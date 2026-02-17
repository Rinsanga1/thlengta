(function() {
  const statusEl = document.getElementById("checkin-status");
  const errorEl = document.getElementById("checkin-error");
  const resultEl = document.getElementById("checkin-result");
  const workplacesList = document.getElementById("workplaces-list");
  const modal = document.getElementById("checkin-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalMessage = document.getElementById("modal-message");
  const modalLoading = document.getElementById("modal-loading");
  const modalConfirm = document.getElementById("modal-confirm");
  const modalResult = document.getElementById("modal-result");
  const confirmBtn = document.getElementById("confirm-checkin-btn");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const cancelModalBtn = document.getElementById("cancel-modal-btn");

  let pendingCheckin = null;

  function showModal(title, message, showLoading, showConfirm, showResult, isSuccess) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalLoading.style.display = showLoading ? "block" : "none";
    modalConfirm.style.display = showConfirm ? "flex" : "none";
    modalResult.style.display = showResult ? "block" : "none";
    if (showResult) {
      const resultIcon = document.getElementById("result-icon");
      const resultMessage = document.getElementById("result-message");
      resultIcon.textContent = isSuccess ? "✓" : "✗";
      resultIcon.style.color = isSuccess ? "#22c55e" : "#ef4444";
      resultMessage.textContent = message;
    }
    modal.style.display = "flex";
  }

  function hideModal() {
    modal.style.display = "none";
    pendingCheckin = null;
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

      document.getElementById("fp_tz").value = tz;
      document.getElementById("fp_lang").value = lang;
      document.getElementById("fp_platform").value = platform;
      document.getElementById("fp_sw").value = sw;
      document.getElementById("fp_sh").value = sh;
      document.getElementById("fp_dpr").value = dpr;
    } catch (e) {}
  }

  async function captureGps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("GPS not supported in this browser"));
        return;
      }
      if (!window.isSecureContext) {
        reject(new Error("GPS requires HTTPS"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }

  async function doCheckin(workplaceId, workplaceName, btn) {
    btn.disabled = true;
    
    showModal(
      "Getting your location...",
      "Please allow location access when prompted",
      true, false, false, false
    );

    try {
      const gps = await captureGps();
      
      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      showModal(
        "Check In?",
        `You are at ${workplaceName}. Check in for ${today}?`,
        false, true, false, false
      );

      pendingCheckin = {
        workplaceId,
        workplaceName,
        lat: gps.lat,
        lng: gps.lng,
        btn
      };

    } catch (err) {
      let msg = "Location error. ";
      if (err.code === 1) msg += "Permission denied. Please allow location access.";
      else if (err.code === 2) msg += "Position unavailable.";
      else if (err.code === 3) msg += "Timeout. Try again.";
      else msg += err.message;

      showModal("Error", msg, false, false, true, false);
    }
  }

  async function submitCheckin() {
    if (!pendingCheckin) return;

    const { workplaceId, workplaceName, lat, lng, btn } = pendingCheckin;
    
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Checking in...";

    attachFingerprint();

    const body = {
      workplacePublicId: workplaceId,
      lat: lat,
      lng: lng,
      fp_tz: document.getElementById("fp_tz").value,
      fp_lang: document.getElementById("fp_lang").value,
      fp_platform: document.getElementById("fp_platform").value,
      fp_sw: document.getElementById("fp_sw").value,
      fp_sh: document.getElementById("fp_sh").value,
      fp_dpr: document.getElementById("fp_dpr").value
    };

    try {
      const response = await fetch("/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (result.ok) {
        showModal(
          "Success!",
          result.message || "Checked in successfully!",
          false, false, true, true
        );
        if (workplacesList) workplacesList.style.display = "none";
      } else {
        showModal(
          "Check-in Failed",
          result.error || "Unable to check in",
          false, false, true, false
        );
        btn.disabled = false;
        btn.textContent = "Check In";
      }
    } catch (err) {
      showModal("Error", "Network error. Please try again.", false, false, true, false);
      btn.disabled = false;
      btn.textContent = "Check In";
    }

    pendingCheckin = null;
  }

  document.querySelectorAll(".checkin-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const workplaceId = btn.dataset.workplaceId;
      const workplaceName = btn.dataset.workplaceName;
      doCheckin(workplaceId, workplaceName, btn);
    });
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", submitCheckin);
  }

  if (cancelModalBtn) {
    cancelModalBtn.addEventListener("click", () => {
      hideModal();
      document.querySelectorAll(".checkin-btn").forEach(btn => {
        btn.disabled = false;
        btn.textContent = "Check In";
      });
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      hideModal();
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideModal();
      document.querySelectorAll(".checkin-btn").forEach(btn => {
        btn.disabled = false;
        btn.textContent = "Check In";
      });
    }
  });
})();
