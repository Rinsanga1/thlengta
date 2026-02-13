# Routing Integration Documentation

This document explains how routing is configured and integrated in this Express.js application using the centralized `config/routes.js` file.

## Architecture Overview

The routing system follows a **centralized router pattern** where:

1. **Central Router**: `config/routes.js` defines all application routes
2. **Controller Import**: Routes import controllers from `app/controllers/`
3. **Express Router**: Uses Express Router for modular route handling
4. **Server Integration**: Router is mounted in the main server file

## Directory Structure

```
config/
└── routes.js                    # Central route definitions

app/
└── controllers/
    ├── hello.controller.js     # Hello route handlers
    └── todo.controller.js      # Todo route handlers

server.ts                       # Main server file with router mounting
```

## Core Routing Configuration

### 1. Route Definition File

**File**: `config/routes.js`

```javascript
const express = require("express");

// Import controllers
const hello = require("../app/controllers/hello.controller");
const todo = require("../app/controllers/todo.controller");

// Create router instance
const router = express.Router();

// Define routes
router.get('/', hello.index);
router.get('/show', hello.show);
router.get('/new', hello.new);

router.get('/todo', todo.index);

// Export router for use in server
module.exports = router;
```

**Key Components:**

1. **Express Import**: `require("express")` - Imports Express framework
2. **Controller Imports**: Imports route handlers from controller files
3. **Router Instance**: `express.Router()` - Creates modular router
4. **Route Definitions**: Maps HTTP methods and paths to controller functions
5. **Module Export**: Exports the configured router

### 2. Route Patterns Explained

```javascript
// Basic GET routes
router.get('/', hello.index);           // GET / -> hello.index
router.get('/show', hello.show);        // GET /show -> hello.show
router.get('/new', hello.new);          // GET /new -> hello.new

// Feature-specific routes
router.get('/todo', todo.index);         // GET /todo -> todo.index
```

**Route Structure:**
- **HTTP Method**: `router.get()`, `router.post()`, `router.put()`, etc.
- **Path**: URL pattern (can include parameters like `/users/:id`)
- **Handler**: Controller function to execute

## Controller Integration

### Controller Structure

Controllers export functions that handle request/response logic:

**File**: `app/controllers/hello.controller.js`

```javascript
exports.index = (req, res) => {
  res.render("layouts/application", {
    title: "Home",
    body: "hello/index"
  });
};

exports.show = (req, res) => {
  res.render("layouts/application", {
    title: "Home",
    body: "hello/show"
  });
};

exports.new = (req, res) => {
  res.render("layouts/application", {
    title: "Home", 
    body: "hello/new"
  });
};
```

**File**: `app/controllers/todo.controller.js`

```javascript
exports.index = (_req, res) => {
  res.render("layouts/application", {
    title: "todo",
    body: "todo/index"
  });
};
```

### Controller Function Pattern

```javascript
// Standard controller function signature
exports.handlerName = (req, res) => {
  // Request handling logic
  // req: Request object (params, query, body, etc.)
  // res: Response object (render, json, redirect, etc.)
  
  res.render("layouts/application", {
    title: "Page Title",
    body: "template/path"
  });
};
```

## Server Integration

### Router Mounting

**File**: `server.ts`

```typescript
const express = require("express");
const path = require("path");

// Import routes
const routes = require("./config/routes");

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'app/views'));

// Mount the router
app.use('/', routes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Mounting Process:**
1. **Import Routes**: `require("./config/routes")` imports the configured router
2. **Mount Router**: `app.use('/', routes)` mounts router at root path
3. **Route Resolution**: Requests are matched against routes in the router

## Route Resolution Flow

### Request Processing Steps

1. **Incoming Request**: Client requests `/todo`
2. **Router Matching**: Express checks if path matches any defined routes
3. **Route Found**: `router.get('/todo', todo.index)` matches
4. **Controller Execution**: Calls `todo.index(req, res)`
5. **Template Rendering**: Controller renders response with EJS
6. **Response Sent**: Final HTML sent to client

### URL Mapping

```
HTTP Method  URL Path        Controller Function    Template
-----------  ---------       -----------------     --------
GET          /               hello.index            hello/index
GET          /show           hello.show             hello/show  
GET          /new            hello.new              hello/new
GET          /todo           todo.index             todo/index
```

## Advanced Routing Patterns

### 1. Route Parameters

```javascript
// Dynamic routes with parameters
router.get('/users/:id', userController.show);
router.get('/posts/:postId/comments/:commentId', commentController.show);

// Accessing parameters in controller
exports.show = (req, res) => {
  const userId = req.params.id;
  const postId = req.params.postId;
  const commentId = req.params.commentId;
  
  // Use parameters to fetch data
  res.render("layouts/application", {
    title: "User Profile",
    body: "users/show",
    user: getUserById(userId)
  });
};
```

### 2. Query Parameters

```javascript
// Routes can handle query parameters automatically
router.get('/search', searchController.results);

