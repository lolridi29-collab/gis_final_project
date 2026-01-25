/***********************
 * Urban Happiness Mapper - Points Viewer
 ************************/

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    console.error(err);
    alert(err?.message || "Viewer failed to start. Check console.");
  });
});

async function boot() {
  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[c]);
  const toNumber = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const DEFAULT_CENTER = [47.07642, 15.436907];
  const MAX_REMOTE_ROWS = 300;
  const HAPPY_COLORS = ["#d1495b", "#f08a4b", "#f2c14e", "#7fd1ae", "#2a9d8f"];

  if (!window.L) throw new Error("Leaflet not loaded. Check leaflet.js include.");

  const mapEl = $("#map");
  if (!mapEl) throw new Error("Missing #map element.");

  const map = L.map("map", { zoomControl: true }).setView(DEFAULT_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const northArrow = L.control({ position: "topright" });
  northArrow.onAdd = () => {
    const div = L.DomUtil.create("div", "northArrow leaflet-control");
    div.innerHTML = "<span>N</span>";
    return div;
  };
  northArrow.addTo(map);

  L.control
    .scale({ position: "bottomright", imperial: false })
    .addTo(map);

  const refreshMapSize = () => map.invalidateSize();
  requestAnimationFrame(refreshMapSize);
  window.addEventListener("load", refreshMapSize);
  window.addEventListener("resize", () => setTimeout(refreshMapSize, 50));

  const mq = window.matchMedia("(max-width: 900px)");
  mq.addEventListener?.("change", () => setTimeout(refreshMapSize, 80));

  const markersLayer = L.layerGroup().addTo(map);

  const supabaseUrl = "https://fxlskilssvhnatnkeyjk.supabase.co";
  const supabaseKey = "sb_publishable_5tLqrEAMedhEg04I0ZZ4-A_H2CKvjZf";
  const supabase = window.supabase?.createClient
    ? window.supabase.createClient(supabaseUrl, supabaseKey)
    : null;

  const listEl = $("#list");
  const countEl = $("#count");
  const emptyStateEl = $("#emptyState");
  const btnRefresh = $("#btnRefresh");
  const statusText = $("#statusText");
  const statusDot = $("#statusDot");
  const lastSyncEl = $("#lastSync");
  const statTotal = $("#statTotal");
  const statAvgHappy = $("#statAvgHappy");
  const statAvgGreen = $("#statAvgGreen");

  if (!supabase && btnRefresh) btnRefresh.disabled = true;

  function setStatus(state, text) {
    if (statusDot) statusDot.dataset.state = state;
    if (statusText) statusText.textContent = text;
  }

  function markerStyle(row) {
    const happy = clamp(toNumber(row.happy, 3), 1, 5);
    const green = clamp(toNumber(row.greeen, 3), 1, 5);
    const color = HAPPY_COLORS[happy - 1] || HAPPY_COLORS[2];
    const radius = 5.5 + (green - 1) * 1.5;

    return {
      radius,
      color,
      fillColor: color,
      fillOpacity: 0.8,
      weight: 2,
    };
  }

  function formatTimestamp(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString();
  }

  function popupHTML(row) {
    const meta = [];
    if (row.age_group) meta.push(`Age: ${escapeHTML(row.age_group)}`);
    if (row.gender) meta.push(`Gender: ${escapeHTML(row.gender)}`);

    return `
      <div style="min-width:220px">
        <div style="font-weight:800;margin-bottom:6px">${escapeHTML(row.placeName || "Unnamed place")}</div>
        <div style="font-size:12px;opacity:.9;margin-bottom:8px">
          Happiness: <b>${escapeHTML(row.happy)}</b> &bull; Green: <b>${escapeHTML(row.greeen)}</b>
        </div>
        ${meta.length ? `<div style="font-size:11px;margin-bottom:6px">${meta.join(" &bull; ")}</div>` : ""}
        ${row.comment ? `<div style="font-size:12px;white-space:pre-wrap">${escapeHTML(row.comment)}</div>` : ""}
        <div style="font-size:11px;opacity:.8;margin-top:8px">${formatTimestamp(row.timestamp)}</div>
      </div>
    `;
  }

  function renderMarkers(rows) {
    markersLayer.clearLayers();
    for (const row of rows) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      L.circleMarker([lat, lng], markerStyle(row))
        .bindPopup(popupHTML(row))
        .addTo(markersLayer);
    }
  }

  function renderList(rows) {
    if (!listEl || !countEl) return;
    countEl.textContent = `${rows.length} point${rows.length === 1 ? "" : "s"}`;
    listEl.innerHTML = "";
    if (emptyStateEl) emptyStateEl.style.display = rows.length ? "none" : "block";

    for (const row of rows) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="cardHeader">
          <div>
            <div class="cardTitle">${escapeHTML(row.placeName || "Unnamed place")}</div>
            <div class="cardMeta">
              ${Number.isFinite(lat) ? lat.toFixed(5) : "--"}, ${Number.isFinite(lng) ? lng.toFixed(5) : "--"} &bull;
              ${formatTimestamp(row.timestamp)}
            </div>
          </div>
        </div>
        <div class="cardRatings">
          <span class="rating">H ${escapeHTML(row.happy)}</span>
          <span class="rating">G ${escapeHTML(row.greeen)}</span>
        </div>
        ${row.comment ? `<div class="cardComment">${escapeHTML(row.comment)}</div>` : ""}
        ${row.age_group || row.gender ? `<div class="cardMeta">Age: ${escapeHTML(row.age_group || "--")} &bull; Gender: ${escapeHTML(row.gender || "--")}</div>` : ""}
        <div class="cardActions">
          <button class="btn" data-action="zoom">Zoom</button>
        </div>
      `;

      card.querySelector('[data-action="zoom"]')?.addEventListener("click", () => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
        }
      });

      listEl.appendChild(card);
    }
  }

  function updateStats(rows) {
    if (statTotal) statTotal.textContent = rows.length;

    const avg = (key) => {
      const values = rows
        .map((row) => toNumber(row[key], null))
        .filter((value) => Number.isFinite(value));
      if (!values.length) return "--";
      const sum = values.reduce((acc, value) => acc + value, 0);
      return `${(sum / values.length).toFixed(1)} / 5`;
    };

    if (statAvgHappy) statAvgHappy.textContent = avg("happy");
    if (statAvgGreen) statAvgGreen.textContent = avg("greeen");
  }

  function fitToRows(rows) {
    const latlngs = rows
      .map((row) => [Number(row.lat), Number(row.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (latlngs.length) {
      map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
    }
  }

  async function loadRows({ fit = false } = {}) {
    if (!supabase) {
      setStatus("error", "Data service unavailable");
      return;
    }

    setStatus("loading", "Loading points...");

    const { data, error } = await supabase
      .from("submissions")
      .select("id,timestamp,placeName,lat,lng,happy,greeen,comment,age_group,gender")
      .order("timestamp", { ascending: false })
      .limit(MAX_REMOTE_ROWS);

    if (error) {
      console.error(error);
      setStatus("error", "Could not load data");
      return;
    }

    const rows = data || [];
    renderMarkers(rows);
    renderList(rows);
    updateStats(rows);

    if (lastSyncEl) lastSyncEl.textContent = new Date().toLocaleTimeString();
    setStatus("ok", "Live data connected");

    if (fit) fitToRows(rows);
  }

  btnRefresh?.addEventListener("click", () => loadRows());

  if (supabase) {
    setStatus("loading", "Connecting...");
    await loadRows({ fit: true });
  } else {
    setStatus("error", "Data service unavailable");
  }
}
