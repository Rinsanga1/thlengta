const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

async function makeFramedQrPng(qrPngBuffer, opts = {}) {
  const {
    framePath = path.join(process.cwd(), "public", "assets", "img", "qr-frame.png"),
    qrSize = 720,
    offsetX = 0,
    offsetY = 0
  } = opts;

  if (!fs.existsSync(framePath)) {
    throw new Error(`Frame not found at: ${framePath}`);
  }

  const frame = sharp(framePath);
  const meta = await frame.metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Could not read frame image width/height. Is qr-frame.png a valid PNG?");
  }

  const qrResized = await sharp(qrPngBuffer)
    .resize(qrSize, qrSize, { fit: "contain" })
    .png()
    .toBuffer();

  const left = Math.round((meta.width - qrSize) / 2 + offsetX);
  const top = Math.round((meta.height - qrSize) / 2 + offsetY);

  return await frame
    .composite([{ input: qrResized, left, top }])
    .png()
    .toBuffer();
}

module.exports = { makeFramedQrPng };
