const ApiError = require('../utils/apiError');

/**
 * Valide req[part] (par défaut 'body') contre un schéma Joi.
 * En cas d'erreur, renvoie un 422 avec le détail des champs.
 */
function validate(schema, part = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[part], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(ApiError.unprocessable('Données invalides', details));
    }
    req[part] = value;
    next();
  };
}

module.exports = validate;
