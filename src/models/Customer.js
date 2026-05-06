const mongoose = require('mongoose');

/**
 * Customer = la fiche client telle que connue dans le système ENEO.
 * Identifiant client unique (clientId), peut posséder N compteurs.
 */
const customerSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true }, // ex: 'ENC-2024-000123'
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    nationalIdNumber: { type: String, trim: true },

    address: {
      street: { type: String, trim: true },
      neighborhood: { type: String, trim: true, index: true }, // quartier (Bastos, Akwa…)
      city: { type: String, trim: true, index: true }, // Yaoundé, Douala…
      region: { type: String, trim: true, index: true }, // Centre, Littoral…
      country: { type: String, default: 'Cameroun' },
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },

    customerType: { type: String, enum: ['residential', 'commercial', 'industrial'], default: 'residential' },

    // Lien inverse vers le User (compte de connexion). Optionnel : un Customer peut exister sans compte créé.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

customerSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});

customerSchema.set('toJSON', { virtuals: true, transform: (d, r) => { delete r.__v; return r; } });

module.exports = mongoose.model('Customer', customerSchema);
