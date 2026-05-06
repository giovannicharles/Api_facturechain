const mongoose = require('mongoose');

const ANOMALY_TYPES = [
  'CONSUMPTION_SPIKE',         // saut de consommation > 2σ vs historique
  'YOY_DEVIATION',             // écart fort vs même mois année précédente
  'NEGATIVE_INCREMENT',        // index courant < index précédent
  'AMOUNT_MISMATCH',           // montant facturé ≠ recalcul
  'IMPOSSIBLE_CONSUMPTION',    // > seuil physique pour le type de compteur
  'MISSING_READING',           // pas d'index relevé sur la période
];

const SEVERITIES = ['low', 'medium', 'high'];

const anomalySchema = new mongoose.Schema(
  {
    meterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meter', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null, index: true },

    type: { type: String, enum: ANOMALY_TYPES, required: true, index: true },
    severity: { type: String, enum: SEVERITIES, default: 'medium' },

    title: { type: String, required: true },
    description: { type: String, default: '' },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} }, // valeurs chiffrées du calcul

    detectedAt: { type: Date, default: Date.now, index: true },

    resolved: { type: Boolean, default: false, index: true },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, default: '' },

    // Public ? une anomalie peut être agrégée dans les stats publiques par zone si elle est confirmée.
    publishedToStats: { type: Boolean, default: false },
  },
  { timestamps: true }
);

anomalySchema.statics.TYPES = ANOMALY_TYPES;
anomalySchema.statics.SEVERITIES = SEVERITIES;

anomalySchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('Anomaly', anomalySchema);
