import {
  formatStipend, formatDate, formatBool, cleanFringe,
  LEVEL_ORDER, LEVEL_LABEL, siteId, esc
} from './utils.js';
import { isStarred, toggleStar } from './shortlist.js';
import { resizeMap } from './map.js';

let currentSite = null;

// ── Init ─────────────────────────────────────────────────────
export function initDetail() {
  document.getElementById('slideCloseBtn').addEventListener('click', closeDetail);
  document.getElementById('slideBackdrop').addEventListener('click', closeDetail);

  document.getElementById('slideStarBtn').addEventListener('click', () => {
    if (!currentSite) return;
    toggleStar(currentSite);
    updateStarBtn();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && currentSite) closeDetail();
  });

  window.addEventListener('appic:shortlist-change', () => {
    if (currentSite) updateStarBtn();
  });
}

// ── Open / close ─────────────────────────────────────────────
export function openDetail(site) {
  currentSite = site;

  window.gtag?.('event', 'site_detail_view', { site_name: site.site });

  document.getElementById('slideTitle').textContent = site.site;
  document.getElementById('slideSubtitle').textContent = [
    site.department,
    `${site.city}, ${site.state}`,
    site.primary_agency_type,
  ].filter(Boolean).join(' · ');

  document.getElementById('slideBody').innerHTML = buildBody(site);

  updateStarBtn();

  document.getElementById('mainPanel').classList.add('has-slide');
  const panel = document.getElementById('slideOver');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('slideBackdrop').classList.add('active');
  panel.focus();
  setTimeout(resizeMap, 260);

  // Highlight selected row
  document.querySelectorAll('.data-table tbody tr.is-selected')
    .forEach(r => r.classList.remove('is-selected'));
  const id = siteId(site);
  document.querySelector(`tr[data-sid="${CSS.escape(id)}"]`)
    ?.classList.add('is-selected');
}

export function closeDetail() {
  currentSite = null;
  const panel = document.getElementById('slideOver');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.getElementById('slideBackdrop').classList.remove('active');
  document.getElementById('mainPanel').classList.remove('has-slide');
  document.querySelectorAll('.data-table tbody tr.is-selected')
    .forEach(r => r.classList.remove('is-selected'));
  setTimeout(resizeMap, 260);
}

// ── Star button ──────────────────────────────────────────────
function updateStarBtn() {
  if (!currentSite) return;
  const btn = document.getElementById('slideStarBtn');
  const starred = isStarred(siteId(currentSite));
  btn.classList.toggle('starred', starred);
  btn.querySelector('.star-icon').textContent = starred ? '★' : '☆';
  btn.querySelector('.star-label').textContent = starred ? 'Shortlisted' : 'Shortlist';
  btn.setAttribute('aria-label', starred ? 'Remove from shortlist' : 'Add to shortlist');
}

