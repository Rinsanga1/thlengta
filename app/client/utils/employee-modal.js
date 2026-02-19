// Employee Modal Functions

document.addEventListener('DOMContentLoaded', function() {
  // Get workplace ID from URL
  const workplaceId = window.location.pathname.split('/')[3];

  // Employee Edit Modal Functionality
  document.querySelectorAll('.emp-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var employeeId = this.getAttribute('data-id');
      var email = this.getAttribute('data-email');
      var isActive = this.getAttribute('data-active') === '1' || this.getAttribute('data-active') === 'true';
      var hasDevice = this.getAttribute('data-device') === '1' || this.getAttribute('data-device') === 'true';
      
      // Populate the edit form
      document.getElementById('empEditEmail').value = email;
      document.getElementById('editEmployeeForm').action = '/owner/workplaces/' + workplaceId + '/employees/' + employeeId + '/update';
      
      // Set status display
      document.getElementById('empEditStatusDisplay').innerHTML = isActive 
        ? '<span style="color:#22c55e; font-weight:600;">Active</span>' 
        : '<span style="color:#ef4444; font-weight:600;">Inactive</span>';
      
      // Set device display
      document.getElementById('empEditDeviceDisplay').innerHTML = hasDevice 
        ? '<span style="color:#22c55e; font-weight:600;">Device Registered</span>' 
        : '<span style="color:#666;">Not Registered</span>';
      
      // Build action buttons
      var actionsHtml = '';
      
      // Toggle status button
      actionsHtml += '<form method="post" action="/owner/workplaces/' + workplaceId + '/employees/' + employeeId + '/toggle" style="display:inline; margin:0;">';
      actionsHtml += '<button type="submit" class="btn" style="width:auto; margin:0; padding:6px 12px; font-size:12px; background:' + (isActive ? '#fff1f1; color:#d32f2f;' : '#e8f5e9; color:#2e7d32;') + ' border:2px solid #1b1b1b; box-shadow:2px 2px 0 #1b1b1b; font-weight:600;">';
      actionsHtml += isActive ? 'Disable' : 'Enable';
      actionsHtml += '</button></form>';
      
      // Reset device button (only if active and has device)
      if (isActive && hasDevice) {
        actionsHtml += '<form method="post" action="/owner/workplaces/' + workplaceId + '/employees/' + employeeId + '/device/reset" style="display:inline; margin:0;" onsubmit="return confirm(\'Reset device for this employee? They will need to check in with a new device.\');">';
        actionsHtml += '<button type="submit" class="btn" style="width:auto; margin:0; padding:6px 12px; font-size:12px; background:#fff3e0; color:#e65100; border:2px solid #1b1b1b; box-shadow:2px 2px 0 #1b1b1b; font-weight:600;">Reset Device</button></form>';
      }
      
      document.getElementById('empEditActions').innerHTML = actionsHtml;
      
      document.getElementById('employeeModal').style.display = 'flex';
    });
  });

  // Close button for employee edit modal
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

  // Employee Delete Modal Functionality
  document.querySelectorAll('.emp-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var employeeId = this.getAttribute('data-id');
      var email = this.getAttribute('data-email');
      
      document.getElementById('deleteEmpEmail').textContent = email;
      document.getElementById('deleteEmployeeForm').action = '/owner/workplaces/' + workplaceId + '/employees/' + employeeId + '/delete';
      
      document.getElementById('deleteEmployeeModal').style.display = 'flex';
    });
  });

  // Cancel button for delete modal
  var cancelDeleteBtn = document.getElementById('cancelDeleteEmpBtn');
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', function() {
      document.getElementById('deleteEmployeeModal').style.display = 'none';
    });
  }

  // Close delete modal when clicking outside
  var deleteModal = document.getElementById('deleteEmployeeModal');
  if (deleteModal) {
    deleteModal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.style.display = 'none';
      }
    });
  }

  // Close delete modal on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var deleteModal = document.getElementById('deleteEmployeeModal');
      var editModal = document.getElementById('employeeModal');
      var addModal = document.getElementById('addEmployeeModal');
      
      if (deleteModal && deleteModal.style.display === 'flex') {
        deleteModal.style.display = 'none';
      }
      if (editModal && editModal.style.display === 'flex') {
        editModal.style.display = 'none';
      }
      if (addModal && addModal.style.display === 'flex') {
        addModal.style.display = 'none';
      }
    }
  });

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
  }
});
