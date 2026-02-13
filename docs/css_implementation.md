# CSS Implementation and Compilation

This document explains how CSS is implemented and compiled for EJS templates in this Express.js application.

## Architecture Overview

The CSS system uses a simple concatenation approach that combines multiple CSS files into a single `application.css` file served to the browser. This approach provides:

- **Single HTTP Request**: Reduces network overhead by serving one CSS file
- **Modular Development**: Allows organizing styles in separate files by feature/component
- **Automatic Compilation**: Concatenates CSS files on server start
- **Clear Separation**: Individual feature styles with global base styles

## Directory Structure

```
app/
├── assets/
│   └── stylesheet/
│       ├── application.css    # Global/base styles
│       ├── hello.css          # Hello page specific styles
│       ├── todo.css           # Todo app specific styles
│       └── dist/
│           └── application.css # Compiled/concatenated output
├── views/
│   └── layouts/
│       └── application.ejs   # Template that references compiled CSS
└── scripts/
    └── compile-css.js        # CSS compilation script
```

## CSS Compilation Process

### 1. Compilation Script

**File**: `scripts/compile-css.js`

The compilation script performs the following operations:

```javascript
const fs = require('fs');
const path = require('path');

exports.compileCSS = () => {
  const sourceDir = path.join(__dirname, '../app/assets/stylesheet');
  const distDir = path.join(__dirname, '../app/assets/stylesheet/dist');
  const outputFile = path.join(distDir, 'application.css');

  try {
    // Get all CSS files except those in dist/
    const cssFiles = fs.readdirSync(sourceDir)
      .filter(file => file.endsWith('.css') && file !== 'dist')
      .sort(); // Alphabetical order

    // Concatenate all CSS files with comments
    const combinedCSS = cssFiles.map(file => {
      const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      return `/* === ${file} === */\n${content}\n`;
    }).join('\n');

    // Ensure dist directory exists
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Write compiled CSS
    fs.writeFileSync(outputFile, combinedCSS);
    console.log(`✅ CSS compiled: ${cssFiles.length} files → application.css`);
    return true;
  } catch (error) {
    console.warn("⚠️  CSS compilation failed:", error.message);
    return false;
  }
};
```

**Key Features:**
- **Automatic Discovery**: Scans the stylesheet directory for `.css` files
- **Alphabetical Ordering**: Ensures consistent compilation order
- **Section Comments**: Adds `/* === filename === */` comments for debugging
- **Error Handling**: Gracefully handles compilation failures
- **Directory Creation**: Automatically creates the `dist` folder if needed

### 2. Server Integration

**File**: `server.ts`

The compilation script is executed during server startup:

```typescript
const express = require("express");
const path = require("path");
const assets = require("./scripts/compile-css");

// CSS Compilation (run before server starts)
assets.compileCSS;

const app = express();

// Serve compiled CSS
app.use(express.static(path.join(__dirname, 'app/assets/stylesheet/dist')));
```

**Process Flow:**
1. Server starts
2. `compileCSS` script runs automatically
3. All CSS files are concatenated into `dist/application.css`
4. Express serves the compiled CSS statically
5. EJS templates reference the compiled file

## CSS File Organization

### 1. Global/Base Styles

**File**: `app/assets/stylesheet/application.css`

Contains foundational styles applied across the entire application:

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    min-height: 100vh;
    background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
    background-size: 400% 400%;
    animation: gradientShift 15s ease infinite;
    font-family: 'Arial', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3rem;
    overflow: hidden;
}
```

**Purpose:**
- CSS reset and box-sizing normalization
- Global body styles (background, layout, typography)
- Application-wide animations and effects
- Responsive base styles

### 2. Feature-Specific Styles

**File**: `app/assets/stylesheet/todo.css`

Contains styles specific to the todo application:

```css
.todo-app {
    background: white;
    border-radius: 20px;
    padding: 40px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    max-width: 400px;
    width: 100%;
}

