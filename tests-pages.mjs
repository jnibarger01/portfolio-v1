import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(ROOT, 'dist');
const BASE = process.env.PAGES_BASE_PATH || '/portfolio-v1/';
const html = await readFile(join(DIST, 'index.html'), 'utf8');
assert(!/\{\{[A-Z_]+\}\}/.test(html), 'static page contains unrendered template tokens');
assert(html.includes(`href="https://jnibarger01.github.io${BASE}"`), 'static canonical URL is missing');
assert(html.includes(`src="${BASE}js/main.js"`), 'static module entrypoint does not include project path');
assert(html.includes('window.JACE_STATIC_PAGES=true'), 'static API mode is not enabled');
assert(html.includes('?route=project%2F'), 'static project links do not use refresh-safe query routes');

for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (!value.startsWith(BASE) || value.includes('#')) continue;
  const pathname = new URL(value, 'https://example.invalid').pathname;
  const relativePath = pathname.slice(BASE.length).replaceAll('/', sep);
  if (relativePath) await access(join(DIST, relativePath));
}

const app = await readFile(join(DIST, 'js', 'platform.js'), 'utf8');
assert(app.includes("'data/projects.json'"), 'static project catalog endpoint is missing');
assert(app.includes("'jace-drive-whispers'"), 'browser-local whisper storage is missing');
assert(app.includes("'jace-drive-laps'"), 'browser-local circuit storage is missing');
const main = await readFile(join(DIST, 'js', 'main.js'), 'utf8');
assert(main.includes('composer = new EffectComposer(renderer);'), 'postprocessing should use the compatible default render target');
assert(!/samples\s*:\s*4/.test(main), 'unsupported multisampled composer target returned');
const model = await readFile(join(DIST, 'assets', 'models', 'modsnation_7416_assets_assembled.glb'));
const wheel = await readFile(join(DIST, 'assets', 'models', 'wheel_trd_pro.glb'));
const tire = await readFile(join(DIST, 'assets', 'models', 'ModsNation_7416_tire.glb'));
assert.equal(model.length, 1266480, 'exact 4Runner model is missing from Pages artifact');
assert.equal(wheel.length, 329700, 'TRD Pro wheel is missing from Pages artifact');
assert.equal(tire.length, 171124, 'KO3 tire is missing from Pages artifact');
console.log('PASS · GitHub Pages paths, rendered metadata, local persistence, and exact 4Runner running-gear assets validated');
