const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stats.controller');
const { authMiddleware } = require('../middleware/auth');
const facturesCtrl = require('../controllers/factures.controller');

// Public
router.get('/public', ctrl.getDashboardPublic);
router.get('/zones', ctrl.getStatsZones);

// Protected
router.get('/dashboard', authMiddleware, facturesCtrl.getDashboard);

module.exports = router;
