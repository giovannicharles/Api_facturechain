const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const ApiError = require('../utils/apiError');
const Customer = require('../models/Customer');
const Meter = require('../models/Meter');
const Invoice = require('../models/Invoice');
const IndexReading = require('../models/IndexReading');
const Anomaly = require('../models/Anomaly');
const { getPagination, buildMeta } = require('../utils/pagination');

function requireCustomer(req) {
  if (!req.user.customerId) throw ApiError.badRequest('Aucune fiche client rattachée à votre compte');
  return req.user.customerId;
}

const getMyCustomer = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const customer = await Customer.findById(customerId).lean();
  return ok(res, { customer });
});

const getMyMeters = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meters = await Meter.find({ customerId }).sort({ createdAt: 1 }).lean();
  return ok(res, { meters });
});

const getMeter = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meter = await Meter.findOne({ _id: req.params.meterId, customerId }).lean();
  if (!meter) throw ApiError.notFound('Compteur introuvable');
  return ok(res, { meter });
});

const getMeterInvoices = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meter = await Meter.findOne({ _id: req.params.meterId, customerId });
  if (!meter) throw ApiError.notFound('Compteur introuvable');

  const { page, limit, skip } = getPagination(req);
  const filter = { meterId: meter._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.year) filter['period.year'] = parseInt(req.query.year, 10);

  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ issueDate: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);
  return ok(res, items, buildMeta({ total, page, limit }));
});

const getMeterIndexReadings = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meter = await Meter.findOne({ _id: req.params.meterId, customerId });
  if (!meter) throw ApiError.notFound('Compteur introuvable');
  const readings = await IndexReading.find({ meterId: meter._id }).sort({ readingDate: -1 }).limit(60).lean();
  return ok(res, { readings });
});

const submitIndexReading = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meter = await Meter.findOne({ _id: req.body.meterId, customerId });
  if (!meter) throw ApiError.notFound('Compteur introuvable');

  const reading = await IndexReading.create({
    meterId: meter._id,
    customerId,
    value: req.body.value,
    readingDate: req.body.readingDate || new Date(),
    source: 'SELF',
    photoUrl: req.body.photoUrl || null,
    notes: req.body.notes || '',
  });
  return ok(res, { reading });
});

const getMeterAnomalies = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meter = await Meter.findOne({ _id: req.params.meterId, customerId });
  if (!meter) throw ApiError.notFound('Compteur introuvable');
  const anomalies = await Anomaly.find({ meterId: meter._id }).sort({ detectedAt: -1 }).lean();
  return ok(res, { anomalies });
});

/**
 * Statistiques de consommation des 12 derniers mois pour un compteur.
 */
const getMeterConsumptionStats = asyncHandler(async (req, res) => {
  const customerId = requireCustomer(req);
  const meter = await Meter.findOne({ _id: req.params.meterId, customerId });
  if (!meter) throw ApiError.notFound('Compteur introuvable');

  const invoices = await Invoice.find({ meterId: meter._id })
    .sort({ issueDate: -1 })
    .limit(24)
    .lean();
  const series = invoices
    .reverse()
    .map((i) => ({
      year: i.period.year,
      month: i.period.month,
      consumption: i.consumptionKwh,
      amount: i.amountBilled,
    }));
  const total12 = series.slice(-12).reduce((acc, s) => acc + s.consumption, 0);
  const avg12 = series.length ? total12 / Math.min(12, series.length) : 0;
  return ok(res, {
    series,
    summary: {
      total12Months: total12,
      avgMonthly: Math.round(avg12),
      lastIndex: meter.lastIndex,
    },
  });
});

module.exports = {
  getMyCustomer,
  getMyMeters,
  getMeter,
  getMeterInvoices,
  getMeterIndexReadings,
  submitIndexReading,
  getMeterAnomalies,
  getMeterConsumptionStats,
};
