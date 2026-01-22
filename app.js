/***********************
 * PPGIS Urban Mapper
 * - Select location via CENTER crosshair (map center)
 * - Submit survey => GeoJSON Feature
 * - Store in localStorage
 * - Export GeoJSON + CSV
 ************************/

const STORAGE_KEY = "ppgis_urban_mapper_v1";

const $ = (sel) => document.querySelector(sel);
const form = $("#surveyForm");
const listEl = $("#list");
const countEl = $("#count");

const likeEl = $("#like");
const safeEl = $("#safe");
const stressEl = $("#stress");
const likeVal = $("#likeVal");
const safeVal = $("#safeVal");
const stressVal = $("#stressVal");

const centerLatEl = $("#centerLat");
const centerLngEl = $("#centerLng");

function setRangeUI() {
  likeVal.textContent = likeEl.value;
  safeVal.textContent = safeEl.value;
  stressVal.textContent = stressEl.value;
}
[likeEl, safeEl, stressEl].forEach((r) => r.addEventListener("input", setRangeUI));
setRangeUI();

// --- Data model: GeoJSON FeatureCollection
function loadFeatureCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { type: "FeatureCollection", features: [] };
    const parsed = JSON.parse(raw);
    if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) return parsed;
  } catch {}
  return { type: "FeatureCollection", features: [] };
}

function saveFeatureCollection(fc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fc));
}

let featureCollection = loadFeatureCollection();

// --- Leaflet map
const map = L.map("map", { zoomControl: true }).setView([47.076420, 15.436907], 12); // default Graz
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// Center-selected location (crosshair)
let selectedLatLng = map.getCenter();
let draftMarker = null;

// Layer for saved markers
const markersLayer = L.layerGroup().addTo(map);

function fmt(n) {
  return Number(n).toFixed(5);
}

// Keep selectedLatLng synced to map center (crosshair)
let rafPending = false;
function syncCenterSelection() {
  const c = map.getCenter();
  selectedLatLng = c;

  if (centerLatEl) centerLatEl.textContent = fmt(c.lat);
  if (centerLngEl) centerLngEl.textContent = fmt(c.lng);

  // Optional subtle marker at center (helps user notice selection)
  if (!draftMarker) {
    draftMarker = L.circleMarker(c, {
      radius: 10,
      color: "#7aa2ff",
      weight: 2,
      fillColor: "#7aa2ff",
      fillOpacity: 0.12
    }).addTo(map);
  } else {
    draftMarker.setLatLng(c);
  }
}

function scheduleSync() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    syncCenterSelection();
  });
}

// Update continuously while moving (smooth) + ensure final update
map.on("move", scheduleSync);
map.on("moveend", syncCenterSelection);
map.on("zoomend", syncCenterSelection);
syncCenterSelection();

// Center map on user location (optional)
$("#btnCenterMe").addEventListener("click", async () => {
  if (!navigator.geolocation) return alert("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      syncCenterSelection();
    },
    () => alert("Could not get your location (permission denied?).")
  );
});

// --- Helpers
function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now()) + Math.random().toString(16).slice(2);
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function popupHTML(f) {
  const p = f.properties;
  return `
    <div style="min-width:220px">
      <div style="font-weight:800;margin-bottom:6px">${escapeHTML(p.placeName || "Unnamed place")}</div>
      <div style="font-size:12px;opacity:.9;margin-bottom:8px">
        Happiness: <b>${p.like}</b> • Green: <b>${p.safe}</b> • Stress: <b>${p.stress}</b>
      </div>
      ${p.comment ? `<div style="font-size:12px;white-space:pre-wrap">${escapeHTML(p.comment)}</div>` : ""}
      <div style="font-size:11px;opacity:.8;margin-top:8px">${new Date(p.timestamp).toLocaleString()}</div>
    </div>
  `;
}

// --- Rendering map markers
function renderMarkers() {
  markersLayer.clearLayers();

  featureCollection.features.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;

    const marker = L.circleMarker([lat, lng], {
      radius: 7,
      color: "#ff9500",
      fillColor: "#ff9500",
      fillOpacity: 0.75,
      weight: 2
    }).bindPopup(popupHTML(f));

    marker.addTo(markersLayer);
  });
}

