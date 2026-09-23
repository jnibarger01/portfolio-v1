import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA = join(ROOT, 'data');
const PROJECTS = JSON.parse(await readFile(join(DATA, 'projects.json'), 'utf8'));
const projectBySlug = new Map(PROJECTS.map(p => [p.slug, p]));
const baseHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
const recentPosts = new Map();

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4177);

const mime = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.xml':'application/xml; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8'
};

function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function json(res, status, body) { res.writeHead(status, {'content-type':'application/json; charset=utf-8', ...securityHeaders()}); res.end(JSON.stringify(body)); }
function securityHeaders() {
  return {
    'x-content-type-options':'nosniff',
    'x-frame-options':'SAMEORIGIN',
    'referrer-policy':'strict-origin-when-cross-origin',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'self'; script-src 'self' https://esm.sh 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://esm.sh https://raw.githubusercontent.com https://www.gstatic.com; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
  };
}

function pageMeta(req, pathname) {
  const match = pathname.match(/^\/project\/([^/]+)\/?$/);
  const project = match ? projectBySlug.get(match[1]) : null;
  const title = project ? `${project.name} · Jace Drive Portfolio` : 'Jace Drive · Interactive Developer Portfolio';
  const description = project ? project.description : 'Drive through Jace Nibarger’s projects in a playable portfolio where every destination opens a real GitHub project portal.';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || `${HOST}:${PORT}`;
  const canonical = `${proto}://${host}${project ? `/project/${project.slug}` : '/'}`;
  return {title, description, canonical};
}

function renderHtml(req, pathname) {
  const meta = pageMeta(req, pathname);
  return baseHtml.replaceAll('{{TITLE}}', esc(meta.title)).replaceAll('{{DESCRIPTION}}', esc(meta.description)).replaceAll('{{CANONICAL}}', esc(meta.canonical));
}

async function readWhispers() {
  try { return JSON.parse(await readFile(join(DATA, 'whispers.json'), 'utf8')); }
  catch { return []; }
}
async function writeWhispers(rows) {
  await mkdir(DATA, {recursive:true});
  const tmp = join(DATA, `whispers.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  await rename(tmp, join(DATA, 'whispers.json'));
}
async function readBody(req, maxBytes=4096) {
  let size=0, chunks=[];
  for await (const chunk of req) { size += chunk.length; if(size>maxBytes) throw new Error('payload_too_large'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, {ok:true, projects:PROJECTS.length});
    if (req.method === 'GET' && pathname === '/api/projects') return json(res, 200, PROJECTS);
    if (req.method === 'GET' && pathname.startsWith('/api/projects/')) {
      const p = projectBySlug.get(pathname.split('/').pop());
      return p ? json(res,200,p) : json(res,404,{error:'project_not_found'});
    }
    if (req.method === 'GET' && pathname === '/api/whispers') return json(res,200,await readWhispers());
    if (req.method === 'POST' && pathname === '/api/whispers') {
      const ip = req.socket.remoteAddress || 'local'; const last = recentPosts.get(ip) || 0;
      if (Date.now()-last < 2000) return json(res,429,{error:'Please wait before transmitting again.'});
      let payload; try { payload=JSON.parse(await readBody(req)); } catch(e) { return json(res,e.message==='payload_too_large'?413:400,{error:'Invalid JSON payload.'}); }
      const name = String(payload.name || 'Visitor').trim().slice(0,20).replace(/[<>]/g,'') || 'Visitor';
      const message = String(payload.message || '').trim().slice(0,60).replace(/[<>]/g,'');
      if (!message) return json(res,400,{error:'Message is required.'});
      const rows = await readWhispers();
      const row = {id:crypto.randomUUID(), name, message, createdAt:new Date().toISOString()};
      await writeWhispers([...rows,row].slice(-30)); recentPosts.set(ip,Date.now()); return json(res,201,row);
    }
    if (req.method === 'GET' && pathname === '/sitemap.xml') {
      const proto=req.headers['x-forwarded-proto']||'http', host=req.headers.host||`${HOST}:${PORT}`, origin=`${proto}://${host}`;
      const urls=[origin+'/',...PROJECTS.map(p=>`${origin}/project/${p.slug}`)].map(u=>`  <url><loc>${esc(u)}</loc></url>`).join('\n');
      res.writeHead(200,{'content-type':'application/xml; charset=utf-8',...securityHeaders()}); return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    }
    if (req.method === 'GET' && (pathname === '/' || pathname.match(/^\/project\/[^/]+\/?$/))) {
      const match=pathname.match(/^\/project\/([^/]+)/); if(match && !projectBySlug.has(match[1])) {res.writeHead(404,securityHeaders()); return res.end('Project not found');}
      res.writeHead(200,{'content-type':'text/html; charset=utf-8',...securityHeaders()}); return res.end(renderHtml(req,pathname));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'method_not_allowed'});
    const safe = normalize(pathname).replace(/^([.][.][/\\])+/, '').replace(/^\/+/, '');
    const file = join(ROOT, safe);
    if (!file.startsWith(ROOT)) {res.writeHead(403,securityHeaders()); return res.end('Forbidden');}
    try {
      const body = await readFile(file); res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control': pathname.endsWith('.js')||pathname.endsWith('.css')?'public, max-age=300':'public, max-age=3600',...securityHeaders()});
      return req.method==='HEAD'?res.end():res.end(body);
    } catch { res.writeHead(404,securityHeaders()); return res.end('Not found'); }
  } catch (err) {
    console.error(err); json(res,500,{error:'internal_error'});
  }
});

server.listen(PORT, HOST, () => console.log(JSON.stringify({ok:true, url:`http://${HOST}:${PORT}`, projects:PROJECTS.length})));
