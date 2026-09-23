import { projectArticle, projectListHtml, careerArticle, contactArticle, esc } from './templates.js';
import { ACHIEVEMENTS } from './achievements.js';
import { WORLD, LAKE, SPOKES, PORTALS, CAREER, CHECKPOINTS, DOCK, lakeRadiusAt } from './layout.js';

const $ = (id) => document.getElementById(id);

export function createUI(app) {
  const menu = $('menu'), detail = $('detail'), map = $('map');
  let activeTab = 'home';
  let detailIndex = 0;
  let lastFocus = null;

  // ---------- modal plumbing ----------
  function open(modal) {
    lastFocus = document.activeElement;
    for (const m of [menu, detail, map]) if (m !== modal) close(m, false);
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
    $('menuTrigger').setAttribute('aria-expanded', String(modal === menu));
    setTimeout(() => modal.querySelector('.modal-close')?.focus({ preventScroll: true }), 60);
    app.onModal?.(true);
  }
  function close(modal, restore = true) {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true');
    if (modal === menu) $('menuTrigger').setAttribute('aria-expanded', 'false');
    if (restore) {
      if (!isOpen()) { app.onModal?.(false); if (location.pathname !== '/') { history.pushState({}, '', '/'); app.onRoute?.(null); } }
      lastFocus?.focus?.({ preventScroll: true });
    }
  }
  const isOpen = () => [menu, detail, map].some((m) => m.classList.contains('is-open'));
  function closeAll() { for (const m of [menu, detail, map]) close(m); }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close]');
    if (t) { e.preventDefault(); close(t.closest('.modal')); return; }
    const tr = e.target.closest('[data-travel]');
    if (tr) { e.preventDefault(); const p = PORTALS.find((x) => x.slug === tr.dataset.travel); if (p) { closeAll(); app.travelTo(p); } return; }
    const gh = e.target.closest('[data-portal]');
    if (gh) app.onGithub?.(gh.dataset.portal);
    const ot = e.target.closest('[data-open-tab]');
    if (ot) { e.preventDefault(); openMenu(ot.dataset.openTab); }
  });
  for (const m of [menu, detail, map]) m.addEventListener('pointerdown', (e) => { if (e.target === m) close(m); });

  // ---------- menu + tabs ----------
  const tabs = [...menu.querySelectorAll('[role=tab]')];
  const previews = { home: '/social-preview.svg' };
  function selectTab(name) {
    activeTab = name;
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
    for (const p of menu.querySelectorAll('.tab-panel')) p.classList.toggle('is-active', p.dataset.panel === name);
    if (name === 'achievements') renderAchievements();
    if (name === 'circuit') loadLeaderboard();
    if (name === 'whispers') loadWhisperFeed();
    if (name === 'projects') renderProjects();
    menu.querySelector('.modal-content').scrollTop = 0;
  }
  tabs.forEach((t) => t.addEventListener('click', () => { selectTab(t.dataset.tab); app.audio.click(); if (t.dataset.tab === 'home') history.replaceState({}, '', '/about'); else if (t.dataset.tab === 'projects') history.replaceState({}, '', '/projects'); }));
  function openMenu(tab = activeTab) {
    const snap = app.snapshot(); if (snap) $('menuPreview').src = snap;
    selectTab(tab); open(menu);
  }
  $('menuTrigger').addEventListener('click', () => (menu.classList.contains('is-open') ? close(menu) : openMenu()));
  $('mapTrigger').addEventListener('click', () => openMap());

  // ---------- detail modal ----------
  function openProject(p, { push = true } = {}) {
    detailIndex = PORTALS.indexOf(p);
    $('detailContent').innerHTML = projectArticle(p, detailIndex, PORTALS.length);
    $('detailBadge').innerHTML = `<span style="border-color:${esc(p.accent)}">${esc(p.district)}</span>${app.discovered.has(p.slug) ? '<span>Visited</span>' : ''}`;
    $('detailPrev').hidden = $('detailNext').hidden = false;
    const snap = app.snapshot(); if (snap) $('detailPreview').src = snap;
    $('detailPreview').alt = `${p.name} in the Jace Drive world`;
    open(detail);
    if (push && location.pathname !== `/project/${p.slug}`) history.pushState({ slug: p.slug }, '', `/project/${p.slug}`);
    setMeta(`${p.name} · ${p.tagline} | Jace Nibarger`, p.description);
  }
  function openInfo(kind, data) {
    $('detailContent').innerHTML = kind === 'career' ? careerArticle(data) : contactArticle(data);
    $('detailBadge').innerHTML = `<span>${kind === 'career' ? 'Career road' : 'Contact'}</span>`;
    $('detailPrev').hidden = $('detailNext').hidden = true;
    const snap = app.snapshot(); if (snap) $('detailPreview').src = snap;
    open(detail);
  }
  const step = (d) => { const p = PORTALS[(detailIndex + d + PORTALS.length) % PORTALS.length]; app.travelTo(p, { silent: true }); openProject(p); };
  $('detailPrev').addEventListener('click', () => step(-1));
  $('detailNext').addEventListener('click', () => step(1));

  function setMeta(title, desc) {
    document.title = title;
    document.querySelector('meta[name=description]')?.setAttribute('content', desc);
  }

  // ---------- project list ----------
  function renderProjects() { $('projectList').innerHTML = projectListHtml(PORTALS, app.discovered); }
  function updateProgress() {
    const n = PORTALS.filter((p) => app.discovered.has(p.slug)).length;
    $('progressText').textContent = `${n} / ${PORTALS.length} portals`;
    $('progressBar').style.width = `${(n / Math.max(1, PORTALS.length)) * 100}%`;
  }

  // ---------- achievements ----------
  function renderAchievements() {
    const got = app.achievements;
    $('achievementSummary').textContent = `${ACHIEVEMENTS.filter((a) => got.has(a.id)).length} of ${ACHIEVEMENTS.length} unlocked`;
    $('achievementGrid').innerHTML = ACHIEVEMENTS.map((a) => `<li class="${got.has(a.id) ? 'is-unlocked' : ''}"><strong>${esc(a.title)}</strong><span>${esc(a.text)}</span></li>`).join('');
  }
  function toast(title, sub, glyph = '★') {
    const el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = `<span class="medal">${esc(glyph)}</span><div><strong>${esc(title)}</strong><small>${esc(sub)}</small></div>`;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 3900);
  }

  // ---------- whispers ----------
  async function loadWhisperFeed() {
    const feed = $('whisperFeed');
    const rows = await app.fetchWhispers();
    feed.innerHTML = rows.length ? rows.slice().reverse().map((w) => `<li><time datetime="${esc(w.createdAt)}">${esc(ago(w.createdAt))}</time><b>${esc(w.name)}</b>${esc(w.message)}</li>`).join('') : '<li>No transmissions yet. Be the first.</li>';
  }
  $('whisperName').value = localStorage.getItem('jace-drive-name') || '';
  $('whisperForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('whisperStatus'); status.textContent = 'Transmitting…';
    const name = $('whisperName').value.trim(); localStorage.setItem('jace-drive-name', name);
    try {
      await app.postWhisper(name, $('whisperMessage').value);
      $('whisperMessage').value = ''; status.textContent = 'Received. Your whisper is floating by your 4Runner.';
      loadWhisperFeed();
    } catch (err) { status.textContent = err.message; }
  });

  // ---------- circuit ----------
  async function loadLeaderboard() {
    $('bestLap').textContent = app.bestLap ? fmt(app.bestLap) : 'none yet';
    const list = $('leaderboard');
    try {
      const r = await fetch('/api/circuit'); const rows = await r.json();
      list.innerHTML = rows.length ? rows.map((x) => `<li>${esc(x.name)} <b>${fmt(x.ms)}</b></li>`).join('') : '<li class="muted">No laps yet. Set the first time.</li>';
    } catch { list.innerHTML = '<li class="muted">Leaderboard offline.</li>'; }
  }
  $('goToCircuit').addEventListener('click', () => { closeAll(); app.goToCircuit(); });

  // ---------- options ----------
  const seg = (id, value, onPick) => {
    const root = $(id);
    const set = (v) => root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    set(value);
    root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; set(b.dataset.v); onPick(b.dataset.v); });
  };
  seg('optQuality', app.settings.quality, (v) => app.setQuality(v));
  seg('optTime', app.settings.time, (v) => app.setTimeMode(v));
  const toggle = (id, get, set) => { const b = $(id); const paint = () => { b.setAttribute('aria-pressed', String(get())); b.textContent = get() ? 'On' : 'Off'; }; paint(); b.addEventListener('click', () => { set(!get()); paint(); }); return paint; };
  const paintAudio = toggle('optAudio', () => app.settings.audio, (v) => app.setAudio(v));
  toggle('optShake', () => app.settings.shake, (v) => { app.settings.shake = v; app.saveSettings(); });
  $('audioTrigger').addEventListener('click', () => { app.setAudio(!app.settings.audio); paintAudio(); });
  $('optRespawn').addEventListener('click', () => { closeAll(); app.respawn(); });
  $('optResetObjects').addEventListener('click', () => { app.resetObjects(); toast('Objects reset', 'Your name is standing again'); });
  $('optResetProgress').addEventListener('click', () => { if (confirm('Reset discovered portals, achievements and best lap?')) { app.resetProgress(); renderAchievements(); updateProgress(); } });

  // ---------- map ----------
  const mc = $('mapCanvas'), mctx = mc.getContext('2d');
  const MAP_R = WORLD.playRadius + 12;
  const toMap = (x, z) => ({ x: mc.width / 2 + (x / MAP_R) * mc.width * 0.47, y: mc.height / 2 + (z / MAP_R) * mc.height * 0.47 });
  function drawMap(t = 0) {
    const w = mc.width, h = mc.height, s = (w * 0.47) / MAP_R;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#1d1721'; mctx.fillRect(0, 0, w, h);
    const c = toMap(0, 0);
    mctx.fillStyle = '#3f6e2f'; mctx.beginPath(); mctx.arc(c.x, c.y, WORLD.playRadius * s, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#2c4f22'; mctx.lineWidth = 18 * s; mctx.stroke();
    // lake
    mctx.fillStyle = '#4fb3b0'; mctx.beginPath();
    for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2; const r = lakeRadiusAt(LAKE.x + Math.cos(a) * 20, LAKE.z + Math.sin(a) * 20); const p = toMap(LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r); k ? mctx.lineTo(p.x, p.y) : mctx.moveTo(p.x, p.y); }
    mctx.fill();
    // roads
    mctx.strokeStyle = '#e7dccb'; mctx.lineCap = 'round'; mctx.lineWidth = WORLD.roadHalf * 2 * s;
    mctx.beginPath(); mctx.arc(c.x, c.y, WORLD.ringRadius * s, 0, Math.PI * 2); mctx.stroke();
    for (const sp of SPOKES) { const a = toMap(sp.ax, sp.az), b = toMap(sp.bx, sp.bz); mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke(); }
    mctx.lineWidth = 3.5 * s; mctx.strokeStyle = '#c9a57a';
    for (const p of PORTALS) { const a = toMap(p.x, p.z), b = toMap(p.road.x, p.road.z); mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke(); }
    mctx.fillStyle = '#e9dfcd'; mctx.beginPath(); mctx.arc(c.x, c.y, WORLD.centerRadius * s, 0, Math.PI * 2); mctx.fill();
    // career + checkpoints + dock
    for (const cr of CAREER) { const p = toMap(cr.x, cr.z); mctx.fillStyle = '#ffceca'; mctx.fillRect(p.x - 5, p.y - 5, 10, 10); }
    CHECKPOINTS.forEach((cp, i) => { const p = toMap(cp.x, cp.z); mctx.fillStyle = i === 0 ? '#d5ff95' : '#1d1721'; mctx.beginPath(); mctx.arc(p.x, p.y, 5, 0, Math.PI * 2); mctx.fill(); });
    const d = toMap(DOCK.x, DOCK.z); mctx.fillStyle = '#ff6a7c'; mctx.beginPath(); mctx.arc(d.x, d.y, 7, 0, Math.PI * 2); mctx.fill();
    // portals
    mctx.textAlign = 'center'; mctx.textBaseline = 'bottom';
    for (const p of PORTALS) {
      const m = toMap(p.x, p.z), seen = app.discovered.has(p.slug);
      const r = 11 + (seen ? 0 : Math.sin(t * 4 + p.angle) * 2.5);
      mctx.fillStyle = p.accent; mctx.strokeStyle = '#1d1721'; mctx.lineWidth = 3;
      mctx.beginPath(); mctx.arc(m.x, m.y, r, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
      if (seen) { mctx.fillStyle = '#1d1721'; mctx.font = '900 12px Nunito, sans-serif'; mctx.textBaseline = 'middle'; mctx.fillText('✓', m.x, m.y + 1); mctx.textBaseline = 'bottom'; }
      mctx.font = "700 26px 'Amatic SC', sans-serif"; mctx.lineWidth = 5; mctx.strokeStyle = '#1d1721'; mctx.strokeText(p.short, m.x, m.y - 14); mctx.fillStyle = '#fff'; mctx.fillText(p.short, m.x, m.y - 14);
    }
    // car
    const car = app.car(); const cm = toMap(car.x, car.z);
    mctx.save(); mctx.translate(cm.x, cm.y); mctx.rotate(-car.yaw + Math.PI);
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#c21515'; mctx.lineWidth = 4;
    mctx.beginPath(); mctx.moveTo(0, -16); mctx.lineTo(11, 12); mctx.lineTo(0, 6); mctx.lineTo(-11, 12); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
  }
  let mapRaf = 0;
  function openMap() {
    open(map); app.unlock('map');
    const tick = (t) => { if (!map.classList.contains('is-open')) return; drawMap(t / 1000); mapRaf = requestAnimationFrame(tick); };
    cancelAnimationFrame(mapRaf); mapRaf = requestAnimationFrame(tick);
  }
  mc.addEventListener('click', (e) => {
    const r = mc.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * mc.width, my = ((e.clientY - r.top) / r.height) * mc.height;
    let best = null, bd = Infinity;
    for (const p of PORTALS) { const m = toMap(p.x, p.z); const d = Math.hypot(mx - m.x, my - m.y); if (d < bd) { bd = d; best = p; } }
    if (best && bd < 44) { close(map); app.travelTo(best); }
  });

  // ---------- prompt ----------
  const prompt = $('prompt');
  prompt.addEventListener('click', () => app.interact());
  function setPrompt(text) {
    if (!text) { prompt.classList.add('hidden'); $('touchInteract').disabled = true; return; }
    if (prompt.classList.contains('hidden') || $('promptText').textContent !== text) { $('promptText').textContent = text; prompt.classList.remove('hidden'); }
    $('touchInteract').disabled = false;
  }

  // ---------- intro ----------
  function setLoading(p, text) {
    $('introBar').style.strokeDashoffset = String(339.3 * (1 - Math.min(1, p)));
    if (text) $('introStatus').textContent = text;
  }
  function ready(onStart) {
    setLoading(1, 'Ready. Click to start. Sound on 🔊');
    const btn = $('introStart'); btn.disabled = false; $('introLabel').textContent = 'Start';
    btn.focus();
    btn.addEventListener('click', () => { $('intro').classList.add('is-done'); document.body.classList.add('is-started'); onStart(); }, { once: true });
  }

  function setCircuit(active, ms, next) {
    $('circuitHud').classList.toggle('hidden', !active);
    if (active) { $('circuitTime').textContent = fmt(ms); $('circuitNext').textContent = next; }
  }

  return { openMenu, openProject, openInfo, openMap, closeAll, isOpen, toast, setPrompt, setLoading, ready, updateProgress, renderAchievements, setCircuit, selectTab, setMeta, get detailOpen() { return detail.classList.contains('is-open'); } };
}

export function fmt(ms) { const s = ms / 1000; const m = Math.floor(s / 60); return m ? `${m}:${(s % 60).toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}s`; }
function ago(iso) { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; }
