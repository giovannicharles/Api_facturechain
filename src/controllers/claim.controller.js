const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const ApiError = require('../utils/apiError');
const Claim = require('../models/Claim');
const claimService = require('../services/claim.service');
const { getPagination, buildMeta } = require('../utils/pagination');

const submit = asyncHandler(async (req, res) => {
  const claim = await claimService.submitClaim({ user: req.user, payload: req.body });
  return created(res, { claim });
});

const listMine = asyncHandler(async (req, res) => {
  if (!req.user.customerId) throw ApiError.badRequest('Aucun client rattaché');
  const { page, limit, skip } = getPagination(req);
  const filter = { customerId: req.user.customerId };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Claim.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
    Claim.countDocuments(filter),
  ]);
  return ok(res, items, buildMeta({ total, page, limit }));
});

const detail = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.claimId).lean();
  if (!claim) throw ApiError.notFound('Réclamation introuvable');
  if (req.user.role === 'subscriber' && String(claim.customerId) !== req.user.customerId) {
    throw ApiError.forbidden();
  }
  return ok(res, { claim });
});

const postMessage = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.claimId);
  if (!claim) throw ApiError.notFound('Réclamation introuvable');
  if (req.user.role === 'subscriber' && String(claim.customerId) !== req.user.customerId) {
    throw ApiError.forbidden();
  }
  const updated = await claimService.addMessage(req.params.claimId, {
    authorId: req.user.id,
    authorRole: req.user.role,
    body: req.body.body,
    attachments: req.body.attachments,
  });
  return ok(res, { claim: updated });
});

const changeStatus = asyncHandler(async (req, res) => {
  const updated = await claimService.changeStatus(req.params.claimId, {
    status: req.body.status,
    note: req.body.note,
    by: req.user.id,
    byRole: req.user.role,
  });
  return ok(res, { claim: updated });
});

const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.assignedAgentId) filter.assignedAgentId = req.query.assignedAgentId;
  const [items, total] = await Promise.all([
    Claim.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
    Claim.countDocuments(filter),
  ]);
  return ok(res, items, buildMeta({ total, page, limit }));
});

const assign = asyncHandler(async (req, res) => {
  const claim = await Claim.findByIdAndUpdate(
    req.params.claimId,
    { assignedAgentId: req.body.agentId || null },
    { new: true }
  );
  if (!claim) throw ApiError.notFound();
  return ok(res, { claim });
});

module.exports = { submit, listMine, detail, postMessage, changeStatus, adminList, assign };
