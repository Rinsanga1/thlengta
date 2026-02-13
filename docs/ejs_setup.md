# EJS Setup and Template Structure

This document explains how EJS (Embedded JavaScript) is set up and how the template system works in this Express.js application.

## Architecture Overview

The EJS system uses a **layout-based architecture** where:

1. **Main Layout**: `app/views/layouts/application.ejs` provides the HTML structure
2. **Content Templates**: Individual templates contain only the page content
3. **Dynamic Includes**: The layout dynamically includes content templates based on route data
4. **Server-Side Rendering**: Express controllers render the layout with content

## Directory Structure

```
app/
├── views/
│   ├── layouts/
│   │   └── application.ejs    # Main layout template (HTML structure)
│   ├── hello/
│   │   ├── index.ejs         # Home page content
│   │   ├── show.ejs          # Show page content
│   │   └── new.ejs           # New page content
│   └── todo/
│       └── index.ejs         # Todo app content
└── controllers/
    ├── hello.controller.ts   # Hello route handlers
    └── todo.controller.ts    # Todo route handlers
```

## Core Template System

### 1. Main Layout Template

**File**: `app/views/layouts/application.ejs`

This is the **master template** that provides the complete HTML structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title><%= title || "Thlengta" %></title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script type="module" src="/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.min.js"></script>
  <script type="module" src="/js/application.ts"></script>
  <link rel="stylesheet" href="/application.css">
</head>

<body>
  <nav>
    <a href="/" data-turbo-action="advance">Home</a>
    <a href="/show" data-turbo-action="advance">Show</a>
    <a href="/new" data-turbo-action="advance">New</a>
    <a href="/todo" data-turbo-action="advance">Todo</a>
  </nav>

  <main>
    <%- include(`../${body}`) %>
  </main>
</body>
</html>
```

**Key Components:**

1. **HTML Structure**: Complete `<html>`, `<head>`, and `<body>` tags
2. **Asset Loading**: Turbo, JavaScript, and CSS files
3. **Navigation**: Site-wide navigation menu
4. **Dynamic Content**: `<%- include(`../${body}`) %>` - The crucial line that includes content templates

### 2. The Magic: Dynamic Include

```html
<%- include(`../${body}`) %>
```

This line is the core of the template system:

- **`<%- %>`**: Unescaped EJS output (allows HTML)
- **`include()`**: EJS function to include other templates
- **`` `../${body}` ``**: Dynamic path construction
  - **`../`**: Goes up one directory from `layouts/` to `views/`
  - **`${body}`**: Variable containing the content template path
  - **Result**: Includes templates like `../hello/index.ejs` or `../todo/index.ejs`

### 3. Content Templates

Content templates contain **only the page-specific content** without HTML structure:

**File**: `app/views/todo/index.ejs`

```html
<section class="todo-app" data-controller="todo">
  <header class="todo-header">
    <h1>My Todos (<span data-todo-target="summary">0/0</span>)</h1>
  </header>

  <div class="add-task-section">
    <form data-action="submit->todo#addTask">
      <div class="add-task">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/>
        </svg>
        <input data-todo-target="input" type="text" placeholder="What needs to be done?" data-action="keydown.enter->todo#addTask">
      </div>
    </form>
  </div>

  <div class="task-list" data-todo-target="taskList">
    <!-- Task items -->
  </div>
</section>
```

**File**: `app/views/hello/index.ejs`

```html
<section>
    <!-- Floating Particles -->
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>
    <div class="particle"></div>

    <!-- 3D Rotating Cube -->
    <div class="cube-container">
        <div class="cube">
            <div class="face front">HTML</div>
            <div class="face back">CSS</div>
            <div class="face right">3D</div>
            <div class="face left">MAGIC</div>
            <div class="face top">✨</div>
            <div class="face bottom">🎨</div>
        </div>
    </div>

    <!-- Glassmorphism Cards -->
    <div class="cards">
        <div class="card">
            <h3>Glass Effect</h3>
            <p>Backdrop blur + transparency</p>
        </div>
        <div class="card">
            <h3>3D Transforms</h3>
            <p>Rotate, scale, perspective</p>
        </div>
        <div class="card">
            <h3>Animations</h3>
            <p>Smooth keyframe magic</p>
        </div>
    </div>
