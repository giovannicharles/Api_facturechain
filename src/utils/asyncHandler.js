/**
 * Wrap un handler async pour propager les erreurs au middleware d'erreur Express.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
