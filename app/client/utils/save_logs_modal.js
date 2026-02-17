// Settings Modals Functions

// Edit Details Modal
function openEditDetailsModal() {
  const modal = document.getElementById('editDetailsModal');
  if (modal) modal.style.display = 'flex';
}

function closeEditDetailsModal() {
  const modal = document.getElementById('editDetailsModal');
  if (modal) modal.style.display = 'none';
}

// Edit Location Modal
function openEditLocationModal() {
  const modal = document.getElementById('editLocationModal');
  if (modal) modal.style.display = 'flex';
}

function closeEditLocationModal() {
  const modal = document.getElementById('editLocationModal');
  if (modal) modal.style.display = 'none';
}

// Edit Radius Modal
function openEditRadiusModal() {
  const modal = document.getElementById('editRadiusModal');
  if (modal) modal.style.display = 'flex';
}

function closeEditRadiusModal() {
  const modal = document.getElementById('editRadiusModal');
  if (modal) modal.style.display = 'none';
}

// Delete Workplace Modal
function openDeleteWorkplaceModal() {
  const modal = document.getElementById('deleteWorkplaceModal');
  if (modal) modal.style.display = 'flex';
}

function closeDeleteWorkplaceModal() {
  const modal = document.getElementById('deleteWorkplaceModal');
  if (modal) modal.style.display = 'none';
}

// Save Logs Modal Functions (from previous)
function openSaveLogsModal() {
  const modal = document.getElementById('saveLogsModal');
  if (modal) modal.style.display = 'flex';
}

function closeSaveLogsModal() {
  const modal = document.getElementById('saveLogsModal');
  if (modal) modal.style.display = 'none';
}

function updateSaveDateInput() {
  const period = document.querySelector('input[name="savePeriod"]:checked');
  if (!period) return;
  
  const periodValue = period.value;
  const dayInput = document.getElementById('dayInput');
  const monthInput = document.getElementById('monthInput');
  const yearInput = document.getElementById('yearInput');
  
  if (dayInput) dayInput.style.display = periodValue === 'day' ? 'block' : 'none';
  if (monthInput) monthInput.style.display = periodValue === 'month' ? 'block' : 'none';
  if (yearInput) yearInput.style.display = periodValue === 'year' ? 'block' : 'none';
}

