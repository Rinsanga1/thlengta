function ensureWorkplaceDraft(req) {
  console.log("[DEBUG] req.session:", req.session ? "exists" : "undefined");
  console.log("[DEBUG] req.sessionID:", req.sessionID);
  console.log("[DEBUG] req.session cookie:", req.session.cookie);
  console.log("[DEBUG] Existing draft:", req.session?.workplaceDraft);
  if (!req.session.workplaceDraft) req.session.workplaceDraft = {};
  return req.session.workplaceDraft;
}

function clearWorkplaceDraft(req) {
  delete req.session.workplaceDraft;
}

function parseTime12hToHHMM(t) {
  if (!t) return null;
  const s = String(t).trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2] || "00", 10);
  const ap = m[3];

  if (hh < 1 || hh > 12) return null;
  if (mm < 0 || mm > 59) return null;

  if (ap === "AM") {
    if (hh === 12) hh = 0;
  } else {
    if (hh !== 12) hh += 12;
  }

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function isValidLatLng(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (la < -90 || la > 90) return false;
  if (lo < -180 || lo > 180) return false;
  return true;
}

module.exports = {
  ensureWorkplaceDraft,
  clearWorkplaceDraft,
  parseTime12hToHHMM,
  isValidLatLng,
};
