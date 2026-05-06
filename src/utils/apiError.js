/**
 * Erreur API métier — utilisée partout pour signaler une erreur "attendue"
 * (validation, ressource non trouvée, droits insuffisants, etc.).
 * Le middleware d'erreur la transforme en réponse JSON standardisée.
 */
class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || `ERR_${statusCode}`;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg, details) {
    return new ApiError(400, msg, { code: 'BAD_REQUEST', details });
  }
  static unauthorized(msg = 'Non authentifié') {
    return new ApiError(401, msg, { code: 'UNAUTHORIZED' });
  }
  static forbidden(msg = 'Accès refusé') {
    return new ApiError(403, msg, { code: 'FORBIDDEN' });
  }
  static notFound(msg = 'Ressource introuvable') {
    return new ApiError(404, msg, { code: 'NOT_FOUND' });
  }
  static conflict(msg) {
    return new ApiError(409, msg, { code: 'CONFLICT' });
  }
  static unprocessable(msg, details) {
    return new ApiError(422, msg, { code: 'UNPROCESSABLE', details });
  }
}

module.exports = ApiError;
