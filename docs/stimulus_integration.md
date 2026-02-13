# Stimulus Integration

This document explains how Stimulus is implemented in this Express.js + EJS application.

## Architecture Overview

This application uses a server-client architecture with Stimulus handling frontend interactions:

- **Backend**: Express.js with EJS templating for server-rendered HTML
- **Frontend**: Stimulus for client-side interactivity without full-page reloads
- **Build Tool**: Bun serves TypeScript directly - no compilation step needed

## Directory Structure

```
app/
├── client/                    # Client-side JavaScript/TypeScript
│   ├── application.ts        # Stimulus entry point
│   └── controllers/          # Stimulus controllers
│       └── todo_controller.ts
├── views/
│   └── layouts/
│       └── application.ejs   # Main layout with Stimulus script
```

## Implementation Details

### 1. Stimulus Entry Point

**File**: `app/client/application.ts`

```typescript
import { Application } from "@hotwired/stimulus"

const application = Application.start()

// Register todo controller manually
import TodoController from "./controllers/todo_controller"
application.register("todo", TodoController)

export { application }
```

### 2. Controller Implementation

**File**: `app/client/controllers/todo_controller.ts`

Controllers use TypeScript with proper type declarations:

```typescript
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["taskItem", "addTask", "input", "summary"]

  declare taskItemTargets: HTMLElement[]
  declare addTaskTarget: HTMLElement
  declare inputTarget: HTMLInputElement
  declare summaryTarget: HTMLElement

  // Controller methods...
}
```

### 3. Server Configuration

**File**: `server.ts`

Stimulus files are served from `/js` route:

```typescript
// Serve TypeScript files directly (Bun handles this)
app.use('/js', express.static(path.join(__dirname, 'app/client')));
```

### 4. Template Integration

**File**: `app/views/layouts/application.ejs`

Stimulus is loaded after Turbo:

```html
<script type="module" src="/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.min.js"></script>
<script type="module" src="/js/application.ts"></script>
```

### 5. EJS Template Usage

**File**: `app/views/todo/index.ejs`

Stimulus data attributes connect HTML to controllers:

```html
<section class="todo-app" data-controller="todo">
  <h1>My Todos (<span data-todo-target="summary">0/0</span>)</h1>

  <label class="add-task" data-todo-target="addTask" data-action="click->todo#addTask">
    + Add Task
    <input data-todo-target="input" type="text" placeholder="New task...">
  </label>

  <div class="todo-slot">
    <label class="task-item" data-todo-target="taskItem" data-action="change->todo#toggle">
      <input type="checkbox">
      <span>Learn HTML & CSS</span>
    </label>
  </div>
</section>
```

## Key Stimulus Concepts Used

### Data Attributes

- `data-controller="todo"` - Connects element to TodoController
- `data-target="todo.summary"` - Creates reference for controller access
- `data-action="click->todo#addTask"` - Binds events to controller methods

### Controller Lifecycle

- `connect()` - Called when controller is initialized
- `static targets` - Declares DOM elements the controller needs
- Method naming follows convention: `toggle()`, `addTask()`, etc.

## Benefits of This Approach

1. **Progressive Enhancement**: Server-rendered HTML with added interactivity
2. **No Build Complexity**: Bun serves TypeScript directly
3. **Clean Separation**: Backend handles data, frontend handles interactions
4. **Type Safety**: TypeScript ensures controller methods and targets are correct
5. **Minimal Dependencies**: Works with existing Express + EJS setup

## How to Add New Controllers

1. Create new controller file: `app/client/controllers/your_controller.ts`
2. Export default class extending `Controller`
3. Register in `app/client/application.ts`:
   ```typescript
   import YourController from "./controllers/your_controller"
   application.register("your", YourController)
   ```
4. Use in EJS template with `data-controller="your"`

## Development Workflow

1. Edit TypeScript controllers in `app/client/controllers/`
2. Restart server: `bun run server`
3. Browser loads TypeScript directly - no compilation step
4. Stimulus automatically connects controllers on page load

## Configuration Files

- **tsconfig.json**: Not needed - Bun handles TypeScript compilation
- **No webpack/build system**: Bun serves TypeScript files directly
- **package.json**: Stimulus dependencies managed by npm

This approach provides the benefits of Stimulus with minimal configuration overhead, perfect for Express.js applications that need frontend interactivity without the complexity of full SPA frameworks.
