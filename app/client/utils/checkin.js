(function() {
  const workplacesList = document.getElementById("workplaces-list");
  const loadingModal = document.getElementById("checkinLoadingModal");
  const loadingMessage = document.getElementById("loadingMessage");
  const confirmModal = document.getElementById("checkinConfirmModal");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmYesBtn = document.getElementById("confirmYesBtn");
  const failModal = document.getElementById("checkinFailModal");
  const failMessage = document.getElementById("failMessage");
  const failCloseBtn = document.getElementById("failCloseBtn");
  const successModal = document.getElementById("checkinSuccessModal");
  const successMessage = document.getElementById("successMessage");
  const successCloseBtn = document.getElementById("successCloseBtn");

  let pendingCheckin = null;

  function showLoadingModal(msg) {
    loadingMessage.textContent = msg;
    loadingModal.style.display = "flex";
  }

  function hideLoadingModal() {
    loadingModal.style.display = "none";
  }

  function showConfirmModal(workplaceName, dateStr) {
    confirmMessage.textContent = `Do you want to check in at ${workplaceName} for ${dateStr}?`;
    confirmModal.style.display = "flex";
  }

  function hideConfirmModal() {
    confirmModal.style.display = "none";
  }

  function showFailModal(msg) {
    failMessage.textContent = msg;
    failModal.style.display = "flex";
  }

  function hideFailModal() {
    failModal.style.display = "none";
  }

  function showSuccessModal(msg) {
    successMessage.textContent = msg;
    successModal.style.display = "flex";
  }

  function hideSuccessModal() {
    successModal.style.display = "none";
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
    
    showLoadingModal("Getting your location...");

    try {
      const gps = await captureGps();
      
      showLoadingModal("Verifying location...");

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

      hideLoadingModal();

      if (result.ok) {
        if (result.withinGeofence) {
          const today = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
          pendingCheckin = {
            workplaceId,
            workplaceName,
            lat: gps.lat,
            lng: gps.lng,
            btn
          };
          showConfirmModal(workplaceName, today);
        } else {
          showFailModal(result.error || "You are not at this store location.");
          btn.disabled = false;
          btn.textContent = "Check In";
        }
      } else {
        showFailModal(result.error || "Unable to verify location.");
        btn.disabled = false;
        btn.textContent = "Check In";
      }

    } catch (err) {
      hideLoadingModal();
      let msg = "Location error. ";
      if (err.code === 1) msg += "Permission denied. Please allow location access.";
      else if (err.code === 2) msg += "Position unavailable.";
      else if (err.code === 3) msg += "Timeout. Try again.";
      else msg += err.message;

      showFailModal(msg);
      btn.disabled = false;
      btn.textContent = "Check In";
    }
  }

  async function submitCheckin() {
    if (!pendingCheckin) return;

    const { workplaceId, workplaceName, lat, lng, btn } = pendingCheckin;
    
    hideConfirmModal();
    showLoadingModal("Checking in...");

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

      hideLoadingModal();

      if (result.ok) {
        const today = new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        showSuccessModal(`Checked in at ${workplaceName} for ${today}`);
        if (workplacesList) workplacesList.style.display = "none";
      } else {
        showFailModal(result.error || "Unable to check in.");
        btn.disabled = false;
        btn.textContent = "Check In";
      }
    } catch (err) {
      hideLoadingModal();
      showFailModal("Network error. Please try again.");
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

  confirmYesBtn.addEventListener("click", submitCheckin);
  
  confirmCancelBtn.addEventListener("click", () => {
    hideConfirmModal();
    document.querySelectorAll(".checkin-btn").forEach(btn => {
      btn.disabled = false;
      btn.textContent = "Check In";
    });
  });

  failCloseBtn.addEventListener("click", hideFailModal);
  successCloseBtn.addEventListener("click", hideSuccessModal);

  [loadingModal, confirmModal, failModal, successModal].forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
  });
})();
