import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const whisperPath = join(ROOT, 'data', 'whispers.json');
const originalWhispers = await readFile(whisperPath, 'utf8');
const port = 4191;
const child = spawn(process.execPath, ['server.mjs'], {cwd:ROOT, env:{...process.env, PORT:String(port)}, stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d);

const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function waitForServer(){ for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return;}catch{} await sleep(100);} throw new Error(`server did not start: ${logs}`); }
function assert(cond,msg){if(!cond)throw new Error(msg);}

try {
  await waitForServer();
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert(health.ok && health.projects===9,'health/project count mismatch');

  const projects = await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json();
  assert(projects.length===9,'expected 9 projects');
  assert(projects.every(p=>p.github.startsWith('https://github.com/jnibarger01/')),'all destinations must be Jace GitHub portals');

  const route = await (await fetch(`http://127.0.0.1:${port}/project/agent-control-stack`)).text();
  assert(route.includes('<title>Agent Control Stack · Jace Drive Portfolio</title>'),'project title not injected');
  assert(route.includes('rel="canonical" href="http://127.0.0.1:4191/project/agent-control-stack"'),'canonical not injected');

  const sitemap = await (await fetch(`http://127.0.0.1:${port}/sitemap.xml`)).text();
  assert((sitemap.match(/<url>/g)||[]).length===10,'sitemap should contain home + 9 projects');

  const vehicleJs = await (await fetch(`http://127.0.0.1:${port}/vehicle-3d.js`)).text();
  assert(vehicleJs.includes('modsnation_7416_assets_assembled.glb'),'exact Toyota Showroom 4Runner model URL missing');
  assert(vehicleJs.includes('2024 Toyota 4Runner TRD Pro'),'4Runner vehicle identity missing');
  const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
  const csp = homeResponse.headers.get('content-security-policy') || '';
  assert(csp.includes('raw.githubusercontent.com') && csp.includes('www.gstatic.com'),'4Runner model/Draco CSP sources missing');

  const bad = await fetch(`http://127.0.0.1:${port}/api/whispers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:''})});
  assert(bad.status===400,'empty whisper should fail');

  await sleep(2100);
  const good = await fetch(`http://127.0.0.1:${port}/api/whispers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test','message':'Portal smoke test'})});
  assert(good.status===201,'valid whisper should be created');
  const saved = await good.json(); assert(saved.message==='Portal smoke test','created whisper mismatch');

  console.log('PASS · API, SEO routes, sitemap, GitHub destinations, and visitor radio validated');
} finally {
  child.kill('SIGTERM');
  await writeFile(whisperPath, originalWhispers, 'utf8');
}
