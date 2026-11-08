# Requirements: Halloween Trick-or-Treat Route Planner

## Overview

A pure static single-page web application — no backend, no login, no paid API keys — that helps families plan a Halloween trick-or-treat route. It stitches together Leaflet + OpenStreetMap for interactive mapping, the free Open-Meteo API for real-time weather, and a built-in `stories.json` library of spooky short stories.

---

## User Stories & Acceptance Criteria (EARS-style)

### 1. Set Start Point

**US-1** — As a user, I want to set my starting location so that my route begins near where I actually am.

**AC-1.1** — WHEN the user clicks "Use My Location", THEN the app SHALL request browser geolocation permission and, on success, place a start-point marker on the map at the detected coordinates and pan the map to that location.

**AC-1.2** — WHEN the browser geolocation request fails or is denied, THEN the app SHALL display an inline error message ("Location unavailable — click the map to set your start") and allow the user to continue by clicking the map.

**AC-1.3** — WHEN the user clicks anywhere on the map, THEN the app SHALL place (or move) the start-point marker to the clicked coordinates and treat that point as the route origin.

**AC-1.4** — WHILE a start point is set, the app SHALL display the latitude and longitude in a human-readable format below the map controls.

---

### 2. Generate a Trick-or-Treat Route

**US-2** — As a user, I want the app to generate a set of trick-or-treat stops near my start point so that I have a ready-made route without manual searching.

**AC-2.1** — WHEN the user clicks "Generate Route" and a start point is set, THEN the app SHALL produce between 5 and 8 stops distributed within a configurable radius (default 800 m) of the start point using OpenStreetMap/Nominatim data (residential streets, points of interest) or, if the Nominatim query returns fewer than 5 results, SHALL supplement with evenly-spaced synthetic waypoints to reach the minimum count.

**AC-2.2** — WHEN "Generate Route" is clicked without a start point set, THEN the app SHALL display a validation message ("Please set a start point first") and SHALL NOT attempt route generation.

**AC-2.3** — WHEN route generation is in progress, THEN the app SHALL display a loading indicator and disable the "Generate Route" button until generation completes or fails.

**AC-2.4** — WHEN route generation fails due to a network error, THEN the app SHALL display an error message and offer a "Retry" option without losing the current start point.

---

### 3. Stop Ordering — Nearest-Neighbor with One-Click Optimize

**US-3** — As a user, I want stops ordered by walking distance so that I walk the shortest practical path between them.

**AC-3.1** — WHEN a route is generated, THEN the app SHALL order stops using a nearest-neighbor heuristic: starting from the user's start point, each successive stop is the unvisited stop nearest (Haversine distance) to the current position.

**AC-3.2** — WHEN the user clicks "Optimize Route", THEN the app SHALL re-run the nearest-neighbor algorithm from the current start point and update both the map polyline and the ordered stop list, animating the reorder transition.

**AC-3.3** — WHEN stops are reordered manually by the user (drag-and-drop on the stop list), THEN the app SHALL update the map polyline to reflect the new order and recalculate estimated arrival times.

**AC-3.4** — WHEN a route is displayed, THEN the app SHALL render a connected polyline on the map passing through stops in the current order, beginning at the start-point marker.

---

### 4. Stop Cards — Weather, Time, and Spooky Story

**US-4** — As a user, I want each stop to display weather and a spooky story so that I can plan around the conditions and entertain my kids along the way.

**AC-4.1** — WHEN a stop card is rendered, THEN it SHALL display: stop name or address (from reverse-geocode or generated label), estimated arrival time (calculated from start time + cumulative walking time at 4 km/h), current temperature in °C and °F, precipitation probability as a percentage, and a weather condition icon.

**AC-4.2** — WHEN weather data is fetched from Open-Meteo, THEN the app SHALL use the `/v1/forecast` endpoint with `hourly=temperature_2m,precipitation_probability,weathercode` and match each stop's estimated arrival hour to the corresponding forecast slot.

**AC-4.3** — WHEN the Open-Meteo API call fails or returns an error status, THEN the app SHALL display "Weather unavailable" in the stop card and continue rendering all other stop information without crashing.

**AC-4.4** — WHEN a stop card is rendered, THEN the app SHALL select one story from `stories.json` whose `tags` array contains a theme matching the stop's context (street, house, park, cemetery, etc.); if no themed match exists, a random story SHALL be selected as fallback.

**AC-4.5** — WHEN a story is displayed on a stop card, THEN the app SHALL show the story title, the 2–3 sentence story body, and a small thematic emoji icon.

---

### 5. Filters — Lit Streets and Avoid Rainy Hours

**US-5** — As a user, I want to filter the route by safety and weather conditions so that I can keep my group safe and dry.

**AC-5.1** — WHEN the "Lit streets only" toggle is enabled, THEN the app SHALL deprioritize (move to the end of the route or remove, based on user preference setting) any stop whose OSM tags indicate `lit=no` or where no `lit` tag is present and the street type is unclassified or path.

**AC-5.2** — WHEN the "Avoid rainy hours" toggle is enabled, THEN the app SHALL flag stops with precipitation probability ≥ 50 % at the estimated arrival hour with a rain warning badge, and offer to remove flagged stops from the route.

**AC-5.3** — WHEN a filter is toggled, THEN the route SHALL update in place (re-optimized if the optimize setting is active) within 500 ms without requiring a full regeneration.

**AC-5.4** — WHEN filters are active, THEN a visible indicator in the UI SHALL show which filters are currently applied.

---

### 6. Printable / Shareable Route Checklist

**US-6** — As a user, I want to print or share my planned route so that I can use it offline or send it to family members.

**AC-6.1** — WHEN the user clicks "Print Checklist", THEN the browser print dialog SHALL open with a print-optimized layout that includes: ordered stop list with checkboxes, stop names, estimated arrival times, weather summary, and story title; the map and interactive controls SHALL be hidden in the print view.

**AC-6.2** — WHEN the user clicks "Share Route", THEN the app SHALL encode the current route state (start coordinates, ordered stop coordinates, active filters, trip start time) into a URL query string and write it to the clipboard, displaying a "Link copied!" confirmation.

**AC-6.3** — WHEN a user opens a shared URL containing a valid route query string, THEN the app SHALL restore the route state (stops, order, filters, start time) automatically on load without requiring any additional interaction.

**AC-6.4** — WHEN the route state cannot be decoded from the URL (malformed or missing parameters), THEN the app SHALL silently ignore the URL parameters and start in the default empty state.

---

### 7. `stories.json` Content Library

**US-7** — As a developer/content author, I want a built-in story library so that the app works fully offline and without any external content API.

**AC-7.1** — The file `stories.json` SHALL contain at least 12 story objects.

**AC-7.2** — Each story object SHALL conform to the following schema:

```json
{
  "id": "string (unique)",
  "title": "string",
  "body": "string (2–3 sentences)",
  "tags": ["string"],
  "emoji": "string (single emoji character)"
}
```

**AC-7.3** — The 12+ stories SHALL collectively cover at least the following theme tags: `street`, `house`, `park`, `cemetery`, `fog`, `shadow`, `witch`, `ghost`, `pumpkin`, `spider`, `candy`, `wind`.

**AC-7.4** — Each story body SHALL be between 2 and 3 sentences in length and suitable for children aged 6–12 (no graphic violence or adult content).

**AC-7.5** — `stories.json` SHALL be valid JSON parseable by `JSON.parse()` with no trailing commas or comments.