.add-task {
    display: block;
    width: 100%;
    padding: 15px;
    background: #f8f9fa;
    border: 2px dashed #ddd;
    border-radius: 12px;
    /* ... more styles ... */
}
```

**File**: `app/assets/stylesheet/hello.css`

Contains styles for the hello page animations and components:

```css
/* Floating Particles */
.particle {
    position: absolute;
    background: rgba(255,255,255,0.5);
    border-radius: 50%;
    pointer-events: none;
    animation: float 6s infinite linear;
}

/* 3D Cube */
.cube-container {
    perspective: 1000px;
    cursor: grab;
}

/* Glass Cards */
.card {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(20px);
    /* ... more styles ... */
}
```

## Compiled Output

### Compilation Result

**File**: `app/assets/stylesheet/dist/application.css`

The compiled output combines all source files:

```css
/* === application.css === */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    min-height: 100vh;
    background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
    background-size: 400% 400%;
    animation: gradientShift 15s ease infinite;
    /* ... more body styles ... */
}

/* === hello.css === */
.particle {
    position: absolute;
    background: rgba(255,255,255,0.5);
    border-radius: 50%;
    /* ... more particle styles ... */
}

/* === todo.css === */
.todo-app {
    background: white;
    border-radius: 20px;
    padding: 40px;
    /* ... more todo styles ... */
}
```

**Features of Compiled Output:**
- **Section Comments**: Clear separation between source files
- **Full Concatenation**: All CSS rules in a single file
- **Preserved Order**: Files combined in alphabetical order
- **No Minification**: Human-readable for development

## EJS Template Integration

### 1. Layout Template Reference

**File**: `app/views/layouts/application.ejs`

The compiled CSS is referenced in the main layout:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title><%= title || "Thlengta" %></title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script type="module" src="/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.min.js"></script>
  <script type="module" src="/js/application.ts"></script>
  
  <!-- Compiled CSS -->
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

### 2. Static File Serving

**File**: `server.ts`

The compiled CSS is served as a static file:

```typescript
// Serve static assets (including compiled CSS)
app.use(express.static(path.join(__dirname, 'app/assets/stylesheet/dist')));
```

**URL Mapping:**
- Template reference: `/application.css`
- Actual file: `app/assets/stylesheet/dist/application.css`
- Content-Type: `text/css` (automatically set by Express)

## Development Workflow

### 1. Adding New Styles

**Step 1:** Create a new CSS file in the stylesheet directory

```bash
touch app/assets/stylesheet/profile.css
```

**Step 2:** Add your component styles

```css
/* app/assets/stylesheet/profile.css */
.profile-card {
    background: white;
    border-radius: 15px;
    padding: 2rem;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.profile-avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    margin: 0 auto 1rem;
}
```

**Step 3:** Restart the server to recompile CSS

```bash
bun run server
```

**Step 4:** Use the styles in your EJS templates

```html
<!-- app/views/profile/index.ejs -->
<div class="profile-card">
  <img src="/avatar.jpg" alt="Profile" class="profile-avatar">
  <h2><%= user.name %></h2>
</div>
```

### 2. Development Server

During development, the CSS compilation happens automatically:

```bash
bun run server
# Output: ✅ CSS compiled: 3 files → application.css
```

The compilation occurs once at server startup. For development with hot reloading, you would need to add file watching.

## Best Practices

### 1. File Organization

```bash
app/assets/stylesheet/
├── application.css     # Global styles, resets, variables
├── components.css      # Reusable component styles
├── layout.css          # Layout and navigation styles
├── todo.css           # Todo feature styles
├── profile.css        # Profile feature styles
└── responsive.css     # Media queries and responsive styles
```

### 2. CSS Architecture

```css
/* application.css - Global styles and CSS custom properties */
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --text-dark: #333;
  --text-light: #666;
  --background: #f8f9fa;
  --border-radius: 12px;
  --transition: all 0.3s ease;
}

