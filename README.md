# 🎃 Trick-or-Treat Planner

A pure static single-page web app that helps families plan the perfect Halloween trick-or-treat route — complete with live weather forecasts and spooky mini-stories at every stop.

## Features

- **Interactive map** — Click anywhere on the map or use GPS to set your start point.
- **Route generation** — Automatically finds 5–8 nearby stops (via OpenStreetMap/Nominatim) and orders them with a nearest-neighbor algorithm for an efficient walk.
- **Live weather** — Fetches an hourly forecast from Open-Meteo for each stop's estimated arrival time. Falls back gracefully to "Weather unavailable" if the API is unreachable.
- **Spooky stories** — Each stop gets a unique themed mini-story from the built-in `stories.json` library (15 original stories).
- **Filters**
  - 🔦 **Lit streets only** — removes stops whose OSM data marks the street as unlit.
  - ☔ **Avoid rainy hours** — drops stops with ≥ 60% precipitation probability at arrival time.
- **Optimize** — Re-runs the nearest-neighbor heuristic any time you want.
- **Drag-and-drop** — Reorder stops by dragging cards in the sidebar.
- **Print** — Clean, map-free print layout with checkboxes and arrival times.
- **Share** — Encodes the full route state into a URL that restores everything on load.

## Usage

No build step is required. Open `index.html` directly in a browser, or serve the project root with any static file server:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .
```

Then navigate to `http://localhost:8000`.

## File Structure

```
trick-or-treat-planner/
├── index.html     # HTML shell — loads Leaflet via CDN and app.js
├── app.js         # All application logic (ES2020 module, no bundler)
├── styles.css     # Halloween-themed dark design + print media query
├── stories.json   # 15 original spooky mini-stories
├── README.md
└── LICENSE
```

## External Services

| Service | Purpose | Key required? |
|---|---|---|
| [Leaflet 1.9.4](https://leafletjs.com) via unpkg CDN | Interactive map | No |
| [OpenStreetMap](https://www.openstreetmap.org) | Map tiles | No |
| [Nominatim](https://nominatim.openstreetmap.org) | Nearby street lookup | No |
| [Open-Meteo](https://open-meteo.com) | Hourly weather forecast | No |

All external services are free and require no API key.

## Walking Speed

Arrival times are estimated at **4.8 km/h** walking speed.

## Browser Support

Works in any modern browser that supports ES2020 modules, the Fetch API, and the Clipboard API. No Internet Explorer support.

## License

MIT — see [LICENSE](./LICENSE) for details.
