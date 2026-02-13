# EJS Implementation

This document explains how EJS (Embedded JavaScript) is implemented in this Express.js application.

## Architecture Overview

EJS serves as the templating engine that renders server-side HTML with data injection, combining with Stimulus for frontend interactivity.

## Configuration Setup

### Server Configuration

**File**: `server.ts`

```typescript
// Set EJS as the view engine
app.set('view engine', 'ejs');

// Set the views directory
app.set('views', path.join(__dirname, 'app/views'));
```

### Package Dependencies

**File**: `package.json`

```json
{
  "dependencies": {
    "ejs": "^4.0.1"
  }
}
```

## Directory Structure

```
app/
├── views/
│   ├── layouts/
│   │   └── application.ejs    # Main layout template
│   ├── hello/
│   │   ├── index.ejs         # Hello home page
│   │   ├── show.ejs          # Hello show page
│   │   └── new.ejs           # Hello new page
│   └── todo/
│       └── index.ejs         # Todo application page
```

## Template Implementation

### 1. Layout System

**File**: `app/views/layouts/application.ejs`

The layout template provides the base HTML structure:

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

### 2. Data Injection

#### Variable Output
```html
<!-- Safe HTML escaping (default) -->
<h1><%= title %></h1>

<!-- Unescaped HTML output (rare, for trusted content) -->
<div><%- content %></div>
```

#### Conditional Rendering
```html
<% if (title) { %>
  <h1><%= title %></h1>
<% } %>
```

#### Loops and Iteration
```html
<% items.forEach(function(item) { %>
  <li><%= item.name %></li>
<% }) %>
```

### 3. Template Composition

#### Include System
```html
<!-- Include partial templates -->
<%- include('../partials/header', { title: pageTitle }) %>
<%- include(`../${body}`) %>
<%- include('../partials/footer') %>
```

#### Layout Pattern
Controllers render templates within the main layout:

```javascript
res.render("layouts/application", {
  title: "todo",
  body: "todo/index"
});
```

## Controller Integration

### Route Controllers

**File**: `app/controllers/todo.controller.ts`

```javascript
exports.index = (_req, res) => {
  res.render("layouts/application", {
    title: "todo",
    body: "todo/index"
  });
};
```

**File**: `app/controllers/hello.controller.ts`

```javascript
exports.index = (_req, res) => {
  res.render("layouts/application", {
    title: "home",
    body: "hello/index"
  });
};
```

### Data Passing

Controllers pass data to templates as objects:

```javascript
res.render("layouts/application", {
  title: pageData.title,
  body: "path/to/template",
  user: req.user,
  items: databaseItems
});
```

## Advanced EJS Features

### 1. Stimulus Integration

EJS seamlessly integrates with Stimulus data attributes:

```html
<section class="todo-app" data-controller="todo">
  <h1>My Todos (<span data-todo-target="summary">0/0</span>)</h1>
  
  <div data-todo-target="taskList">
    <div class="todo-slot" data-todo-target="taskItem">
      <label class="task-item" data-action="change->todo#toggle">
        <input type="checkbox">
        <span>Task text</span>
      </label>
    </div>
  </div>
</section>
```

### 2. Turbo Navigation

Turbo enhances page transitions without full reloads:

```html
<nav>
  <a href="/" data-turbo-action="advance">Home</a>
  <a href="/todo" data-turbo-action="advance">Todo</a>
</nav>
```

### 3. CSS and Asset Management

CSS files are served separately:

```html
<link rel="stylesheet" href="/application.css">
```

With server configuration:

```typescript
app.use('/application.css', express.static(
  path.join(__dirname, 'app/assets/stylesheet/dist/application.css')
));
```

## Template Best Practices

### 1. Security
- Use `<%= %>` for all user data (HTML escaped)
- Only use `<%- %>` for trusted HTML content
- Never render user-provided HTML without sanitization

### 2. Organization
- Keep complex logic in controllers
- Use partials for reusable components
- Follow consistent naming conventions

### 3. Performance
- Minimize server-side processing in templates
- Use caching for static templates
- Optimize asset delivery

### 4. Maintainability
- Use semantic HTML structure
- Keep templates readable with proper indentation
- Comment complex template logic

## Error Handling

### Template Errors
EJS provides helpful error messages with line numbers:

```
Error: Could not find the include file "../partials/header.ejs"
    at include (ejs/lib/ejs.js:701:14)
    at eval (eval at compile (ejs/lib/ejs.js:662:12), <anonymous>:15:17)
```

### Development vs Production
- Development: Detailed error messages
- Production: Graceful error pages

## File Serving Configuration

### Static Assets

**CSS Files:**
```typescript
app.use('/application.css', express.static(
  path.join(__dirname, 'app/assets/stylesheet/dist/application.css')
));
```

**JavaScript Files:**
```typescript
app.use('/js', express.static(
  path.join(__dirname, 'app/client')
));
```

### Dynamic Template Rendering

Route handlers use the Express response object:

```javascript
// Render within layout
res.render("layouts/application", {
  title: "Page Title",
  body: "path/to/template"
});

// Direct template rendering
res.render("template/name", data);
```

This EJS implementation provides a clean, maintainable templating system that works seamlessly with modern frontend technologies like Stimulus and Turbo while maintaining the benefits of server-side rendering.