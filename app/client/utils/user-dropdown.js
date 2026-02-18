// User Dropdown Toggle Functionality

document.addEventListener('DOMContentLoaded', function() {
  const userDropdown = document.querySelector('.user-dropdown');
  const userDropdownToggle = document.querySelector('.user-avatar-btn');
  const userDropdownMenu = document.getElementById('userDropdownMenu');
  const userAvatarChevron = document.querySelector('.user-avatar-chevron');

  if (!userDropdownToggle || !userDropdownMenu) {
    console.log('User dropdown elements not found');
    return;
  }

  console.log('User dropdown initialized');

  // Toggle dropdown on click
  userDropdownToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('User dropdown clicked');
    
    const isOpen = userDropdownMenu.classList.contains('open');
    console.log('Dropdown is currently open:', isOpen);
    
    // Close all other dropdowns first
    document.querySelectorAll('.nav-dropdown-menu.open').forEach(function(menu) {
      menu.classList.remove('open');
    });
    
    document.querySelectorAll('.user-avatar-chevron.rotated').forEach(function(chevron) {
      chevron.classList.remove('rotated');
    });
    
    // Toggle current dropdown
    if (isOpen) {
      userDropdownMenu.classList.remove('open');
      if (userAvatarChevron) userAvatarChevron.classList.remove('rotated');
      userDropdownToggle.setAttribute('aria-expanded', 'false');
    } else {
      userDropdownMenu.classList.add('open');
      if (userAvatarChevron) userAvatarChevron.classList.add('rotated');
      userDropdownToggle.setAttribute('aria-expanded', 'true');
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (userDropdown && !userDropdown.contains(e.target)) {
      userDropdownMenu.classList.remove('open');
      if (userAvatarChevron) userAvatarChevron.classList.remove('rotated');
      userDropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Close dropdown on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      userDropdownMenu.classList.remove('open');
      if (userAvatarChevron) userAvatarChevron.classList.remove('rotated');
      userDropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Sign Out Modal Functionality
  const signoutBtn = document.getElementById('signoutBtn');
  const signoutModal = document.getElementById('signoutModal');
  const cancelSignoutBtn = document.getElementById('cancelSignoutBtn');

  if (signoutBtn && signoutModal) {
    signoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Close the dropdown first
      userDropdownMenu.classList.remove('open');
      if (userAvatarChevron) userAvatarChevron.classList.remove('rotated');
      userDropdownToggle.setAttribute('aria-expanded', 'false');
      
      // Show the modal
      signoutModal.style.display = 'flex';
    });

    // Close modal on cancel button
    if (cancelSignoutBtn) {
      cancelSignoutBtn.addEventListener('click', function() {
        signoutModal.style.display = 'none';
      });
    }

    // Close modal on backdrop click
    signoutModal.addEventListener('click', function(e) {
      if (e.target === signoutModal) {
        signoutModal.style.display = 'none';
      }
    });

    // Close modal on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && signoutModal.style.display === 'flex') {
        signoutModal.style.display = 'none';
      }
    });
  }
});
