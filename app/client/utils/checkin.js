(function() {
  const workplacesList = document.getElementById("workplaces-list");
  const modal = document.getElementById("checkin-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalLoading = document.getElementById("modal-loading");
  const modalFail = document.getElementById("modal-fail");
  const failMessage = document.getElementById("fail-message");
  const modalPass = document.getElementById("modal-pass");
  const modalSuccess = document.getElementById("modal-success");
  const successMessage = document.getElementById("success-message");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalConfirmBtn = document.getElementById("modal-confirm-btn");

  let pendingCheckin = null;

  function showModal() {
    modal.style.display = "flex";
  }

  function hideModal() {
    modal.style.display = "none";
    pendingCheckin = null;
  }

  function showLoading(message) {
    modalTitle.textContent = "Checking In";
    modalLoading.style.display = "block";
    modalFail.style.display = "none";
    modalPass.style.display = "none";
    modalSuccess.style.display = "none";
    modalCloseBtn.style.display = "none";
    modalCancelBtn.style.display = "none";
    modalConfirmBtn.style.display = "none";
    showModal();
  }

  function showFail(message) {
    modalTitle.textContent = "Cannot Check In";
    modalLoading.style.display = "none";
    modalFail.style.display = "block";
    failMessage.textContent = message;
    modalPass.style.display = "none";
    modalSuccess.style.display = "none";
    modalCloseBtn.style.display = "inline-block";
    modalCancelBtn.style.display = "none";
    modalConfirmBtn.style.display = "none";
    showModal();
  }

  function showPass() {
    modalTitle.textContent = "Check In";
    modalLoading.style.display = "none";
    modalFail.style.display = "none";
    modalPass.style.display = "block";
    modalSuccess.style.display = "none";
    modalCloseBtn.style.display = "none";
    modalCancelBtn.style.display = "inline-block";
    modalConfirmBtn.style.display = "inline-block";
    showModal();
  }

  function showSuccess(message) {
    modalTitle.textContent = "Success!";
    modalLoading.style.display = "none";
    modalFail.style.display = "none";
    modalPass.style.display = "none";
    modalSuccess.style.display = "block";
    successMessage.textContent = message;
    modalCloseBtn.style.display = "inline-block";
    modalCancelBtn.style.display = "none";
    modalConfirmBtn.style.display = "none";
    showModal();
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

  async function validateLocation(workplaceId, workplaceName, btn) {
    btn.disabled = true;
    btn.textContent = "Checking...";
    
    showLoading("Getting your location...");

    try {
      const gps = await captureGps();
      
      showLoading("Verifying location...");

      const body = {
        workplacePublicId: workplaceId,
        lat: gps.lat,
        lng: gps.lng,
        validateOnly: true
      };

      const response = await fetch("/checkin/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (result.ok) {
        if (result.withinGeofence) {
          pendingCheckin = {
            workplaceId,
            workplaceName,
            lat: gps.lat,
            lng: gps.lng,
            btn
          };
          showPass();
        } else {
          showFail(result.error || "You are not at this store location.");
          btn.disabled = false;
          btn.textContent = "Check In";
        }
      } else {
        showFail(result.error || "Unable to verify location.");
        btn.disabled = false;
        btn.textContent = "Check In";
      }

    } catch (err) {
      let msg = "Location error. ";
      if (err.code === 1) msg += "Permission denied. Please allow location access.";
      else if (err.code === 2) msg += "Position unavailable.";
      else if (err.code === 3) msg += "Timeout. Try again.";
      else msg += err.message;

      showFail(msg);
      btn.disabled = false;
      btn.textContent = "Check In";
    }
  }

  async function submitCheckin() {
    if (!pendingCheckin) return;

    const { workplaceId, workplaceName, lat, lng, btn } = pendingCheckin;
    
    modalConfirmBtn.disabled = true;
    modalConfirmBtn.textContent = "Checking in...";

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
        showSuccess(result.message || "Checked in successfully!");
        if (workplacesList) workplacesList.style.display = "none";
      } else {
        showFail(result.error || "Unable to check in.");
        btn.disabled = false;
        btn.textContent = "Check In";
      }
    } catch (err) {
      showFail("Network error. Please try again.");
      btn.disabled = false;
      btn.textContent = "Check In";
    }

    pendingCheckin = null;
  }

  document.querySelectorAll(".checkin-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const workplaceId = btn.dataset.workplaceId;
      const workplaceName = btn.dataset.workplaceName;
      validateLocation(workplaceId, workplaceName, btn);
    });
  });

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener("click", submitCheckin);
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", () => {
      hideModal();
      document.querySelectorAll(".checkin-btn").forEach(btn => {
        btn.disabled = false;
        btn.textContent = "Check In";
      });
    });
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      hideModal();
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideModal();
    }
  });
})();
