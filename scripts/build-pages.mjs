import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'dist');
const base = process.env.PAGES_BASE_PATH || '/portfolio-v1/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('PAGES_BASE_PATH must start and end with /.');
const origin = `https://jnibarger01.github.io${base.slice(0, -1)}`;

await mkdir(OUT, { recursive: true });
for (const path of ['assets', 'data', 'js', 'vendor']) await cp(join(ROOT, path), join(OUT, path), { recursive: true });
for (const path of ['styles.css', 'favicon.svg', 'site.webmanifest', 'social-preview.svg']) await cp(join(ROOT, path), join(OUT, path));
await writeFile(join(OUT, 'data', 'whispers.json'), '[]\n');
await writeFile(join(OUT, 'data', 'laps.json'), '[]\n');

globalThis.JACE_STATIC_PAGES = true;
globalThis.JACE_BASE_PATH = base;
const [{ projectArticle, projectListHtml }, projects] = await Promise.all([
  import('../js/templates.js'),
  readFile(join(ROOT, 'data', 'projects.json'), 'utf8').then(JSON.parse)
]);
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Person', name: 'Jace Nibarger', url: `${origin}/`,
  jobTitle: 'Assistant Service Drive Manager and Service Advisor',
  sameAs: ['https://github.com/jnibarger01', 'https://www.linkedin.com/in/jace-nibarger-a7196211b']
}).replaceAll('<', '\\u003c');

let html = await readFile(join(ROOT, 'index.html'), 'utf8');
const replacements = {
  '{{TITLE}}': 'Jace Drive · Interactive Developer Portfolio',
  '{{DESCRIPTION}}': 'Drive through Jace Nibarger’s projects in a playable portfolio where every destination opens a real GitHub project portal.',
  '{{CANONICAL}}': `${origin}/`, '{{ORIGIN}}': origin, '{{OG_TYPE}}': 'website', '{{JSONLD}}': jsonLd,
  '{{ROUTE}}': 'home', '{{PROJECT_LIST}}': projectListHtml(projects),
  '{{PROJECT_ARTICLE}}': projectArticle(projects[0], 0, projects.length)
};
for (const [token, value] of Object.entries(replacements)) html = html.replaceAll(token, value);
html = html
  .replace(/(href|src)="\/([^"]*)"/g, (match, attribute, path) => path.startsWith(base.slice(1)) ? match : `${attribute}="${base}${path}"`)
  .replaceAll('<body ', '<body data-static-pages="true" ')
  .replace('</body>', `<script>window.JACE_STATIC_PAGES=true;window.JACE_BASE_PATH=${JSON.stringify(base)};</script>\n</body>`);
await writeFile(join(OUT, 'index.html'), html);

for (const path of ['styles.css']) {
  const file = join(OUT, path);
  const contents = await readFile(file, 'utf8');
  await writeFile(file, contents.replaceAll('/assets/', `${base}assets/`).replaceAll('/vendor/', `${base}vendor/`));
}
for (const dir of ['js', 'vendor']) {
  const { readdir } = await import('node:fs/promises');
  async function rewrite(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (entry.isDirectory()) { await rewrite(file); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const source = await readFile(file, 'utf8');
      await writeFile(file, source.replaceAll("'/vendor/", `'${base}vendor/`).replaceAll('"/vendor/', `"${base}vendor/`).replaceAll("'/assets/", `'${base}assets/`).replaceAll('"/assets/', `"${base}assets/`));
    }
  }
  await rewrite(join(OUT, dir));
}
const manifestPath = join(OUT, 'site.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.start_url = base;
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: base + icon.src.replace(/^\/+/, '') }));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(OUT, 'robots.txt'), `User-agent: *\nAllow: ${base}\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
console.log(`Built GitHub Pages site at ${OUT} for ${origin}/`);
