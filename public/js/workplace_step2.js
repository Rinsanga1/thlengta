(function () {
  const btnUseLoc = document.getElementById("btnUseLoc");
  const btnContinue = document.getElementById("btnContinue");
  const statusBox = document.getElementById("locStatus");
  const mapFrame = document.getElementById("mapFrame");

  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  const accEl = document.getElementById("acc");

  const btnManual = document.getElementById("btnManual");
  const manualForm = document.getElementById("manualForm");

  if (!btnUseLoc) return; // safety

  function setStatus(title, msg) {
    statusBox.innerHTML =
      '<div style="font-weight:900;">' + title + '</div>' +
      '<div class="small" style="margin-top:6px;">' + msg + '</div>';
  }

  function setMap(lat, lng) {
    const lat6 = Number(lat).toFixed(6);
    const lng6 = Number(lng).toFixed(6);
    mapFrame.src =
      "https://www.google.com/maps?q=" +
      encodeURIComponent(lat6 + "," + lng6) +
      "&z=18&output=embed";
  }

  btnManual.addEventListener("click", function () {
    manualForm.style.display =
      (manualForm.style.display === "none" || !manualForm.style.display)
        ? "block"
        : "none";
  });

  btnUseLoc.addEventListener("click", function () {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported", "Your browser does not support location services.");
      return;
    }

    setStatus("Requesting location permission", "Please allow location access.");

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        latEl.value = lat;
        lngEl.value = lng;
        accEl.value = acc;

        setStatus(
          "Location captured",
          "Lat: " + lat.toFixed(6) + " | Lng: " + lng.toFixed(6) + " | Accuracy: ~" + Math.round(acc) + "m"
        );

        setMap(lat, lng);
        btnContinue.disabled = false;
      },
      function (err) {
        setStatus("Could not get location", (err && err.message) ? err.message : "Permission denied or unavailable.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
})();
