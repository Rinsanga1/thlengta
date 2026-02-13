# Turbo Integration

This document explains how to integrate Hotwired Turbo into a plain Express.js + EJS application for SPA-like functionality without full page reloads.

## Architecture Overview

Turbo provides three main components that work together to create fast, modern web applications:

- **Turbo Drive**: Enhances navigation by fetching pages via AJAX and replacing the page content
- **Turbo Frames**: Enables independent page sections to update without full page reloads
- **Turbo Streams**: Provides real-time DOM updates from server responses

## Installation and Setup

### 1. Package Installation

Add Turbo to your application:

```bash
npm install @hotwired/turbo
```

**File**: `package.json`

```json
{
  "dependencies": {
    "@hotwired/turbo": "^8.0.23",
    "express": "^5.2.1",
    "ejs": "^4.0.1"
  }
}
```

### 2. Server Configuration

**File**: `server.ts`

Configure Express to serve Turbo and your application files:

```typescript
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'app/views'));

// Serve Turbo from node_modules
app.use('/node_modules/@hotwired/turbo', 
  express.static(path.join(__dirname, 'node_modules/@hotwired/turbo/dist'))
);

// Serve application JavaScript
app.use('/js', express.static(path.join(__dirname, 'app/client')));

// Serve static assets
app.use(express.static(path.join(__dirname, 'app/assets')));
```

### 3. Layout Template Integration

**File**: `app/views/layouts/application.ejs`

Add Turbo to your main layout template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title><%= title || "Express App" %></title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="turbo-prefetch" content="false">
  
  <!-- Turbo Core -->
  <script type="module" src="/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.min.js"></script>
  
  <!-- Application JavaScript -->
  <script type="module" src="/js/application.js"></script>
  
  <link rel="stylesheet" href="/application.css">
</head>

<body>
  <header>
    <nav>
      <a href="/" data-turbo-action="advance">Home</a>
      <a href="/about" data-turbo-action="advance">About</a>
      <a href="/contact" data-turbo-action="advance">Contact</a>
    </nav>
  </header>

  <main>
    <%- include(`../${body}`) %>
  </main>
</body>
</html>
```

## Turbo Drive Implementation

### Enhanced Navigation

Turbo Drive automatically intercepts link clicks and fetches pages via AJAX. Add `data-turbo-action` attributes to control navigation behavior:

```html
<!-- Standard navigation (default) -->
<a href="/page">Regular Link</a>

<!-- Advance navigation (add to history) -->
<a href="/page" data-turbo-action="advance">Fast Navigation</a>

<!-- Replace navigation (no history entry) -->
<a href="/page" data-turbo-action="replace">Replace Page</a>

<!-- Disable Turbo for specific links -->
<a href="/external" data-turbo="false">External Link</a>

<!-- Disable Turbo for entire form -->
<form action="/submit" method="post" data-turbo="false">
  <!-- Form content -->
</form>
```

### Form Submissions

Turbo automatically enhances form submissions:

**File**: `app/views/contact/form.ejs`

```html
<form action="/contact" method="post" data-turbo="true">
  <div class="form-group">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required>
  </div>
  
  <div class="form-group">
    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required>
  </div>
  
  <div class="form-group">
    <label for="message">Message:</label>
    <textarea id="message" name="message" rows="4" required></textarea>
  </div>
  
  <button type="submit">Send Message</button>
</form>
```

**File**: `app/controllers/contact.controller.js`

```javascript
exports.submit = (req, res) => {
  const { name, email, message } = req.body;
  
  // Process form data
  // ... database operations, email sending, etc.
  
  // Render response (Turbo will handle this)
  res.render("layouts/application", {
    title: "Thank You",
    body: "contact/success",
    formData: { name, email }
  });
};
```

## Turbo Frames Implementation

### Independent Page Sections

Turbo Frames allow updating specific parts of a page without full reloads.

**File**: `app/views/dashboard/index.ejs`

```html
<div class="dashboard">
  <h1>Dashboard</h1>
  
  <!-- Frame for notifications -->
  <turbo-frame id="notifications-frame" src="/notifications">
    <div class="loading">Loading notifications...</div>
  </turbo-frame>
  
  <!-- Frame for recent activity -->
  <turbo-frame id="activity-frame" src="/activity">
    <div class="loading">Loading activity...</div>
  </turbo-frame>
  
  <!-- Frame for user profile -->
  <turbo-frame id="profile-frame" src="/profile">
    <div class="loading">Loading profile...</div>
  </turbo-frame>
</div>
```

**File**: `app/views/notifications/index.ejs` (Frame content)

```html
<turbo-frame id="notifications-frame">
  <div class="notifications">
    <h2>Notifications</h2>
    <% if (notifications.length > 0) { %>
      <ul>
        <% notifications.forEach(function(notification) { %>
          <li><%= notification.message %></li>
        <% }) %>
      </ul>
    <% } else { %>
      <p>No new notifications</p>
    <% } %>
  </div>