/* Component-specific CSS files */
/* todo.css */
.todo-app {
  background: var(--background);
  border-radius: var(--border-radius);
  transition: var(--transition);
}
```

### 3. Class Naming Conventions

```css
/* BEM methodology recommended */
.todo-app { }
.todo-app__header { }
.todo-app__list { }
.todo-app__item { }
.todo-app__item--completed { }
.todo-app__item--urgent { }
```

### 4. Performance Considerations

- **Order Matters**: Load `application.css` first for base styles
- **Specificity**: Keep selectors simple to avoid conflicts
- **Media Queries**: Place responsive styles at the end of component files
- **Optimization**: Consider CSS minification for production

## Advanced Features

### 1. Custom Compilation Script

Enhanced compilation with additional features:

```javascript
// scripts/compile-css.js
const fs = require('fs');
const path = require('path');

exports.compileCSS = (options = {}) => {
  const {
    minify = false,
    watch = false,
    sourceMap = false
  } = options;

  // Enhanced compilation logic
  // - CSS minification
  // - File watching
  // - Source map generation
  // - PostCSS processing
};
```

### 2. Environment-Specific Compilation

```javascript
// scripts/compile-css.js
const isDevelopment = process.env.NODE_ENV !== 'production';

exports.compileCSS = () => {
  const cssFiles = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith('.css') && file !== 'dist')
    .sort();

  const combinedCSS = cssFiles.map(file => {
    const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    return isDevelopment 
      ? `/* === ${file} === */\n${content}\n`
      : content; // Remove comments in production
  }).join('\n');

  // Write compiled CSS
  fs.writeFileSync(outputFile, combinedCSS);
};
```

### 3. Watch Mode for Development

```javascript
// scripts/watch-css.js
const fs = require('fs');
const { compileCSS } = require('./compile-css');

function watchCSS() {
  const stylesheetDir = path.join(__dirname, '../app/assets/stylesheet');
  
  // Initial compilation
  compileCSS();
  
  // Watch for changes
  fs.watch(stylesheetDir, (eventType, filename) => {
    if (filename.endsWith('.css') && filename !== 'dist') {
      console.log(`🔄 CSS changed: ${filename}`);
      compileCSS();
    }
  });
}

watchCSS();
```

## Error Handling and Debugging

### 1. Compilation Errors

The script handles common errors:

```javascript
try {
  const cssFiles = fs.readdirSync(sourceDir);
  // ... compilation logic
} catch (error) {
  console.warn("⚠️  CSS compilation failed:", error.message);
  return false;
}
```

**Common Issues:**
- Missing source directory
- Permission errors
- Invalid CSS syntax (not caught by this simple script)
- File encoding issues

### 2. Debugging Compiled CSS

The section comments help identify source files:

```css
/* === todo.css === */
.todo-app { /* Styles from todo.css */ }

/* === hello.css === */
.particle { /* Styles from hello.css */ }
```

**Browser DevTools:**
- Use inspector to identify which file contains specific rules
- Check the "Sources" tab for the compiled file
- Use section comments to navigate to source files

## Future Enhancements

### 1. CSS Preprocessors

Enhance the system to support Sass/SCSS:

```javascript
// scripts/compile-scss.js
const sass = require('sass');

exports.compileSCSS = () => {
  const result = sass.compile('app/assets/scss/application.scss');
  fs.writeFileSync('app/assets/stylesheet/dist/application.css', result.css);
};
```

### 2. PostCSS Integration

Add PostCSS for autoprefixing and optimization:

```javascript
// scripts/compile-css.js
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');

exports.compileCSS = async () => {
  // Concatenate files
  const combinedCSS = concatCSSFiles();
  
  // Process with PostCSS
  const result = await postcss([autoprefixer])
    .process(combinedCSS, { from: undefined });
    
  fs.writeFileSync(outputFile, result.css);
};
```

### 3. Production Optimization

```javascript
// scripts/optimize-css.js
const CleanCSS = require('clean-css');

exports.optimizeCSS = (css) => {
  const minifier = new CleanCSS({
    level: 2, // Advanced optimizations
    returnPromise: true
  });
  
  return minifier.minify(css);
};
```

This CSS implementation provides a simple, maintainable approach to styling in Express.js + EJS applications while offering flexibility for future enhancements and optimizations.