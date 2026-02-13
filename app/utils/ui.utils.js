function pickAlertTypeFromQuery(req) {
  const t = String(req.query.type || "").trim().toLowerCase();
  if (t === "success" || t === "error") return t;
  return null;
}

module.exports = {
  pickAlertTypeFromQuery,
};
