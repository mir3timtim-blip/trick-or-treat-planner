# Design: Halloween Trick-or-Treat Route Planner

## 1. Architecture Overview

The app is a **pure static single-page application**. All files are served directly from disk or any static file host (GitHub Pages, S3, Netlify, etc.). There is no build step, no bundler requirement, no server-side code, and no authentication.

```
trick-or-treat-planner/
├── index.html        # Single HTML shell; loads all assets
├── app.js            # All application logic (ES2020 modules)
├── styles.css        # All styling including print media query
└── stories.json      # Static spooky story library (12+ entries)
```

No npm packages are installed locally. Third-party libraries are loaded via CDN `<script>` tags with integrity hashes:

| Library | Version | Purpose |
|---|---|---|
| Leaflet | 1.9.x | Interactive map + tile rendering |
| OpenStreetMap | — | Map tile source (via Leaflet TileLayer) |
| Nominatim | — | Reverse geocoding stop labels (free, no key) |
| Open-Meteo | — | Hourly weather forecast (free, no key) |

---

## 2. `index.html` Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- meta charset, viewport, title, Open Graph tags -->
  <!-- Leaflet CSS CDN -->
  <!-- styles.css -->
</head>
<body>
  <header>          <!-- App title, tagline -->
  <main>
    <section id="controls">
      <!-- Use My Location button -->
      <!-- Generate Route button -->
      <!-- Optimize Route button -->
      <!-- Filter toggles: lit-streets, avoid-rain -->
      <!-- Trip start time picker -->
      <!-- Coordinates display -->
    </section>
    <div id="map">  <!-- Leaflet mounts here, 400px tall on desktop -->
    <section id="stops-list">
      <!-- Stop cards injected here by app.js -->
    </section>
    <div id="share-bar">
      <!-- Print Checklist button -->
      <!-- Share Route button -->
    </div>
  </main>
  <div id="toast" aria-live="polite"> <!-- Non-blocking messages -->
  <!-- Leaflet JS CDN -->
  <!-- app.js as type="module" -->
</body>
</html>
```

---

## 3. `app.js` — Module Structure

`app.js` is a single ES module file. It is organized into the following logical sections (not separate files, to avoid a bundler requirement):

### 3.1 State

```js
const state = {
  startPoint: null,          // { lat, lng }
  stops: [],                 // Stop[]
  filters: {
    litOnly: false,
    avoidRain: false,
  },
  tripStartTime: Date,       // JS Date from the time picker
  weather: {},               // keyed by stopId → WeatherSlot
  shareUrl: null,            // string | null
};
```

### 3.2 Data Types

```ts
// Stop object
{
  id: string,               // e.g. "stop-0"
  label: string,            // display name / address
  lat: number,
  lng: number,
  osmTags: object,          // raw OSM tags (lit, highway, etc.)
  arrivalTime: Date,        // calculated from walking speed
  storyId: string,          // matched story id from stories.json
}

// WeatherSlot (from Open-Meteo hourly array, one slot per stop)
{
  hour: number,             // 0–23
  temperature_2m: number,   // °C
  precipitation_probability: number, // 0–100
  weathercode: number,      // WMO weather code
}

// Story (from stories.json)
{
  id: string,
  title: string,
  body: string,
  tags: string[],
  emoji: string,
}
```

### 3.3 Map Initialization

- `initMap()` creates a `L.map('map')` instance with an OSM tile layer.
- Tile URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- Attribution string includes the required OSM copyright notice.
- Default view: world center (0, 0), zoom 2, until a start point is set.
- On start-point set: `map.setView([lat, lng], 15)`.

### 3.4 Start Point Setting

```
setStartPoint(lat, lng)
  → updates state.startPoint
  → removes old marker, adds L.marker with custom pumpkin icon
  → updates coordinates display
  → if stops exist, recalculates arrival times
```

Two entry paths:
1. **Geolocation**: `navigator.geolocation.getCurrentPosition()` success callback calls `setStartPoint`.
2. **Map click**: `map.on('click', e => setStartPoint(e.latlng.lat, e.latlng.lng))`.

### 3.5 Route Generation

```
generateRoute()
  → validates state.startPoint exists
  → shows loading spinner
  → calls fetchNominatimStops(lat, lng, radiusMeters=800)
  → if results < 5, supplements with syntheticStops(lat, lng, count)
  → trims to max 8 stops
  → applies nearestNeighbor(startPoint, stops)
  → calls assignStories(stops)
  → calls fetchWeatherBatch(stops, tripStartTime)
  → calls applyFilters()
  → renders stop cards and polyline
  → hides loading spinner
