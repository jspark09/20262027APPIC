import { siteId, formatStipend, formatDate, formatBool, esc } from './utils.js';

const STORAGE_KEY = 'appic-shortlist-2026';
const shortlist = new Map(); // id → site

export function initShortlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      for (const site of arr) shortlist.set(siteId(site), site);
    }
  } catch {}

  document.getElementById('exportCsvBtn')
    ?.addEventListener('click', exportCsv);

  dispatch();
}

export function isStarred(id) {
  return shortlist.has(id);
}

export function toggleStar(site) {
  const id = siteId(site);
  if (shortlist.has(id)) {
    shortlist.delete(id);
  } else {
    shortlist.set(id, site);
  }
  persist();
  dispatch();
  renderShortlist();
}

export function getShortlist() {
  return [...shortlist.values()];
}

// ── Compare table ────────────────────────────────────────────
export function renderShortlist() {
  const head = document.getElementById('compareHead');
  const body = document.getElementById('compareBody');
  if (!head || !body) return;

  const sites = getShortlist();
  if (!sites.length) {
    head.innerHTML = '';
    body.innerHTML = '<tr><td class="td-msg">No sites shortlisted yet. Star a site from the results to add it here.</td></tr>';
    return;
  }

  // Column headers = site names
  head.innerHTML = `<tr>
    <th class="row-label">Field</th>
    ${sites.map(s => `
      <th>
        <div class="site-col-head">${esc(s.site)}</div>
        <div class="site-col-city">${esc(s.city)}, ${esc(s.state)}</div>
      </th>
    `).join('')}
  </tr>`;

  // Rows = fields
  const FIELDS = [
    { label: 'Agency Type',          fn: s => s.primary_agency_type || '—' },
    { label: 'APA Accreditation',    fn: s => s.apa_accreditation || '—' },
    { label: 'Annual Stipend',       fn: s => formatStipend(s.ft_stipend) },
    { label: 'FT Slots',             fn: s => s.ft_slots ?? '—' },
    { label: 'Application Deadline', fn: s => formatDate(s.application_due_date) },
    { label: 'Start Date',           fn: s => s.start_date || '—' },
    { label: 'Min. Intervention Hrs',fn: s => s.min_intervention_hours ?? 'No min' },
    { label: 'Min. Assessment Hrs',  fn: s => s.min_assessment_hours ?? 'No min' },
    { label: 'Accepts Counseling',   fn: s => formatBool(s.accepts_counseling) },
    { label: 'Accepts Clinical',     fn: s => formatBool(s.accepts_clinical) },
    { label: 'US Citizenship Req.',  fn: s => s.us_citizenship_required ? '⚠ Yes' : 'No' },
    { label: 'Accepting Applicants', fn: s => formatBool(s.accepting_applicants) },
    { label: 'Research Level',       fn: s => s.research_level || '—' },
    { label: 'Assessment Level',     fn: s => s.assessment_modality_level || '—' },
  ];

  body.innerHTML = FIELDS.map(f => `
    <tr>
      <td class="row-label">${esc(f.label)}</td>
      ${sites.map(s => `<td>${esc(String(f.fn(s)))}</td>`).join('')}
    </tr>
  `).join('');
}

// ── CSV export ───────────────────────────────────────────────
function exportCsv() {
  const sites = getShortlist();
  if (!sites.length) { alert('Your shortlist is empty.'); return; }

  const COLS = [
    ['Site', s => s.site],
    ['Department', s => s.department || ''],
    ['City', s => s.city],
    ['State', s => s.state],
    ['Primary Agency Type', s => s.primary_agency_type || ''],
    ['APA Accreditation', s => s.apa_accreditation || ''],
    ['Annual Stipend', s => s.ft_stipend ?? ''],
    ['FT Slots', s => s.ft_slots ?? ''],
    ['Application Deadline', s => s.application_due_date || ''],
    ['Start Date', s => s.start_date || ''],
    ['Min Intervention Hrs', s => s.min_intervention_hours ?? ''],
    ['Min Assessment Hrs', s => s.min_assessment_hours ?? ''],
    ['Accepts Counseling', s => s.accepts_counseling ?? ''],
    ['Accepts Clinical', s => s.accepts_clinical ?? ''],
    ['US Citizenship Required', s => s.us_citizenship_required],
    ['Accepting Applicants', s => s.accepting_applicants],
    ['Research Level', s => s.research_level || ''],
    ['Assessment Level', s => s.assessment_modality_level || ''],
    ['APPIC URL', s => s.url || ''],
    ['Program Website', s => s.web_address || ''],
    ['Brochure URL', s => s.brochure_url || ''],
    ['Populations', s => (s.populations || []).join('; ')],
  ];

  const header = COLS.map(([label]) => `"${label}"`).join(',');
  const rows = sites.map(s =>
    COLS.map(([, fn]) => `"${String(fn(s)).replace(/"/g, '""')}"`).join(',')
  );

  const csv = [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url, download: 'appic-shortlist.csv'
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Internals ────────────────────────────────────────────────
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...shortlist.values()]));
  } catch {}
}

function dispatch() {
  window.dispatchEvent(new CustomEvent('appic:shortlist-change', {
    detail: { count: shortlist.size }
  }));
}
