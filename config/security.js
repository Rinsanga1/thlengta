const helmet = require("helmet");

const securityMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],

      "base-uri": ["'self'"],
      "object-src": ["'none'"],

      "frame-ancestors": ["'self'"],

      "frame-src": [
        "'self'",
        "https://www.google.com",
        "https://www.google.com/maps",
        "https://maps.google.com"
      ],

      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],

      "style-src": ["'self'", "https:", "'unsafe-inline'"],

      "img-src": ["'self'", "data:", "https:"],

      "font-src": ["'self'", "https:", "data:"],

      "form-action": ["'self'"],

      "connect-src": ["'self'"],

      "upgrade-insecure-requests": []
    }
  }
});

module.exports = { securityMiddleware };
