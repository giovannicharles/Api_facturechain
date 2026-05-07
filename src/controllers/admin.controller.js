const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const ApiError = require('../utils/apiError');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Meter = require('../models/Meter');
const Invoice = require('../models/Invoice');
const Claim = require('../models/Claim');
const Anomaly = require('../models/Anomaly');
const Announcement = require('../models/Announcement');
const { getPagination, buildMeta } = require('../utils/pagination');
const PowerOutage = require('../models/PowerOutage'); // Nom exact du modèle
/**
 * Dashboard admin : KPIs temps réel + tendances.
 * Adapté aux schémas réels.
 */
const dashboard = asyncHandler(async (req, res) => {
  const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalCustomers,
    totalMeters,
    activeMeters,
    totalInvoices,
    openClaims,
    totalClaims,
    resolvedClaims30,
    unresolvedAnomalies30,
    highAnomalies30,
    totalAnomalies,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'suspended' }),
    Customer.countDocuments(),
    Meter.countDocuments(),
    Meter.countDocuments({ status: 'active' }),
    Invoice.countDocuments(),
    Claim.countDocuments({ status: { $nin: ['resolved', 'rejected', 'closed'] } }),
    Claim.countDocuments(),
    Claim.countDocuments({ status: 'resolved', resolvedAt: { $gte: since30Days } }),
    // Anomalies non résolues des 30 derniers jours
    Anomaly.countDocuments({ detectedAt: { $gte: since30Days }, resolved: false }),
    Anomaly.countDocuments({ detectedAt: { $gte: since30Days }, severity: 'high', resolved: false }),
    Anomaly.countDocuments(),
  ]);

  // Délai moyen de résolution (jours) sur 90 jours
  const resolvedClaims90 = await Claim.find({
    status: 'resolved',
    resolvedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
  }).select('submittedAt resolvedAt').lean();
  const avgResolutionDays = resolvedClaims90.length
    ? resolvedClaims90.reduce((acc, c) => acc + (c.resolvedAt - c.submittedAt) / 86400000, 0) / resolvedClaims90.length
    : 0;

  // Top 5 zones avec anomalies (basé sur l'adresse du compteur)
  const topAnomZones = await Anomaly.aggregate([
    { $match: { detectedAt: { $gte: since30Days } } },
    { $lookup: { from: 'meters', localField: 'meterId', foreignField: '_id', as: 'meter' } },
    { $unwind: '$meter' },
    { $group: { _id: '$meter.address.city', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  // Tendance 30 jours (factures par jour)
  const invoiceTrend = await Invoice.aggregate([
    { $match: { issueDate: { $gte: since30Days } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$issueDate' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Statistiques sur les coupures (PowerOutage)
  const activeOutages = await PowerOutage.countDocuments({
    status: { $in: ['reported', 'confirmed'] },
  });
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const lastWeekOutages = await PowerOutage.countDocuments({
    createdAt: { $gte: oneWeekAgo },
  });

  // Répartition des réclamations par statut
  const claimsByStatus = await Claim.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = {};
  for (const item of claimsByStatus) {
    byStatus[item._id] = item.count;
  }

  // Structure exacte attendue par le frontend
  return ok(res, {
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
    },
    customers: {
      total: totalCustomers,
    },
    meters: {
      active: activeMeters,
    },
    anomalies: {
      unresolved: unresolvedAnomalies30,
      high: highAnomalies30,
      total: totalAnomalies,
    },
    outages: {
      active: activeOutages,
      lastWeek: lastWeekOutages,
    },
    claims: {
      open: openClaims,
      total: totalClaims,
      byStatus,
    },
    // Métriques additionnelles (non utilisées par le template actuel)
    extra: {
      avgResolutionDays: Number(avgResolutionDays.toFixed(1)),
      topAnomalyZones: topAnomZones.map(z => ({ city: z._id || 'Inconnu', count: z.count })),
      invoiceTrend: invoiceTrend.map(x => ({ date: x._id, count: x.count })),
    },
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.q) filter.email = new RegExp(req.query.q, 'i');
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return ok(res, items, buildMeta({ total, page, limit }));
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'pending'].includes(status)) throw ApiError.badRequest('Statut invalide');
  const user = await User.findByIdAndUpdate(req.params.userId, { status }, { new: true });
  if (!user) throw ApiError.notFound();
  return ok(res, { user });
});

const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const filter = {};
  if (req.query.q) {
    const r = new RegExp(req.query.q, 'i');
    filter.$or = [{ clientId: r }, { firstName: r }, { lastName: r }];
  }
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);
  return ok(res, items, buildMeta({ total, page, limit }));
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const a = await Announcement.create({ ...req.body, createdBy: req.user.id });
  return ok(res, { announcement: a });
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const items = await Announcement.find().sort({ createdAt: -1 }).limit(200).lean();
  return ok(res, items);
});

module.exports = {
  dashboard,
  listUsers,
  updateUserStatus,
  listCustomers,
  createAnnouncement,
  listAnnouncements,
};
