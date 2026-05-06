const logger = require('../config/logger');
const env = require('../config/env');
const ApiError = require('../utils/apiError');

// 404 fallback
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route inexistante : ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  // Mongoose : erreurs de validation
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.unprocessable('Données invalides', details);
  }
  // Mongoose : cast ID invalide
  if (err.name === 'CastError' && err.path === '_id') {
    error = ApiError.badRequest('Identifiant invalide');
  }
  // Mongo duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    error = ApiError.conflict(`Valeur déjà utilisée : ${field}`);
  }

  if (!(error instanceof ApiError)) {
    logger.error(`[err] ${err.stack || err.message}`);
    error = new ApiError(500, env.isProd ? 'Erreur serveur' : err.message, { code: 'INTERNAL' });
  } else if (error.statusCode >= 500) {
    logger.error(`[err] ${err.stack || err.message}`);
  }

  const payload = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.details) payload.error.details = error.details;
  if (!env.isProd && error.statusCode >= 500) payload.error.stack = err.stack;

  res.status(error.statusCode).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
