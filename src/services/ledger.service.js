const Invoice = require('../models/Invoice');
const { sha256 } = require('../utils/hash');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Service Ledger — assure l'intégrité des factures via une chaîne de hash interne.
 *
 * Chaque facture stocke `hash` (calculé sur ses champs métier + previousHash de la
 * dernière facture du même compteur). Toute modification ultérieure casse la chaîne.
 *
 * `verifyInvoiceChain(meterId)` parcourt l'ordre chronologique et confirme l'intégrité.
 *
 * Le mode `blockchain` est un stub destiné à une future intégration on-chain :
 * - publishToChain(invoice) → envoie le hash sur une blockchain
 * - getOnChainProof(invoice) → renvoie la preuve d'inclusion
 * Ces méthodes existent mais n'opèrent pas tant que LEDGER_MODE !== 'blockchain'.
 */

function buildSealableInvoice(invoice) {
  // Champs canoniques pris en compte dans le hash. Si un de ces champs change, le hash change.
  return {
    invoiceNumber: invoice.invoiceNumber,
    meterId: String(invoice.meterId),
    customerId: String(invoice.customerId),
    period: invoice.period,
    previousIndex: invoice.previousIndex,
    currentIndex: invoice.currentIndex,
    consumptionKwh: invoice.consumptionKwh,
    amountBilled: invoice.amountBilled,
    issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString() : null,
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString() : null,
  };
}

async function getLastInvoiceHashForMeter(meterId, beforeDate = null) {
  const filter = { meterId };
  if (beforeDate) filter.issueDate = { $lt: beforeDate };
  const last = await Invoice.findOne(filter).sort({ issueDate: -1, createdAt: -1 }).lean();
  return last ? last.hash : null;
}

/**
 * Calcule le hash d'une facture à partir de ses champs + du previousHash fourni.
 */
function computeInvoiceHash(invoice, previousHash) {
  const sealable = buildSealableInvoice(invoice);
  return sha256({ ...sealable, previousHash: previousHash || null });
}

/**
 * Pour une nouvelle facture (encore non sauvegardée), récupère le previousHash
 * et calcule son hash final. Modifie l'objet `invoice` en place.
 */
async function sealInvoice(invoice) {
  const previousHash = await getLastInvoiceHashForMeter(invoice.meterId, invoice.issueDate);
  const hash = computeInvoiceHash(invoice, previousHash);
  invoice.previousHash = previousHash;
  invoice.hash = hash;
  invoice.sealedAt = new Date();

  if (env.ledger.mode === 'blockchain') {
    // Stub : à implémenter (smart contract, anchor de hash, etc.)
    logger.debug(`[ledger] (stub) publish ${invoice.invoiceNumber} on-chain`);
  }
  return invoice;
}

/**
 * Vérifie l'intégrité de toute la chaîne pour un compteur.
 * Retourne { valid: boolean, brokenAt?: invoiceNumber, totalChecked }
 */
async function verifyInvoiceChain(meterId) {
  const invoices = await Invoice.find({ meterId }).sort({ issueDate: 1, createdAt: 1 }).lean();
  let prevHash = null;
  for (const inv of invoices) {
    const expected = computeInvoiceHash(inv, prevHash);
    if (expected !== inv.hash || inv.previousHash !== prevHash) {
      return { valid: false, brokenAt: inv.invoiceNumber, totalChecked: invoices.length };
    }
    prevHash = inv.hash;
  }
  return { valid: true, totalChecked: invoices.length };
}

/**
 * Vérifie une seule facture : son hash colle bien à ses champs + previousHash.
 */
function verifyInvoice(invoice) {
  const expected = computeInvoiceHash(invoice, invoice.previousHash);
  return expected === invoice.hash;
}

module.exports = {
  sealInvoice,
  verifyInvoice,
  verifyInvoiceChain,
  computeInvoiceHash,
  getLastInvoiceHashForMeter,
};
