const jwt = require('jsonwebtoken');
const { User } = require('../models');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.register = async (req, res) => {
  try {
    const { email, password, prenom, nom, numeroAbonne, zone, telephone } = req.body;
    if (!email || !password || !prenom || !nom || !numeroAbonne) {
      return res.status(400).json({ message: 'Tous les champs obligatoires doivent être remplis' });
    }
    const exists = await User.findOne({ $or: [{ email }, { numeroAbonne }] });
    if (exists) return res.status(409).json({ message: 'Email ou numéro d\'abonné déjà utilisé' });

    const user = await User.create({ email, password, prenom, nom, numeroAbonne, zone, telephone });
    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, nom: user.nom, prenom: user.prenom, numeroAbonne: user.numeroAbonne, zone: user.zone, compteur: user.compteur }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email et mot de passe requis' });

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }
    if (!user.actif) return res.status(403).json({ message: 'Compte désactivé' });

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, email: user.email, nom: user.nom, prenom: user.prenom, numeroAbonne: user.numeroAbonne, zone: user.zone, compteur: user.compteur }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};
