const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { nanoid } = require("nanoid");

const uploadDir = path.join(process.cwd(), "public", "uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn("Could not create uploads dir:", e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
    cb(null, `store_${req.params.storeId || "new"}_${Date.now()}_${nanoid(6)}${safeExt}`);
  }
});

function fileFilter(req, file, cb) {
  const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Invalid file type. Only PNG/JPG/WEBP allowed."), ok);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

module.exports = upload;
