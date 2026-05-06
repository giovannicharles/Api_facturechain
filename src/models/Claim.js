const mongoose = require('mongoose');

const CLAIM_TYPES = [
  'BILLING_DISPUTE',     // contestation de montant
  'METER_DEFECT',        // compteur défaillant
  'WRONG_READING',       // erreur de relevé
  'POWER_OUTAGE',        // coupure non résolue
  'CONNECTION_ISSUE',    // raccordement / nouveau compteur
  'OTHER',
];

const CLAIM_STATUSES = [
  'submitted',           // soumise par l'abonné
  'received',            // reçue par notre équipe
  'investigating',       // en cours d'analyse
  'transmitted_to_eneo', // transmise à ENEO
  'awaiting_response',   // en attente retour ENEO
  'resolved',            // résolue
  'rejected',            // rejetée
  'closed',              // clôturée par l'abonné
];

const messageSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorRole: { type: String, enum: ['subscriber', 'agent', 'admin', 'system'] },
    body: { type: String, required: true },
    attachments: [{ name: String, url: String, mime: String }],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: CLAIM_STATUSES },
    note: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    claimNumber: { type: String, required: true, unique: true, index: true }, // 'RCL-2024-000123'
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    meterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meter', default: null, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null, index: true },

    type: { type: String, enum: CLAIM_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    attachments: [{ name: String, url: String, mime: String }],

    status: { type: String, enum: CLAIM_STATUSES, default: 'submitted', index: true },
    statusHistory: [statusEventSchema],

    assignedAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    eneoTransmissionRef: { type: String, default: null }, // référence côté ENEO

    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    slaDueAt: { type: Date, default: null },

    messages: [messageSchema],

    resolution: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },

    submittedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

claimSchema.statics.TYPES = CLAIM_TYPES;
claimSchema.statics.STATUSES = CLAIM_STATUSES;

claimSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('Claim', claimSchema);
