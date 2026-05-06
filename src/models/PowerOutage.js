const mongoose = require('mongoose');

const outageSchema = new mongoose.Schema(
  {
    region: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    neighborhood: { type: String, default: '', index: true },
    coordinates: { lat: Number, lng: Number },

    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, default: null },

    status: { type: String, enum: ['reported', 'confirmed', 'resolved', 'rejected'], default: 'reported', index: true },
    confirmations: { type: Number, default: 1 },
    confirmedByUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, default: '' },

    isOfficial: { type: Boolean, default: false }, // annonce officielle ENEO/admin ?
  },
  { timestamps: true }
);

outageSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('PowerOutage', outageSchema);
