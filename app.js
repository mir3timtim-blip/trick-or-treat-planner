/**
 * Trick-or-Treat Planner — app.js
 * Pure static ES2020 module. No build step required.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const WALKING_SPEED_KMH = 4.8;
const DEFAULT_RADIUS_M  = 800;
const SYNTHETIC_RADIUS_M = 400;
const WEATHER_TIMEOUT_MS = 5_000;
const NOMINATIM_DELAY_MS = 1_100;

// WMO weather code → emoji icon
const WMO_ICONS = {
  0:  "☀️",
  1:  "🌤️", 2:  "🌤️", 3:  "🌤️",
  45: "🌫️", 48: "🌫️",
  51: "🌧️", 53: "🌧️", 55: "🌧️",
  56: "🌧️", 57: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌧️", 67: "🌧️",
  71: "❄️",  73: "❄️",  75: "❄️",  77: "❄️",
  80: "🌦️", 81: "🌦️", 82: "🌦️",
  85: "❄️",  86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

// ─── Module-level state ────────────────────────────────────────────────────────

/** @type {Story[]} */
let stories = [];

/** @type {import('leaflet').Map} */
let map;

/** @type {import('leaflet').Marker|null} */
let startMarker = null;

/** @type {import('leaflet').Polyline|null} */
let routePolyline = null;

/** @type {import('leaflet').Marker[]} */
let stopMarkers = [];

const state = {
  /** @type {{lat:number, lng:number}|null} */
  startPoint: null,

  /** @type {Stop[]} */
  stops: [],

  filters: {
    litOnly: false,
    avoidRain: false,
  },

  /** @type {Date} */
  tripStartTime: new Date(),

  /** @type {Record<string, WeatherSlot>} */
  weather: {},

  /** @type {string|null} */
  shareUrl: null,
};

// ─── Type definitions (JSDoc only) ────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   lat: number,
 *   lng: number,
 *   osmTags: Record<string,string>,
 *   arrivalTime: Date,
 *   storyId: string|null,
 * }} Stop
 *
 * @typedef {{
 *   hour: number,
 *   temperature_2m: number,
 *   precipitation_probability: number,
 *   weathercode: number,
 * }} WeatherSlot
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   body: string,
 *   tags: string[],
 *   emoji: string,
 * }} Story
 */

// ─── Stories ──────────────────────────────────────────────────────────────────

async function loadStories() {
  try {
    const res = await fetch("./stories.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stories = await res.json();
  } catch (err) {
    console.warn("[TrickorTreat] stories.json failed to load:", err);
    stories = [];
  }
}

// ─── Map Initialization ───────────────────────────────────────────────────────

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([20, 0], 2);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  map.on("click", (e) => {
    setStartPoint(e.latlng.lat, e.latlng.lng);
  });
}

// ─── Start Point ──────────────────────────────────────────────────────────────

