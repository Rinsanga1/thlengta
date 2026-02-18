// Employee Modal Functions

document.addEventListener('DOMContentLoaded', function() {
  // Employee Details Modal Functionality
  document.querySelectorAll('.emp-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var email = this.getAttribute('data-email');
      var isActive = this.getAttribute('data-active') === '1';
      var hasDevice = this.getAttribute('data-device') === '1';
      
      document.getElementById('empModalEmail').textContent = email;
      document.getElementById('empModalStatus').innerHTML = isActive 
        ? '<span style="color:#22c55e; font-weight:600;">Active</span>' 
        : '<span style="color:#ef4444; font-weight:600;">Inactive</span>';
      document.getElementById('empModalDevice').innerHTML = hasDevice 
        ? '<span style="color:#22c55e; font-weight:600;">Device Registered</span>' 
        : '<span style="color:#666;">Not Registered</span>';
      
      document.getElementById('employeeModal').style.display = 'flex';
    });
  });

  // Close button for employee modal
  var closeEmpBtn = document.getElementById('closeEmpModalBtn');
  if (closeEmpBtn) {
    closeEmpBtn.addEventListener('click', function() {
      document.getElementById('employeeModal').style.display = 'none';
    });
  }

  // Close employee modal when clicking outside
  var employeeModal = document.getElementById('employeeModal');
  if (employeeModal) {
    employeeModal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.style.display = 'none';
      }
    });
  }

  // Add Employee Modal Functionality
  const addEmployeeBtn = document.getElementById('addEmployeeBtn');
  const addEmployeeModal = document.getElementById('addEmployeeModal');
  const cancelAddEmployeeBtn = document.getElementById('cancelAddEmployeeBtn');

  if (addEmployeeBtn && addEmployeeModal) {
    addEmployeeBtn.addEventListener('click', function() {
      addEmployeeModal.style.display = 'flex';
    });

    // Close modal on cancel button
    if (cancelAddEmployeeBtn) {
      cancelAddEmployeeBtn.addEventListener('click', function() {
        addEmployeeModal.style.display = 'none';
      });
    }

    // Close modal on backdrop click
    addEmployeeModal.addEventListener('click', function(e) {
      if (e.target === addEmployeeModal) {
        addEmployeeModal.style.display = 'none';
      }
    });

    // Close modal on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && addEmployeeModal.style.display === 'flex') {
        addEmployeeModal.style.display = 'none';
      }
    });
  }
});
