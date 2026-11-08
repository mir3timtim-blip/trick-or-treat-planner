# Tasks: Halloween Trick-or-Treat Route Planner

Numbered, ordered implementation checklist. Each task maps to one or more requirements (US-N) and design sections (§N).

---

## Phase 1 — Project Scaffold

- [x] **1.** Create the project directory structure with empty placeholder files: `index.html`, `app.js`, `styles.css`, `stories.json`. *(No build tool or package.json required.)*

- [x] **2.** Write `stories.json` with at least 12 story objects covering all required theme tags (`street`, `house`, `park`, `cemetery`, `fog`, `shadow`, `witch`, `ghost`, `pumpkin`, `spider`, `candy`, `wind`). Each object must have `id`, `title`, `body` (2–3 sentences), `tags` (array), and `emoji` fields. Validate the file parses with `JSON.parse()`. *(US-7, AC-7.1–7.5)*

---

## Phase 2 — HTML Shell

- [x] **3.** Write the complete `index.html` boilerplate: `<!DOCTYPE html>`, `lang="en"`, `charset`, `viewport` meta tag, `<title>`, and Open Graph tags (`og:title`, `og:description`, `og:type`). *(Design §2)*

- [x] **4.** Add Leaflet CSS and JS CDN `<link>`/`<script>` tags with SRI integrity hashes to `index.html`. *(Design §1)*

- [x] **5.** Add the `<link rel="stylesheet" href="styles.css">` tag and `<script type="module" src="app.js">` tag to `index.html`. *(Design §2)*

- [x] **6.** Build the `<header>` section in `index.html` with the app title ("🎃 Trick-or-Treat Planner") and a one-line tagline. *(Design §2)*

- [x] **7.** Build the `#controls` section in `index.html` with: "Use My Location" button (`id="btn-locate"`), "Generate Route" button (`id="btn-generate"`), "Optimize Route" button (`id="btn-optimize"`), trip start-time `<input type="time">` (`id="trip-start"`), coordinates display `<p id="coords-display">`, and the two filter checkboxes (`id="filter-lit"`, `id="filter-rain"`) each wrapped in a `<label>`. *(Design §2, US-1, US-5)*

- [x] **8.** Add the `<div id="map" role="application" aria-label="Trick-or-treat route map"></div>` element and `<section id="stops-list"></section>` to `index.html`. *(Design §2)*

- [x] **9.** Add the `#share-bar` div with "Print Checklist" (`id="btn-print"`) and "Share Route" (`id="btn-share"`) buttons, and the `<div id="toast" aria-live="polite"></div>` element to `index.html`. *(Design §2, US-6)*

---

## Phase 3 — Base Styles

- [ ] **10.** Define CSS custom properties in `:root` for the Halloween color palette: `--color-orange`, `--color-black`, `--color-purple`, `--color-bg`, `--color-text`, plus spacing tokens `--space-sm`, `--space-md`, `--space-lg`. *(Design §4)*

- [x] **11.** Write CSS reset/base rules: `box-sizing: border-box` on `*`, system-ui font stack on `body`, margin reset. *(Design §4)*

- [x] **12.** Write mobile-first layout CSS: single-column flexbox for `<main>`, with a `@media (min-width: 768px)` breakpoint introducing a two-column grid (controls + map left, stop list right). *(Design §4)*

- [x] **13.** Style `#map` with a fixed height of 400 px, a border-radius, and appropriate `z-index`. *(Design §4)*

- [x] **14.** Style `.stop-card` with border-radius, drop-shadow, orange left-border accent, and internal padding. *(Design §4)*

- [x] **15.** Style `.stop-card .weather` as a flex row with icon, temperature, and precipitation items. *(Design §4)*

- [x] **16.** Style `.stop-card .story` with italic text and emoji prefix. *(Design §4)*

- [x] **17.** Write `.badge-rain` (blue) and `.badge-unlit` (grey) badge styles, positioned absolutely over the card corner. *(Design §4)*

- [x] **18.** Style the filter checkboxes with a custom SVG checkmark and a visible active-filter indicator `(.filter-active)`. *(Design §4)*

- [x] **19.** Style `#toast` as fixed, bottom-center, with a fade-in/fade-out CSS animation (`@keyframes toast-fade`). *(Design §4)*

- [x] **20.** Write `@media print` rules: hide `#map`, `#controls`, `#share-bar`, `.story-body`, `.weather-icon`; show `.print-checklist`; format each stop as `☐ [HH:MM] Name — Temp — Precip%`; add `break-inside: avoid` on stop items. *(Design §3.13, US-6, AC-6.1)*

- [x] **21.** Write `@media (prefers-color-scheme: dark)` overrides maintaining ≥ 4.5:1 contrast ratios. *(Design §4)*

---

## Phase 4 — Core App Logic (`app.js`)

