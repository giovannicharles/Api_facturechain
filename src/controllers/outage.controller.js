const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const ApiError = require('../utils/apiError');
const PowerOutage = require('../models/PowerOutage');

const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.region) filter.region = req.query.region;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.neighborhood) filter.neighborhood = req.query.neighborhood;
  if (req.query.activeOnly === 'true') filter.status = { $in: ['reported', 'confirmed'] };

  // 7 derniers jours par défaut
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  filter.startTime = { $gte: since };

  const items = await PowerOutage.find(filter).sort({ startTime: -1 }).limit(500).lean();
  return ok(res, items);
});

const report = asyncHandler(async (req, res) => {
  const outage = await PowerOutage.create({
    ...req.body,
    reporterUserId: req.user.id,
    confirmedByUserIds: [req.user.id],
    confirmations: 1,
    status: 'reported',
  });
  return created(res, { outage });
});

const confirm = asyncHandler(async (req, res) => {
  const outage = await PowerOutage.findById(req.params.id);
  if (!outage) throw ApiError.notFound();
  if (outage.confirmedByUserIds.some((id) => String(id) === req.user.id)) {
    return ok(res, { outage });
  }
  outage.confirmedByUserIds.push(req.user.id);
  outage.confirmations = outage.confirmedByUserIds.length;
  if (outage.confirmations >= 3 && outage.status === 'reported') outage.status = 'confirmed';
  await outage.save();
  return ok(res, { outage });
});

const resolve = asyncHandler(async (req, res) => {
  const outage = await PowerOutage.findByIdAndUpdate(
    req.params.id,
    { status: 'resolved', endTime: new Date() },
    { new: true }
  );
  if (!outage) throw ApiError.notFound();
  return ok(res, { outage });
});

module.exports = { list, report, confirm, resolve };