</turbo-frame>
```

**File**: `app/controllers/notifications.controller.js`

```javascript
exports.index = (req, res) => {
  const notifications = getNotifications(); // Fetch from database
  
  res.render("notifications/index", {
    notifications: notifications
  });
};

exports.markAsRead = (req, res) => {
  const { id } = req.params;
  
  // Mark notification as read
  markNotificationAsRead(id);
  
  // Return updated frame content
  const notifications = getUnreadNotifications();
  res.render("notifications/index", {
    notifications: notifications
  });
};
```

### Frame Navigation

Update frames independently with targeted links:

```html
<turbo-frame id="search-results">
  <div class="search-form">
    <form action="/search" method="get" data-turbo-frame="search-results">
      <input type="text" name="query" placeholder="Search...">
      <button type="submit">Search</button>
    </form>
  </div>
  
  <% if (results) { %>
    <div class="results">
      <% results.forEach(function(result) { %>
        <div class="result-item">
          <h3><%= result.title %></h3>
          <p><%= result.description %></p>
          <a href="/items/<%= result.id %>" data-turbo-frame="_top">View Details</a>
        </div>
      <% }) %>
    </div>
  <% } %>
</turbo-frame>
```

## Turbo Streams Implementation

### Real-time Updates

Turbo Streams enable real-time DOM updates from the server.

**File**: `app/views/comments/_comment.ejs` (Partial template)

```html
<div class="comment" id="comment-<%= comment.id %>">
  <div class="comment-header">
    <strong><%= comment.author %></strong>
    <span class="timestamp"><%= comment.createdAt %></span>
  </div>
  <div class="comment-content">
    <%= comment.content %>
  </div>
  <% if (currentUser && currentUser.id === comment.userId) { %>
    <div class="comment-actions">
      <button data-action="click->comments#edit" data-comment-id="<%= comment.id %>">
        Edit
      </button>
      <form action="/comments/<%= comment.id %>" method="post" data-turbo-stream="true">
        <input type="hidden" name="_method" value="delete">
        <button type="submit">Delete</button>
      </form>
    </div>
  <% } %>
</div>
```

**File**: `app/controllers/comments.controller.js`

```javascript
exports.create = (req, res) => {
  const { postId, content } = req.body;
  const userId = req.user.id;
  
  // Create new comment
  const comment = createComment({ postId, userId, content });
  
  // Return Turbo Stream response
  res.set('Content-Type', 'text/vnd.turbo-stream.html');
  res.render('streams/append_comment', {
    target: 'comments-list',
    template: 'comments/_comment',
    comment: comment,
    currentUser: req.user
  });
};

exports.delete = (req, res) => {
  const { id } = req.params;
  
  // Delete comment
  deleteComment(id);
  
  // Return Turbo Stream response
  res.set('Content-Type', 'text/vnd.turbo-stream.html');
  res.render('streams/remove_comment', {
    target: `comment-${id}`
  });
};
```

**File**: `app/views/streams/append_comment.ejs`

```html
<turbo-stream action="append" target="<%= target %>">
  <template>
    <%- include(`../${template}`, { comment: comment, currentUser: currentUser }) %>
  </template>
</turbo-stream>
```

**File**: `app/views/streams/remove_comment.ejs`

```html
<turbo-stream action="remove" target="<%= target %>"></turbo-stream>
```

## Application Entry Point

**File**: `app/client/application.js`

Configure Turbo and set up event listeners:

```javascript
// Turbo configuration
Turbo.session.drive = true;
Turbo.session.frame = true;
Turbo.session.stream = true;

// Disable prefetching if needed
document.addEventListener('turbo:before-fetch-request', (event) => {
  // Custom request handling
  console.log('Fetching:', event.detail.url);
});

// Handle page transitions
document.addEventListener('turbo:load', () => {
  console.log('Page loaded with Turbo');
  // Reinitialize JavaScript components here
});

// Handle form submissions
document.addEventListener('turbo:submit-start', (event) => {
  // Show loading state
  const submitButton = event.target.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
  }
});

document.addEventListener('turbo:submit-end', (event) => {
  // Restore button state
  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
  }
});

// Handle errors
document.addEventListener('turbo:frame-load', (event) => {
  // Custom frame loading logic
  console.log('Frame loaded:', event.target.id);
});

