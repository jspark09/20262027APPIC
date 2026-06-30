// ── Ordered level scale ──────────────────────────────────────
export const LEVEL_ORDER = {
  major_area: 4,
  emphasis:   3,
  experience: 2,
  exposure:   1,
};

export const LEVEL_LABEL = {
  major_area: 'Major Area',
  emphasis:   'Emphasis',
  experience: 'Experience',
  exposure:   'Exposure',
};

// ── Formatters ───────────────────────────────────────────────
export function formatStipend(val) {
  if (val === null || val === undefined) return 'Not listed';
  return '$' + Number(val).toLocaleString('en-US');
}

export function formatDate(str) {
  if (!str) return '—';
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return str;
  return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}

export function parseDateMs(str) {
  if (!str) return Infinity;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return Infinity;
  return new Date(+m[3], +m[1] - 1, +m[2]).getTime();
}

export function formatBool(val) {
  if (val === null || val === undefined) return 'Not specified';
  return val ? 'Yes' : 'No';
}

// Produce a stable, unique-enough ID for a site
export function siteId(site) {
  return String(site.appic_number || '') ||
    [site.site, site.city, site.state].join('|').replace(/\s+/g, '_');
}

// Clean up fringe benefits: comma-separated, strip excess whitespace
export function cleanFringe(raw) {
  if (!raw) return '—';
  return raw
    .split(',')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ') || '—';
}

// HTML-escape a value for safe insertion into innerHTML
export function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