</section>
```

## Controller Integration

### Route Handlers and Template Rendering

Controllers handle the logic of rendering the layout with the appropriate content:

**File**: `app/controllers/todo.controller.ts`

```typescript
exports.index = (_req, res) => {
  res.render("layouts/application", {
    title: "todo",
    body: "todo/index"
  });
};
```

**File**: `app/controllers/hello.controller.ts`

```typescript
exports.index = (req, res) => {
  res.render("layouts/application", {
    title: "Home",
    body: "hello/index"  // Path relative to layouts/
  });
};

exports.show = (req, res) => {
  res.render("layouts/application", {
    title: "Home",
    body: "hello/show"  // Path relative to layouts/
  });
};

exports.new = (req, res) => {
  res.render("layouts/application", {
    title: "Home",
    body: "hello/new"  // Path relative to layouts/
  });
};
```

**Controller Logic Explained:**

1. **`res.render("layouts/application", data)`**: Renders the main layout
2. **`title`**: Sets the page title in `<title><%= title || "Thlengta" %></title>`
3. **`body`**: Specifies which content template to include
   - `"todo/index"` becomes `../todo/index.ejs` in the include statement
   - `"hello/show"` becomes `../hello/show.ejs` in the include statement

## Template Resolution Process

### Step-by-Step Flow

1. **Request**: Client requests `/todo`
2. **Route**: Router matches to `todo.index` controller
3. **Controller**: `todo.controller.ts` executes:
   ```typescript
   res.render("layouts/application", {
     title: "todo",
     body: "todo/index"
   });
   ```
4. **EJS Engine**: Processes `layouts/application.ejs`:
   - Replaces `<%= title %>` with "todo"
   - Processes `<%- include(`../${body}`) %>` where `body` = "todo/index"
   - Becomes `<%- include("../todo/index") %>`
   - Includes and renders `todo/index.ejs`
5. **Final HTML**: Complete page sent to browser with layout + content

### Path Resolution

```
app/views/layouts/application.ejs
           │
           │ <%- include(`../${body}`) %>
           │ where body = "todo/index"
           ▼
app/views/todo/index.ejs
```

**Directory Context:**
- Layout template runs from: `app/views/layouts/`
- Include path: `../` (go to `app/views/`) + `${body}` + `.ejs`
- Final path: `app/views/todo/index.ejs`

## EJS Features Used

### 1. Variable Output

```html
<!-- HTML escaped output (safe for user content) -->
<title><%= title || "Thlengta" %></title>

<!-- Unescaped output (allows HTML) -->
<%- include(`../${body}`) %>
```

### 2. Template Includes

```html
<!-- Dynamic include with variable path -->
<%- include(`../${body}`) %>

<!-- Static include example (not used here but possible) -->
<%- include('../partials/header') %>
```

### 3. Conditional Logic

```html
<!-- Example of conditional rendering (not in current templates) -->
<% if (user) { %>
  <p>Welcome, <%= user.name %>!</p>
<% } else { %>
  <p>Please <a href="/login">log in</a></p>
<% } %>
```

### 4. Loops and Iteration

```html
<!-- Example of loops (not in current templates) -->
<% items.forEach(function(item) { %>
  <div class="item">
    <h3><%= item.title %></h3>
    <p><%= item.description %></p>
  </div>
<% }) %>
```

## Server Configuration

### EJS Engine Setup

**File**: `server.ts`

```typescript
const express = require("express");
const path = require("path");

const app = express();

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Set the views directory
app.set('views', path.join(__dirname, 'app/views'));
```

**Configuration Details:**
- **`view engine: 'ejs'`**: Tells Express to use EJS for `.ejs` files
- **`views: path.join(__dirname, 'app/views')`**: Sets the base directory for templates
- **Automatic Resolution**: Express automatically finds `.ejs` files in the views directory

## Benefits of This Architecture

### 1. **DRY Principle**
- Single HTML structure in the layout
- No repeated boilerplate in content templates
- Consistent page structure across the application

### 2. **Separation of Concerns**
- Layout: HTML structure, assets, navigation
- Content: Page-specific markup and logic
- Controllers: Data preparation and routing logic

### 3. **Maintainability**
- Change navigation in one place (layout)
- Add new pages by creating content templates only
- Easy to modify global styles and scripts

### 4. **Scalability**
- Easy to add multiple layouts if needed
- Content templates can include partials
- Supports complex data passing from controllers

## Advanced Template Patterns

### 1. Multiple Layouts

```typescript
// For admin pages
res.render("layouts/admin", {
  title: "Admin Dashboard",
  body: "admin/dashboard"
});