function downloadLogs() {
  const modal = document.getElementById('saveLogsModal');
  if (!modal) return;
  
  const workplaceId = modal.dataset.workplaceId;
  if (!workplaceId) return;
  
  const period = document.querySelector('input[name="savePeriod"]:checked');
  if (!period) return;
  
  const periodValue = period.value;
  let url;
  
  if (periodValue === 'day') {
    const dateInput = document.getElementById('saveDateInput');
    const date = dateInput ? dateInput.value : '';
    url = `/owner/workplaces/${workplaceId}/logs.csv?date=${date}`;
  } else if (periodValue === 'month') {
    const monthInput = document.getElementById('saveMonthInput');
    const month = monthInput ? monthInput.value : '';
    url = `/owner/workplaces/${workplaceId}/logs_month.csv?month=${month}`;
  } else if (periodValue === 'year') {
    const yearInput = document.getElementById('saveYearInput');
    const year = yearInput ? yearInput.value : '';
    url = `/owner/workplaces/${workplaceId}/logs_year.csv?year=${year}`;
  }
  
  if (url) window.location.href = url;
  closeSaveLogsModal();
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  // Edit Details Modal
  const editDetailsBtn = document.getElementById('editDetailsBtn');
  if (editDetailsBtn) editDetailsBtn.addEventListener('click', openEditDetailsModal);
  const cancelEditDetailsBtn = document.getElementById('cancelEditDetailsBtn');
  if (cancelEditDetailsBtn) cancelEditDetailsBtn.addEventListener('click', closeEditDetailsModal);
  
  // Edit Location Modal
  const editLocBtn = document.getElementById('editLocBtn');
  if (editLocBtn) editLocBtn.addEventListener('click', openEditLocationModal);
  const cancelEditLocBtn = document.getElementById('cancelEditLocBtn');
  if (cancelEditLocBtn) cancelEditLocBtn.addEventListener('click', closeEditLocationModal);
  
  // Edit Radius Modal
  const editRadiusBtn = document.getElementById('editRadiusBtn');
  if (editRadiusBtn) editRadiusBtn.addEventListener('click', openEditRadiusModal);
  const cancelEditRadiusBtn = document.getElementById('cancelEditRadiusBtn');
  if (cancelEditRadiusBtn) cancelEditRadiusBtn.addEventListener('click', closeEditRadiusModal);
  
  // Delete Workplace Modal
  const deleteWorkplaceBtn = document.getElementById('deleteWorkplaceBtn');
  if (deleteWorkplaceBtn) deleteWorkplaceBtn.addEventListener('click', openDeleteWorkplaceModal);
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteWorkplaceModal);
  
  // Close modals on backdrop click
  const modals = ['editDetailsModal', 'editLocationModal', 'editRadiusModal', 'deleteWorkplaceModal', 'saveLogsModal', 'datePickerModal'];
  modals.forEach(function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
      });
    }
  });
  
  // Save Logs Modal
  const saveLogsBtn = document.getElementById('saveLogsBtn');
  if (saveLogsBtn) saveLogsBtn.addEventListener('click', openSaveLogsModal);
  const cancelSaveBtn = document.getElementById('cancelSaveLogsBtn');
  if (cancelSaveBtn) cancelSaveBtn.addEventListener('click', closeSaveLogsModal);
  const downloadBtn = document.getElementById('downloadLogsBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadLogs);
  
  const saveRadioButtons = document.querySelectorAll('input[name="savePeriod"]');
  saveRadioButtons.forEach(function(radio) {
    radio.addEventListener('change', updateSaveDateInput);
  });
  
  // Date Picker Modal
  const datePickerBtn = document.getElementById('datePickerBtn');
  if (datePickerBtn) datePickerBtn.addEventListener('click', function() {
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.style.display = 'flex';
  });
  
  const cancelDatePickerBtn = document.getElementById('cancelDatePickerBtn');
  if (cancelDatePickerBtn) cancelDatePickerBtn.addEventListener('click', function() {
    const modal = document.getElementById('datePickerModal');
    if (modal) modal.style.display = 'none';
  });
  
  // Modal button functionality for location modal - Use my current location
  const modalBtnUseLoc = document.getElementById('modalBtnUseLoc');
  if (modalBtnUseLoc) {
    modalBtnUseLoc.addEventListener('click', function() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          const modalLat = document.getElementById('modalLat');
          const modalLng = document.getElementById('modalLng');
          const modalMapFrame = document.getElementById('modalMapFrame');
          const modalLocStatus = document.getElementById('modalLocStatus');
          
          if (modalLat) modalLat.value = position.coords.latitude.toFixed(6);
          if (modalLng) modalLng.value = position.coords.longitude.toFixed(6);
          if (modalMapFrame) {
            modalMapFrame.src = `https://www.google.com/maps?q=${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}&z=16&output=embed`;
          }
          if (modalLocStatus) {
            modalLocStatus.innerHTML = '<span style="color:green;">Location updated!</span>';
          }
        }, function() {
          const modalLocStatus = document.getElementById('modalLocStatus');
          if (modalLocStatus) {
            modalLocStatus.innerHTML = '<span style="color:red;">Unable to get location. Please enable GPS.</span>';
          }
        });
      } else {
        const modalLocStatus = document.getElementById('modalLocStatus');
        if (modalLocStatus) {
          modalLocStatus.innerHTML = '<span style="color:red;">Geolocation not supported.</span>';
        }
      }
    });
  }
  
  // Update map when lat/lng changes manually in modal
  const modalLat = document.getElementById('modalLat');
  const modalLng = document.getElementById('modalLng');
  
  function updateModalMap() {
    const lat = modalLat ? modalLat.value : '';
    const lng = modalLng ? modalLng.value : '';
    const modalMapFrame = document.getElementById('modalMapFrame');
    
    if (lat && lng && modalMapFrame) {
      modalMapFrame.src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
    }
  }
  
  if (modalLat) {
    modalLat.addEventListener('change', updateModalMap);
    modalLat.addEventListener('input', updateModalMap);
  }
  if (modalLng) {
    modalLng.addEventListener('change', updateModalMap);
    modalLng.addEventListener('input', updateModalMap);
  }
});