// --- Rendering sidebar list
function renderList() {
  const n = featureCollection.features.length;
  countEl.textContent = `${n} point${n === 1 ? "" : "s"}`;
  listEl.innerHTML = "";

  // newest first
  const features = [...featureCollection.features].sort(
    (a, b) => b.properties.timestamp - a.properties.timestamp
  );

  for (const f of features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="cardTitle">${escapeHTML(p.placeName || "Unnamed place")}</div>
      <div class="cardMeta">
        ${lat.toFixed(5)}, ${lng.toFixed(5)}<br/>
        Happiness: ${p.like} • Green: ${p.safe} • Stress: ${p.stress}
        ${p.comment ? `<div style="margin-top:6px">${escapeHTML(p.comment)}</div>` : ""}
      </div>
      <div class="cardActions">
        <button class="btn" data-action="zoom" data-id="${p.id}">Zoom</button>
        <button class="btn danger" data-action="delete" data-id="${p.id}">Delete</button>
      </div>
    `;

    card.querySelector('[data-action="zoom"]').addEventListener("click", () => {
      map.setView([lat, lng], 16, { animate: true });
      syncCenterSelection();
    });

    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (!confirm("Delete this point?")) return;
      featureCollection.features = featureCollection.features.filter(
        (x) => x.properties.id !== p.id
      );
      saveFeatureCollection(featureCollection);
      renderMarkers();
      renderList();
    });

    listEl.appendChild(card);
  }
}

// --- Submit survey -> add GeoJSON feature (uses map CENTER)
form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Always use center at submit time
  const center = map.getCenter();
  selectedLatLng = center;

  const placeName = $("#placeName").value.trim();
  const like = Number(likeEl.value);
  const safe = Number(safeEl.value);
  const stress = Number(stressEl.value);
  const comment = $("#comment").value.trim();

  const feature = {
    type: "Feature",
    geometry: {
      type: "Point",
      // GeoJSON uses [lng, lat]
      coordinates: [selectedLatLng.lng, selectedLatLng.lat]
    },
    properties: {
      id: uid(),
      timestamp: Date.now(),
      placeName,
      like,
      safe,
      stress,
      comment
    }
  };

  featureCollection.features.push(feature);
  saveFeatureCollection(featureCollection);

  // Reset some fields
  $("#placeName").value = "";
  $("#comment").value = "";

  renderMarkers();
  renderList();
});

// --- Export GeoJSON
$("#btnExportGeoJSON").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: "application/geo+json" });
  downloadBlob(blob, `ppgis-data-${new Date().toISOString().slice(0,10)}.geojson`);
});

// --- Export CSV
$("#btnExportCSV").addEventListener("click", () => {
  const csv = toCSV(featureCollection);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `ppgis-data-${new Date().toISOString().slice(0,10)}.csv`);
});

// --- Clear all
$("#btnClearAll").addEventListener("click", () => {
  if (!confirm("Clear ALL points? This cannot be undone.")) return;
  featureCollection = { type: "FeatureCollection", features: [] };
  saveFeatureCollection(featureCollection);
  renderMarkers();
  renderList();
});

// --- Download helper
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- CSV conversion
function toCSV(fc) {
  const headers = [
    "id","timestamp","placeName","lat","lng","like","safe","stress","comment"
  ];

  const rows = fc.features.map((f) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;

    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    return [
      esc(p.id),
      esc(new Date(p.timestamp).toISOString()),
      esc(p.placeName),
      esc(lat),
      esc(lng),
      esc(p.like),
      esc(p.safe),
      esc(p.stress),
      esc(p.comment)
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// --- Initial render
renderMarkers();
renderList();

// If existing points exist, fit bounds
if (featureCollection.features.length > 0) {
  const latlngs = featureCollection.features.map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return [lat, lng];
  });
  const bounds = L.latLngBounds(latlngs);
  map.fitBounds(bounds.pad(0.2));
  syncCenterSelection();
}
