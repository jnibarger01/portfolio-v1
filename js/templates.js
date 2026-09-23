// Shared by the Node server (SEO pre-render) and the browser UI, so both emit identical markup.
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const DISTRICT_ORDER = ['Home', 'Agent Systems', 'Data & Markets', 'Automotive', 'Service Lane'];

export function projectArticle(p, index, total) {
  return `<p class="eyebrow">${esc(p.district)} · ${esc(p.kind)}</p>
<h2 class="title" id="detailTitle">${esc(p.name)}</h2>
<p class="tagline">${esc(p.tagline)}</p>
<p>${esc(p.description)}</p>
<ul class="chips" aria-label="Tech">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<div class="actions"><a class="btn is-primary" href="${esc(p.github)}" target="_blank" rel="noopener" data-portal="${esc(p.slug)}">Open GitHub portal ↗</a><button class="btn" type="button" data-close>Keep driving</button></div>
<p class="muted">Portal ${index + 1} of ${total} · <a href="/project/${esc(p.slug)}">/project/${esc(p.slug)}</a></p>`;
}

export function projectListHtml(projects, discovered = new Set()) {
  const groups = new Map();
  for (const p of projects) { if (!groups.has(p.district)) groups.set(p.district, []); groups.get(p.district).push(p); }
  const order = [...DISTRICT_ORDER, ...[...groups.keys()].filter((d) => !DISTRICT_ORDER.includes(d))];
  return order.filter((d) => groups.has(d)).map((d) => `<h3>${esc(d)}</h3><ul class="project-list">${groups.get(d).map((p) => `
<li class="project-row${discovered.has(p.slug) ? ' is-seen' : ''}"><span class="dot" style="color:${esc(p.accent)};background:${esc(p.accent)}"></span>
<div><h4><a href="/project/${esc(p.slug)}" data-travel="${esc(p.slug)}">${esc(p.name)}</a>${discovered.has(p.slug) ? '<span class="seen-tag">VISITED</span>' : ''}</h4><p>${esc(p.tagline)}</p></div>
<div class="row-actions"><button class="btn" type="button" data-travel="${esc(p.slug)}">Drive there</button><a class="btn" href="${esc(p.github)}" target="_blank" rel="noopener" aria-label="${esc(p.name)} on GitHub">Repo ↗</a></div></li>`).join('')}</ul>`).join('');
}

export function careerArticle(c) {
  return `<p class="eyebrow">Career road</p>
<h2 class="title" id="detailTitle">${esc(c.title)}</h2>
<p class="tagline">${esc(c.big)}: ${esc(c.line)}</p>
<p>${esc(c.role)}</p>
<p>${esc(c.story || '')}</p>
<div class="actions"><a class="btn is-primary" href="/about" data-open-tab="home">More about Jace</a><button class="btn" type="button" data-close>Keep driving</button></div>`;
}

export function contactArticle(c) {
  return `<p class="eyebrow">Say hello</p>
<h2 class="title" id="detailTitle">${esc(c.label)}</h2>
<p class="tagline">${esc(c.sub)}</p>
<p>Jace is open to service leadership, operations, customer experience, AI implementation, and technical product roles, in the Kansas City area or remote.</p>
<div class="actions"><a class="btn is-primary" href="${esc(c.href)}" ${c.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${c.href.startsWith('mailto') ? 'Write an email' : 'Open ↗'}</a><button class="btn" type="button" data-close>Keep driving</button></div>`;
}
