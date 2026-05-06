const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const authService = require('../services/auth.service');
const User = require('../models/User');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
  return created(res, { user: user.toJSON() });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });
  return ok(res, result);
});

const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refresh(req.body.refreshToken);
  return ok(res, data);
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user?.id, req.body.refreshToken || '');
  return ok(res, { ok: true });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('customerId').lean();
  return ok(res, { user });
});

module.exports = { register, login, refresh, logout, me };
