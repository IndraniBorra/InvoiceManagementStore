/**
 * CRA dev-server middleware.
 * Explicitly disables COEP so Plaid Link's cross-origin iframe can load.
 * Without this, Chrome defaults to COEP:same-origin and blocks cdn.plaid.com.
 */
module.exports = function (app) {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
};
