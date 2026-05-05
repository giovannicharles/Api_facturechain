const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/factures.controller');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getFactures);
router.get('/verify/:reference', ctrl.verifyFacture);
router.get('/:id', ctrl.getFacture);
router.post('/', adminOnly, ctrl.createFacture); // Admin only

module.exports = router;
