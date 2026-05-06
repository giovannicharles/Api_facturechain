const mongoose = require('mongoose');

/**
 * Invoice = facture officielle (ENEO ou recalculée).
 * - hash / previousHash : chaîne d'intégrité interne (préparation blockchain).
 * - breakdown : détail tranches tarifaires + taxes.
 * - recomputed : montant que NOUS calculons à partir des index et du tarif. Permet de
 *   visualiser un écart avec le montant facturé par ENEO.
 */
const breakdownLineSchema = new mongoose.Schema(
  {
    label: String,
    quantity: Number,
    unitPrice: Number,
    amount: Number,
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true }, // 'ENEO-2024-08-1234567'
    meterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meter', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    period: {
      year: { type: Number, required: true, index: true },
      month: { type: Number, required: true, index: true }, // 1..12
    },

    previousIndex: { type: Number, required: true },
    currentIndex: { type: Number, required: true },
    consumptionKwh: { type: Number, required: true },

    // Montants
    amountBilled: { type: Number, required: true }, // montant facturé par ENEO
    amountRecomputed: { type: Number, default: 0 }, // recalculé par nous
    discrepancy: { type: Number, default: 0 }, // écart amountBilled - amountRecomputed

    breakdown: [breakdownLineSchema],
    taxes: { type: Number, default: 0 }, // TVA
    fixedFee: { type: Number, default: 0 }, // redevance fixe

    issueDate: { type: Date, required: true, index: true },
    dueDate: { type: Date, required: true },

    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'disputed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    source: { type: String, enum: ['ENEO', 'SEED', 'COMPUTED'], default: 'SEED' },

    // Ledger / hash chain
    hash: { type: String, required: true, index: true },
    previousHash: { type: String, default: null },
    sealedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

invoiceSchema.index({ meterId: 1, 'period.year': -1, 'period.month': -1 });

invoiceSchema.set('toJSON', { transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('Invoice', invoiceSchema);
