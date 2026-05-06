const mongoose = require('mongoose');

/**
 * IndexReading = un relevé d'index. Peut être :
 * - ENEO : importé via l'adapter ENEO
 * - SELF : auto-relevé par l'abonné (preuve via photo)
 * - SEED : généré par le seed (démo)
 */
const indexReadingSchema = new mongoose.Schema(
  {
    meterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meter', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    value: { type: Number, required: true, min: 0 }, // kWh affiché au compteur
    readingDate: { type: Date, required: true, index: true },
    source: { type: String, enum: ['ENEO', 'SELF', 'SEED'], default: 'SELF', index: true },

    photoUrl: { type: String, default: null }, // URL de la photo du compteur (auto-relevé)
    notes: { type: String, default: '' },

    // Si l'auto-relevé contredit l'index ENEO suivant, on flag
    flaggedDiscrepancy: { type: Boolean, default: false },
  },
  { timestamps: true }
);

indexReadingSchema.index({ meterId: 1, readingDate: -1 });

indexReadingSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('IndexReading', indexReadingSchema);
