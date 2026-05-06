const mongoose = require('mongoose');

const ROLES = ['subscriber', 'agent', 'admin'];
const STATUSES = ['active', 'suspended', 'pending'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'subscriber', index: true },
    status: { type: String, enum: STATUSES, default: 'active', index: true },

    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },

    // Pour les abonnés : lien vers la fiche client ENEO (Customer)
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },

    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    failedLoginCount: { type: Number, default: 0 },
    refreshTokens: [{ token: String, createdAt: Date, userAgent: String }],
  },
  { timestamps: true }
);

userSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshTokens;
    delete ret.__v;
    return ret;
  },
});

userSchema.statics.ROLES = ROLES;
userSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('User', userSchema);
