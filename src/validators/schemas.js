const Joi = require('joi');

const auth = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
    firstName: Joi.string().min(1).max(80).required(),
    lastName: Joi.string().min(1).max(80).required(),
    phone: Joi.string().pattern(/^\+?[0-9 ]{6,20}$/).optional(),
    clientId: Joi.string().trim().optional(),
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
  refresh: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

const claim = {
  submit: Joi.object({
    type: Joi.string().valid(
      'BILLING_DISPUTE', 'METER_DEFECT', 'WRONG_READING', 'POWER_OUTAGE', 'CONNECTION_ISSUE', 'OTHER'
    ).required(),
    title: Joi.string().min(3).max(120).required(),
    description: Joi.string().min(10).max(4000).required(),
    meterId: Joi.string().hex().length(24).optional(),
    invoiceId: Joi.string().hex().length(24).optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    attachments: Joi.array().items(
      Joi.object({ name: Joi.string(), url: Joi.string().uri(), mime: Joi.string() })
    ).optional(),
  }),
  message: Joi.object({
    body: Joi.string().min(1).max(4000).required(),
    attachments: Joi.array().items(
      Joi.object({ name: Joi.string(), url: Joi.string().uri(), mime: Joi.string() })
    ).optional(),
  }),
  changeStatus: Joi.object({
    status: Joi.string().valid(
      'received', 'investigating', 'transmitted_to_eneo', 'awaiting_response', 'resolved', 'rejected', 'closed'
    ).required(),
    note: Joi.string().max(2000).optional(),
  }),
};

const indexReading = {
  create: Joi.object({
    meterId: Joi.string().hex().length(24).required(),
    value: Joi.number().min(0).required(),
    readingDate: Joi.date().optional(),
    photoUrl: Joi.string().uri().optional(),
    notes: Joi.string().max(500).optional(),
  }),
};

const outage = {
  report: Joi.object({
    region: Joi.string().required(),
    city: Joi.string().required(),
    neighborhood: Joi.string().allow('').optional(),
    coordinates: Joi.object({ lat: Joi.number(), lng: Joi.number() }).optional(),
    startTime: Joi.date().required(),
    description: Joi.string().max(500).allow('').optional(),
  }),
};

module.exports = { auth, claim, indexReading, outage };
