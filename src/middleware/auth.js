const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token manquant ou invalide' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.actif) return res.status(401).json({ message: 'Utilisateur introuvable ou inactif' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
  next();
};

module.exports = { authMiddleware, adminOnly };
