document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners for employee edit buttons
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

  // Close modal when clicking close button
  document.getElementById('closeEmpModalBtn').addEventListener('click', function() {
    document.getElementById('employeeModal').style.display = 'none';
  });

  // Close modal when clicking outside
  document.getElementById('employeeModal').addEventListener('click', function(e) {
    if (e.target === this) {
      this.style.display = 'none';
    }
  });
});
