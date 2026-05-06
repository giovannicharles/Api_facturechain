const mongoose = require('mongoose');

const meterSchema = new mongoose.Schema(
  {
    meterNumber: { type: String, required: true, unique: true, index: true }, // ex: 'CMP-DLA-987654'
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    label: { type: String, default: '' }, // 'Maison principale', 'Boutique', etc.

    // Catégorie tarifaire ENEO (BT résidentiel par défaut)
    tariffCategory: {
      type: String,
      enum: ['BT_SOCIAL', 'BT_RESIDENTIAL', 'BT_PROFESSIONAL', 'MT_INDUSTRIAL'],
      default: 'BT_RESIDENTIAL',
    },

    contractedPower: { type: Number, default: 5 }, // kVA souscrit

    address: {
      street: String,
      neighborhood: { type: String, index: true },
      city: { type: String, index: true },
      region: { type: String, index: true },
      coordinates: { lat: Number, lng: Number },
    },

    status: { type: String, enum: ['active', 'suspended', 'disputed', 'closed'], default: 'active', index: true },
    installedAt: { type: Date, default: Date.now },

    // Cache du dernier index relevé (pour affichage rapide dashboard)
    lastIndex: {
      value: { type: Number, default: 0 },
      readingDate: { type: Date, default: null },
      source: { type: String, enum: ['ENEO', 'SELF', 'SEED'], default: 'SEED' },
    },
  },
  { timestamps: true }
);

meterSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('Meter', meterSchema);
