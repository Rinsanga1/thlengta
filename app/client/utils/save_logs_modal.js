// Save Logs & Filter Logs Modal Functions

// Filter Modal Functions
function openFilterLogsModal() {
  const modal = document.getElementById('filterLogsModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeFilterLogsModal() {
  const modal = document.getElementById('filterLogsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function updateFilterDateInput() {
  const period = document.querySelector('input[name="filterPeriod"]:checked');
  if (!period) return;
  
  const periodValue = period.value;
  const dayInput = document.getElementById('filterDayInput');
  const monthInput = document.getElementById('filterMonthInput');
  const yearInput = document.getElementById('filterYearInput');
  
  if (dayInput) dayInput.style.display = periodValue === 'day' ? 'block' : 'none';
  if (monthInput) monthInput.style.display = periodValue === 'month' ? 'block' : 'none';
  if (yearInput) yearInput.style.display = periodValue === 'year' ? 'block' : 'none';
  
  // Update hidden date input value based on selected period
  const dateInput = document.getElementById('filterDateInput');
  const monthValueInput = document.getElementById('filterMonthValue');
  const yearValueInput = document.getElementById('filterYearValue');
  
  if (periodValue === 'day' && dateInput) {
    dateInput.name = 'date';
    if (monthValueInput) monthValueInput.name = 'month_disabled';
    if (yearValueInput) yearValueInput.name = 'year_disabled';
  } else if (periodValue === 'month' && monthValueInput) {
    monthValueInput.name = 'date';
    if (dateInput) dateInput.name = 'date_disabled';
    if (yearValueInput) yearValueInput.name = 'year_disabled';
  } else if (periodValue === 'year' && yearValueInput) {
    yearValueInput.name = 'date';
    if (dateInput) dateInput.name = 'date_disabled';
    if (monthValueInput) monthValueInput.name = 'month_disabled';
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
  // Filter Modal Event Listeners
  const filterModal = document.getElementById('filterLogsModal');
  if (filterModal) {
    filterModal.addEventListener('click', function(e) {
      if (e.target === this) {
        closeFilterLogsModal();
      }
    });
  }
  
  const filterLogsBtn = document.getElementById('filterLogsBtn');
  if (filterLogsBtn) {
    filterLogsBtn.addEventListener('click', openFilterLogsModal);
  }
  
  const cancelFilterBtn = document.getElementById('cancelFilterLogsBtn');
  if (cancelFilterBtn) {
    cancelFilterBtn.addEventListener('click', closeFilterLogsModal);
  }
  
  const filterRadioButtons = document.querySelectorAll('input[name="filterPeriod"]');
  filterRadioButtons.forEach(function(radio) {
    radio.addEventListener('change', updateFilterDateInput);
  });
  
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
