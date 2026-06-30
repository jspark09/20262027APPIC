import { LEVEL_ORDER, esc } from './utils.js';

// ── Constants ────────────────────────────────────────────────
const LEVEL_OPTIONS = [
  { value: 'exposure',   label: 'Exposure or higher' },
  { value: 'experience', label: 'Experience or higher' },
  { value: 'emphasis',   label: 'Emphasis or higher' },
  { value: 'major_area', label: 'Major Area only' },
];

const LEVEL_SHORT = {
  exposure: 'Exp.', experience: 'Exp+', emphasis: 'Emph+', major_area: 'Major'
};


// ── State ────────────────────────────────────────────────────
let state = makeDefault();
let onChange = null;

function makeDefault() {
  return {
    keyword:              '',
    counseling:           false,
    clinical:             false,
    school:               false,
    international:        false,
    accreditation:        new Set(),   // empty = all
    includeAgencies:      new Set(),   // empty = all; non-empty = only these types
    stipendMin:           0,
    stipendMax:           Infinity,
    includeUnlisted:      true,
    researchLevel:        '',
    assessmentLevel:      '',
    states:               new Set(),   // empty = all
    myInterventionHours:  null,
    myAssessmentHours:    null,
    populations:          [],          // string[]
    modalities:           [],          // {name, minLevel}[]
    experienceAreas:      [],          // {name, minLevel}[]
  };
}

// ── Public ───────────────────────────────────────────────────
export function initFilters(options, onChangeFn) {
  onChange = onChangeFn;
  const container = document.getElementById('filtersContainer');
  container.innerHTML = buildHTML(options);
  attachListeners(options);
  emit();
}

export function clearAllFilters() {
  state = makeDefault();
  resetUI();
  emit();
}