document.addEventListener('turbo:frame-missing', (event) => {
  // Handle missing frames
  console.error('Frame missing:', event.target.id);
});
```

## Progress Indicators

**File**: `app/views/layouts/application.ejs`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- ... head content ... -->
  <style>
    /* Progress bar styles */
    .turbo-progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: #007bff;
      z-index: 9999;
      transition: width 0.3s ease;
    }
  </style>
</head>

<body>
  <!-- Turbo progress indicator (automatically added) -->
  
  <div class="loading-indicator" id="loading-indicator" style="display: none;">
    <div class="spinner"></div>
    <span>Loading...</span>
  </div>

  <header>
    <!-- ... header content ... -->
  </header>

  <main>
    <%- include(`../${body}`) %>
  </main>

  <script>
    // Show loading indicator
    document.addEventListener('turbo:visit', () => {
      document.getElementById('loading-indicator').style.display = 'flex';
    });

    document.addEventListener('turbo:load', () => {
      document.getElementById('loading-indicator').style.display = 'none';
    });

    document.addEventListener('turbo:frame-load', () => {
      // Frame-specific loading logic
    });
  </script>
</body>
</html>
```

## Error Handling

**File**: `app/client/application.js`

```javascript
// Handle navigation errors
document.addEventListener('turbo:fetch-request-error', (event) => {
  console.error('Fetch error:', event.detail.error);
  
  // Show user-friendly error message
  const errorMessage = document.createElement('div');
  errorMessage.className = 'error-message';
  errorMessage.textContent = 'Failed to load page. Please try again.';
  document.body.appendChild(errorMessage);
  
  // Remove error after 3 seconds
  setTimeout(() => {
    errorMessage.remove();
  }, 3000);
});

// Handle frame errors
document.addEventListener('turbo:frame-error', (event) => {
  console.error('Frame error:', event.target.id);
  
  // Show error in frame
  event.target.innerHTML = `
    <div class="frame-error">
      <p>Failed to load content. <a href="#" onclick="location.reload()">Try refreshing</a></p>
    </div>
  `;
});
```

## Route Configuration

**File**: `config/routes.js`

```javascript
const express = require("express");
const router = express.Router();

const home = require("../app/controllers/home.controller");
const contact = require("../app/controllers/contact.controller");
const dashboard = require("../app/controllers/dashboard.controller");

// Standard routes (Turbo Drive enhanced)
router.get('/', home.index);
router.get('/about', home.about);
router.get('/contact', contact.form);
router.post('/contact', contact.submit);

// Frame targets
router.get('/notifications', dashboard.notifications);
router.get('/activity', dashboard.activity);
router.get('/profile', dashboard.profile);

// Stream responses (real-time updates)
router.post('/comments', comments.create);
router.delete('/comments/:id', comments.delete);

module.exports = router;
```

## Best Practices

### 1. Progressive Enhancement
- Ensure your application works without JavaScript
- Use semantic HTML structure
- Provide meaningful loading states

### 2. Performance Optimization
- Use `data-turbo-prefetch="false"` for large pages
- Implement proper caching headers
- Minimize frame payload sizes

### 3. User Experience
- Provide clear loading indicators
- Handle errors gracefully
- Maintain browser history correctly

### 4. Security Considerations
- Validate all form submissions server-side
- Use CSRF protection
- Sanitize user input in stream responses

### 5. Testing
- Test with JavaScript disabled
- Verify frame updates work correctly
- Test stream responses in production

## Advanced Features

### Custom Events

```javascript
// Custom event for dynamic content loading
document.addEventListener('turbo:before-render', (event) => {
  // Perform actions before page renders
  console.log('About to render:', event.detail.newBody);
});

document.addEventListener('turbo:render', (event) => {
  // Perform actions after page renders
  console.log('Page rendered:', event.detail.newBody);
});
```

### Conditional Frame Loading

```html
<!-- Load frame only when visible -->
<turbo-frame id="lazy-frame" loading="lazy" src="/heavy-content">
  <div class="placeholder">Loading content...</div>
</turbo-frame>

<!-- Or load on interaction -->
<button onclick="document.getElementById('interactive-frame').src='/data'">
  Load Data
</button>
<turbo-frame id="interactive-frame"></turbo-frame>
```

## Troubleshooting

### Common Issues

1. **Links not working with Turbo**
   - Check that Turbo script is loaded correctly
   - Verify links are in the same origin
   - Ensure no JavaScript errors are blocking Turbo

2. **Frames not updating**
   - Verify frame IDs match exactly
   - Check that frame responses contain proper turbo-frame tags
   - Ensure server responses have correct content types

3. **Stream responses not working**
   - Verify Content-Type is `text/vnd.turbo-stream.html`
   - Check stream syntax is correct
   - Ensure template paths are accurate

### Debug Mode

Enable debug logging:

```javascript
// In application.js
Turbo.debug = true;

// Or set via meta tag
<meta name="turbo-debug" content="true">
```

This Turbo integration provides a solid foundation for building fast, modern web applications with Express.js and EJS while maintaining the benefits of server-side rendering and progressive enhancement.