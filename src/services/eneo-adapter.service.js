const env = require('../config/env');
const logger = require('../config/logger');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Meter = require('../models/Meter');

/**
 * Adapter ENEO. Découple la source des données ENEO du reste de l'app.
 * - mode 'mock' : utilise nos collections locales (seed) comme si elles venaient d'ENEO.
 * - mode 'http' : (stub) appelle une vraie API ENEO via fetch.
 *
 * Quand l'API officielle ENEO sera dispo, il suffira de basculer ENEO_ADAPTER_MODE=http
 * et de configurer ENEO_API_BASE_URL + ENEO_API_KEY.
 */

async function findInvoiceByNumber(invoiceNumber) {
  if (env.eneo.mode === 'mock') {
    return Invoice.findOne({ invoiceNumber })
      .populate('customerId', 'clientId firstName lastName phone address')
      .populate('meterId', 'meterNumber tariffCategory address')
      .lean();
  }
  // mode http (stub)
  return httpFetch(`/invoices/${encodeURIComponent(invoiceNumber)}`);
}

async function findCustomerByClientId(clientId) {
  if (env.eneo.mode === 'mock') {
    return Customer.findOne({ clientId }).lean();
  }
  return httpFetch(`/customers/${encodeURIComponent(clientId)}`);
}

async function findMetersByCustomer(customerId) {
  if (env.eneo.mode === 'mock') {
    return Meter.find({ customerId }).lean();
  }
  return httpFetch(`/customers/${customerId}/meters`);
}

async function transmitClaim(claim) {
  if (env.eneo.mode === 'mock') {
    // Simule la transmission : génère une référence côté ENEO.
    const ref = `ENEO-CL-${Date.now().toString().slice(-8)}`;
    logger.info(`[eneo:mock] réclamation ${claim.claimNumber} transmise → ref ${ref}`);
    return { transmitted: true, eneoRef: ref };
  }
  return httpFetch('/claims', { method: 'POST', body: claim });
}

async function httpFetch(path, options = {}) {
  if (!env.eneo.baseUrl) {
    throw new Error('ENEO_API_BASE_URL non configurée');
  }
  const url = env.eneo.baseUrl.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(env.eneo.apiKey ? { 'X-API-Key': env.eneo.apiKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`[eneo] HTTP ${res.status}`);
  return res.json();
}

module.exports = {
  findInvoiceByNumber,
  findCustomerByClientId,
  findMetersByCustomer,
  transmitClaim,
};
