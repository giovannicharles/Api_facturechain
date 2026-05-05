const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reclamations.controller');
const { authMiddleware } = require('../middleware/auth');
const { uploadPreuve } = require('../config/cloudinary');

router.use(authMiddleware);

router.get('/', ctrl.getReclamations);
router.get('/:id', ctrl.getReclamation);
router.post('/', uploadPreuve.array('preuves', 5), ctrl.createReclamation);
router.patch('/:id/statut', ctrl.updateStatut);

module.exports = router;
