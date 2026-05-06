const Claim = require('../models/Claim');
const Customer = require('../models/Customer');
const ApiError = require('../utils/apiError');
const eneo = require('./eneo-adapter.service');

const SLA_DAYS = 7; // SLA par défaut sur une réclamation

async function generateClaimNumber() {
  const year = new Date().getFullYear();
  const count = await Claim.countDocuments({ submittedAt: { $gte: new Date(`${year}-01-01`) } });
  const seq = String(count + 1).padStart(6, '0');
  return `RCL-${year}-${seq}`;
}

async function submitClaim({ user, payload }) {
  if (!user.customerId) throw ApiError.badRequest('Aucun identifiant client rattaché à votre compte');

  const customer = await Customer.findById(user.customerId);
  if (!customer) throw ApiError.notFound('Client introuvable');

  const claimNumber = await generateClaimNumber();
  const slaDueAt = new Date(Date.now() + SLA_DAYS * 24 * 60 * 60 * 1000);

  const claim = await Claim.create({
    claimNumber,
    customerId: customer._id,
    meterId: payload.meterId || null,
    invoiceId: payload.invoiceId || null,
    type: payload.type,
    title: payload.title,
    description: payload.description,
    attachments: payload.attachments || [],
    priority: payload.priority || 'medium',
    status: 'submitted',
    statusHistory: [{ status: 'submitted', note: 'Soumise par l\'abonné', by: user.id, at: new Date() }],
    submittedAt: new Date(),
    slaDueAt,
  });

  return claim;
}

const ALLOWED_TRANSITIONS = {
  submitted: ['received', 'rejected'],
  received: ['investigating', 'rejected'],
  investigating: ['transmitted_to_eneo', 'resolved', 'rejected'],
  transmitted_to_eneo: ['awaiting_response', 'resolved'],
  awaiting_response: ['resolved', 'rejected'],
  resolved: ['closed'],
  rejected: ['closed'],
  closed: [],
};

async function changeStatus(claimId, { status, note, by, byRole }) {
  const claim = await Claim.findById(claimId);
  if (!claim) throw ApiError.notFound('Réclamation introuvable');

  const allowed = ALLOWED_TRANSITIONS[claim.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Transition non permise : ${claim.status} → ${status}`);
  }

  // Effet de bord : transmission ENEO
  if (status === 'transmitted_to_eneo') {
    const r = await eneo.transmitClaim(claim);
    if (r && r.eneoRef) claim.eneoTransmissionRef = r.eneoRef;
  }
  if (status === 'resolved') claim.resolvedAt = new Date();

  claim.status = status;
  claim.statusHistory.push({ status, note: note || '', by: by || null, at: new Date() });
  await claim.save();
  return claim;
}

async function addMessage(claimId, { authorId, authorRole, body, attachments = [] }) {
  const claim = await Claim.findById(claimId);
  if (!claim) throw ApiError.notFound('Réclamation introuvable');
  claim.messages.push({ authorId, authorRole, body, attachments, createdAt: new Date() });
  await claim.save();
  return claim;
}

module.exports = { submitClaim, changeStatus, addMessage, ALLOWED_TRANSITIONS };
