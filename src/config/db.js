const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI non défini dans .env');

    const conn = await mongoose.connect(uri, {
      // Options recommandées pour MongoDB Atlas
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Atlas connecté : ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('❌ Erreur connexion MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
