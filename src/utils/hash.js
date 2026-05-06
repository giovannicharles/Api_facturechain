const crypto = require('crypto');

/**
 * Calcule le hash SHA-256 d'un objet, de manière déterministe (clés triées).
 * Utilisé par le ledger pour rendre les factures inviolables.
 */
function sha256(input) {
  const data = typeof input === 'string' ? input : stableStringify(input);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

module.exports = { sha256, stableStringify };
