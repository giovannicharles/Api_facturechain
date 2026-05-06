const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const User = require('../models/User');
const Customer = require('../models/Customer');
const ApiError = require('../utils/apiError');

function signAccess(user) {
  return jwt.sign({ sub: user._id, role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}
function signRefresh(user) {
  const tokenId = uuidv4();
  const token = jwt.sign({ sub: user._id, jti: tokenId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
  return { token, tokenId };
}

/**
 * Inscription d'un abonné. Si `clientId` ENEO est fourni et trouvé, on rattache au Customer
 * existant. Sinon, on crée un compte sans rattachement (l'admin pourra le lier plus tard).
 */
async function register({ email, password, firstName, lastName, phone, clientId }) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('Un compte existe déjà avec cet e-mail');

  let customer = null;
  if (clientId) {
    customer = await Customer.findOne({ clientId });
    if (!customer) throw ApiError.badRequest('Identifiant client ENEO inconnu');
    if (customer.userId) throw ApiError.conflict('Cet identifiant client est déjà rattaché à un compte');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const user = await User.create({
    email,
    passwordHash,
    firstName,
    lastName,
    phone,
    role: 'subscriber',
    customerId: customer ? customer._id : null,
  });

  if (customer) {
    customer.userId = user._id;
    await customer.save();
  }

  return user;
}

async function login({ email, password, ip, userAgent }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Identifiants invalides');
  if (user.status !== 'active') throw ApiError.forbidden('Compte non actif');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    await user.save();
    throw ApiError.unauthorized('Identifiants invalides');
  }

  const access = signAccess(user);
  const { token: refresh, tokenId } = signRefresh(user);

  user.failedLoginCount = 0;
  user.lastLoginAt = new Date();
  user.lastLoginIp = ip;
  user.refreshTokens.push({ token: tokenId, createdAt: new Date(), userAgent });
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5); // garde les 5 derniers
  }
  await user.save();

  return {
    user: user.toJSON(),
    tokens: { accessToken: access, refreshToken: refresh },
  };
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    throw ApiError.unauthorized('Refresh token invalide');
  }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized();
  const exists = user.refreshTokens.some((t) => t.token === payload.jti);
  if (!exists) throw ApiError.unauthorized('Refresh token révoqué');
  return { accessToken: signAccess(user) };
}

async function logout(userId, refreshToken) {
  if (!userId) return;
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    return;
  }
  await User.updateOne({ _id: userId }, { $pull: { refreshTokens: { token: payload.jti } } });
}

module.exports = { register, login, refresh, logout };