- [x] **22.** Write the `state` object with all fields: `startPoint`, `stops`, `filters`, `tripStartTime`, `weather`, `shareUrl`. Export nothing (module-internal). *(Design §3.1)*

- [x] **23.** Implement `loadStories()`: fetch `./stories.json`, parse, and cache in a module-scoped `stories` variable. Call this on module load. Handle fetch errors by setting `stories = []` and logging a warning. *(Design §3.11, US-7)*

- [x] **24.** Implement `initMap()`: create `L.map('map')`, add OSM tile layer with correct attribution, set default view. Attach `map.on('click')` to call `setStartPoint`. *(Design §3.3)*

- [x] **25.** Implement `setStartPoint(lat, lng)`: update `state.startPoint`, remove any existing start marker, add a new `L.marker` with a custom pumpkin emoji divIcon, pan the map with `map.setView`, and update `#coords-display`. *(Design §3.4, US-1, AC-1.3, AC-1.4)*

- [x] **26.** Implement the "Use My Location" button handler: call `navigator.geolocation.getCurrentPosition`, on success call `setStartPoint`, on error show a toast with the fallback message. *(US-1, AC-1.1, AC-1.2)*

- [x] **27.** Implement `haversine(a, b)` returning distance in meters between two `{lat, lng}` points. *(Design §3.8)*

- [x] **28.** Implement `nearestNeighbor(origin, stops)` returning a reordered `Stop[]` using the greedy nearest-neighbor heuristic. *(Design §3.8, US-3, AC-3.1)*

- [x] **29.** Implement `calculateArrivalTimes(stops, startPoint, tripStartTime)`: walk through the ordered stops, compute cumulative walking time at 4 km/h using Haversine, and assign `stop.arrivalTime` as a `Date`. *(Design §3.9, US-4, AC-4.1)*

- [x] **30.** Implement `fetchNominatimStops(lat, lng, radius)`: build the bounding-box viewbox, send the Nominatim search request with `User-Agent` header, parse results into `Stop` objects including `osmTags`. Handle network errors by returning `[]` and showing a toast. *(Design §3.6, US-2, AC-2.1, AC-2.4)*

- [x] **31.** Implement `syntheticStops(lat, lng, count)`: generate `count` evenly-spaced points on a circle of radius 400 m around the start point. *(Design §3.7, AC-2.1)*

- [x] **32.** Implement `inferTag(stop)`: map OSM tags to story theme tags (`street`, `cemetery`, `park`, `house`). *(Design §3.11)*

- [x] **33.** Implement `assignStories(stops)`: for each stop, filter `stories` by `inferTag`, select a random match (or random fallback), assign `stop.storyId`. *(Design §3.11, US-4, AC-4.4)*

- [x] **34.** Implement `fetchWeather(lat, lng, stops)`: build the Open-Meteo URL, fetch with a 5 000 ms `AbortController` timeout, match each stop's arrival hour to the hourly arrays, and populate `state.weather`. On error, call `showWeatherUnavailable()`. *(Design §3.10, US-4, AC-4.2, AC-4.3)*

- [x] **35.** Implement `wmoToIcon(code)`: return an emoji string for a given WMO weather code using the mapping table in the design doc. *(Design §6)*

- [x] **36.** Implement `applyFilters()`: filter `state.stops` by `litOnly` and `avoidRain` flags, re-run `nearestNeighbor`, recalculate arrival times, re-render. Mark rainy stops with `badge-rain`; mark unlit stops with `badge-unlit`. *(Design §3.12, US-5, AC-5.1–5.4)*

- [x] **37.** Implement `generateRoute()`: validate start point, show loading spinner (disable `#btn-generate`), fetch Nominatim stops, supplement with synthetic if < 5, trim to 8, run nearest-neighbor, assign stories, fetch weather, apply filters, render, hide spinner. *(Design §3.5, US-2, AC-2.1–2.4)*

- [x] **38.** Attach the "Generate Route" button click handler to `generateRoute()`. Attach the "Optimize Route" button click handler to re-run `nearestNeighbor` + `calculateArrivalTimes` + re-render. *(US-3, AC-3.2)*

---

## Phase 5 — Stop Card Rendering

- [x] **39.** Implement `renderStopCard(stop, index)`: build and return a `<article class="stop-card">` DOM element containing: numbered heading, stop label, arrival time (formatted `HH:MM`), weather row (icon + °C/°F + precip%), story block (emoji + title + body). *(US-4, AC-4.1, AC-4.5)*

- [x] **40.** Implement `renderStopList(stops)`: clear `#stops-list`, call `renderStopCard` for each stop, append to DOM. *(Design §3.5)*

- [x] **41.** Implement `renderPolyline(stops, startPoint)`: remove any existing polyline layer, draw a new `L.polyline` from start point through all stops in order, fit map bounds. *(US-3, AC-3.4)*

