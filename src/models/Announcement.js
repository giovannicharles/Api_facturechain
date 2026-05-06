const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },

    target: {
      scope: { type: String, enum: ['all', 'region', 'city', 'neighborhood'], default: 'all' },
      region: { type: String, default: null },
      city: { type: String, default: null },
      neighborhood: { type: String, default: null },
    },

    scheduledFor: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

announcementSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('Announcement', announcementSchema);
