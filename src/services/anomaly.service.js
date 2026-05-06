const Anomaly = require('../models/Anomaly');
const Invoice = require('../models/Invoice');
const Meter = require('../models/Meter');
const { computeInvoiceAmount } = require('./tariff.service');
const logger = require('../config/logger');

/**
 * Détecteur d'anomalies multicritère.
 * Appelé après création/import d'une facture, ou en batch.
 */

const SPIKE_Z_THRESHOLD = 2;        // sigma
const YOY_DEVIATION_PCT = 0.5;      // > +50 % vs N-1
const IMPOSSIBLE_RESIDENTIAL_KWH = 3000; // par mois (résidentiel BT)
const AMOUNT_MISMATCH_PCT = 0.05;   // écart > 5 %

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
}

/**
 * Détecte les anomalies pour une facture donnée et crée les enregistrements correspondants.
 * Renvoie le tableau des anomalies créées.
 */
async function detectAnomaliesForInvoice(invoice) {
  const anomalies = [];

  const meter = await Meter.findById(invoice.meterId).lean();
  if (!meter) return anomalies;

  // 1) Index négatif
  if (invoice.currentIndex < invoice.previousIndex) {
    anomalies.push(
      buildAnomaly(invoice, meter, 'NEGATIVE_INCREMENT', 'high', {
        title: 'Index courant inférieur à l\'index précédent',
        description: `Index précédent : ${invoice.previousIndex} kWh — Index courant : ${invoice.currentIndex} kWh.`,
        metrics: { previousIndex: invoice.previousIndex, currentIndex: invoice.currentIndex },
      })
    );
  }

  // 2) Spike sur l'historique perso (Z-score)
  const history = await Invoice.find({
    meterId: invoice.meterId,
    _id: { $ne: invoice._id },
  })
    .sort({ issueDate: -1 })
    .limit(12)
    .lean();
  const histKwh = history.map((i) => i.consumptionKwh).filter((v) => Number.isFinite(v));
  if (histKwh.length >= 3) {
    const m = mean(histKwh);
    const s = stdDev(histKwh);
    const z = s > 0 ? (invoice.consumptionKwh - m) / s : 0;
    if (z >= SPIKE_Z_THRESHOLD) {
      anomalies.push(
        buildAnomaly(invoice, meter, 'CONSUMPTION_SPIKE', z >= 3 ? 'high' : 'medium', {
          title: 'Pic de consommation inhabituel',
          description: `Consommation ${invoice.consumptionKwh} kWh — moyenne historique ${m.toFixed(0)} kWh (z=${z.toFixed(2)}).`,
          metrics: { z, mean: m, std: s, value: invoice.consumptionKwh },
        })
      );
    }
  }

  // 3) YoY deviation (vs même mois année précédente)
  const yoy = await Invoice.findOne({
    meterId: invoice.meterId,
    'period.month': invoice.period.month,
    'period.year': invoice.period.year - 1,
  }).lean();
  if (yoy && yoy.consumptionKwh > 0) {
    const delta = (invoice.consumptionKwh - yoy.consumptionKwh) / yoy.consumptionKwh;
    if (delta >= YOY_DEVIATION_PCT) {
      anomalies.push(
        buildAnomaly(invoice, meter, 'YOY_DEVIATION', 'medium', {
          title: 'Écart annuel important',
          description: `Augmentation de ${(delta * 100).toFixed(0)}% par rapport au même mois en ${invoice.period.year - 1}.`,
          metrics: { current: invoice.consumptionKwh, previousYear: yoy.consumptionKwh, delta },
        })
      );
    }
  }

  // 4) Consommation physiquement improbable
  const isResidential = (meter.tariffCategory || '').startsWith('BT_');
  if (isResidential && invoice.consumptionKwh > IMPOSSIBLE_RESIDENTIAL_KWH) {
    anomalies.push(
      buildAnomaly(invoice, meter, 'IMPOSSIBLE_CONSUMPTION', 'high', {
        title: 'Consommation anormalement élevée',
        description: `${invoice.consumptionKwh} kWh dépasse le seuil de plausibilité (${IMPOSSIBLE_RESIDENTIAL_KWH} kWh) pour un compteur résidentiel.`,
        metrics: { consumption: invoice.consumptionKwh, threshold: IMPOSSIBLE_RESIDENTIAL_KWH },
      })
    );
  }

  // 5) Discordance montant facturé vs recalculé
  const recomputed = computeInvoiceAmount(invoice.consumptionKwh, meter.tariffCategory);
  if (recomputed.total > 0 && invoice.amountBilled > 0) {
    const diffPct = Math.abs(invoice.amountBilled - recomputed.total) / recomputed.total;
    if (diffPct >= AMOUNT_MISMATCH_PCT) {
      anomalies.push(
        buildAnomaly(invoice, meter, 'AMOUNT_MISMATCH', diffPct >= 0.2 ? 'high' : 'medium', {
          title: 'Écart entre le montant facturé et le recalcul',
          description: `Facturé ${invoice.amountBilled.toLocaleString('fr-FR')} FCFA — Recalculé ${recomputed.total.toLocaleString('fr-FR')} FCFA (écart ${(diffPct * 100).toFixed(1)}%).`,
          metrics: { billed: invoice.amountBilled, recomputed: recomputed.total, diffPct },
        })
      );
    }
  }

  // Persistance (en évitant les doublons exacts)
  const created = [];
  for (const a of anomalies) {
    const exists = await Anomaly.findOne({ invoiceId: a.invoiceId, type: a.type }).lean();
    if (exists) continue;
    const saved = await Anomaly.create(a);
    created.push(saved);
  }
  if (created.length) {
    logger.debug(`[anomaly] ${created.length} anomalie(s) détectée(s) pour facture ${invoice.invoiceNumber}`);
  }
  return created;
}

function buildAnomaly(invoice, meter, type, severity, extras) {
  return {
    meterId: meter._id,
    customerId: meter.customerId,
    invoiceId: invoice._id,
    type,
    severity,
    title: extras.title,
    description: extras.description,
    metrics: extras.metrics || {},
    detectedAt: new Date(),
  };
}

module.exports = {
  detectAnomaliesForInvoice,
};
