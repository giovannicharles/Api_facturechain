const Invoice = require('../models/Invoice');
const Meter = require('../models/Meter');
const ApiError = require('../utils/apiError');
const ledger = require('./ledger.service');
const tariff = require('./tariff.service');
const { detectAnomaliesForInvoice } = require('./anomaly.service');

/**
 * Crée une facture, calcule son montant recalculé, l'écart, scelle le hash chain,
 * lance la détection d'anomalies.
 */
async function createInvoice(payload, { runAnomalyDetection = true } = {}) {
  const meter = await Meter.findById(payload.meterId);
  if (!meter) throw ApiError.notFound('Compteur introuvable');

  const consumption = payload.currentIndex - payload.previousIndex;
  const recomputed = tariff.computeInvoiceAmount(Math.max(0, consumption), meter.tariffCategory);

  const invoiceData = {
    invoiceNumber: payload.invoiceNumber,
    meterId: meter._id,
    customerId: meter.customerId,
    period: payload.period,
    previousIndex: payload.previousIndex,
    currentIndex: payload.currentIndex,
    consumptionKwh: consumption,
    amountBilled: payload.amountBilled,
    amountRecomputed: recomputed.total,
    discrepancy: payload.amountBilled - recomputed.total,
    breakdown: recomputed.breakdown,
    taxes: recomputed.taxes,
    fixedFee: recomputed.fixedFee,
    issueDate: payload.issueDate || new Date(),
    dueDate: payload.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: payload.status || 'pending',
    source: payload.source || 'COMPUTED',
  };

  // hash chain
  await ledger.sealInvoice(invoiceData);

  const invoice = await Invoice.create(invoiceData);

  // mise à jour cache compteur (dernier index)
  if (!meter.lastIndex || invoice.issueDate >= (meter.lastIndex.readingDate || 0)) {
    meter.lastIndex = {
      value: invoice.currentIndex,
      readingDate: invoice.issueDate,
      source: invoice.source === 'ENEO' ? 'ENEO' : 'SEED',
    };
    await meter.save();
  }

  if (runAnomalyDetection) {
    await detectAnomaliesForInvoice(invoice);
  }

  return invoice;
}

module.exports = { createInvoice };