// ── Detail body HTML ─────────────────────────────────────────
function buildBody(s) {
  const parts = [];

  // Links first (most commonly needed)
  const links = [];
  if (s.url)
    links.push(`<a href="${esc(s.url)}" target="_blank" rel="noopener" class="d-link d-link-primary">APPIC Directory ↗</a>`);
  if (s.web_address)
    links.push(`<a href="${esc(s.web_address)}" target="_blank" rel="noopener" class="d-link d-link-outline">Program Site ↗</a>`);
  if (s.brochure_url && s.brochure_url !== s.web_address)
    links.push(`<a href="${esc(s.brochure_url)}" target="_blank" rel="noopener" class="d-link d-link-outline">Brochure ↗</a>`);
  if (links.length) {
    parts.push(section('Links', `<div class="detail-links">${links.join('')}</div>`));
  }

  // Key information
  parts.push(section('Key Information', grid([
    field('Annual Stipend', formatStipend(s.ft_stipend)),
    field('FT Slots', s.ft_slots ?? '-'),
    field('Application Deadline', formatDate(s.application_due_date) || '-'),
    field('Start Date', s.start_date || '-'),
    field('APA Accreditation', s.apa_accreditation || '-'),
    field('CPA Accreditation', s.cpa_accreditation || '-'),
    field('Accepting Applicants', formatBool(s.accepting_applicants)),
    field('Fringe Benefits', cleanFringe(s.fringe_benefits), true),
  ])));

  // Eligibility
  const citizenVal = s.us_citizenship_required
    ? '<span class="d-value warn">⚠ Yes, US citizenship required</span>'
    : '<span class="d-value">No, international applicants welcome</span>';

  parts.push(section('Eligibility', grid([
    field('Accepts Counseling', formatBool(s.accepts_counseling)),
    field('Accepts Clinical',   formatBool(s.accepts_clinical)),
    field('Accepts School',     formatBool(s.accepts_school)),
    field('Accepts PhD',        formatBool(s.accepts_phd)),
    field('Accepts PsyD',       formatBool(s.accepts_psyd)),
    field('Min. Years in Program', s.min_years_grad != null ? s.min_years_grad : '-'),
    fieldRaw('US Citizenship Required', citizenVal),
    field('Work Auth Required', formatBool(s.noncitizen_work_auth_required)),
  ])));

  // Hours requirements
  parts.push(section('Minimum Hours Required', grid([
    field('Intervention Hours', s.min_intervention_hours != null ? s.min_intervention_hours : 'No minimum'),
    field('Assessment Hours',   s.min_assessment_hours   != null ? s.min_assessment_hours   : 'No minimum'),
    field('Combined Hours',     s.min_combined_hours     != null ? s.min_combined_hours     : 'No minimum'),
    field('Research Level',     s.research_level ? LEVEL_LABEL[s.research_level] : '-'),
    field('Assessment Mod. Level', s.assessment_modality_level ? LEVEL_LABEL[s.assessment_modality_level] : '-'),
  ])));

  // Populations
  if (s.populations?.length) {
    const tags = s.populations
      .map(p => `<span class="dtag">${esc(p)}</span>`)
      .join('');
    parts.push(section('Populations Served', `<div class="tag-cloud">${tags}</div>`));
  }

  // Treatment modalities
  const mods = s.treatment_modalities;
  if (mods && Object.keys(mods).length) {
    const sorted = Object.entries(mods)
      .sort((a, b) => (LEVEL_ORDER[b[1]] || 0) - (LEVEL_ORDER[a[1]] || 0));
    const rows = sorted.map(([name, lv]) => `
      <div class="area-row">
        <span class="area-name">${esc(name)}</span>
        <span class="lv-pill lv-${lv}">${LEVEL_LABEL[lv] || lv}</span>
      </div>
    `).join('');
    parts.push(section('Treatment Modalities', `<div class="area-list">${rows}</div>`));
  }

  // Experience / specialty areas
  const exps = s.experience_areas;
  if (exps && Object.keys(exps).length) {
    const sorted = Object.entries(exps)
      .sort((a, b) => (LEVEL_ORDER[b[1]] || 0) - (LEVEL_ORDER[a[1]] || 0));
    const rows = sorted.map(([name, lv]) => `
      <div class="area-row">
        <span class="area-name">${esc(name)}</span>
        <span class="lv-pill lv-${lv}">${LEVEL_LABEL[lv] || lv}</span>
      </div>
    `).join('');
    parts.push(section('Experience / Specialty Areas', `<div class="area-list">${rows}</div>`));
  }

  // Location note
  if (!s.geocode_exact) {
    parts.push(`<p style="font-size:0.73rem;color:var(--text-muted);margin-top:8px">
      ⚠ Map location is approximate (state-centroid). Actual address: ${esc(s.address || '-')}
    </p>`);
  }

  return parts.join('');
}

// ── Helpers ──────────────────────────────────────────────────
function section(title, content) {
  return `<div class="detail-section">
    <h3>${title}</h3>
    ${content}
  </div>`;
}

function grid(fields) {
  return `<div class="detail-grid">${fields.join('')}</div>`;
}

function field(label, value, wide = false) {
  return `<div class="d-field${wide ? ' wide' : ''}">
    <span class="d-label">${esc(label)}</span>
    <span class="d-value">${esc(String(value))}</span>
  </div>`;
}

function fieldRaw(label, valueHtml) {
  return `<div class="d-field wide">
    <span class="d-label">${esc(label)}</span>
    ${valueHtml}
  </div>`;
}
