/**
 * Format standard de réponse :
 *   { success: true, data, meta }
 *   { success: false, error: { code, message, details } }
 */
function ok(res, data, meta) {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.json(payload);
}

function created(res, data) {
  return res.status(201).json({ success: true, data });
}

function noContent(res) {
  return res.status(204).send();
}

module.exports = { ok, created, noContent };