```

### 3.6 Nominatim Query

```
fetchNominatimStops(lat, lng, radius)
  → GET https://nominatim.openstreetmap.org/search
       ?format=jsonv2
       &q=residential
       &limit=20
       &viewbox=<bbox around lat/lng>
       &bounded=1
  → parses results, maps to Stop objects
  → reverse-geocodes each lat/lng for a human label if display_name is empty
```

Nominatim usage policy: maximum 1 request/second; the app adds a 1 100 ms delay between sequential requests. `User-Agent` header is set to `TrickOrTreatPlanner/1.0`.

### 3.7 Synthetic Waypoints (Fallback)

When Nominatim returns fewer than 5 results, `syntheticStops(lat, lng, count)` generates evenly-spaced points on a circle of radius 400 m around the start point:

```js
for (let i = 0; i < count; i++) {
  const angle = (2 * Math.PI * i) / count;
  const dlat = (400 / 111320) * Math.cos(angle);
  const dlng = (400 / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
  stops.push({ lat: lat + dlat, lng: lng + dlng, label: `Stop ${i + 1}`, ... });
}
```

### 3.8 Nearest-Neighbor Algorithm

```
nearestNeighbor(origin, stops) → Stop[]
  unvisited = [...stops]
  ordered = []
  current = origin
  while unvisited.length > 0:
    next = unvisited.reduce(minByHaversine(current))
    ordered.push(next)
    unvisited.remove(next)
    current = next
  return ordered
```

Haversine distance formula operates on `{ lat, lng }` objects and returns meters.

### 3.9 Arrival Time Calculation

```
WALKING_SPEED_KMH = 4
calculateArrivalTimes(stops, startPoint, tripStartTime)
  cumulative = 0  // minutes
  prev = startPoint
  for each stop:
    dist = haversine(prev, stop)  // meters
    minutes = (dist / 1000) / WALKING_SPEED_KMH * 60
    cumulative += minutes
    stop.arrivalTime = new Date(tripStartTime.getTime() + cumulative * 60_000)
    prev = stop
```

### 3.10 Open-Meteo Weather Fetch

Endpoint: `https://api.open-meteo.com/v1/forecast`

Single batch request for the bounding box center (not per-stop, to minimize requests):

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lng}
  &hourly=temperature_2m,precipitation_probability,weathercode
  &forecast_days=1
  &timezone=auto
```

Response mapping:
- Extract the `hourly` arrays for `time`, `temperature_2m`, `precipitation_probability`, `weathercode`.
- For each stop, find the index where `hourly.time[i]` matches the stop's `arrivalTime` hour (ISO 8601 truncated to the hour).
- Store as `state.weather[stopId]`.

**Failure handling:**
- Network error or non-200 response → catch block sets `state.weather = {}` and calls `renderWeatherUnavailable()` on all stop cards.
- Partial data (some hours missing) → affected stop cards show "Weather unavailable" for that slot only.
- Timeout after 5 000 ms → treated as network error.

### 3.11 Story Assignment

```
assignStories(stops)
  stories = loaded from stories.json (fetched once at startup, cached in module scope)
  for each stop:
    matched = stories.filter(s => s.tags.some(t => inferTag(stop) === t))
    stop.storyId = matched.length > 0
      ? matched[Math.floor(Math.random() * matched.length)].id
      : randomStory().id
```

`inferTag(stop)` maps OSM tags to story theme tags:
- `highway=residential` or `highway=living_street` → `"street"`
- `amenity=grave_yard` or `landuse=cemetery` → `"cemetery"`
- `leisure=park` → `"park"`
- default → `"house"`

### 3.12 Filters

```
applyFilters()
  filtered = [...state.stops]
  if litOnly:
    filtered = filtered.filter(s => s.osmTags.lit !== 'no')
  if avoidRain:
    rainy = filtered.filter(s => state.weather[s.id]?.precipitation_probability >= 50)
    // mark rainy stops with a badge; offer removal via UI
  re-run nearestNeighbor on remaining stops
  recalculate arrival times
  re-render
```

### 3.13 Print Layout

`styles.css` includes a `@media print` block:
- Hides: `#map`, `#controls`, `#share-bar`, `.story-body`, `.weather-icon`.
- Shows: `.print-checklist` element (hidden by default) containing the ordered stop list.
- Each stop prints as: `☐ [HH:MM] Stop Name — 🌡 Temp — ☔ Precip%`.
- Page break avoided between stop items with `break-inside: avoid`.

### 3.14 Share URL Encoding

