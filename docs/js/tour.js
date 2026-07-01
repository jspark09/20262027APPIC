const STORAGE_KEY = 'appic:tourSeen';

const STEPS = [
  {
    target:    '#sidebar',
    title:     'Search & Filter',
    msg:       'Type a name, city, or department in the Search box — or use the sections below to narrow by state, stipend, program type, hours, and more. The map and list update instantly.',
    placement: 'right',
  },
  {
    target:    '#resultsPanel',
    title:     'Results List',
    msg:       'Every site visible on the map appears here. Click any row to open full details. Use ☆ on a row to save a site to your shortlist.',
    placement: 'above',
  },
  {
    target:    '#tabShortlist',
    title:     'My Shortlist',
    msg:       'Starred sites are collected here. Switch to this tab any time, then click "Export CSV" to download a summary of your saved sites.',
    placement: 'below',
  },
];

let step = 0;
let overlay, spotlight, card, titleEl, msgEl, nextBtn, dotsEl;

export function initTour() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  overlay   = document.getElementById('tourOverlay');
  spotlight = document.getElementById('tourSpotlight');
  card      = document.getElementById('tourCard');
  titleEl   = document.getElementById('tourTitle');
  msgEl     = document.getElementById('tourMsg');
  nextBtn   = document.getElementById('tourNext');
  dotsEl    = document.getElementById('tourDots');

  document.getElementById('tourSkip').addEventListener('click', endTour);
  nextBtn.addEventListener('click', advanceTour);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') endTour(); });

  // Small delay so the app has rendered its panels
  setTimeout(() => showStep(0), 600);
}

function showStep(n) {
  step = n;
  const s = STEPS[n];

  dotsEl.innerHTML = STEPS.map((_, i) =>
    `<span class="tour-dot${i === n ? ' active' : ''}"></span>`
  ).join('');

  titleEl.textContent = s.title;
  msgEl.textContent   = s.msg;
  nextBtn.textContent = n === STEPS.length - 1 ? 'Done ✓' : 'Next →';

  overlay.hidden = false;
  overlay.removeAttribute('aria-hidden');

  const target = document.querySelector(s.target);
  if (!target) return;

  const r   = target.getBoundingClientRect();
  const PAD = 8;
  Object.assign(spotlight.style, {
    top:    (r.top    - PAD) + 'px',
    left:   (r.left   - PAD) + 'px',
    width:  (r.width  + PAD * 2) + 'px',
    height: (r.height + PAD * 2) + 'px',
  });

  positionCard(r, s.placement);
}

function positionCard(r, placement) {
  const GAP = 18;
  const CW  = 285;
  const CH  = 175; // approx card height
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;

  let top, left;
  if (placement === 'right') {
    top  = Math.min(Math.max(r.top, GAP), vh - CH - GAP);
    left = Math.min(r.right + GAP, vw - CW - GAP);
  } else if (placement === 'above') {
    top  = Math.max(r.top - CH - GAP, GAP);
    left = Math.min(Math.max(r.left + r.width / 2 - CW / 2, GAP), vw - CW - GAP);
  } else {
    // below
    top  = Math.min(r.bottom + GAP, vh - CH - GAP);
    left = Math.min(Math.max(r.right - CW, GAP), vw - CW - GAP);
  }

  Object.assign(card.style, { top: top + 'px', left: left + 'px' });
}

function advanceTour() {
  if (step < STEPS.length - 1) {
    showStep(step + 1);
  } else {
    endTour();
  }
}

function endTour() {
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  localStorage.setItem(STORAGE_KEY, '1');
}
