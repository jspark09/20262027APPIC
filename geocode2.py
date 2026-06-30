"""
Second-pass geocoder for the 62 sites still on shared coordinates.
Uses a street-type regex to extract real addresses from messy multi-line strings.
"""
import json, re, time, sys
from collections import Counter
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import HTTPError

DATA_FILE = "internships_full.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS   = {"User-Agent": "APPIC-Internship-Explorer/1.0 (junsangjasonpark@gmail.com)"}

STREET_TYPES = (
    r'Street|St\.?\b|Avenue|Ave\.?\b|Boulevard|Blvd\.?\b|Drive|Dr\.?\b'
    r'|Road|Rd\.?\b|Way\b|Lane|Ln\.?\b|Court|Ct\.?\b|Circle|Cir\.?\b'
    r'|Loop\b|Place|Pl\.?\b|Highway|Hwy\.?\b|Parkway|Pkwy\.?\b'
    r'|Quadrangle\b|Mall\b|Halsey\b|Bellflower\b|Broad\s+Rock\b'
)
# Finds "digits + words including a street type" — ignores building/suite prefixes
STREET_RE = re.compile(
    r'\b(\d+\w*(?:\s+\w+){0,4}?\s+(?:' + STREET_TYPES + r')\.?)',
    re.IGNORECASE
)

def extract_best_street(address):
    """Return the most likely street address fragment from a messy string."""
    matches = STREET_RE.findall(address)
    if not matches:
        return None
    # Prefer longer matches (more context = more specific)
    return max(matches, key=len).strip()

def nom_fetch(params, delay=2.0):
    url = NOMINATIM + '?' + urlencode({**params, 'format': 'json', 'limit': 1})
    req = Request(url, headers=HEADERS)
    wait = delay
    for attempt in range(5):
        try:
            with urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            time.sleep(delay)
            return data[0] if data else None
        except HTTPError as e:
            if e.code == 429:
                print(f"    429 – waiting {wait:.0f}s…", flush=True)
                time.sleep(wait)
                wait = min(wait * 2, 120)
            else:
                return None
        except Exception as e:
            print(f"    err: {e}")
            return None
    return None

def geocode_site(site):
    addr  = site.get('address', '') or ''
    city  = site.get('city', '') or ''
    state = site.get('state', '') or ''

    street = extract_best_street(addr)

    # 1. Structured query with best extracted street
    if street:
        res = nom_fetch({'street': street, 'city': city, 'state': state,
                         'country': 'USA', 'countrycodes': 'us,gu,pr'})
        if res:
            return float(res['lat']), float(res['lon']), True
        time.sleep(2)

    # 2. Full address as free-form (often works when structured fails)
    if addr and not addr.lower().startswith('p.o') and not addr.lower().startswith('po box'):
        # Take first 80 chars before the city appears
        short = re.split(re.escape(city), addr, flags=re.IGNORECASE)[0].strip().rstrip(',')
        if short:
            res = nom_fetch({'q': f'{short}, {city}, {state}'})
            if res:
                return float(res['lat']), float(res['lon']), True
            time.sleep(2)

    return None, None, False

# ── Main ─────────────────────────────────────────────────────
with open(DATA_FILE) as f:
    data = json.load(f)

cc     = Counter((d['lat'], d['lng']) for d in data)
shared = {k for k, v in cc.items() if v > 1}
targets = [d for d in data if (d['lat'], d['lng']) in shared]
print(f"Still on shared coordinates: {len(targets)} sites")
print()

# Show what we'll extract before running
print("=== Address extraction preview ===")
for s in targets[:8]:
    street = extract_best_street(s.get('address','') or '')
    print(f"  IN:  {(s.get('address','') or '')[:80]!r}")
    print(f"  OUT: {street!r}")
    print()
print("=== Starting geocoding ===\n")

improved = 0
failed   = 0

for i, site in enumerate(targets, 1):
    old_lat, old_lng = site['lat'], site['lng']
    print(f"[{i}/{len(targets)}] {site['site'][:58]}", flush=True)

    lat, lng, exact = geocode_site(site)

    if lat is not None:
        moved = ((lat - old_lat)**2 + (lng - old_lng)**2) ** 0.5
        if moved > 0.005:   # only apply if we actually moved it
            site['lat']           = round(lat, 6)
            site['lng']           = round(lng, 6)
            site['geocode_exact'] = exact
            tag = "✓" if exact else "~"
            print(f"  {tag} {lat:.4f}, {lng:.4f}  (moved {moved:.3f}°)", flush=True)
            improved += 1
        else:
            print(f"  ↔ same city, skipping ({lat:.4f}, {lng:.4f})", flush=True)
            failed += 1
    else:
        print(f"  ✗ no result", flush=True)
        failed += 1

    # Checkpoint every 10 sites
    if i % 10 == 0:
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  [checkpoint saved]", flush=True)

    time.sleep(2)

with open(DATA_FILE, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\nDone. Improved: {improved}  Unchanged/failed: {failed}")
print(f"Saved → {DATA_FILE}")
