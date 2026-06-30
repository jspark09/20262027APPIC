"""
Re-geocode APPIC sites that share identical coordinates (city-centroid pile-ups).

Strategy (in order):
  1. US Census Bureau batch geocoder — free, no key, handles ~500 addresses at once
  2. Nominatim fallback (with backoff) for addresses Census can't match
"""
import json, re, time, csv, io, sys
from collections import Counter
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

DATA_FILE = "internships_full.json"
OUT_FILE  = "internships_full.json"

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
NOMINATIM  = "https://nominatim.openstreetmap.org/search"
NOM_HEADERS = {"User-Agent": "APPIC-Internship-Explorer/1.0 (junsangjasonpark@gmail.com)"}

# ── Helpers ──────────────────────────────────────────────────

def extract_street(address, city):
    """Strip city/state/zip suffix from address to isolate street."""
    pattern = re.compile(re.escape(city) + r'.*$', re.IGNORECASE)
    street = pattern.sub('', address).strip().rstrip(',').strip()
    lines = [l.strip() for l in re.split(r'  +|\n', street) if l.strip()]
    for i, line in enumerate(lines):
        if re.search(r'\d', line):
            return ' '.join(lines[i:])
    return street

def census_batch(sites_with_ids):
    """
    Send a batch of sites to the Census geocoder.
    sites_with_ids: list of (unique_id, site_dict)
    Returns: dict of unique_id -> (lat, lng) for successful matches
    """
    # Build CSV payload
    rows = []
    for uid, site in sites_with_ids:
        addr  = site.get('address', '') or ''
        city  = site.get('city', '') or ''
        state = site.get('state', '') or ''
        street = extract_street(addr, city)
        # Skip PO boxes and empty streets
        if not street or street.lower().startswith('po box'):
            street = addr  # use full address as fallback
        rows.append([uid, street, city, state, ''])

    csv_buf = io.StringIO()
    writer  = csv.writer(csv_buf)
    writer.writerows(rows)
    payload = csv_buf.getvalue().encode('utf-8')

    # Multipart form upload
    boundary = b'----CensusBatchBoundary'
    body = (
        b'--' + boundary + b'\r\n'
        b'Content-Disposition: form-data; name="addressFile"; filename="addresses.csv"\r\n'
        b'Content-Type: text/csv\r\n\r\n' +
        payload + b'\r\n'
        b'--' + boundary + b'\r\n'
        b'Content-Disposition: form-data; name="benchmark"\r\n\r\n'
        b'Public_AR_Current\r\n'
        b'--' + boundary + b'--\r\n'
    )
    req = Request(
        CENSUS_URL,
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary.decode()}'},
        method='POST'
    )
    try:
        with urlopen(req, timeout=60) as r:
            result_csv = r.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"  Census batch error: {e}")
        return {}

    # Parse CSV response
    # Format: ID, input_address, match, matchtype, matched_address, coords, tigerlineid, side
    results = {}
    for row in csv.reader(io.StringIO(result_csv)):
        if len(row) < 6:
            continue
        uid, _, match, _, _, coords = row[0], row[1], row[2], row[3], row[4], row[5]
        if match.strip() == 'Match' and coords.strip():
            try:
                lon_str, lat_str = coords.strip().split(',')
                results[uid.strip()] = (float(lat_str), float(lon_str))
            except Exception:
                pass
    return results

def nominatim_single(site, delay=2.0):
    """Single-site Nominatim lookup with retry on 429."""
    addr  = site.get('address', '') or ''
    city  = site.get('city', '') or ''
    state = site.get('state', '') or ''
    street = extract_street(addr, city)

    def fetch(params):
        url = NOMINATIM + '?' + urlencode({**params, 'format': 'json', 'limit': 1})
        req = Request(url, headers=NOM_HEADERS)
        wait = delay
        for attempt in range(4):
            try:
                with urlopen(req, timeout=15) as r:
                    results = json.loads(r.read())
                time.sleep(delay)
                return results[0] if results else None
            except HTTPError as e:
                if e.code == 429:
                    print(f"    429 – waiting {wait:.0f}s…")
                    time.sleep(wait)
                    wait = min(wait * 2, 120)
                else:
                    return None
            except Exception:
                return None
        return None

    if street and not street.lower().startswith('po box'):
        res = fetch({'street': street, 'city': city, 'state': state,
                     'country': 'USA', 'countrycodes': 'us,gu,pr'})
        if res:
            return float(res['lat']), float(res['lon']), True

    res = fetch({'q': f'{city}, {state}, USA'})
    if res:
        return float(res['lat']), float(res['lon']), False

    return None, None, False

