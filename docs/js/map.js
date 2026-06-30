import { esc } from './utils.js';

const EXACT_COLOR  = '#0d9488'; // teal
const APPROX_COLOR = '#64748b'; // slate — used for dashed border on hollow markers

let mapInstance   = null;
let clusterGroup  = null;

// Deterministic jitter for sites that share exact coordinates with others.
// Uses the site's APPIC number as a seed so position is stable across renders.
function jitter(sites) {
  // Build a count map for each coordinate pair
  const counts = new Map();
  for (const s of sites) {
    const key = `${s.lat},${s.lng}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Track which index each site gets at its coordinate
  const seen = new Map();
  return sites.map(s => {
    const key = `${s.lat},${s.lng}`;
    if (counts.get(key) <= 1) return { lat: s.lat, lng: s.lng };
    const idx = seen.get(key) || 0;
    seen.set(key, idx + 1);
    const total  = counts.get(key);
    const angle  = (2 * Math.PI * idx) / total;
    const radius = 0.0025; // ~275m
    return {
      lat: s.lat + radius * Math.cos(angle),
      lng: s.lng + radius * Math.sin(angle),
    };
  });
}

// ── Public ───────────────────────────────────────────────────
export function initMap(containerId) {
  mapInstance = L.map(containerId, {
    center: [39.5, -98.35],
    zoom: 4,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(mapInstance);

  clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 55,
    spiderfyOnMaxZoom: true,
  });
  mapInstance.addLayer(clusterGroup);

  mapInstance.on('moveend zoomend', () => {
    window.dispatchEvent(new CustomEvent('appic:bounds-change', {
      detail: { bounds: mapInstance.getBounds() },
    }));
  });

  return mapInstance;
}

export function getMapBounds() {
  return mapInstance?.getBounds() ?? null;
}

export function renderMarkers(data, onClickFn) {
  if (!mapInstance || !clusterGroup) return;
  clusterGroup.clearLayers();

  const positions = jitter(data);

  for (let i = 0; i < data.length; i++) {
    const site = data[i];
    const pos  = positions[i];
    const isApprox = !site.geocode_exact;

    const marker = L.circleMarker([pos.lat, pos.lng], {
      radius:      7,
      fillColor:   isApprox ? 'transparent' : EXACT_COLOR,
      color:       isApprox ? APPROX_COLOR  : '#fff',
      weight:      isApprox ? 2.5 : 1,
      dashArray:   isApprox ? '5 3' : null,
      fillOpacity: isApprox ? 0 : 0.88,
      opacity:     0.95,
    });

    const stipendStr = site.ft_stipend != null
      ? '$' + Number(site.ft_stipend).toLocaleString('en-US')
      : 'Not listed';

    const locNote = isApprox ? ' <em style="color:#94a3b8">(approx.)</em>' : '';

    marker.bindTooltip(`
      <div class="tt-box">
        <div class="tt-name">${esc(site.site)}</div>
        <div class="tt-loc">${esc(site.city)}, ${esc(site.state)}${locNote}</div>
        <div class="tt-meta">
          <span>Stipend: <strong>${stipendStr}</strong></span>
          <span>Slots: <strong>${site.ft_slots ?? '—'}</strong></span>
        </div>
      </div>
    `, { sticky: true, className: 'site-tooltip', opacity: 1 });

    marker.on('click', () => onClickFn(site));
    clusterGroup.addLayer(marker);
  }
}

// Called after the slide-over animation completes so Leaflet
// recalculates the map canvas size
export function resizeMap() {
  mapInstance?.invalidateSize();
}
