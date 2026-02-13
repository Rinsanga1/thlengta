require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { securityMiddleware } = require("./config/security");
const { renderPageMiddleware } = require("./app/middleware/renderPage");
const { initDb } = require("./app/db/database");
const { compileCSS } = require("./scripts/compile-css");
const router = require("./config/routes");

// @refactor this later: SQLite session store
const SQLiteStoreFactory = require("connect-sqlite3");
const SQLiteStore = SQLiteStoreFactory(session);



const app = express();


compileCSS();


// serve static assets - bun can serve typescript directly
app.use('/assets', express.static(path.join(__dirname, 'app/assets')));
app.use('/client', express.static(path.join(__dirname, 'app/client')));


// If behind Nginx/Cloudflare, this helps with secure cookies + req.ip
app.set("trust proxy", 1);
// Set views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "app/views"));


app.use(securityMiddleware);


// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cookieParser());


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
      secure: false

      // IMPORTANT:
      // We do NOT set maxAge here, so by default it becomes a session cookie
      // (dies when browser closes).
      // For Remember Me, the login route will set:
      // req.session.cookie.maxAge = 14 days
    }
  })
);




// Render page helper
app.use(renderPageMiddleware);


// Router
app.use("/", router);

app.get("/health", (req, res) => res.json({ ok: true, app: "thlengta" }));

const PORT = Number(process.env.PORT || 3000);

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
