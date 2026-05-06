const PDFDocument = require('pdfkit');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const ApiError = require('../utils/apiError');
const Invoice = require('../models/Invoice');
const Anomaly = require('../models/Anomaly');
const eneoAdapter = require('../services/eneo-adapter.service');
const ledger = require('../services/ledger.service');

/**
 * Recherche par numéro de facture — point d'entrée central de l'app.
 * Accessible aux abonnés (vérification rapide d'une facture).
 */
const searchByNumber = asyncHandler(async (req, res) => {
  const number = (req.query.invoiceNumber || '').trim();
  if (!number) throw ApiError.badRequest('Le numéro de facture est requis');
  const invoice = await eneoAdapter.findInvoiceByNumber(number);
  if (!invoice) throw ApiError.notFound('Aucune facture ne correspond à ce numéro');
  // Joint anomalies attachées
  const anomalies = await Anomaly.find({ invoiceId: invoice._id }).lean();
  return ok(res, { invoice, anomalies });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.invoiceId)
    .populate('meterId', 'meterNumber tariffCategory address')
    .populate('customerId', 'clientId firstName lastName phone address')
    .lean();
  if (!invoice) throw ApiError.notFound('Facture introuvable');

  // Sécurité : un abonné ne voit que ses propres factures
  if (req.user.role === 'subscriber') {
    if (String(invoice.customerId._id) !== req.user.customerId) {
      throw ApiError.forbidden('Cette facture ne vous appartient pas');
    }
  }
  const anomalies = await Anomaly.find({ invoiceId: invoice._id }).lean();
  return ok(res, { invoice, anomalies });
});

const verifyInvoiceIntegrity = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.invoiceId).lean();
  if (!invoice) throw ApiError.notFound('Facture introuvable');
  const isValid = ledger.verifyInvoice(invoice);
  return ok(res, {
    invoiceNumber: invoice.invoiceNumber,
    hash: invoice.hash,
    previousHash: invoice.previousHash,
    isValid,
    sealedAt: invoice.sealedAt,
  });
});

const verifyChainForMeter = asyncHandler(async (req, res) => {
  const result = await ledger.verifyInvoiceChain(req.params.meterId);
  return ok(res, result);
});

/**
 * Génère le PDF d'une facture (pdfkit, en streaming).
 */
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.invoiceId)
    .populate('meterId')
    .populate('customerId')
    .lean();
  if (!invoice) throw ApiError.notFound('Facture introuvable');
  if (req.user.role === 'subscriber' && String(invoice.customerId._id) !== req.user.customerId) {
    throw ApiError.forbidden();
  }

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="facture-${invoice.invoiceNumber}.pdf"`);
  doc.pipe(res);

  // En-tête
  doc.fontSize(20).fillColor('#0B5FFF').text('FactureChain', { continued: true })
    .fillColor('#000').fontSize(10).text('   Suivi consommation électrique');
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor('#000').text(`Facture ${invoice.invoiceNumber}`);
  doc.moveDown(0.3);
  doc.fontSize(10)
    .text(`Période : ${String(invoice.period.month).padStart(2, '0')}/${invoice.period.year}`)
    .text(`Émise le : ${new Date(invoice.issueDate).toLocaleDateString('fr-FR')}`)
    .text(`Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}`)
    .text(`Statut : ${invoice.status}`);

  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#0B5FFF').text('Abonné').fillColor('#000').fontSize(10);
  const c = invoice.customerId;
  doc.text(`${c.firstName} ${c.lastName}`)
    .text(`Identifiant client : ${c.clientId}`)
    .text(`${c.address?.neighborhood || ''}, ${c.address?.city || ''}, ${c.address?.region || ''}`);

  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#0B5FFF').text('Compteur').fillColor('#000').fontSize(10);
  doc.text(`Numéro : ${invoice.meterId.meterNumber}`)
    .text(`Catégorie tarifaire : ${invoice.meterId.tariffCategory}`);

  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#0B5FFF').text('Index & consommation').fillColor('#000').fontSize(10);
  doc.text(`Index précédent : ${invoice.previousIndex} kWh`)
    .text(`Index courant : ${invoice.currentIndex} kWh`)
    .text(`Consommation : ${invoice.consumptionKwh} kWh`);

  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#0B5FFF').text('Détail').fillColor('#000').fontSize(10);
  invoice.breakdown.forEach((line) => {
    doc.text(`• ${line.label} : ${line.quantity} × ${line.unitPrice.toLocaleString('fr-FR')} = ${line.amount.toLocaleString('fr-FR')} FCFA`);
  });

  doc.moveDown(0.6);
  doc.fontSize(13).fillColor('#0B5FFF').text(`Total facturé : ${invoice.amountBilled.toLocaleString('fr-FR')} FCFA`).fillColor('#000');
  if (invoice.discrepancy && Math.abs(invoice.discrepancy) > 1) {
    doc.fontSize(10).fillColor('#B00020')
      .text(`Recalcul FactureChain : ${invoice.amountRecomputed.toLocaleString('fr-FR')} FCFA — écart ${invoice.discrepancy.toLocaleString('fr-FR')} FCFA`)
      .fillColor('#000');
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#666')
    .text(`Empreinte d'intégrité (SHA-256) : ${invoice.hash}`)
    .text(`Empreinte précédente : ${invoice.previousHash || '— (première facture du compteur)'}`)
    .text('Cette empreinte garantit que la facture n\'a pas été altérée depuis son émission.');

  doc.end();
});

module.exports = {
  searchByNumber,
  getInvoice,
  verifyInvoiceIntegrity,
  verifyChainForMeter,
  downloadInvoicePdf,
};
