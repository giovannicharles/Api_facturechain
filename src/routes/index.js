const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const authCtrl = require('../controllers/auth.controller');
const facturesCtrl = require('../controllers/factures.controller');
const reclCtrl = require('../controllers/reclamations.controller');
const statsCtrl = require('../controllers/stats.controller');
const { uploadPreuve } = require('../config/cloudinary');

const router = express.Router();

// ==========================================
// AUTH
// ==========================================
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', authMiddleware, authCtrl.me);

// ==========================================
// FACTURES
// ==========================================
router.get('/factures', authMiddleware, facturesCtrl.getFactures);
router.get('/factures/verify/:reference', facturesCtrl.verifyFacture); // public
router.get('/factures/:id', authMiddleware, facturesCtrl.getFacture);
router.post('/factures', authMiddleware, adminOnly, facturesCtrl.createFacture);

// ==========================================
// RÉCLAMATIONS
// ==========================================
router.get('/reclamations', authMiddleware, reclCtrl.getReclamations);
router.get('/reclamations/:id', authMiddleware, reclCtrl.getReclamation);
router.post('/reclamations', authMiddleware, uploadPreuve.array('preuves', 5), reclCtrl.createReclamation);
router.patch('/reclamations/:id/statut', authMiddleware, reclCtrl.updateStatut);

// ==========================================
// STATS
// ==========================================
router.get('/stats/dashboard', authMiddleware, facturesCtrl.getDashboard);
router.get('/stats/zones', statsCtrl.getStatsZones);           // public
router.get('/stats/public', statsCtrl.getDashboardPublic);     // public

module.exports = router;
