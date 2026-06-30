import { initMap, renderMarkers, getMapBounds } from './map.js';
import { initFilters, clearAllFilters, getFilterPredicate } from './filters.js';
import { renderList } from './list.js';
import { initDetail, openDetail } from './detail.js';
import { initShortlist, renderShortlist } from './shortlist.js';

const DATA_URL = './data/internships_full.json';

let allData      = [];
let filteredData = [];   // passes sidebar filters
let currentSort  = 'stipend_desc';
let currentHours = { intervention: null, assessment: null };
let mapBounds    = null; // null until first moveend fires

// ── Boot ─────────────────────────────────────────────────────
async function boot() {
  setupSidebarToggle();
  setupShortlistToggle();
  setupSortListener();

  // Load data
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allData = await res.json();
  } catch (err) {
    showError(`Failed to load data: ${err.message}.<br>
      Make sure <code>internships_full.json</code> is in <code>docs/data/</code>
      and you are serving the site from a local server (not <code>file://</code>).`);
    return;
  }

  // Init modules
  initMap('map');
  initDetail();
  initShortlist();
  renderShortlist(); // populate the shortlist panel immediately, don't wait for a star click

  // Sync list to map viewport on every pan/zoom
  window.addEventListener('appic:bounds-change', e => {
    mapBounds = e.detail.bounds;
    renderListInView();
  });

  // Derive dynamic filter options from data
  const options = deriveOptions(allData);

  // Build filters UI; first call fires onFiltersChange immediately
  document.getElementById('clearFiltersBtn').addEventListener('click', clearAllFilters);
  initFilters(options, onFiltersChange);

  // Update shortlist count badge
  window.addEventListener('appic:shortlist-change', e => {
    document.getElementById('shortlistCount').textContent = e.detail.count;
  });
}

// ── Filter change handler ────────────────────────────────────
function onFiltersChange(filterState) {
  currentHours = {
    intervention: filterState.myInterventionHours,
    assessment:   filterState.myAssessmentHours,
  };

  filteredData = allData.filter(getFilterPredicate(filterState));

  // Map always shows everything that passes sidebar filters
  renderMarkers(filteredData, openDetail);

  // List is additionally constrained to current viewport
  renderListInView();

  const total = allData.length;
  const shown = filteredData.length;
  document.getElementById('matchCount').innerHTML =
    shown === total
      ? `All <strong>${total}</strong> sites`
      : `<strong>${shown}</strong> of ${total} sites`;
}

// ── Render list limited to current map viewport ───────────────
function renderListInView() {
  const bounds  = mapBounds ?? getMapBounds();
  const inView  = bounds
    ? filteredData.filter(s => bounds.contains([s.lat, s.lng]))
    : filteredData;

  renderList(inView, currentSort, currentHours);

  const viewTxt = bounds && inView.length < filteredData.length
    ? `${inView.length} in map view (${filteredData.length} match filters)`
    : `${inView.length} site${inView.length !== 1 ? 's' : ''}`;
  document.getElementById('resultsInfo').textContent = viewTxt;
}

// ── Sort ─────────────────────────────────────────────────────
function setupSortListener() {
  document.getElementById('sortSelect').addEventListener('change', e => {
    currentSort = e.target.value;
    renderListInView();
  });
}

// ── Sidebar toggle ───────────────────────────────────────────
function setupSidebarToggle() {
  const btn      = document.getElementById('sidebarToggle');
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  btn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      const open = sidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('active', open);
      btn.setAttribute('aria-expanded', open);
    } else {
      const collapsed = sidebar.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', !collapsed);
    }
  });

  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    btn.setAttribute('aria-expanded', false);
  });
}

// ── Shortlist view toggle ─────────────────────────────────────
function setupShortlistToggle() {
  const btn      = document.getElementById('shortlistBtn');
  const results  = document.getElementById('resultsPanel');
  const slPanel  = document.getElementById('shortlistPanel');

  function setResultsMode(count) {
    slPanel.hidden = true;
    results.hidden = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML  = `☆ Shortlist (<span id="shortlistCount">${count}</span>)`;
  }

  function setShortlistMode() {
    results.hidden = true;
    slPanel.hidden = false;
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '← Back to Results';
    renderShortlist();
  }

  btn.addEventListener('click', () => {
    if (slPanel.hidden) {
      setShortlistMode();
    } else {
      const count = document.getElementById('shortlistCount')?.textContent ?? '0';
      setResultsMode(count);
    }
  });

  window.addEventListener('appic:shortlist-change', e => {
    if (!slPanel.hidden) renderShortlist();
    const countEl = document.getElementById('shortlistCount');
    if (countEl) countEl.textContent = e.detail.count;
  });
}

// ── Options derivation ───────────────────────────────────────
function deriveOptions(data) {
  const states          = new Set();
  const agencyTypes     = new Set();
  const accreditations  = new Set();
  const populations     = new Set();
  const modalities      = new Set();
  const experienceAreas = new Set();

  for (const s of data) {
    if (s.state)                 states.add(s.state);
    if (s.primary_agency_type)   agencyTypes.add(s.primary_agency_type);
    if (s.apa_accreditation)     accreditations.add(s.apa_accreditation);
    for (const p of (s.populations        || []))    populations.add(p);
    for (const k of Object.keys(s.treatment_modalities || {})) modalities.add(k);
    for (const k of Object.keys(s.experience_areas    || {})) experienceAreas.add(k);
  }

  return {
    states:          [...states].sort(),
    agencyTypes:     [...agencyTypes].sort(),
    accreditations:  [...accreditations].sort(),
    populations:     [...populations].sort(),
    modalities:      [...modalities].sort(),
    experienceAreas: [...experienceAreas].sort(),
  };
}

// ── Error display ─────────────────────────────────────────────
function showError(html) {
  document.getElementById('resultsBody').innerHTML =
    `<tr><td colspan="8" class="td-msg" style="color:#dc2626">${html}</td></tr>`;
  document.getElementById('matchCount').textContent = 'Error loading data';
}

boot().catch(console.error);
