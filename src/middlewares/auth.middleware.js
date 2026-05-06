const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const User = require('../models/User');

/**
 * Vérifie le bearer token et attache req.user.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Token manquant');
    }
    let payload;
    try {
      payload = jwt.verify(token, env.jwt.accessSecret);
    } catch (e) {
      throw ApiError.unauthorized('Token invalide ou expiré');
    }
    const user = await User.findById(payload.sub).lean();
    if (!user || user.status !== 'active') {
      throw ApiError.unauthorized('Compte indisponible');
    }
    req.user = {
      id: String(user._id),
      role: user.role,
      email: user.email,
      customerId: user.customerId ? String(user.customerId) : null,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Restreint l'accès à certains rôles.
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}

module.exports = { authenticate, authorize };