// For public pages
res.render("layouts/application", {
  title: "Welcome",
  body: "public/home"
});
```

### 2. Nested Partials

**File**: `app/views/partials/header.ejs`
```html
<header class="site-header">
  <h1><%= siteName %></h1>
  <nav>
    <%- include('../partials/navigation') %>
  </nav>
</header>
```

**File**: `app/views/partials/navigation.ejs`
```html
<ul class="nav-links">
  <li><a href="/">Home</a></li>
  <li><a href="/about">About</a></li>
  <li><a href="/contact">Contact</a></li>
</ul>
```

### 3. Dynamic Data Passing

```typescript
// Passing complex data to templates
res.render("layouts/application", {
  title: "Product Catalog",
  body: "products/index",
  products: getProducts(),
  user: req.user,
  flash: req.flash(),
  meta: {
    description: "Browse our product catalog",
    keywords: "products, catalog, shop"
  }
});
```

### 4. Template Inheritance Alternative

Instead of includes, you could use template inheritance:

```html
<!-- layouts/application.ejs -->
<!DOCTYPE html>
<html>
<head>
  <title><%= title %></title>
  <%- block('head') %>
</head>
<body>
  <%- block('header') %>
  <main><%- block('content') %></main>
  <%- block('footer') %>
</body>
</html>

<!-- todo/index.ejs -->
<% extends('layouts/application') %>

<% block('content') %>
<section class="todo-app">
  <!-- Todo content -->
</section>
<% endblock %>
```

## Common Patterns and Best Practices

### 1. Data Variable Naming

```typescript
// Clear, descriptive variable names
res.render("layouts/application", {
  title: "User Profile",
  body: "users/profile",
  currentUser: req.user,        // Clear context
  userProfile: profile,         // Specific data
  isEditable: req.user.id === profile.id  // Boolean flag
});
```

### 2. Error Handling

```typescript
exports.profile = (req, res) => {
  try {
    const userId = req.params.id;
    const profile = getUserProfile(userId);
    
    if (!profile) {
      return res.status(404).render("layouts/application", {
        title: "User Not Found",
        body: "errors/404"
      });
    }
    
    res.render("layouts/application", {
      title: `${profile.name}'s Profile`,
      body: "users/profile",
      userProfile: profile
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).render("layouts/application", {
      title: "Server Error",
      body: "errors/500"
    });
  }
};
```

### 3. Partial Organization

```
app/views/
├── layouts/
│   ├── application.ejs
│   └── admin.ejs
├── partials/
│   ├── header.ejs
│   ├── footer.ejs
│   ├── navigation.ejs
│   └── forms/
│       ├── input.ejs
│       └── button.ejs
├── components/
│   ├── card.ejs
│   ├── modal.ejs
│   └── alert.ejs
└── pages/
    ├── home/
    ├── users/
    └── products/
```

## Debugging EJS Templates

### 1. Template Errors

EJS provides helpful error messages:

```
Error: Could not find the include file "../todo/index.ejs"
    at include (ejs/lib/ejs.js:701:14)
    at eval (eval at compile (ejs/lib/ejs.js:662:12), <anonymous>:21:17)
    at tryToString (fs.js:456:14)
    at FSReqWrap.readFileAfterClose [as oncomplete] (fs.js:443:15)
```

### 2. Debug Variables

```html
<!-- Debug variable contents -->
<pre><%= JSON.stringify(data, null, 2) %></pre>

<!-- Check if variable exists -->
<% if (typeof user !== 'undefined') { %>
  <p>User: <%= user.name %></p>
<% } else { %>
  <p>No user data available</p>
<% } %>
```

### 3. Template Caching

In development, disable template caching for easier debugging:

```typescript
// Development only
app.set('view cache', false);

// Production
app.set('view cache', true);
```

This EJS setup provides a clean, maintainable template system that separates concerns while keeping the codebase organized and scalable.