const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage pour les preuves de réclamation
const preuveStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: process.env.CLOUDINARY_FOLDER || 'facturechain/preuves',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    resource_type: 'auto',
  },
});

// Storage pour les photos de compteur
const compteurStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'facturechain/compteurs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
  },
});

const uploadPreuve = multer({
  storage: preuveStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadCompteur = multer({
  storage: compteurStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { cloudinary, uploadPreuve, uploadCompteur };