// Accessing query in controller
exports.results = (req, res) => {
  const query = req.query.q;        // GET /search?q=javascript
  const page = req.query.page || 1; // GET /search?page=2
  
  res.render("layouts/application", {
    title: "Search Results",
    body: "search/results",
    results: performSearch(query, page)
  });
};
```

### 3. HTTP Method Variations

```javascript
// Different HTTP methods for same path
router.get('/users', userController.index);    // List users
router.post('/users', userController.create);   // Create user
router.put('/users/:id', userController.update); // Update user
router.delete('/users/:id', userController.delete); // Delete user
```

### 4. Route Middleware

```javascript
// Middleware functions
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// Apply middleware to routes
router.get('/dashboard', requireAuth, dashboardController.index);
router.get('/profile', requireAuth, profileController.show);

// Middleware for route groups
router.use('/admin', requireAuth, adminMiddleware);
router.get('/admin/users', adminController.users);
router.get('/admin/settings', adminController.settings);
```

### 5. Route Groups and Namespacing

```javascript
// API routes group
const apiRouter = express.Router();

apiRouter.get('/users', userApiController.index);
apiRouter.post('/users', userApiController.create);
apiRouter.get('/posts', postApiController.index);

// Mount API routes at /api
router.use('/api', apiRouter);

// Admin routes group
const adminRouter = express.Router();
adminRouter.get('/dashboard', adminController.dashboard);
adminRouter.get('/users', adminController.users);

// Mount admin routes at /admin
router.use('/admin', adminRouter);
```

## Error Handling in Routes

### 1. Try-Catch Pattern

```javascript
exports.show = async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    
    if (!user) {
      return res.status(404).render("layouts/application", {
        title: "User Not Found",
        body: "errors/404"
      });
    }
    
    res.render("layouts/application", {
      title: user.name,
      body: "users/show",
      user: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).render("layouts/application", {
      title: "Server Error",
      body: "errors/500"
    });
  }
};
```

### 2. Async/Await Support

```javascript
// Using async/await in controllers
exports.create = async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.redirect(`/users/${user.id}`);
  } catch (error) {
    res.status(400).render("layouts/application", {
      title: "Create User",
      body: "users/new",
      errors: error.message
    });
  }
};
```

## Route Organization Best Practices

### 1. Controller Naming Convention

```
app/controllers/
├── users.controller.js     # User-related routes
├── posts.controller.js      # Post-related routes
├── auth.controller.js       # Authentication routes
└── admin.controller.js      # Admin routes
```

### 2. Route Organization

```javascript
// Group related routes together
// Public routes
router.get('/', homeController.index);
router.get('/about', aboutController.show);
router.get('/contact', contactController.show);

// User routes
router.get('/users', userController.index);
router.get('/users/:id', userController.show);
router.post('/users', userController.create);

// Session routes
router.get('/login', sessionController.new);
router.post('/login', sessionController.create);
router.delete('/logout', sessionController.destroy);
```

### 3. RESTful Route Patterns

```javascript
// Standard RESTful routes for a resource
router.get('/posts', postController.index);      // index - list all
router.get('/posts/new', postController.new);     // new - show form
router.post('/posts', postController.create);     // create - create new
router.get('/posts/:id', postController.show);    // show - show one
router.get('/posts/:id/edit', postController.edit); // edit - show edit form
router.put('/posts/:id', postController.update);  // update - update existing
router.delete('/posts/:id', postController.delete); // delete - remove
```

## Debugging Routes

### 1. Route Listing

```javascript
// Add this to your routes file to see all registered routes
router.get('/routes', (req, res) => {
  const routes = router.stack
    .filter(r => r.route)
    .map(r => ({
      method: Object.keys(r.route.methods)[0].toUpperCase(),
      path: r.route.path,
      handler: r.route.stack[0].name || 'anonymous'
    }));
  
  res.json(routes);
});
```

### 2. Request Logging Middleware

```javascript
// Add middleware to log all requests
router.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});
```

### 3. Route Testing

```javascript
// Test routes programmatically
const request = require('supertest');
const app = require('../server');

describe('Routes', () => {
  test('GET / returns home page', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Home');
  });
  
  test('GET /todo returns todo page', async () => {
    const response = await request(app).get('/todo');
    expect(response.status).toBe(200);
    expect(response.text).toContain('My Todos');
  });
});
```

## Performance Considerations

### 1. Route Order Matters

```javascript
// More specific routes first
router.get('/users/new', userController.new);     // Specific
router.get('/users/:id', userController.show);    // Parameterized

// Static routes after parameterized ones
router.get('/about', aboutController.show);       // Static
```

### 2. Route Caching

```javascript
// Cache expensive route computations
const cache = new Map();

exports.index = async (req, res) => {
  const cacheKey = 'homepage_data';
  
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, await fetchExpensiveData());
  }
  
  res.render("layouts/application", {
    title: "Home",
    body: "home/index",
    data: cache.get(cacheKey)
  });
};
```

## Security Considerations

### 1. Input Validation

```javascript
const { body, validationResult } = require('express-validator');

router.post('/users', 
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render("layouts/application", {
        title: "Create User",
        body: "users/new",
        errors: errors.array()
      });
    }
    
    // Proceed with user creation
    userController.create(req, res);
  }
);
```

### 2. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

router.use('/api', limiter);
```

This routing system provides a clean, organized way to manage application routes while maintaining separation of concerns and enabling scalable development.