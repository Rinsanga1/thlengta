document.addEventListener('DOMContentLoaded', function() {
  // Delete confirmation functions
  window.showDeleteConfirm = function() {
    document.getElementById('deleteConfirm').style.display = 'block';
  };

  window.hideDeleteConfirm = function() {
    document.getElementById('deleteConfirm').style.display = 'none';
  };

  // Delete confirmation event listeners
  const deleteBtn = document.querySelector('.delete-workplace-btn');
  const cancelDeleteBtn = document.querySelector('.cancel-delete-btn');
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function() {
      document.getElementById('deleteConfirm').style.display = 'block';
    });
  }
  
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', function() {
      document.getElementById('deleteConfirm').style.display = 'none';
    });
  }

  // Edit Location button
  const editLocBtn = document.getElementById('editLocBtn');
  const saveLocBtn = document.getElementById('saveLocBtn');
  const cancelLocBtn = document.getElementById('cancelLocBtn');
  
  if (editLocBtn) {
    const workplaceId = editLocBtn.dataset.workplaceId;

    // Function to enter edit mode
    function enterLocationEditMode() {
      const latInput = document.getElementById('lat');
      const lngInput = document.getElementById('lng');
      const locationFields = document.getElementById('locationFields');
      const locationDisplay = document.getElementById('locationDisplay');
      
      latInput.readOnly = false;
      lngInput.readOnly = false;
      latInput.style.background = '#fff';
      lngInput.style.background = '#fff';
      locationFields.style.display = 'block';
      locationDisplay.style.display = 'none';
      editLocBtn.style.display = 'none';
      
      // Initialize location picker after fields are visible
      initLocationPicker();
    }

    // Function to exit edit mode (cancel)
    function exitLocationEditMode() {
      const latInput = document.getElementById('lat');
      const lngInput = document.getElementById('lng');
      const locationFields = document.getElementById('locationFields');
      const locationDisplay = document.getElementById('locationDisplay');
      
      // Reset values to original
      const originalLat = latInput.dataset.originalLat || latInput.defaultValue;
      const originalLng = lngInput.dataset.originalLng || lngInput.defaultValue;
      
      latInput.value = originalLat;
      lngInput.value = originalLng;
      latInput.readOnly = true;
      lngInput.readOnly = true;
      latInput.style.background = '#f5f5f5';
      lngInput.style.background = '#f5f5f5';
      locationFields.style.display = 'none';
      locationDisplay.style.display = 'block';
      editLocBtn.style.display = '';
    }

    // Edit button click
    editLocBtn.addEventListener('click', function() {
      const latInput = document.getElementById('lat');
      const lngInput = document.getElementById('lng');
      // Store original values
      latInput.dataset.originalLat = latInput.value;
      latInput.dataset.originalLng = lngInput.value;
      enterLocationEditMode();
    });

    // Save button click
    if (saveLocBtn) {
      saveLocBtn.addEventListener('click', function() {
        const latInput = document.getElementById('lat');
        const lngInput = document.getElementById('lng');
        
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/owner/workplaces/' + workplaceId + '/settings';
        
        const latInputHidden = document.createElement('input');
        latInputHidden.type = 'hidden';
        latInputHidden.name = 'lat';
        latInputHidden.value = latInput.value;
        
        const lngInputHidden = document.createElement('input');
        lngInputHidden.type = 'hidden';
        lngInputHidden.name = 'lng';
        lngInputHidden.value = lngInput.value;
        
        const radiusInput = document.createElement('input');
        radiusInput.type = 'hidden';
        radiusInput.name = 'radius_m';
        radiusInput.value = latInput.dataset.radius || 70;
        
        const nameInput = document.createElement('input');
        nameInput.type = 'hidden';
        nameInput.name = 'name';
        nameInput.value = latInput.dataset.workplaceName || '';
        
        form.appendChild(latInputHidden);
        form.appendChild(lngInputHidden);
        form.appendChild(radiusInput);
        form.appendChild(nameInput);
        document.body.appendChild(form);
        form.submit();
      });
    }

    // Cancel button click
    if (cancelLocBtn) {
      cancelLocBtn.addEventListener('click', function() {
        exitLocationEditMode();
      });
    }
  }

  // Edit Details button
  const editDetailsBtn = document.getElementById('editDetailsBtn');
  if (editDetailsBtn) {
    editDetailsBtn.addEventListener('click', function() {
      const detailsFields = document.getElementById('detailsFields');
      const detailsDisplay = document.getElementById('detailsDisplay');
      
      if (detailsFields.style.display === 'none') {
        detailsFields.style.display = 'block';
        detailsDisplay.style.display = 'none';
        editDetailsBtn.textContent = 'Cancel';
      } else {
        detailsFields.style.display = 'none';
        detailsDisplay.style.display = 'block';
        editDetailsBtn.textContent = 'Edit Details';
      }
    });
  }

  // Edit Radius button
  const editRadiusBtn = document.getElementById('editRadiusBtn');
  if (editRadiusBtn) {
    editRadiusBtn.addEventListener('click', function() {
      const radiusFields = document.getElementById('radiusFields');
      const radiusDisplay = document.getElementById('radiusDisplay');
      
      if (radiusFields.style.display === 'none') {
        radiusFields.style.display = 'block';
        radiusDisplay.style.display = 'none';
        editRadiusBtn.textContent = 'Cancel';
      } else {
        radiusFields.style.display = 'none';
        radiusDisplay.style.display = 'block';
        editRadiusBtn.textContent = 'Edit Radius';
      }
    });
  }

  // Location picker functions
  function initLocationPicker() {
    const btnUseLoc = document.getElementById('btnUseLoc');
    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    const mapFrame = document.getElementById('mapFrame');
    const locStatus = document.getElementById('locStatus');

    if (!btnUseLoc || !latInput || !lngInput) return;

    function updateMap(lat, lng) {
      if (mapFrame) {
        mapFrame.src = 'https://www.google.com/maps?q=' + lat + ',' + lng + '&z=16&output=embed';
      }
    }

    function updateStatus(message, type) {
      if (locStatus) {
        locStatus.innerHTML = '<div style="font-weight:900;">' + (type === 'error' ? 'Error' : 'Location Set') + '</div><div class="small" style="margin-top:6px;">' + message + '</div>';
        locStatus.style.background = type === 'error' ? '#fff3f3' : '#eaf6f0';
        locStatus.style.display = 'block';
      }
    }

    btnUseLoc.removeEventListener('click', arguments.callee);
    btnUseLoc.addEventListener('click', function() {
      if (!navigator.geolocation) {
        updateStatus('Geolocation is not supported by your browser', 'error');
        return;
      }

      if (locStatus) {
        locStatus.innerHTML = '<div style="font-weight:900;">Getting location...</div>';
        locStatus.style.background = '#fff7df';
        locStatus.style.display = 'block';
      }

      navigator.geolocation.getCurrentPosition(
        function(position) {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const acc = position.coords.accuracy;

          latInput.value = lat.toFixed(6);
          lngInput.value = lng.toFixed(6);

          updateMap(lat, lng);
          updateStatus('Location captured (accuracy: ' + Math.round(acc) + 'm)');
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

    latInput.removeEventListener('change', arguments.callee);
    latInput.addEventListener('change', function() {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (!isNaN(lat) && !isNaN(lng)) {
        updateMap(lat, lng);
      }
    });

    lngInput.removeEventListener('change', arguments.callee);
    lngInput.addEventListener('change', function() {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (!isNaN(lat) && !isNaN(lng)) {
        updateMap(lat, lng);
      }
    });
  }
});
