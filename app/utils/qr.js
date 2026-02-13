const QRCode = require("qrcode");

async function toPngBuffer(text) {
  return QRCode.toBuffer(text, {
    type: "png",
    margin: 1,
    width: 512
  });
}

module.exports = { toPngBuffer };
