const { dbGet } = require("../../../db/helpers");
const { getManagerStoreOrNull } = require("../../utils/manager.utils");
const { toPngBuffer } = require("../../utils/qr"); // Assuming toPngBuffer is in qr.js

function getBaseUrl(req) { // This helper is needed here and also in adminStoresController
  const envBase = process.env.BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// Displays the store QR code page
exports.show = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;

    return res.renderPage("manager/qrs/show", { // Renamed view
      title: "Store QR",
      store,
      scanUrl
    });
  } catch (err) {
    console.error("Manager QR view error:", err);
    return res.status(500).send("Server error");
  }
};

// Serves the store's QR code as a PNG
exports.png = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
    const png = await toPngBuffer(scanUrl);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (err) {
    console.error("Manager QR png error:", err);
    return res.status(500).send("Server error");
  }
};
