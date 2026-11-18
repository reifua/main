// Compiles src/assets/css/*.css with Tailwind + Autoprefixer into
// dist/assets/css/. Replaces eleventy-plugin-tailwindcss, which monkeypatched
// the Eleventy prototype (Eleventy.prototype.watch no longer exists in v3).
//
// Usage:
//   node lib/build-css.mjs           one-off build (production)
//   node lib/build-css.mjs --serve   build, then run `eleventy --serve`
//   node lib/build-css.mjs --watch   build, then run `eleventy --watch`
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import CleanCSS from 'clean-css';

const root = process.cwd();
const srcDir = path.join(root, 'src', 'assets', 'css');
const outDir = path.join(root, 'dist', 'assets', 'css');
const configFile = path.join(root, 'tailwind.config.js');

const args = new Set(process.argv.slice(2));
const serve = args.has('--serve');
const watchMode = serve || args.has('--watch');

async function cssFiles() {
  const entries = await readdir(srcDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => path.join(srcDir, entry.name));
}

async function buildCss() {
  const plugins = [tailwindcss(configFile), autoprefixer()];
  await mkdir(outDir, { recursive: true });

  for (const src of await cssFiles()) {
    const dest = path.join(outDir, path.basename(src));
    const input = await readFile(src);
    const result = await postcss(plugins).process(input, { from: src, to: dest });
    const css = new CleanCSS().minify(result.css).styles;
    await writeFile(dest, css);
    console.log(`[css] wrote ${path.relative(root, dest)} from ${path.relative(root, src)}`);
  }
}

function startEleventy() {
  const cmd = path.join(root, 'node_modules', '@11ty', 'eleventy', 'cmd.js');
  const child = spawn(process.execPath, [cmd, serve ? '--serve' : '--watch'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

function watchCss() {
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildCss().catch((error) => {
        console.error('[css] build failed:', error);
      });
    }, 100);
  };

  watch(srcDir, schedule);
  watch(configFile, schedule);
  console.log('[css] watching src/assets/css and tailwind.config.js');
}

await buildCss();
if (watchMode) {
  startEleventy();
  watchCss();
}
