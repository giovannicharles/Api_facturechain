const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.get('/me', authMiddleware, authCtrl.me);

module.exports = router;
