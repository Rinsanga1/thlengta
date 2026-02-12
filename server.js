require("dotenv").config();
console.log("[BOOT] SUPERADMIN_EMAIL =", process.env.SUPERADMIN_EMAIL);
console.log("[BOOT] SMTP_USER =", process.env.SMTP_USER);
console.log("[BOOT] MAIL_FROM =", process.env.MAIL_FROM);

const path = require("path");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

// SQLite session store
const SQLiteStoreFactory = require("connect-sqlite3");
const SQLiteStore = SQLiteStoreFactory(session);

const { initDb } = require("./src/db/database");

const authRoutes = require("./src/routes/auth.routes");
const adminRoutes = require("./src/routes/admin.routes");
const employeeRoutes = require("./src/routes/employee.routes");
const superAdminRoutes = require("./src/routes/superadmin.routes");
const managerRoutes = require("./src/routes/manager.routes");

const app = express();

// If behind Nginx/Cloudflare, this helps with secure cookies + req.ip
app.set("trust proxy", 1);

/**
 * Helmet with CSP tuned for:
 * - local JS/CSS (self)
 * - Google Maps iframe preview (frame-src)
 */
app.use(
  helmet({
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
  })
);

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/contact", (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const message = (req.body.message || "").trim();

  if (!name || !email || !message) {
    return res.status(400).send("Please fill all fields.");
  }

  console.log("[CONTACT]", { name, email, message });
  return res.status(200).send("OK");
});

app.use(cookieParser());

// Serve /public folder at web root
app.use(express.static(path.join(__dirname, "public")));

// ----------------------
// Sessions (SQLite store)
// ----------------------
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_secret_change_me";
if (SESSION_SECRET === "dev_secret_change_me") {
  console.warn("[WARN] SESSION_SECRET is using default. Set it in .env for production.");
}

// Store file will be created automatically if missing
const sessionStore = new SQLiteStore({
  db: "sessions.sqlite",
  dir: process.cwd(),
  table: "sessions",
  // ttl is seconds. This is the server-side cleanup window.
  // Even if cookie expires sooner, old rows may remain until cleanup (fine).
  ttl: 60 * 60 * 24 * 30 // 30 days
});

app.use(
  session({
    name: "thlengta.sid",
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",

      // Your site is https (and you set trust proxy), so keep secure true.
      // If you ever test on plain http locally, set this to false locally.
      secure: true

      // IMPORTANT:
      // We do NOT set maxAge here, so by default it becomes a session cookie
      // (dies when browser closes).
      // For Remember Me, the login route will set:
      // req.session.cookie.maxAge = 14 days
    }
  })
);

// Views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));

// Helper: renderPage wraps views in layout
app.use((req, res, next) => {
  res.renderPage = (view, params = {}) => {
    res.render(view, params, (err, html) => {
      if (err) return next(err);
      res.render("layouts/main", { ...params, body: html });
    });
  };
  next();
});

// Routes
app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/superadmin", superAdminRoutes);
app.use("/manager", managerRoutes);
app.use("/e", employeeRoutes);

app.get("/health", (req, res) => res.json({ ok: true, app: "thlengta" }));

const PORT = Number(process.env.PORT || 8105);

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Thlengta running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB init failed:", err);
    process.exit(1);
  });
