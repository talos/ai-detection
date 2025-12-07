import { copyFileSync, mkdirSync, existsSync, rmSync, cpSync } from 'fs';
import { join } from 'path';

const srcDir = './src';
const distDir = './dist';
const firefoxDir = './src/firefox';

// Clean dist directory
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir);

// Build configuration for each entry point
const entryPoints = [
  { input: join(srcDir, 'content_script.ts'), output: join(distDir, 'content_script.js') },
  { input: join(srcDir, 'background.ts'), output: join(distDir, 'background.js') },
  { input: join(srcDir, 'popup.ts'), output: join(distDir, 'popup.js') },
  { input: join(srcDir, 'options.ts'), output: join(distDir, 'options.js') },
];

console.log('Building extension...');

// Build each entry point
for (const { input, output } of entryPoints) {
  const fileName = output.split('/').pop()!;
  const result = await Bun.build({
    entrypoints: [input],
    outdir: distDir,
    naming: fileName,
    target: 'browser',
    minify: false, // Keep readable for debugging
    sourcemap: 'external',
  });

  if (!result.success) {
    console.error(`Failed to build ${input}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`  Built: ${output}`);
}

// Copy static files from firefox directory
const staticFiles = [
  'manifest.json',
  'popup.html',
  'options.html',
  'icon.svg',
];

for (const file of staticFiles) {
  const srcPath = join(firefoxDir, file);
  const destPath = join(distDir, file);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`  Copied: ${file}`);
  } else {
    console.warn(`  Warning: ${file} not found`);
  }
}

// Update manifest to use bundled files (remove highlight.js since it's bundled)
const manifestPath = join(distDir, 'manifest.json');
const manifest = await Bun.file(manifestPath).json();

// Update content_scripts to just use the bundled file
manifest.content_scripts = [{
  matches: ['<all_urls>'],
  js: ['content_script.js']
}];

// Update background scripts
manifest.background = {
  scripts: ['background.js']
};

await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
console.log('  Updated manifest.json');

console.log('\nBuild complete! Extension ready in ./dist');
console.log('Load in Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> select dist/manifest.json');
