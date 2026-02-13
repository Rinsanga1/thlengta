import * as fs from 'fs';
import * as path from 'path';

export const compileCSS = (): boolean => {
  const sourceDir = path.join(__dirname, '../app/assets/stylesheet');
  const distDir = path.join(sourceDir, 'dist');
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
    console.warn("⚠️  CSS compilation failed:", (error as Error).message);
    return false;
  }
};

compileCSS();