# ── Main ─────────────────────────────────────────────────────

with open(DATA_FILE) as f:
    data = json.load(f)

# Find sites on shared coordinates
coord_counts = Counter((d['lat'], d['lng']) for d in data)
shared       = {k for k, v in coord_counts.items() if v > 1}
targets      = [d for d in data if (d['lat'], d['lng']) in shared]
print(f"Sites to re-geocode: {len(targets)} (on {len(shared)} shared coordinate pairs)")

# Build a stable uid -> site index for the targets
uid_map = {}  # uid -> site dict (reference into data list)
for site in targets:
    uid = str(site['appic_number'])
    uid_map[uid] = site

# ── Phase 1: Census batch geocoder ───────────────────────────
print(f"\nPhase 1: Census batch geocoder ({len(uid_map)} sites in one request)…")
sites_with_ids = list(uid_map.items())

# Census has a soft limit; split into chunks of 500 to be safe
CHUNK = 500
census_hits = {}
for i in range(0, len(sites_with_ids), CHUNK):
    chunk = sites_with_ids[i:i+CHUNK]
    print(f"  Sending {len(chunk)} addresses to Census…")
    hits = census_batch(chunk)
    census_hits.update(hits)
    print(f"  → {len(hits)} matched in this chunk")
    if i + CHUNK < len(sites_with_ids):
        time.sleep(2)

print(f"Census matched: {len(census_hits)} / {len(uid_map)}")

# Apply Census results
census_improved = 0
for uid, (lat, lng) in census_hits.items():
    site = uid_map[uid]
    old_lat, old_lng = site['lat'], site['lng']
    moved = ((lat - old_lat)**2 + (lng - old_lng)**2) ** 0.5
    site['lat'] = round(lat, 6)
    site['lng'] = round(lng, 6)
    site['geocode_exact'] = True
    if moved > 0.01:
        census_improved += 1

print(f"Census improved positions: {census_improved}")

# ── Phase 2: Nominatim for Census misses ─────────────────────
nom_targets = [(uid, site) for uid, site in uid_map.items() if uid not in census_hits]
print(f"\nPhase 2: Nominatim for {len(nom_targets)} Census misses…")

nom_improved = 0
nom_failed   = 0
for i, (uid, site) in enumerate(nom_targets, 1):
    old_lat, old_lng = site['lat'], site['lng']
    print(f"  [{i}/{len(nom_targets)}] {site['site'][:55]}")
    lat, lng, exact = nominatim_single(site)
    if lat is not None:
        moved = ((lat - old_lat)**2 + (lng - old_lng)**2) ** 0.5
        site['lat'] = round(lat, 6)
        site['lng'] = round(lng, 6)
        site['geocode_exact'] = exact
        tag = "✓" if exact else "~"
        print(f"    {tag} {lat:.4f}, {lng:.4f}  (moved {moved:.3f}°)")
        if moved > 0.01:
            nom_improved += 1
    else:
        print(f"    ✗ no result")
        nom_failed += 1

    # Save progress every 20 sites
    if i % 20 == 0:
        with open(OUT_FILE, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  [checkpoint saved at site {i}]")

# ── Final save ────────────────────────────────────────────────
with open(OUT_FILE, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

total_improved = census_improved + nom_improved
print(f"\nDone.")
print(f"  Census improved: {census_improved}")
print(f"  Nominatim improved: {nom_improved}")
print(f"  Still unresolved: {nom_failed}")
print(f"  Total improved: {total_improved} / {len(targets)}")
print(f"Saved → {OUT_FILE}")
