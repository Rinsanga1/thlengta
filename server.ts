require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { securityMiddleware } = require("./config/security");
const { renderPageMiddleware } = require("./app/middleware/renderPage");
const { routeLogger } = require("./app/middleware/route_logger");
const { initDb, getDb } = require("./db/database");
const { compileCSS } = require("./scripts/compile-css");
const router = require("./config/routes");
const { createSessionMiddleware, createSuperadminSessionMiddleware } = require("./config/session");

const app = express();

compileCSS();

// If behind Nginx/Cloudflare, this helps with secure cookies + req.ip
app.set("trust proxy", 1);

// Set views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app/views"));

// Serve static assets - bun can serve typescript directly
app.use('/assets', express.static(path.join(__dirname, 'app/assets')));
app.use('/client', express.static(path.join(__dirname, 'app/client')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(securityMiddleware);

// Session configuration validation
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_secret_change_me";
const SUPERADMIN_SESSION_SECRET = process.env.SUPERADMIN_SESSION_SECRET || "dev_superadmin_secret_change_me";

if (SESSION_SECRET === "dev_secret_change_me") {
  console.warn("[WARN] SESSION_SECRET is using default. Set it in .env for production.");
}
if (SUPERADMIN_SESSION_SECRET === "dev_superadmin_secret_change_me") {
  console.warn("[WARN] SUPERADMIN_SESSION_SECRET is using default. Set it in .env for production.");
}

// Initialize database and session middleware
let sessionMiddleware;
let superadminSessionMiddleware;

// Session middleware will be added after DB initialization
// This is a placeholder middleware that will be replaced
app.use((req, res, next) => {
  if (sessionMiddleware) {
    sessionMiddleware(req, res, next);
  } else {
    next();
  }
});

// Superadmin routes use separate session middleware
app.use('/superadmin', (req, res, next) => {
  if (superadminSessionMiddleware) {
    superadminSessionMiddleware(req, res, next);
  } else {
    next();
  }
});

// Render page helper
app.use(renderPageMiddleware);

// Route logger
app.use(routeLogger);

// Router
app.use("/", router);

// Health check
app.get("/health", (req, res) => res.json({ ok: true, app: "thlengta" }));

const PORT = Number(process.env.PORT || 3000);

initDb()
  .then(() => {
    const db = getDb();

    // Initialize session middleware
    sessionMiddleware = createSessionMiddleware();
    superadminSessionMiddleware = createSuperadminSessionMiddleware();

    console.log("[Session] Session store initialized with SQLite");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Thlengta running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB init failed:", err);
    process.exit(1);
  });

// Graceful shutdown - cleanup session store
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  // The session store cleanup interval will be cleared automatically
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  process.exit(0);
});
