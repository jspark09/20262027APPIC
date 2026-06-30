"""
Third-pass geocoder: targeted fixes for the 19 remaining shared-coordinate sites.
Manually curated search strings for the tricky cases.
"""
import json, re, time
from collections import Counter
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import HTTPError

DATA_FILE = "internships_full.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS   = {"User-Agent": "APPIC-Internship-Explorer/1.0 (junsangjasonpark@gmail.com)"}

# Manual overrides: appic_number -> (search query, is_exact)
MANUAL = {
    # Puerto Rico / San Juan — VA Caribbean has a real street address
    1773: ("10 Calle Casia, San Juan, Puerto Rico 00921", True),

    # Texas state centroid (31.5,-99.3) is wrong — two totally different cities
    1591: ("1901 Veterans Memorial Drive, Temple, Texas 76504", True),  # Central TX VAHCS
    1589: ("1100 Wilford Hall Loop, Lackland AFB, San Antonio, Texas", True),  # Wilford Hall

    # Memphis — Christ Community
    2509: ("2670 Union Avenue Extended, Memphis, Tennessee 38104", True),

    # Newark, DE — Christiana Care (typo "Olgletown" → "Ogletown")
    2404: ("47350 Ogletown-Stanton Road, Newark, Delaware 19713", True),
    # U Delaware Warner Hall is at 75 The Green, Newark DE
    1196: ("75 The Green, Newark, Delaware 19716", True),

    # Los Angeles — LA County DHS (Bauchet St, not Drive)
    1130: ("450 Bauchet Street, Los Angeles, California 90012", True),
    # UCLA John Wooden Center West = 221 Westwood Plaza
    1135: ("221 Westwood Plaza, Los Angeles, California 90095", True),

    # East Lansing — MSU buildings
    1369: ("463 East Circle Drive, East Lansing, Michigan 48824", True),   # MSU Counseling (Olin)
    2447: ("620 Farm Lane, East Lansing, Michigan 48824", True),           # Mid-Michigan (Erickson)

    # Pittsburgh — VA Pittsburgh main campus
    1543: ("4100 Allequippa Street, Pittsburgh, Pennsylvania 15261", True),

    # Pittsburgh Psychology Internship Consortium at Duquesne
    2285: ("600 Forbes Avenue, Pittsburgh, Pennsylvania 15282", True),

    # Chapel Hill — both UNC sites
    2063: ("137 East Franklin Street, Chapel Hill, North Carolina 27514", True),  # UNC Counseling
    1409: ("321 South Columbia Street, Chapel Hill, North Carolina 27516", True), # UNC SOM

    # Memphis — U of Memphis Counseling
    1559: ("3720 Alumni Avenue, Memphis, Tennessee 38152", True),
}

def nom_fetch(q, delay=2.0):
    params = {'q': q, 'format': 'json', 'limit': 1}
    url = NOMINATIM + '?' + urlencode(params)
    req = Request(url, headers=HEADERS)
    wait = delay
    for _ in range(5):
        try:
            with urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            time.sleep(delay)
            return data[0] if data else None
        except HTTPError as e:
            if e.code == 429:
                print(f"  429 – waiting {wait:.0f}s…", flush=True)
                time.sleep(wait)
                wait = min(wait * 2, 120)
            else:
                return None
        except Exception as e:
            print(f"  err: {e}")
            return None
    return None

with open(DATA_FILE) as f:
    data = json.load(f)

# Build appic_number -> site index
site_map = {int(s.get('appic_number', 0)): s for s in data}

improved = 0
for appic_num, (query, exact) in MANUAL.items():
    site = site_map.get(appic_num)
    if not site:
        print(f"  ⚠ APPIC#{appic_num} not found in data")
        continue
    old_lat, old_lng = site['lat'], site['lng']
    print(f"APPIC#{appic_num}: {site['site'][:55]}")
    print(f"  query: {query!r}")
    res = nom_fetch(query)
    if res:
        lat, lng = float(res['lat']), float(res['lon'])
        moved = ((lat - old_lat)**2 + (lng - old_lng)**2) ** 0.5
        site['lat'] = round(lat, 6)
        site['lng'] = round(lng, 6)
        site['geocode_exact'] = exact
        print(f"  ✓ {lat:.4f}, {lng:.4f}  (moved {moved:.3f}°)", flush=True)
        if moved > 0.005:
            improved += 1
    else:
        print(f"  ✗ no result", flush=True)
    time.sleep(2)

with open(DATA_FILE, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\nDone. Applied: {improved} fixes. Saved → {DATA_FILE}")