export function getFilterPredicate(s) {
  return function(site) {
    // Keyword
    if (s.keyword) {
      const q = s.keyword.toLowerCase();
      const hay = `${site.site} ${site.department || ''} ${site.city} ${site.state}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    // Program type (null = "not specified" → don't exclude)
    if (s.counseling && site.accepts_counseling === false) return false;
    if (s.clinical   && site.accepts_clinical   === false) return false;
    if (s.school     && site.accepts_school     === false) return false;

    // International
    if (s.international && site.us_citizenship_required === true) return false;

    // Accreditation
    if (s.accreditation.size > 0 && !s.accreditation.has(site.apa_accreditation)) return false;

    // Include agencies (empty = all; non-empty = show only checked types)
    if (s.includeAgencies.size > 0 && !s.includeAgencies.has(site.primary_agency_type)) return false;

    // Stipend
    const stip = site.ft_stipend;
    if (stip === null || stip === undefined) {
      if (!s.includeUnlisted) return false;
    } else {
      if (stip < s.stipendMin) return false;
      if (s.stipendMax !== Infinity && stip > s.stipendMax) return false;
    }

    // Research level
    if (s.researchLevel) {
      const got = LEVEL_ORDER[site.research_level] || 0;
      const req = LEVEL_ORDER[s.researchLevel]    || 0;
      if (got < req) return false;
    }

    // Assessment modality level
    if (s.assessmentLevel) {
      const got = LEVEL_ORDER[site.assessment_modality_level] || 0;
      const req = LEVEL_ORDER[s.assessmentLevel]              || 0;
      if (got < req) return false;
    }

    // States
    if (s.states.size > 0 && !s.states.has(site.state)) return false;

    // Hours (eligibility filter — hides ineligible sites)
    if (s.myInterventionHours !== null) {
      const min = site.min_intervention_hours;
      if (min !== null && min > s.myInterventionHours) return false;
    }
    if (s.myAssessmentHours !== null) {
      const min = site.min_assessment_hours;
      if (min !== null && min > s.myAssessmentHours) return false;
    }

    // Populations (binary presence check — populations[] is yes/no)
    for (const pop of s.populations) {
      if (!(site.populations || []).includes(pop)) return false;
    }

    // Modalities (with minimum level)
    for (const { name, minLevel } of s.modalities) {
      const got = LEVEL_ORDER[(site.treatment_modalities || {})[name]] || 0;
      const req = LEVEL_ORDER[minLevel] || 1;
      if (got < req) return false;
    }

    // Experience areas (with minimum level)
    for (const { name, minLevel } of s.experienceAreas) {
      const got = LEVEL_ORDER[(site.experience_areas || {})[name]] || 0;
      const req = LEVEL_ORDER[minLevel] || 1;
      if (got < req) return false;
    }

    return true;
  };
}

// ── HTML builders ────────────────────────────────────────────
function buildHTML(opts) {
  return [
    section('search',  'Search',                  searchHTML(),                  true),
    section('prog',    'Program Type',             progTypeHTML()),
    section('intl',    'International Eligibility',intlHTML()),
    section('accred',  'APA Accreditation',        accredHTML(opts.accreditations)),
    section('agency',  'Agency Type',              agencyHTML(opts.agencyTypes)),
    section('loc',     'Location / State',         locationHTML(opts.states)),
    section('stip',    'Stipend Range',            stipendHTML()),
    section('level',   'Training Levels',          levelHTML()),
    section('hours',   'My Hours (Eligibility)',   hoursHTML()),
    section('pop',     'Populations Served',       tagFilterHTML('pop', opts.populations, false)),
    section('mod',     'Treatment Modalities',     tagFilterHTML('mod', opts.modalities, true)),
    section('exp',     'Specialty / Exp. Areas',   tagFilterHTML('exp', opts.experienceAreas, true)),
  ].join('');
}

function section(id, title, body, open = false) {
  return `<div class="filter-section${open ? ' is-open' : ''}" id="fs-${id}">
    <button class="fs-header" type="button"
            aria-expanded="${open}"
            aria-controls="fsb-${id}">
      <span>${title}</span>
      <span class="fs-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="fs-body" id="fsb-${id}"${open ? '' : ' hidden'}>
      ${body}
    </div>
  </div>`;
}

function searchHTML() {
  return `<input type="search" id="f-kw" class="f-input"
    placeholder="Site name, city, department…"
    aria-label="Search sites">`;
}

function progTypeHTML() {
  return `
    <label class="f-check"><input type="checkbox" id="f-counseling"> Accepts Counseling students</label>
    <label class="f-check"><input type="checkbox" id="f-clinical">   Accepts Clinical students</label>
    <label class="f-check"><input type="checkbox" id="f-school">     Accepts School Psychology students</label>
  `;
}

function intlHTML() {
  return `<label class="f-check">
    <input type="checkbox" id="f-intl"> Open to international applicants
    <span style="font-size:0.68rem;color:var(--on-muted);">(excludes citizenship-required sites)</span>
  </label>`;
}

function accredHTML(vals) {
  return vals.map(v => `
    <label class="f-check">
      <input type="checkbox" class="f-accred" value="${esc(v)}">
      ${esc(v)}
    </label>
  `).join('');
}

function agencyHTML(types) {
  const boxes = types.map(t => `
    <label class="f-check">
      <input type="checkbox" class="f-incl-agency" value="${esc(t)}">
      <span>${esc(t)}</span>
    </label>
  `).join('');

  return `
    <p class="f-hint">Check types to include. Empty = all types shown.</p>
    <div class="f-quick-row" style="margin-bottom:6px">
      <button type="button" class="f-quick-excl" id="agencySelectAll">Select all</button>
      <button type="button" class="f-quick-excl" id="agencyClearAll">Clear</button>
    </div>
    <div class="f-scroll-list">${boxes}</div>
  `;
}

function locationHTML(states) {
  return `<div class="f-scroll-list">
    ${states.map(s => `
      <label class="f-check">
        <input type="checkbox" class="f-state" value="${esc(s)}"> ${esc(s)}
      </label>
    `).join('')}
  </div>`;
}

function stipendHTML() {
  return `
    <div class="f-stip-display">Min: <strong id="stipMinVal">$0</strong></div>
    <div class="f-range-wrap">
      <input type="range" id="f-stip-min" class="f-slider"
             min="0" max="130000" step="1000" value="0"
             aria-label="Minimum stipend">
    </div>
    <div class="f-stip-display" style="margin-top:6px">Max: <strong id="stipMaxVal">No max</strong></div>
    <div class="f-range-wrap">
      <input type="range" id="f-stip-max" class="f-slider"
             min="0" max="130000" step="1000" value="130000"
             aria-label="Maximum stipend">
    </div>
    <label class="f-check" style="margin-top:8px">
      <input type="checkbox" id="f-unlisted" checked> Include "Not listed" stipend
    </label>
  `;
}

function levelHTML() {
  const opts = `<option value="">Any level</option>` +
    LEVEL_OPTIONS.map(l => `<option value="${l.value}">${l.label}</option>`).join('');
  return `
    <div class="f-level-row">
      <label class="f-small-label" for="f-research-lv">Research level ≥</label>
      <select id="f-research-lv" class="f-input f-select">${opts}</select>
    </div>
    <div class="f-level-row">
      <label class="f-small-label" for="f-assess-lv">Assessment modality level ≥</label>
      <select id="f-assess-lv" class="f-input f-select">${opts}</select>
    </div>
  `;
}

function hoursHTML() {
  return `
    <p class="f-hint">Enter your hours to filter to eligible sites and show an Eligible? column.</p>
    <div class="f-hours-row">
      <div class="f-hours-field">
        <label class="f-small-label" for="f-int-hrs">Intervention hrs</label>
        <input type="number" id="f-int-hrs" class="f-input" min="0" step="10" placeholder="e.g. 400">
      </div>
      <div class="f-hours-field">
        <label class="f-small-label" for="f-ass-hrs">Assessment hrs</label>
        <input type="number" id="f-ass-hrs" class="f-input" min="0" step="10" placeholder="e.g. 100">
      </div>
    </div>
  `;
}

function tagFilterHTML(prefix, items, hasLevel) {
  const opts = items.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  const lvlSel = hasLevel ? `
    <select id="${prefix}-lvl" class="f-input f-select f-level-sel" aria-label="Minimum level">
      ${LEVEL_OPTIONS.map(l => `<option value="${l.value}">${l.label}</option>`).join('')}
    </select>
  ` : '';
  const placeholder = hasLevel ? 'Select…' : 'Select…';
  return `
    <div class="f-tags" id="${prefix}-tags"></div>
    <div class="f-add-row">
      <select id="${prefix}-sel" class="f-input f-select" aria-label="Select option">
        <option value="">${placeholder}</option>
        ${opts}
      </select>
      ${lvlSel}
      <button type="button" class="f-add-btn" id="${prefix}-add">Add</button>
    </div>
  `;
}

// ── Event listeners ──────────────────────────────────────────
function attachListeners() {
  // Accordion
  document.querySelectorAll('.fs-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec  = btn.closest('.filter-section');
      const body = sec.querySelector('.fs-body');
      const open = sec.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open);
      body.hidden = !open;
    });
  });

  // Keyword (debounced)
  let kwTimer;
  document.getElementById('f-kw').addEventListener('input', e => {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(() => { state.keyword = e.target.value.trim(); emit(); }, 250);
  });

  // Program type
  document.getElementById('f-counseling').addEventListener('change', e => { state.counseling = e.target.checked; emit(); });
  document.getElementById('f-clinical').addEventListener('change',   e => { state.clinical   = e.target.checked; emit(); });
  document.getElementById('f-school').addEventListener('change',     e => { state.school     = e.target.checked; emit(); });

  // International
  document.getElementById('f-intl').addEventListener('change', e => { state.international = e.target.checked; emit(); });

  // Accreditation
  document.querySelectorAll('.f-accred').forEach(cb => {
    cb.addEventListener('change', () => {
      state.accreditation = new Set(
        [...document.querySelectorAll('.f-accred:checked')].map(c => c.value)
      );
      emit();
    });
  });

  // Agency include checkboxes
  document.querySelectorAll('.f-incl-agency').forEach(cb => {
    cb.addEventListener('change', () => {
      state.includeAgencies = new Set(
        [...document.querySelectorAll('.f-incl-agency:checked')].map(c => c.value)
      );
      emit();
    });
  });

  document.getElementById('agencySelectAll')?.addEventListener('click', () => {
    document.querySelectorAll('.f-incl-agency').forEach(cb => { cb.checked = true; });
    state.includeAgencies = new Set(
      [...document.querySelectorAll('.f-incl-agency')].map(c => c.value)
    );
    emit();
  });

  document.getElementById('agencyClearAll')?.addEventListener('click', () => {
    document.querySelectorAll('.f-incl-agency').forEach(cb => { cb.checked = false; });
    state.includeAgencies = new Set();
    emit();
  });

  // State checkboxes
  document.querySelectorAll('.f-state').forEach(cb => {
    cb.addEventListener('change', () => {
      state.states = new Set(
        [...document.querySelectorAll('.f-state:checked')].map(c => c.value)
      );
      emit();
    });
  });

  // Stipend sliders
  const stipMin = document.getElementById('f-stip-min');
  const stipMax = document.getElementById('f-stip-max');
  const minVal  = document.getElementById('stipMinVal');
  const maxVal  = document.getElementById('stipMaxVal');

  stipMin.addEventListener('input', () => {
    const v = +stipMin.value;
    if (v >= +stipMax.value) stipMin.value = +stipMax.value - 1000;
    state.stipendMin = +stipMin.value;
    minVal.textContent = '$' + Number(stipMin.value).toLocaleString();
    emit();
  });

  stipMax.addEventListener('input', () => {
    const v = +stipMax.value;
    if (v <= +stipMin.value) stipMax.value = +stipMin.value + 1000;
    state.stipendMax = +stipMax.value >= 130000 ? Infinity : +stipMax.value;
    maxVal.textContent = +stipMax.value >= 130000 ? 'No max' : '$' + Number(stipMax.value).toLocaleString();
    emit();
  });

  document.getElementById('f-unlisted').addEventListener('change', e => {
    state.includeUnlisted = e.target.checked; emit();
  });

  // Training levels
  document.getElementById('f-research-lv').addEventListener('change', e => { state.researchLevel  = e.target.value; emit(); });
  document.getElementById('f-assess-lv').addEventListener('change',   e => { state.assessmentLevel = e.target.value; emit(); });

  // Hours
  let hoursTimer;
  ['f-int-hrs', 'f-ass-hrs'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(hoursTimer);
      hoursTimer = setTimeout(() => {
        const iv = document.getElementById('f-int-hrs').value;
        const av = document.getElementById('f-ass-hrs').value;
        state.myInterventionHours = iv ? +iv : null;
        state.myAssessmentHours   = av ? +av : null;
        emit();
      }, 300);
    });
  });

  // Training tag filters
  wireTagFilter('pop', false);
  wireTagFilter('mod', true);
  wireTagFilter('exp', true);
}

function wireTagFilter(prefix, hasLevel) {
  document.getElementById(`${prefix}-add`).addEventListener('click', () => {
    const sel = document.getElementById(`${prefix}-sel`);
    const val = sel.value;
    if (!val) return;

    if (prefix === 'pop') {
      if (!state.populations.includes(val)) {
        state.populations.push(val);
        renderPopTags();
        emit();
      }
    } else {
      const lvlSel = document.getElementById(`${prefix}-lvl`);
      const lv = lvlSel.value;
      const arr = prefix === 'mod' ? state.modalities : state.experienceAreas;
      const existing = arr.findIndex(x => x.name === val);
      if (existing >= 0) arr.splice(existing, 1);
      arr.push({ name: val, minLevel: lv });
      prefix === 'mod' ? renderModTags() : renderExpTags();
      emit();
    }
    sel.value = '';
  });
}

// ── Tag rendering ────────────────────────────────────────────
function renderPopTags() {
  const el = document.getElementById('pop-tags');
  el.innerHTML = state.populations.map((p, i) => `
    <span class="f-tag">
      <span>${esc(p)}</span>
      <button type="button" class="f-tag-x" data-i="${i}" aria-label="Remove ${esc(p)}">×</button>
    </span>
  `).join('');
  el.querySelectorAll('.f-tag-x').forEach(btn => {
    btn.addEventListener('click', () => {
      state.populations.splice(+btn.dataset.i, 1);
      renderPopTags(); emit();
    });
  });
}

function renderModTags() {
  renderLevelTags('mod-tags', state.modalities, () => renderModTags());
}

function renderExpTags() {
  renderLevelTags('exp-tags', state.experienceAreas, () => renderExpTags());
}

function renderLevelTags(containerId, arr, rerender) {
  const el = document.getElementById(containerId);
  el.innerHTML = arr.map((item, i) => `
    <span class="f-tag">
      <span>${esc(item.name)} ≥ ${LEVEL_SHORT[item.minLevel] || item.minLevel}</span>
      <button type="button" class="f-tag-x" data-i="${i}" aria-label="Remove ${esc(item.name)}">×</button>
    </span>
  `).join('');
  el.querySelectorAll('.f-tag-x').forEach(btn => {
    btn.addEventListener('click', () => {
      arr.splice(+btn.dataset.i, 1);
      rerender(); emit();
    });
  });
}

// ── Reset UI to match default state ─────────────────────────
function resetUI() {
  document.getElementById('f-kw').value = '';
  document.querySelectorAll('#filtersContainer input[type="checkbox"]').forEach(cb => {
    cb.checked = cb.id === 'f-unlisted';
  });
  document.querySelectorAll('.f-incl-agency').forEach(cb => { cb.checked = false; });
  document.getElementById('f-stip-min').value = 0;
  document.getElementById('f-stip-max').value = 130000;
  document.getElementById('stipMinVal').textContent = '$0';
  document.getElementById('stipMaxVal').textContent = 'No max';
  document.getElementById('f-research-lv').value = '';
  document.getElementById('f-assess-lv').value   = '';
  document.getElementById('f-int-hrs').value = '';
  document.getElementById('f-ass-hrs').value = '';
  ['pop','mod','exp'].forEach(p => {
    const el = document.getElementById(`${p}-tags`);
    if (el) el.innerHTML = '';
    const sel = document.getElementById(`${p}-sel`);
    if (sel) sel.value = '';
  });
}

function emit() {
  // Update match-count display inside each accordion (handled in app.js)
  onChange(state);
}
