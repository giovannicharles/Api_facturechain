const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, default: null },
    action: { type: String, required: true, index: true }, // 'auth.login', 'invoice.create', 'claim.update.status'...
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

auditLogSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('AuditLog', auditLogSchema);
