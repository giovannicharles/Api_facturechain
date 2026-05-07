const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validation.middleware');
const schemas = require('../validators/schemas');

const auth = require('../controllers/auth.controller');
const customer = require('../controllers/customer.controller');
const invoice = require('../controllers/invoice.controller');
const claim = require('../controllers/claim.controller');
const outage = require('../controllers/outage.controller');
const publicCtrl = require('../controllers/public.controller');
const admin = require('../controllers/admin.controller');

// ---- Health ----
router.get('/health', (req, res) =>
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime(), now: new Date().toISOString() } })
);

// ---- Auth ----
router.post('/auth/register', validate(schemas.auth.register), auth.register);
router.post('/auth/login', validate(schemas.auth.login), auth.login);
router.post('/auth/refresh', validate(schemas.auth.refresh), auth.refresh);
router.post('/auth/logout', authenticate, auth.logout);
router.get('/auth/me', authenticate, auth.me);

// ---- Customer / Meters (abonné) ----
router.get('/me/customer', authenticate, customer.getMyCustomer);
router.get('/me/meters', authenticate, customer.getMyMeters);
router.get('/meters/:meterId', authenticate, customer.getMeter);
router.get('/meters/:meterId/invoices', authenticate, customer.getMeterInvoices);
router.get('/meters/:meterId/index-readings', authenticate, customer.getMeterIndexReadings);
router.post('/index-readings', authenticate, validate(schemas.indexReading.create), customer.submitIndexReading);
router.get('/meters/:meterId/anomalies', authenticate, customer.getMeterAnomalies);
router.get('/meters/:meterId/consumption-stats', authenticate, customer.getMeterConsumptionStats);

// ---- Invoices ----
router.get('/invoices/search', authenticate, invoice.searchByNumber);
router.get('/invoices/:invoiceId', authenticate, invoice.getInvoice);
router.get('/invoices/:invoiceId/verify', authenticate, invoice.verifyInvoiceIntegrity);
router.get('/invoices/:invoiceId/pdf', authenticate, invoice.downloadInvoicePdf);
router.get('/meters/:meterId/verify-chain', authenticate, invoice.verifyChainForMeter);

// ---- Claims (abonné) ----
router.post('/claims', authenticate, validate(schemas.claim.submit), claim.submit);
router.get('/claims/mine', authenticate, claim.listMine);
router.get('/claims/:claimId', authenticate, claim.detail);
router.post('/claims/:claimId/messages', authenticate, validate(schemas.claim.message), claim.postMessage);

// ---- Outages ----
router.get('/outages', outage.list); // public (pas besoin d'auth pour la carte)
router.post('/outages', authenticate, validate(schemas.outage.report), outage.report);
router.post('/outages/:id/confirm', authenticate, outage.confirm);
router.post('/outages/:id/resolve', authenticate, authorize('agent', 'admin'), outage.resolve);

// ---- Public stats ----
router.get('/public/stats/anomalies-by-zone', publicCtrl.anomaliesByZone);
router.get('/public/stats/outages-by-zone', publicCtrl.outagesByZone);

// ---- Admin ----
router.get('/admin/dashboard', authenticate, authorize('agent', 'admin'), admin.dashboard);
router.get('/admin/users', authenticate, authorize('admin'), admin.listUsers);
router.patch('/admin/users/:userId/status', authenticate, authorize('admin'), admin.updateUserStatus);
router.get('/admin/customers', authenticate, authorize('agent', 'admin'), admin.listCustomers);
router.get('/admin/claims', authenticate, authorize('agent', 'admin'), claim.adminList);
router.get('/admin/claims/:claimId', authenticate, authorize('agent', 'admin'), claim.detail);
router.patch('/admin/claims/:claimId/status', authenticate, authorize('agent', 'admin'),
  validate(schemas.claim.changeStatus), claim.changeStatus);
router.patch('/admin/claims/:claimId/assign', authenticate, authorize('admin'), claim.assign);
router.get('/admin/announcements', authenticate, authorize('agent', 'admin'), admin.listAnnouncements);
router.post('/admin/announcements', authenticate, authorize('admin'), admin.createAnnouncement);

module.exports = router;
