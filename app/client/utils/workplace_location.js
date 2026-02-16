/**
 * Workplace Location Picker
 * Handles geolocation and map preview for workplace creation
 */
(function() {
  const btnUseLoc = document.getElementById('btnUseLoc');
  const latInput = document.getElementById('lat');
  const lngInput = document.getElementById('lng');
  const accInput = document.getElementById('accuracy_m');
  const mapFrame = document.getElementById('mapFrame');
  const locStatus = document.getElementById('locStatus');

  if (!btnUseLoc || !latInput || !lngInput || !mapFrame) return;

  function updateMap(lat, lng) {
    mapFrame.src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
  }

  function updateStatus(message, type = 'info') {
    locStatus.innerHTML = `
      <div style="font-weight:900;">${type === 'error' ? 'Error' : 'Location Set'}</div>
      <div class="small" style="margin-top:6px;">${message}</div>
    `;
    locStatus.style.background = type === 'error' ? '#fff3f3' : '#eaf6f0';
  }

  btnUseLoc.addEventListener('click', function() {
    if (!navigator.geolocation) {
      updateStatus('Geolocation is not supported by your browser', 'error');
      return;
    }

    locStatus.innerHTML = '<div style="font-weight:900;">Getting location...</div>';
    locStatus.style.background = '#fff7df';

    navigator.geolocation.getCurrentPosition(
      function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = position.coords.accuracy;

        latInput.value = lat.toFixed(6);
        lngInput.value = lng.toFixed(6);
        if (accInput) accInput.value = Math.round(acc);

        updateMap(lat, lng);
        updateStatus(`Location captured (accuracy: ${Math.round(acc)}m)`);
      },
      function(error) {
        let message = 'Unable to retrieve your location';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access denied. Please allow location permission.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out.';
            break;
        }
        updateStatus(message, 'error');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });

  // Update map when inputs change manually
  function onCoordsChange() {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      updateMap(lat, lng);
    }
  }

  latInput.addEventListener('change', onCoordsChange);
  lngInput.addEventListener('change', onCoordsChange);
})();
