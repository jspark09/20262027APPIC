import { esc } from './utils.js';

const MAX_RESULTS = 8;

let data      = [];
let onSelect  = null;
let inputEl, clearBtn, resultsEl, wrapEl;
let currentMatches = [];
let activeIndex    = -1;

// ── Public ───────────────────────────────────────────────────
export function initSearch(siteData, onSelectFn) {
  data     = siteData;
  onSelect = onSelectFn;

  wrapEl    = document.querySelector('.map-search');
  inputEl   = document.getElementById('siteSearchInput');
  clearBtn  = document.getElementById('siteSearchClear');
  resultsEl = document.getElementById('siteSearchResults');

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('keydown', onKeydown);
  clearBtn.addEventListener('click', clearSearch);

  document.addEventListener('click', e => {
    if (!wrapEl.contains(e.target)) closeResults();
  });
}

// ── Input handling ───────────────────────────────────────────
function onInput() {
  const q = inputEl.value.trim();
  clearBtn.hidden = !q;

  if (!q) { closeResults(); return; }

  currentMatches = findMatches(q);
  renderResults(currentMatches, q);
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = inputEl.value.trim();
    if (!q) return;
    const matches = currentMatches.length ? currentMatches : findMatches(q);
    const pick = activeIndex >= 0 ? matches[activeIndex] : matches[0];
    if (pick) selectSite(pick);
    return;
  }

  if (resultsEl.hidden) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive(Math.min(activeIndex + 1, currentMatches.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive(Math.max(activeIndex - 1, 0));
  } else if (e.key === 'Escape') {
    closeResults();
  }
}

function setActive(idx) {
  activeIndex = idx;
  [...resultsEl.children].forEach((li, i) => li.classList.toggle('is-active', i === idx));
  resultsEl.children[idx]?.scrollIntoView({ block: 'nearest' });
}

function selectSite(site) {
  inputEl.value = site.site || '';
  closeResults();
  onSelect(site);
}

function closeResults() {
  resultsEl.hidden = true;
  resultsEl.innerHTML = '';
  activeIndex = -1;
  inputEl.setAttribute('aria-expanded', 'false');
}

function clearSearch() {
  inputEl.value = '';
  clearBtn.hidden = true;
  closeResults();
  inputEl.focus();
}

// ── Rendering ────────────────────────────────────────────────
function renderResults(matches, query) {
  activeIndex = -1;

  if (!matches.length) {
    resultsEl.innerHTML = `<li class="sr-empty">No matching sites</li>`;
    resultsEl.hidden = false;
    inputEl.setAttribute('aria-expanded', 'true');
    return;
  }

  resultsEl.innerHTML = matches.map((s, i) => `
    <li class="sr-item" role="option" data-idx="${i}">
      <span class="sr-name">${highlight(s.site, query)}</span>
      <span class="sr-loc">${esc(s.city)}, ${esc(s.state)}${s.department ? ' · ' + esc(s.department) : ''}</span>
    </li>
  `).join('');
  resultsEl.hidden = false;
  inputEl.setAttribute('aria-expanded', 'true');

  resultsEl.querySelectorAll('.sr-item').forEach(li => {
    const idx = Number(li.dataset.idx);
    // mousedown (not click) fires before the input blurs, so the
    // document-level click-outside listener doesn't close us first
    li.addEventListener('mousedown', e => {
      e.preventDefault();
      selectSite(matches[idx]);
    });
    li.addEventListener('mouseenter', () => setActive(idx));
  });
}

function highlight(text, query) {
  const safe = esc(text || '');
  const q = esc(query.trim());
  if (!q) return safe;
  const idx = safe.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return safe;
  return safe.slice(0, idx) + '<mark>' + safe.slice(idx, idx + q.length) + '</mark>' + safe.slice(idx + q.length);
}

// ── Relevance scoring ────────────────────────────────────────
function findMatches(query) {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = [];
  for (const site of data) {
    const score = scoreSite(site, q, tokens);
    if (score > 0) scored.push({ site, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map(m => m.site);
}

function scoreSite(site, q, tokens) {
  const name  = (site.site       || '').toLowerCase();
  const dept  = (site.department || '').toLowerCase();
  const city  = (site.city       || '').toLowerCase();
  const state = (site.state      || '').toLowerCase();

  let score = 0;

  if (name === q)            score += 100;
  else if (name.startsWith(q)) score += 60;
  else if (name.includes(q))   score += 40;

  for (const t of tokens) {
    if (name.includes(t))  score += name.startsWith(t) ? 12 : 8;
    if (dept.includes(t))  score += 4;
    if (city.includes(t))  score += 3;
    if (state === t)       score += 3;
  }

  return score;
}
