const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const Anomaly = require('../models/Anomaly');
const PowerOutage = require('../models/PowerOutage');
const Meter = require('../models/Meter');

/**
 * Stats publiques : anomalies par zone, coupures par zone, dans les 30 derniers jours.
 * Sert à l'app abonné comme à l'app admin pour afficher la "pression collective".
 */

const anomaliesByZone = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // On récupère les meterId de chaque zone (city)
  const meters = await Meter.find().select('_id address.city address.region').lean();
  const meterToCity = new Map(meters.map((m) => [String(m._id), m.address?.city || 'Inconnu']));

  const anomalies = await Anomaly.find({ detectedAt: { $gte: since } }).select('meterId type severity').lean();

  const byCity = {};
  for (const a of anomalies) {
    const city = meterToCity.get(String(a.meterId)) || 'Inconnu';
    if (!byCity[city]) byCity[city] = { city, count: 0, byType: {}, bySeverity: { low: 0, medium: 0, high: 0 } };
    byCity[city].count += 1;
    byCity[city].byType[a.type] = (byCity[city].byType[a.type] || 0) + 1;
    byCity[city].bySeverity[a.severity] += 1;
  }
  return ok(res, { since, zones: Object.values(byCity).sort((a, b) => b.count - a.count) });
});

const outagesByZone = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const items = await PowerOutage.aggregate([
    { $match: { startTime: { $gte: since } } },
    {
      $group: {
        _id: { city: '$city', region: '$region' },
        count: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
      },
    },
    { $sort: { count: -1 } },
  ]);
  return ok(res, {
    since,
    zones: items.map((x) => ({ city: x._id.city, region: x._id.region, count: x.count, confirmed: x.confirmed })),
  });
});

module.exports = { anomaliesByZone, outagesByZone };