function setStartPoint(lat, lng) {
  state.startPoint = { lat, lng };

  if (startMarker) {
    map.removeLayer(startMarker);
  }

  const pumpkinIcon = L.divIcon({
    html: '<span style="font-size:2rem;line-height:1;" aria-hidden="true">🎃</span>',
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  startMarker = L.marker([lat, lng], { icon: pumpkinIcon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup("Start here 🎃");

  map.setView([lat, lng], 15, { animate: true });

  const coordsDisplay = document.getElementById("coords-display");
  coordsDisplay.textContent = `Start: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Recalculate arrival times if route already exists
  if (state.stops.length > 0) {
    calculateArrivalTimes(state.stops, state.startPoint, state.tripStartTime);
    renderStopList(state.stops);
  }
}

// ─── Geolocation ──────────────────────────────────────────────────────────────

function handleLocateClick() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported by this browser.", 4000, "error");
    return;
  }

  const btn = document.getElementById("btn-locate");
  btn.disabled = true;
  btn.textContent = "📍 Locating…";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setStartPoint(pos.coords.latitude, pos.coords.longitude);
      btn.disabled = false;
      btn.textContent = "📍 Use My Location";
      showToast("Location found! Click Generate Route.", 3000, "success");
    },
    (err) => {
      console.warn("[TrickorTreat] Geolocation error:", err);
      btn.disabled = false;
      btn.textContent = "📍 Use My Location";
      showToast(
        "Location unavailable — click the map to set your start.",
        5000,
        "error"
      );
    },
    { timeout: 10_000, maximumAge: 60_000 }
  );
}

// ─── Haversine Distance ───────────────────────────────────────────────────────

/**
 * Returns the Haversine distance in metres between two {lat,lng} points.
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number}
 */
function haversine(a, b) {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(aVal));
}

// ─── Nearest-Neighbor ─────────────────────────────────────────────────────────

/**
 * Orders stops using a greedy nearest-neighbor heuristic from origin.
 * @param {{lat:number,lng:number}} origin
 * @param {Stop[]} stops
 * @returns {Stop[]}
 */
function nearestNeighbor(origin, stops) {
  const unvisited = [...stops];
  const ordered = [];
  let current = origin;

  while (unvisited.length > 0) {
    let minDist = Infinity;
    let nearest = null;
    let nearestIdx = -1;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversine(current, unvisited[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = unvisited[i];
        nearestIdx = i;
      }
    }

    ordered.push(nearest);
    unvisited.splice(nearestIdx, 1);
    current = nearest;
  }

  return ordered;
}

// ─── Arrival Times ────────────────────────────────────────────────────────────

/**
 * Mutates each stop by assigning a computed arrivalTime Date.
 * @param {Stop[]} stops
 * @param {{lat:number,lng:number}} startPoint
 * @param {Date} tripStartTime
 */
function calculateArrivalTimes(stops, startPoint, tripStartTime) {
  let cumulativeMinutes = 0;
  let prev = startPoint;

  for (const stop of stops) {
    const distM = haversine(prev, stop);
    const minutes = (distM / 1000 / WALKING_SPEED_KMH) * 60;
    cumulativeMinutes += minutes;
    stop.arrivalTime = new Date(
      tripStartTime.getTime() + cumulativeMinutes * 60_000
    );
    prev = stop;
  }
}

// ─── Nominatim ────────────────────────────────────────────────────────────────

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusM
 * @returns {Promise<Stop[]>}
 */
async function fetchNominatimStops(lat, lng, radiusM = DEFAULT_RADIUS_M) {
  // Build a bounding box around the start point
  const deltaLat = radiusM / 111_320;
  const deltaLng =
    radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));

  const west  = (lng - deltaLng).toFixed(6);
  const east  = (lng + deltaLng).toFixed(6);
  const south = (lat - deltaLat).toFixed(6);
  const north = (lat + deltaLat).toFixed(6);

  const params = new URLSearchParams({
    format:         "jsonv2",
    q:              "residential",
    viewbox:        `${west},${south},${east},${north}`,
    bounded:        "1",
    limit:          "20",
    addressdetails: "1",
    extratags:      "1",
  });

  const url = `https://nominatim.openstreetmap.org/search?${params}`;

  try {
    await new Promise((r) => setTimeout(r, 100)); // small polite delay
    const res = await fetch(url, {
      headers: { "User-Agent": "TrickOrTreatPlanner/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return data.slice(0, 20).map((item, idx) => ({
      id:         `stop-nom-${idx}`,
      label:      item.display_name?.split(",").slice(0, 2).join(", ") || `Stop ${idx + 1}`,
      lat:        parseFloat(item.lat),
      lng:        parseFloat(item.lon),
      osmTags:    item.extratags || {},
      arrivalTime: new Date(),
      storyId:    null,
    }));
  } catch (err) {
    console.warn("[TrickorTreat] Nominatim error:", err);
    showToast("Could not fetch nearby streets — using generated stops.", 4000, "error");
    return [];
  }
}

// ─── Synthetic Stops ──────────────────────────────────────────────────────────

/**
 * Generates `count` evenly-spaced synthetic stops on a circle around the origin.
 * @param {number} lat
 * @param {number} lng
 * @param {number} count
 * @returns {Stop[]}
 */
function syntheticStops(lat, lng, count) {
  const names = [
    "Pumpkin Lane",
    "Shadow Court",
    "Cobweb Close",
    "Haunted Hollow",
    "Witch's Way",
    "Gravestone Grove",
    "Moonlit Mews",
    "Skeleton Street",
    "Black Cat Boulevard",
    "Candy Corner",
  ];

  const stops = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    // Vary radius slightly per stop for a more natural distribution
    const r = SYNTHETIC_RADIUS_M * (0.6 + 0.4 * ((i % 3) / 2));
    const dLat = r / 111_320;
    const dLng = r / (111_320 * Math.cos((lat * Math.PI) / 180));
    stops.push({
      id:          `stop-syn-${i}`,
      label:       names[i % names.length],
      lat:         lat + dLat * Math.cos(angle),
      lng:         lng + dLng * Math.sin(angle),
      osmTags:     { lit: i % 3 === 0 ? "no" : "yes" },
      arrivalTime: new Date(),
      storyId:     null,
    });
  }
  return stops;
}

// ─── Story Assignment ─────────────────────────────────────────────────────────

/**
 * Maps a stop's OSM tags to a story theme tag.
 * @param {Stop} stop
 * @returns {string}
 */
function inferTag(stop) {
  const tags = stop.osmTags || {};
  const hw   = tags.highway    || "";
  const am   = tags.amenity    || "";
  const lu   = tags.landuse    || "";
  const le   = tags.leisure    || "";

  if (am === "grave_yard" || lu === "cemetery") return "cemetery";
  if (le === "park")                             return "park";
  if (hw === "residential" || hw === "living_street") return "street";

  // Synthetic name hints
  const label = (stop.label || "").toLowerCase();
  if (label.includes("park"))      return "park";
  if (label.includes("lane") || label.includes("street") || label.includes("boulevard")) return "street";
  if (label.includes("grave") || label.includes("cemetery")) return "cemetery";

  return "house";
}

/**
 * Used story IDs within the current route (avoids repeats).
 * @type {Set<string>}
 */
const usedStoryIds = new Set();

/**
 * Assigns a story to each stop, avoiding repeats within one route.
 * @param {Stop[]} stops
 */
function assignStories(stops) {
  usedStoryIds.clear();

  for (const stop of stops) {
    const tag = inferTag(stop);
    const candidates = stories.filter(
      (s) => s.tags.includes(tag) && !usedStoryIds.has(s.id)
    );

    let chosen;
    if (candidates.length > 0) {
      chosen = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      // Fallback: any unused story
      const unused = stories.filter((s) => !usedStoryIds.has(s.id));
      if (unused.length > 0) {
        chosen = unused[Math.floor(Math.random() * unused.length)];
      } else {
        // All stories used — allow repeats from here
        chosen = stories[Math.floor(Math.random() * stories.length)];
      }
    }

    if (chosen) {
      stop.storyId = chosen.id;
      usedStoryIds.add(chosen.id);
    } else {
      stop.storyId = null;
    }
  }
}

// ─── Weather ──────────────────────────────────────────────────────────────────

/**
 * Returns an emoji for a WMO weather code.
 * @param {number} code
 * @returns {string}
 */
function wmoToIcon(code) {
  return WMO_ICONS[code] ?? "🌡️";
}

/**
 * Fetches Open-Meteo hourly forecast for the given location and maps each
 * stop's arrival hour to a WeatherSlot, stored in state.weather.
 * @param {number} lat
 * @param {number} lng
 * @param {Stop[]} stops
 */
async function fetchWeather(lat, lng, stops) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  const params = new URLSearchParams({
    latitude:            lat.toFixed(6),
    longitude:           lng.toFixed(6),
    hourly:              "temperature_2m,precipitation_probability,weathercode",
    forecast_days:       "1",
    timezone:            "auto",
  });

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const times   = data.hourly?.time                    ?? [];
    const temps   = data.hourly?.temperature_2m          ?? [];
    const precips = data.hourly?.precipitation_probability ?? [];
    const codes   = data.hourly?.weathercode             ?? [];

    state.weather = {};

    for (const stop of stops) {
      // Find the index whose hour matches the stop's arrivalTime hour
      const arrival = stop.arrivalTime;
      const targetHour = `${String(arrival.getHours()).padStart(2, "0")}:00`;

      const idx = times.findIndex((t) => t.endsWith(targetHour));
      if (idx !== -1) {
        state.weather[stop.id] = {
          hour:                     arrival.getHours(),
          temperature_2m:           temps[idx]   ?? null,
          precipitation_probability: precips[idx] ?? null,
          weathercode:              codes[idx]   ?? null,
        };
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[TrickorTreat] Weather fetch error:", err);
    state.weather = {};
    showToast("Weather unavailable — route still works!", 3000, "error");
  }
}

// ─── Filters ──────────────────────────────────────────────────────────────────

/**
 * Applies active filters to state.stops, re-orders with nearest-neighbor,
 * recalculates arrival times, and re-renders.
 */
function applyFilters() {
  if (!state.startPoint || state.stops.length === 0) return;

  let filtered = [...state.stops];

  if (state.filters.litOnly) {
    filtered = filtered.filter((s) => s.osmTags?.lit !== "no");
  }

  if (state.filters.avoidRain) {
    filtered = filtered.filter((s) => {
      const w = state.weather[s.id];
      if (!w || w.precipitation_probability === null) return true; // keep if no data
      return w.precipitation_probability < 60;
    });
  }

  if (filtered.length === 0) {
    showToast("All stops were filtered out — relax the filters.", 4000, "error");
    filtered = [...state.stops]; // restore
  }

  const ordered = nearestNeighbor(state.startPoint, filtered);
  calculateArrivalTimes(ordered, state.startPoint, state.tripStartTime);
  state.stops = ordered;

  renderStopList(state.stops);
  renderPolyline(state.stops, state.startPoint);
  updateActiveFiltersBar();
}

function updateActiveFiltersBar() {
  const bar = document.getElementById("active-filters-bar");
  const parts = [];
  if (state.filters.litOnly)  parts.push("🔦 Lit streets only");
  if (state.filters.avoidRain) parts.push("☔ Avoid rainy hours");

  if (parts.length > 0) {
    bar.textContent = "Active filters: " + parts.join(" · ");
    bar.classList.add("visible");
  } else {
    bar.textContent = "";
    bar.classList.remove("visible");
  }

  // Reflect on filter labels
  document.getElementById("filter-lit").closest(".filter-label")
    .classList.toggle("filter-active", state.filters.litOnly);
  document.getElementById("filter-rain").closest(".filter-label")
    .classList.toggle("filter-active", state.filters.avoidRain);
}

// ─── Route Generation ─────────────────────────────────────────────────────────

async function generateRoute() {
  if (!state.startPoint) {
    showToast("Please set a start point first.", 3000, "error");
    return;
  }

  const btnGenerate = document.getElementById("btn-generate");
  const spinner     = document.getElementById("spinner");

  btnGenerate.disabled = true;
  spinner.hidden = false;

  try {
    const desiredCount = parseInt(
      document.getElementById("stop-count").value,
      10
    );

    // Parse trip start time
    const timeInput = document.getElementById("trip-start").value || "18:00";
    const [hours, minutes] = timeInput.split(":").map(Number);
    const tripStart = new Date();
    tripStart.setHours(hours, minutes, 0, 0);
    state.tripStartTime = tripStart;

    // 1. Try Nominatim
    let rawStops = await fetchNominatimStops(
      state.startPoint.lat,
      state.startPoint.lng,
      DEFAULT_RADIUS_M
    );

    // 2. Supplement with synthetic if needed
    if (rawStops.length < desiredCount) {
      const needed = desiredCount - rawStops.length;
      const synthetics = syntheticStops(
        state.startPoint.lat,
        state.startPoint.lng,
        needed
      );
      rawStops = [...rawStops, ...synthetics];
    }

    // 3. Trim to desired count
    rawStops = rawStops.slice(0, desiredCount);

    // Re-assign ids to be sequential
    rawStops = rawStops.map((s, i) => ({ ...s, id: `stop-${i}` }));

    // 4. Nearest-neighbor ordering
    const ordered = nearestNeighbor(state.startPoint, rawStops);

    // 5. Arrival times
    calculateArrivalTimes(ordered, state.startPoint, state.tripStartTime);

    // 6. Assign stories
    assignStories(ordered);

    // 7. Fetch weather
    await fetchWeather(state.startPoint.lat, state.startPoint.lng, ordered);

    state.stops = ordered;

    // 8. Apply active filters
    applyFilters(); // this calls render internally

    // 9. Enable optimize button
    document.getElementById("btn-optimize").disabled = false;

  } catch (err) {
    console.error("[TrickorTreat] Route generation error:", err);
    showToast("Route generation failed. Please try again.", 4000, "error");
  } finally {
    btnGenerate.disabled = false;
    spinner.hidden = true;
  }
}

// ─── Polyline Rendering ───────────────────────────────────────────────────────

function renderPolyline(stops, startPoint) {
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
  stopMarkers.forEach((m) => map.removeLayer(m));
  stopMarkers = [];

  if (!startPoint || stops.length === 0) return;

  const latlngs = [
    [startPoint.lat, startPoint.lng],
    ...stops.map((s) => [s.lat, s.lng]),
  ];

  routePolyline = L.polyline(latlngs, {
    color:   "#ff7b00",
    weight:  4,
    opacity: 0.8,
    dashArray: "8 6",
  }).addTo(map);

  // Number markers for each stop
  stops.forEach((stop, idx) => {
    const icon = L.divIcon({
      html: `<div style="
        background:#ff7b00;
        color:#000;
        font-weight:700;
        font-size:0.8rem;
        width:26px;height:26px;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        border:2px solid #000;
        font-family:system-ui,sans-serif;
      ">${idx + 1}</div>`,
      className: "",
      iconSize:   [26, 26],
      iconAnchor: [13, 13],
    });

    const marker = L.marker([stop.lat, stop.lng], { icon })
      .addTo(map)
      .bindPopup(`<strong>${idx + 1}. ${stop.label}</strong>`);

    stopMarkers.push(marker);
  });

  map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
}

// ─── Stop Card Rendering ──────────────────────────────────────────────────────

/**
 * Formats a Date as HH:MM.
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * Converts Celsius to Fahrenheit.
 * @param {number} c
 * @returns {string}
 */
function cToF(c) {
  return ((c * 9) / 5 + 32).toFixed(1);
}

/**
 * Builds a stop card DOM element.
 * @param {Stop} stop
 * @param {number} index
 * @returns {HTMLElement}
 */
function renderStopCard(stop, index) {
  const article = document.createElement("article");
  article.className = "stop-card";
  article.setAttribute("aria-labelledby", `stop-name-${stop.id}`);
  article.setAttribute("draggable", "true");
  article.dataset.stopId = stop.id;

  // --- Weather ---
  const w = state.weather[stop.id];
  let weatherHTML;
  if (!w || w.temperature_2m === null) {
    weatherHTML = `<span class="weather-unavailable">Weather unavailable</span>`;
  } else {
    const icon    = wmoToIcon(w.weathercode);
    const tempC   = w.temperature_2m.toFixed(1);
    const tempF   = cToF(w.temperature_2m);
    const precip  = w.precipitation_probability ?? "–";
    weatherHTML = `
      <span class="weather-icon" aria-hidden="true">${icon}</span>
      <span class="weather-temp">🌡️ ${tempC}°C / ${tempF}°F</span>
      <span class="weather-precip">☔ ${precip}%</span>
    `;
  }

  // Rain / unlit badges
  let badges = "";
  if (w && w.precipitation_probability !== null && w.precipitation_probability >= 60) {
    badges += `<span class="badge-rain" title="High chance of rain at this stop">🌧️ Rain</span>`;
  }
  if (stop.osmTags?.lit === "no") {
    badges += `<span class="badge-unlit" title="Street not marked as lit">🔦 Unlit</span>`;
  }

  // --- Story ---
  const story = stories.find((s) => s.id === stop.storyId);
  let storyHTML = "";
  if (story) {
    storyHTML = `
      <div class="stop-story">
        <div class="story-header">
          <span class="story-emoji" aria-hidden="true">${story.emoji}</span>
          <span class="story-title">${escapeHtml(story.title)}</span>
        </div>
        <p class="story-body">${escapeHtml(story.body)}</p>
      </div>
    `;
  }

  // --- Print checklist line ---
  const printWeather = w && w.temperature_2m !== null
    ? `🌡️ ${w.temperature_2m.toFixed(1)}°C — ☔ ${w.precipitation_probability ?? "–"}%`
    : "";
  const printLine = `
    <div class="print-checklist-line">
      <span class="print-checkbox" aria-hidden="true">☐</span>
      <span class="print-arrival">[${formatTime(stop.arrivalTime)}]</span>
      <span class="print-name">${escapeHtml(stop.label)}</span>
      <span class="print-weather-summary">${printWeather}</span>
    </div>
  `;

  article.innerHTML = `
    ${badges}
    <div class="stop-number">Stop ${index + 1}</div>
    <h2 class="stop-name" id="stop-name-${stop.id}">${escapeHtml(stop.label)}</h2>
    <p class="stop-arrival">
      Estimated arrival: <time datetime="${stop.arrivalTime.toISOString()}">${formatTime(stop.arrivalTime)}</time>
    </p>
    <div class="stop-weather" aria-label="Weather at this stop">
      ${weatherHTML}
    </div>
    ${storyHTML}
    ${printLine}
    <span class="stop-drag-hint" aria-hidden="true">⠿</span>
  `;

  // Drag-and-drop events
  article.addEventListener("dragstart", onDragStart);
  article.addEventListener("dragover",  onDragOver);
  article.addEventListener("drop",      onDrop);
  article.addEventListener("dragend",   onDragEnd);

  return article;
}

/**
 * Clears and re-renders the stop list.
 * @param {Stop[]} stops
 */
function renderStopList(stops) {
  const section = document.getElementById("stops-list");
  section.innerHTML = "";

  if (stops.length === 0) {
    section.textContent = "No stops to display.";
    return;
  }

  stops.forEach((stop, idx) => {
    section.appendChild(renderStopCard(stop, idx));
  });
}

// ─── Drag-and-Drop Reordering ─────────────────────────────────────────────────

let dragSrcId = null;

function onDragStart(e) {
  dragSrcId = e.currentTarget.dataset.stopId;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.stopId;
  if (!dragSrcId || dragSrcId === targetId) return;

  const srcIdx = state.stops.findIndex((s) => s.id === dragSrcId);
  const tgtIdx = state.stops.findIndex((s) => s.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  // Swap positions
  const reordered = [...state.stops];
  const [moved]   = reordered.splice(srcIdx, 1);
  reordered.splice(tgtIdx, 0, moved);

  state.stops = reordered;
  calculateArrivalTimes(state.stops, state.startPoint, state.tripStartTime);
  renderStopList(state.stops);
  renderPolyline(state.stops, state.startPoint);
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".stop-card").forEach((c) =>
    c.classList.remove("drag-over")
  );
  dragSrcId = null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimeout = null;

/**
 * @param {string} message
 * @param {number} [durationMs=3000]
 * @param {'info'|'error'|'success'} [type='info']
 */
function showToast(message, durationMs = 3000, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "visible";
  if (type === "error")   toast.classList.add("toast-error");
  if (type === "success") toast.classList.add("toast-success");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.className = "";
    toast.textContent = "";
  }, durationMs);
}

// ─── Share URL ────────────────────────────────────────────────────────────────

function encodeShareUrl() {
  if (!state.startPoint || state.stops.length === 0) return null;

  const params = new URLSearchParams({
    slat:      state.startPoint.lat,
    slng:      state.startPoint.lng,
    stops:     JSON.stringify(state.stops.map((s) => [s.lat, s.lng, s.label])),
    litOnly:   state.filters.litOnly  ? "1" : "0",
    avoidRain: state.filters.avoidRain ? "1" : "0",
    start:     state.tripStartTime.toISOString(),
  });

  return `${location.origin}${location.pathname}?${params}`;
}

/**
 * Parses and restores route state from the URL on page load.
 * @returns {boolean} true if state was restored
 */
async function decodeShareUrl() {
  try {
    const params = new URLSearchParams(location.search);
    if (!params.has("slat") || !params.has("slng") || !params.has("stops")) {
      return false;
    }

    const slat = parseFloat(params.get("slat"));
    const slng = parseFloat(params.get("slng"));
    if (!isFinite(slat) || !isFinite(slng)) return false;

    const rawStops = JSON.parse(params.get("stops"));
    if (!Array.isArray(rawStops) || rawStops.length === 0) return false;

    const litOnly   = params.get("litOnly")   === "1";
    const avoidRain = params.get("avoidRain") === "1";
    const startISO  = params.get("start");
    const tripStart = startISO ? new Date(startISO) : new Date();

    setStartPoint(slat, slng);
    state.tripStartTime = tripStart;
    state.filters.litOnly   = litOnly;
    state.filters.avoidRain = avoidRain;

    // Reconstruct stops from URL
    const stops = rawStops.map(([lat, lng, label], i) => ({
      id:          `stop-${i}`,
      label:       label || `Stop ${i + 1}`,
      lat:         parseFloat(lat),
      lng:         parseFloat(lng),
      osmTags:     {},
      arrivalTime: new Date(),
      storyId:     null,
    }));

    calculateArrivalTimes(stops, { lat: slat, lng: slng }, tripStart);
    assignStories(stops);

    await fetchWeather(slat, slng, stops);

    state.stops = stops;

    // Sync filter checkboxes
    document.getElementById("filter-lit").checked  = litOnly;
    document.getElementById("filter-rain").checked = avoidRain;
    document.getElementById("trip-start").value    =
      `${String(tripStart.getHours()).padStart(2,"0")}:${String(tripStart.getMinutes()).padStart(2,"0")}`;

    renderStopList(state.stops);
    renderPolyline(state.stops, state.startPoint);
    updateActiveFiltersBar();
    document.getElementById("btn-optimize").disabled = false;

    showToast("Shared route restored! 🎃", 3000, "success");
    return true;
  } catch (err) {
    console.warn("[TrickorTreat] Could not decode share URL:", err);
    return false;
  }
}

async function handleShareClick() {
  const url = encodeShareUrl();
  if (!url) {
    showToast("Generate a route first before sharing.", 3000, "error");
    return;
  }

  state.shareUrl = url;

  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied! 🔗 Share away!", 3000, "success");
  } catch {
    // Clipboard API unavailable — show the URL for manual copy
    const existingInput = document.getElementById("share-url-input");
    if (existingInput) existingInput.remove();

    const input = document.createElement("input");
    input.id        = "share-url-input";
    input.type      = "text";
    input.value     = url;
    input.readOnly  = true;
    input.setAttribute("aria-label", "Share URL — copy this link");
    document.getElementById("share-bar").appendChild(input);
    input.select();
    showToast("Copy the URL below to share your route.", 4000, "info");
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

function attachEventListeners() {
  document.getElementById("btn-locate").addEventListener("click", handleLocateClick);

  document.getElementById("btn-generate").addEventListener("click", generateRoute);

  document.getElementById("btn-optimize").addEventListener("click", () => {
    if (!state.startPoint || state.stops.length === 0) return;
    const ordered = nearestNeighbor(state.startPoint, state.stops);
    calculateArrivalTimes(ordered, state.startPoint, state.tripStartTime);
    state.stops = ordered;
    renderStopList(state.stops);
    renderPolyline(state.stops, state.startPoint);
    showToast("Route optimized! ⚡", 2000, "success");
  });

  document.getElementById("filter-lit").addEventListener("change", (e) => {
    state.filters.litOnly = e.target.checked;
    applyFilters();
  });

  document.getElementById("filter-rain").addEventListener("change", (e) => {
    state.filters.avoidRain = e.target.checked;
    applyFilters();
  });

  document.getElementById("trip-start").addEventListener("change", (e) => {
    const [hours, minutes] = e.target.value.split(":").map(Number);
    state.tripStartTime.setHours(hours, minutes, 0, 0);
    if (state.stops.length > 0) {
      calculateArrivalTimes(state.stops, state.startPoint, state.tripStartTime);
      renderStopList(state.stops);
    }
  });

  document.getElementById("btn-print").addEventListener("click", () => {
    window.print();
  });

  document.getElementById("btn-share").addEventListener("click", handleShareClick);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  await loadStories();
  initMap();
  attachEventListeners();

  // Attempt to restore from share URL
  if (location.search) {
    await decodeShareUrl();
  }
}

init();
