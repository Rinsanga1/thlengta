// Save Logs & Date Picker Modal Functions

// Date Picker Modal Functions
function openDatePickerModal() {
  const modal = document.getElementById('datePickerModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeDatePickerModal() {
  const modal = document.getElementById('datePickerModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Save Logs Modal Functions
function openSaveLogsModal() {
  const modal = document.getElementById('saveLogsModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeSaveLogsModal() {
  const modal = document.getElementById('saveLogsModal');
  if (modal) {
    modal.style.display = 'none';
  }
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
  if (!workplaceId) {
    console.error('Workplace ID not found');
    return;
  }
  
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
  
  if (url) {
    window.location.href = url;
  }
  closeSaveLogsModal();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Date Picker Modal Event Listeners
  const datePickerModal = document.getElementById('datePickerModal');
  if (datePickerModal) {
    datePickerModal.addEventListener('click', function(e) {
      if (e.target === this) {
        closeDatePickerModal();
      }
    });
  }
  
  const datePickerBtn = document.getElementById('datePickerBtn');
  if (datePickerBtn) {
    datePickerBtn.addEventListener('click', openDatePickerModal);
  }
  
  const cancelDatePickerBtn = document.getElementById('cancelDatePickerBtn');
  if (cancelDatePickerBtn) {
    cancelDatePickerBtn.addEventListener('click', closeDatePickerModal);
  }
  
  // Save Logs Modal Event Listeners
  const saveModal = document.getElementById('saveLogsModal');
  if (saveModal) {
    saveModal.addEventListener('click', function(e) {
      if (e.target === this) {
        closeSaveLogsModal();
      }
    });
  }
  
  const saveLogsBtn = document.getElementById('saveLogsBtn');
  if (saveLogsBtn) {
    saveLogsBtn.addEventListener('click', openSaveLogsModal);
  }
  
  const cancelSaveBtn = document.getElementById('cancelSaveLogsBtn');
  if (cancelSaveBtn) {
    cancelSaveBtn.addEventListener('click', closeSaveLogsModal);
  }
  
  const downloadBtn = document.getElementById('downloadLogsBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadLogs);
  }
  
  const saveRadioButtons = document.querySelectorAll('input[name="savePeriod"]');
  saveRadioButtons.forEach(function(radio) {
    radio.addEventListener('change', updateSaveDateInput);
  });
});