- [x] **42.** Implement drag-and-drop reordering on the stop list using the HTML Drag and Drop API (`draggable`, `dragover`, `drop` events): update `state.stops` order, recalculate arrival times, re-render polyline. *(US-3, AC-3.3)*

- [x] **43.** Implement `showWeatherUnavailable()`: set the weather section of all rendered stop cards to "Weather unavailable" text. *(AC-4.3)*

- [x] **44.** Implement `showToast(message, durationMs)`: set `#toast` text, add visible class, remove it after `durationMs` (default 3 000 ms). *(Design §3.14)*

---

## Phase 6 — Print & Share

- [ ] **45.** Implement the "Print Checklist" button handler: call `window.print()`. Verify that the `@media print` styles correctly show `.print-checklist` and hide the map/controls. *(US-6, AC-6.1)*

- [ ] **46.** Implement `encodeShareUrl(state)`: serialize start point, stop coordinates, active filters, and trip start time into a URL query string. *(Design §3.14, US-6, AC-6.2)*

- [ ] **47.** Implement the "Share Route" button handler: call `encodeShareUrl`, write to clipboard via `navigator.clipboard.writeText`, show "Link copied!" toast. Handle clipboard API unavailability by displaying the URL in an `<input>` for manual copy. *(US-6, AC-6.2)*

- [ ] **48.** Implement `decodeShareUrl()`: on page load, parse `location.search`, validate required fields, return partial state or `null` on any error. Call `generateRoute()` (skipping network fetches) with the decoded stops if valid. *(US-6, AC-6.3, AC-6.4)*

---

## Phase 7 — Polish & Accessibility

- [ ] **49.** Add `aria-label` attributes to all icon-only buttons. Add `aria-labelledby` to each `.stop-card` `<article>` pointing to its heading. *(Design §8)*

- [ ] **50.** Ensure all buttons meet the 44 × 44 px minimum touch target size via CSS `min-width`/`min-height` or `padding`. *(Design §8)*

- [ ] **51.** Verify focus order matches visual order by tabbing through the page; fix any `tabindex` issues found. *(Design §8)*

- [ ] **52.** Add a visible "active filter" label/badge in the controls area when one or more filters are on. *(US-5, AC-5.4)*

- [ ] **53.** Add a loading spinner element to `index.html` (`<div id="spinner" aria-live="polite" aria-busy="true" hidden>`), show/hide it during route generation and weather fetch. *(AC-2.3)*

---

## Phase 8 — Manual Tests

- [ ] **54.** **Geolocation test**: Open the app in a browser, click "Use My Location", grant permission. Verify a pumpkin marker appears at your coordinates and the map pans to it.

- [ ] **55.** **Map-click test**: Click anywhere on the map. Verify the start marker moves to the clicked location and coordinates update in `#coords-display`.

- [ ] **56.** **Route generation test**: Set a start point, click "Generate Route". Verify 5–8 stop cards appear, a polyline is drawn on the map, and each card shows a stop name, arrival time, and spooky story.

- [ ] **57.** **Weather display test**: Inspect the network tab to confirm one Open-Meteo request is made. Verify temperature and precipitation probability appear on at least one stop card.

- [ ] **58.** **Weather failure test**: Block `api.open-meteo.com` in DevTools network conditions and generate a route. Verify all cards show "Weather unavailable" and the route is still fully usable.

- [ ] **59.** **Optimize Route test**: Generate a route, manually drag a stop card to a different position, then click "Optimize Route". Verify the polyline and card order update to the nearest-neighbor optimized order.

- [ ] **60.** **Lit streets filter test**: Enable "Lit streets only", generate a route. Verify no stop cards display the `badge-unlit` badge (or that unlit stops are deprioritized to the end).

- [ ] **61.** **Avoid rain filter test**: Enable "Avoid rainy hours". If any stop has precipitation probability ≥ 50 %, verify the `badge-rain` badge appears and an offer to remove the stop is shown.

- [ ] **62.** **Print checklist test**: Click "Print Checklist", open the browser's print preview. Verify the map and controls are hidden, and the stop list with checkboxes and arrival times is visible.

- [ ] **63.** **Share route test**: Click "Share Route". Verify a "Link copied!" toast appears. Paste the URL into a new tab and verify the route is restored with the same stops and filters.

- [ ] **64.** **Malformed URL test**: Manually append `?slat=bad&slng=data` to the URL and reload. Verify the app starts in the empty default state with no errors in the console.

- [ ] **65.** **Offline / no-network test**: Disconnect from the internet after the page has loaded. Click "Generate Route" (start point already set). Verify the app falls back to synthetic stops, shows appropriate error toasts, and does not crash.

- [ ] **66.** **Accessibility test**: Run the page through an automated accessibility checker (e.g., axe DevTools). Resolve any critical or serious violations found.
