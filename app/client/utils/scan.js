(function () {
  const form = document.getElementById("scanForm");
  const submitBtn = document.getElementById("submitBtn");
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  const gpsStatus = document.getElementById("gpsStatus");
  const gpsDebug = document.getElementById("gpsDebug");

  // Device token hidden field (your existing anti-buddy punch token)
  const deviceTokenEl = document.getElementById("device_token");

  // Fingerprint hidden fields
  const fpTz = document.getElementById("fp_tz");
  const fpLang = document.getElementById("fp_lang");
  const fpPlatform = document.getElementById("fp_platform");
  const fpSw = document.getElementById("fp_sw");
  const fpSh = document.getElementById("fp_sh");
  const fpDpr = document.getElementById("fp_dpr");

  // PIN input (from scan.ejs)
  const pinInput = document.getElementById("pinInput");

  function setStatus(msg) { if (gpsStatus) gpsStatus.textContent = msg; }
  function setDebug(msg) { if (gpsDebug) gpsDebug.textContent = msg || ""; }

  function safeUUID() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return "dev_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function getOrCreateDeviceToken() {
    const key = "thlengta_device_token";
    try {
      let t = localStorage.getItem(key);
      if (!t) {
        t = safeUUID();
        localStorage.setItem(key, t);
      }
      return t;
    } catch (e) {
      // If storage is blocked (private mode etc), still give a token for this request
      return safeUUID();
    }
  }

  function attachDeviceToken() {
    const t = getOrCreateDeviceToken();
    if (deviceTokenEl) deviceTokenEl.value = t;
  }

  function attachFingerprint() {
    try {
      const tz = (window.Intl && Intl.DateTimeFormat)
        ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "")
        : "";

      const lang = String(navigator.language || "");
      const platform = String(
        navigator.platform ||
        (navigator.userAgentData && navigator.userAgentData.platform) ||
        ""
      );

      const sw = String((window.screen && screen.width) || window.innerWidth || "");
      const sh = String((window.screen && screen.height) || window.innerHeight || "");
      const dpr = String(window.devicePixelRatio || "");

      if (fpTz) fpTz.value = tz;
      if (fpLang) fpLang.value = lang;
      if (fpPlatform) fpPlatform.value = platform;
      if (fpSw) fpSw.value = sw;
      if (fpSh) fpSh.value = sh;
      if (fpDpr) fpDpr.value = dpr;
    } catch (e) {
      // ignore
    }
  }

  function hasCoords() {
    const lat = parseFloat(latEl && latEl.value ? latEl.value : "");
    const lng = parseFloat(lngEl && lngEl.value ? lngEl.value : "");
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  }

  function getPos(opts) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, opts);
    });
  }

  async function captureGps() {
    if (!navigator.geolocation) {
      setStatus("GPS not supported in this browser.");
      setDebug("");
      return false;
    }
    if (!window.isSecureContext) {
      setStatus("GPS blocked: must be https.");
      setDebug("");
      return false;
    }

    setStatus("Requesting location permission...");

    try {
      const pos = await getPos({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      if (latEl) latEl.value = String(lat);
      if (lngEl) lngEl.value = String(lng);

      setStatus(`Location captured (~${Math.round(acc || 0)}m). Submitting...`);
      setDebug(`lat=${lat.toFixed(6)} lng=${lng.toFixed(6)} acc=${Math.round(acc || 0)}m`);

      return hasCoords();
    } catch (err) {
      const code = err && err.code;
      const msg = (err && err.message) ? err.message : "";

      let human = "Location failed. ";
      if (code === 1) human += "Permission denied (allow location).";
      else if (code === 2) human += "Position unavailable (turn on location services).";
      else if (code === 3) human += "Timeout (try near a window).";
      else human += "Unknown error.";

      setStatus(human);
      setDebug(`GPS error code=${code} msg=${msg}`);
      return false;
    }
  }

  // Fill device token + fingerprint immediately (so form has them even before click)
  attachDeviceToken();
  attachFingerprint();

  setStatus("Press the button to capture GPS.");

  // ---------------------------
  // KEY FIX: one unified submit flow
  // - Works for button click
  // - Works for Android keyboard Enter
  // - Prevents accidental double submits
  // ---------------------------
  let busy = false;

  async function doCheckin(e) {
    if (e && e.preventDefault) e.preventDefault();

    if (busy) return;

    // Always refresh values right before submit
    attachDeviceToken();
    attachFingerprint();

    // If coords already exist, we can submit immediately
    // (keeps behavior consistent if browser cached fields)
    if (hasCoords()) {
      form.submit();
      return;
    }

    busy = true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.7";
    }

    const ok = await captureGps();

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
    }

    busy = false;

    if (!ok) return;

    form.submit();
  }

  // Button click uses the unified flow
  if (submitBtn) submitBtn.addEventListener("click", doCheckin);

  // Catch any native form submits (Android Enter sometimes does this)
  if (form) form.addEventListener("submit", doCheckin);

  // Extra hardening: prevent Enter from triggering a native submit early,
  // and instead run the same checkin flow.
  if (pinInput) {
    pinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doCheckin(e);
      }
    });
  }
})();