```
encodeShareUrl(state) → string
  params = new URLSearchParams({
    slat: state.startPoint.lat,
    slng: state.startPoint.lng,
    stops: JSON.stringify(state.stops.map(s => [s.lat, s.lng])),
    litOnly: state.filters.litOnly ? '1' : '0',
    avoidRain: state.filters.avoidRain ? '1' : '0',
    start: state.tripStartTime.toISOString(),
  })
  return `${location.origin}${location.pathname}?${params}`

decodeShareUrl() → Partial<State> | null
  try:
    parse URLSearchParams
    validate required fields present and numeric
    return partial state
  catch:
    return null
```

---

## 4. `styles.css` Structure

| Section | Purpose |
|---|---|
| CSS custom properties (`:root`) | Colors (orange, black, purple Halloween palette), spacing tokens |
| Reset / base | `box-sizing`, font stack (system-ui), margin reset |
| Layout | Flexbox column for mobile-first; two-column grid on ≥ 768 px |
| `#map` | Fixed height 400 px; `z-index` managed to sit below modals |
| `.stop-card` | Card with border-radius, drop shadow, orange accent border |
| `.stop-card .weather` | Flex row: icon + temp + precip |
| `.stop-card .story` | Italic body text, emoji prefix |
| `.badge-rain` | Blue badge overlay on rainy stop cards |
| `.badge-unlit` | Grey badge overlay on unlit stop cards |
| Filter toggles | Styled `<input type="checkbox">` with custom SVG checkmark |
| Toast `#toast` | Fixed bottom-center, fade-in/out animation |
| `@media print` | See §3.13 |
| Dark mode `@media (prefers-color-scheme: dark)` | Inverted palette, maintains contrast ratios ≥ 4.5:1 |

---

## 5. `stories.json` Structure

```json
[
  {
    "id": "s01",
    "title": "The Whispering Lamp Post",
    "body": "Every Halloween, the old lamp post at the corner of Elm Street flickers three times before going dark. The children say it's the ghost of a street-sweeper who still tends his route. No one dares walk past it after the third flicker.",
    "tags": ["street", "ghost"],
    "emoji": "🕯️"
  },
  ...
]
```

Minimum 12 stories covering all required theme tags (see AC-7.3).

---

## 6. External API Contracts

### Open-Meteo `/v1/forecast`

**Request:**
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=<float>
  &longitude=<float>
  &hourly=temperature_2m,precipitation_probability,weathercode
  &forecast_days=1
  &timezone=auto
```

**Expected response shape:**
```json
{
  "latitude": 51.5,
  "longitude": -0.12,
  "hourly": {
    "time": ["2026-10-31T00:00", "2026-10-31T01:00", ...],
    "temperature_2m": [12.1, 11.8, ...],
    "precipitation_probability": [10, 15, ...],
    "weathercode": [1, 1, ...]
  }
}
```

**WMO weather code → icon mapping** (subset):
| Code | Icon | Description |
|---|---|---|
| 0 | ☀️ | Clear sky |
| 1–3 | 🌤️ | Partly cloudy |
| 45, 48 | 🌫️ | Fog |
| 51–67 | 🌧️ | Rain |
| 71–77 | ❄️ | Snow |
| 80–82 | 🌦️ | Rain showers |
| 95–99 | ⛈️ | Thunderstorm |

### Nominatim Search

**Request:**
```
GET https://nominatim.openstreetmap.org/search
  ?format=jsonv2
  &q=residential
  &viewbox=<west,south,east,north>
  &bounded=1
  &limit=20
  &addressdetails=1
  &extratags=1
```

**Expected response shape:**
```json
[
  {
    "place_id": 12345,
    "display_name": "23 Elm Street, Springfield",
    "lat": "51.5001",
    "lon": "-0.1200",
    "extratags": { "lit": "yes", "highway": "residential" }
  },
  ...
]
```

---

## 7. Error Handling Summary

| Scenario | Behaviour |
|---|---|
| Geolocation denied | Toast error; fallback to map-click |
| Nominatim network error | Toast error; fallback to synthetic stops |
| Nominatim < 5 results | Supplement with synthetic stops silently |
| Open-Meteo network error | "Weather unavailable" on all cards; route still usable |
| Open-Meteo timeout (>5 s) | Same as network error |
| stories.json fetch error | Use empty array; all stops show no story (graceful degradation) |
| Malformed share URL | Silently ignored; start in default state |
| No start point on Generate | Inline validation message; no fetch attempted |

---

## 8. Accessibility Notes

- All interactive controls have `aria-label` or visible `<label>` elements.
- Map container has `role="application"` and `aria-label="Trick-or-treat route map"`.
- Toast uses `aria-live="polite"`.
- Stop cards use `<article>` elements with `aria-labelledby` pointing to the stop name heading.
- Color is never the sole indicator of state (badges also use text/icons).
- Focus order follows visual order; no focus traps outside of any modal dialogs.
- Minimum touch target size 44 × 44 px for all buttons.
