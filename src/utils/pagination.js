/**
 * Lit page/limit dans req.query, applique des bornes saines, retourne skip/limit.
 */
function getPagination(req, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let page = parseInt(req.query.page, 10);
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit, skip: (page - 1) * limit };
}

function buildMeta({ total, page, limit }) {
  return {
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = { getPagination, buildMeta };
