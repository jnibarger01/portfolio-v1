import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const whisperPath = join(ROOT, 'data', 'whispers.json');
const originalWhispers = await readFile(whisperPath, 'utf8');
const lapPath = join(ROOT, 'data', 'laps.json');
const originalLaps = await readFile(lapPath, 'utf8');
const port = 4191;
const child = spawn(process.execPath, ['server.mjs'], {cwd:ROOT, env:{...process.env, PORT:String(port)}, stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d);

const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function waitForServer(){ for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return;}catch{} await sleep(100);} throw new Error(`server did not start: ${logs}`); }
function assert(cond,msg){if(!cond)throw new Error(msg);}

try {
  await waitForServer();
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert(health.ok && health.projects===17,'health/project count mismatch');

  const projects = await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json();
  assert(projects.length===17,'expected 17 projects');
  assert(projects.every(p=>p.github.startsWith('https://github.com/jnibarger01/')),'all destinations must be Jace GitHub portals');

  const route = await (await fetch(`http://127.0.0.1:${port}/project/agent-control-stack`)).text();
  assert(route.includes('<title>Agent Control Stack · Jace Drive Portfolio</title>'),'project title not injected');
  assert(route.includes('rel="canonical" href="http://127.0.0.1:4191/project/agent-control-stack"'),'canonical not injected');

  const sitemap = await (await fetch(`http://127.0.0.1:${port}/sitemap.xml`)).text();
  assert((sitemap.match(/<url>/g)||[]).length===18,'sitemap should contain home + 17 projects');

  const home = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert(home.includes('2024 Toyota 4Runner TRD Pro'),'4Runner vehicle identity missing');
  assert(home.includes('type="module" src="/js/main.js"'),'3D runtime entrypoint missing');
  assert(!home.includes('{{'),'unrendered HTML template placeholder remains');
  const model = await fetch(`http://127.0.0.1:${port}/assets/models/modsnation_7416_assets_assembled.glb`);
  assert(model.ok && (await model.arrayBuffer()).byteLength===1266480,'self-hosted exact 4Runner model unavailable');
  const wheel = await fetch(`http://127.0.0.1:${port}/assets/models/wheel_trd_pro.glb`);
  assert(wheel.ok && (await wheel.arrayBuffer()).byteLength===329700,'self-hosted TRD Pro wheel asset unavailable');
  const tire = await fetch(`http://127.0.0.1:${port}/assets/models/ModsNation_7416_tire.glb`);
  assert(tire.ok && (await tire.arrayBuffer()).byteLength===171124,'self-hosted KO3 tire asset unavailable');
  const three = await fetch(`http://127.0.0.1:${port}/vendor/three/three.module.min.js`);
  assert(three.ok,'self-hosted Three.js module unavailable');
  const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
  const csp = homeResponse.headers.get('content-security-policy') || '';
  assert(csp.includes("connect-src 'self'") && !csp.includes('raw.githubusercontent.com'),'integration should be same-origin');

  const bad = await fetch(`http://127.0.0.1:${port}/api/whispers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:''})});
  assert(bad.status===400,'empty whisper should fail');

  const noPosition = await fetch(`http://127.0.0.1:${port}/api/whispers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Missing position'})});
  assert(noPosition.status===400,'whisper without a world position should fail');

  await sleep(2100);
  const good = await fetch(`http://127.0.0.1:${port}/api/whispers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test','message':'Portal smoke test',x:12.3,z:-45.6})});
  assert(good.status===201,'valid whisper should be created');
  const saved = await good.json(); assert(saved.message==='Portal smoke test' && saved.x===12.3 && saved.z===-45.6,'created whisper position mismatch');
  const postedWhispers=await (await fetch(`http://127.0.0.1:${port}/api/whispers`)).json();
  assert(postedWhispers.some(w=>w.id===saved.id && w.x===12.3 && w.z===-45.6),'whisper position was not persisted');

  const badLap=await fetch(`http://127.0.0.1:${port}/api/circuit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test',ms:0})});
  assert(badLap.status===400,'invalid lap time should fail');
  const lap=await fetch(`http://127.0.0.1:${port}/api/circuit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test',ms:61234})});
  assert(lap.status===201,'valid circuit lap should be created');
  const createdLap=await lap.json();
  const leaderboard=await (await fetch(`http://127.0.0.1:${port}/api/circuit`)).json();
  assert(leaderboard.some(row=>row.id===createdLap.id && row.ms===61234),'circuit leaderboard did not persist lap');

  console.log('PASS · 17-project API, SEO routes, sitemap, same-origin Three.js/4Runner assets, GitHub destinations, positional whispers, and circuit leaderboard validated');
} finally {
  child.kill('SIGTERM');
  await writeFile(whisperPath, originalWhispers, 'utf8');
  await writeFile(lapPath, originalLaps, 'utf8');
}
