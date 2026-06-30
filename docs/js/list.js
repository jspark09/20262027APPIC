import { formatStipend, siteId, esc } from './utils.js';
import { isStarred, toggleStar } from './shortlist.js';
import { openDetail } from './detail.js';

// Module state — updated on each renderList call
let currentData = [];
let currentMyHours = { intervention: null, assessment: null };

// ── Public ───────────────────────────────────────────────────
export function renderList(data, sortKey, myHours) {
  currentData  = sortData([...data], sortKey || 'stipend_desc');
  currentMyHours = myHours || { intervention: null, assessment: null };

  const hasHours = currentMyHours.intervention !== null || currentMyHours.assessment !== null;
  document.getElementById('colElig').hidden = !hasHours;

  const tbody = document.getElementById('resultsBody');
  if (!currentData.length) {
    const cols = hasHours ? 8 : 7; // star + name + loc + agency + stip + slots + acc [+ elig]
    tbody.innerHTML = `<tr><td colspan="${cols}" class="td-msg">No sites match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentData.map((site, idx) => buildRow(site, idx, hasHours)).join('');
}

// Single delegated listener — handles all rows regardless of re-renders
document.getElementById('resultsBody')
  .addEventListener('click', handleBodyClick);

window.addEventListener('appic:shortlist-change', refreshStars);

// ── Event handlers ───────────────────────────────────────────
function handleBodyClick(e) {
  // Let external links navigate without also opening the detail panel
  if (e.target.closest('a.row-extlink')) return;

  const starBtn = e.target.closest('.row-star');
  if (starBtn) {
    e.stopPropagation();
    const idx = +starBtn.closest('tr').dataset.idx;
    if (!isNaN(idx) && currentData[idx]) toggleStar(currentData[idx]);
    return;
  }

  const tr = e.target.closest('tr[data-idx]');
  if (tr) {
    const idx = +tr.dataset.idx;
    if (!isNaN(idx) && currentData[idx]) openDetail(currentData[idx]);
  }
}

function refreshStars() {
  document.querySelectorAll('[data-star-id]').forEach(btn => {
    const id = btn.getAttribute('data-star-id');
    const starred = isStarred(id);
    btn.classList.toggle('starred', starred);
    btn.textContent = starred ? '★' : '☆';
    btn.setAttribute('aria-label', starred ? 'Remove from shortlist' : 'Add to shortlist');
  });
}

// ── Row builder ──────────────────────────────────────────────
function buildRow(site, idx, hasHours) {
  const id       = siteId(site);
  const starred  = isStarred(id);
  const isApprox = !site.geocode_exact;

  const approxBadge = isApprox
    ? `<span class="approx-badge" title="Location is approximate (state centroid)">~approx</span>`
    : '';

  const accredClass = accredCssClass(site.apa_accreditation);
  const accredText  = esc(site.apa_accreditation || '-');

  let eligCell = '';
  if (hasHours) {
    const eligible = checkEligibility(site, currentMyHours);
    eligCell = `<td class="${eligible ? 'elig-yes' : 'elig-no'}">${eligible ? '✓ Yes' : '✗ No'}</td>`;
  }

  const extLink = site.url
    ? `<a href="${esc(site.url)}" target="_blank" rel="noopener"
          class="row-extlink" title="Open APPIC directory page" aria-label="APPIC directory page">APPIC ↗</a>`
    : '';

  return `<tr data-idx="${idx}" data-sid="${esc(id)}" tabindex="0" role="row" class="result-row">
    <td class="td-star" role="gridcell">
      <button class="row-star ${starred ? 'starred' : ''}"
              data-star-id="${esc(id)}"
              aria-label="${starred ? 'Remove from shortlist' : 'Add to shortlist'}">
        ${starred ? '★' : '☆'}
      </button>
    </td>
    <td role="gridcell">
      <div class="site-name">${esc(site.site)}${approxBadge} ${extLink}</div>
      ${site.department ? `<div class="dept-name">${esc(site.department)}</div>` : ''}
    </td>
    <td class="col-loc" role="gridcell">${esc(site.city)}, ${esc(site.state)}</td>
    <td class="col-agency" role="gridcell">${esc(site.primary_agency_type || '-')}</td>
    <td class="col-stip" role="gridcell">${formatStipend(site.ft_stipend)}</td>
    <td class="col-slots" role="gridcell">${site.ft_slots ?? '-'}</td>
    <td class="col-acc" role="gridcell">
      <span class="acc-badge ${accredClass}">${accredText}</span>
    </td>
    ${eligCell}
  </tr>`;
}

// ── Eligibility check ────────────────────────────────────────
function checkEligibility(site, hours) {
  if (hours.intervention !== null) {
    const min = site.min_intervention_hours;
    if (min !== null && min > hours.intervention) return false;
  }
  if (hours.assessment !== null) {
    const min = site.min_assessment_hours;
    if (min !== null && min > hours.assessment) return false;
  }
  return true;
}

// ── Sort ─────────────────────────────────────────────────────
function sortData(data, key) {
  return data.sort((a, b) => {
    switch (key) {
      case 'stipend_desc': {
        const na = a.ft_stipend === null, nb = b.ft_stipend === null;
        if (na && nb) return 0; if (na) return 1; if (nb) return -1;
        return b.ft_stipend - a.ft_stipend;
      }
      case 'stipend_asc': {
        const na = a.ft_stipend === null, nb = b.ft_stipend === null;
        if (na && nb) return 0; if (na) return 1; if (nb) return -1;
        return a.ft_stipend - b.ft_stipend;
      }
      case 'min_intervention': {
        const ia = a.min_intervention_hours ?? Infinity;
        const ib = b.min_intervention_hours ?? Infinity;
        return ia - ib;
      }
      case 'min_assessment': {
        const ia = a.min_assessment_hours ?? Infinity;
        const ib = b.min_assessment_hours ?? Infinity;
        return ia - ib;
      }
      case 'slots_desc': {
        const sa = a.ft_slots ?? -Infinity, sb = b.ft_slots ?? -Infinity;
        return sb - sa;
      }
      case 'name':
        return a.site.localeCompare(b.site);
      default:
        return 0;
    }
  });
}

// ── Accreditation CSS ────────────────────────────────────────
function accredCssClass(val) {
  if (!val) return '';
  if (val === 'Accredited') return 'acc-Accredited';
  if (val.includes('Contingency')) return 'acc-Contingency';
  if (val.includes('Inactive')) return 'acc-Inactive';
  if (val.includes('Not')) return 'acc-Not';
  return '';
}
