/***********************
 * Urban Happiness Mapper
 * Leaflet + Supabase
 ************************/

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    console.error(err);
    alert(err?.message || "App failed to start. Check console.");
  });
});

async function boot() {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[c]);

  const fmt = (n) => Number(n).toFixed(5);

  // ---------- Validate Leaflet ----------
  if (!window.L) throw new Error("Leaflet not loaded. Check leaflet.js include.");

  // ---------- Map FIRST (so it shows even if Supabase fails) ----------
  const mapEl = $("#map");
  if (!mapEl) throw new Error("Missing #map element.");

  const map = L.map("map", { zoomControl: true }).setView([47.07642, 15.436907], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // After map + tile layer
const refreshMapSize = () => map.invalidateSize();

requestAnimationFrame(refreshMapSize);
window.addEventListener("load", refreshMapSize);
window.addEventListener("resize", () => setTimeout(refreshMapSize, 50));

// When switching into/out of the mobile breakpoint, force a repaint
const mq = window.matchMedia("(max-width: 900px)");
mq.addEventListener?.("change", () => setTimeout(refreshMapSize, 80));


  const draftLayer = L.layerGroup().addTo(map);
  const markersLayer = L.layerGroup().addTo(map);

  // Center HUD + draft marker
  const centerLatEl = $("#centerLat");
  const centerLngEl = $("#centerLng");
  let draftMarker = null;
  let rafPending = false;

  function syncCenterSelection() {
    const c = map.getCenter();
    if (centerLatEl) centerLatEl.textContent = fmt(c.lat);
    if (centerLngEl) centerLngEl.textContent = fmt(c.lng);

    if (!draftMarker) {
      draftMarker = L.circleMarker(c, {
        radius: 10,
        color: "#7aa2ff",
        weight: 2,
        fillColor: "#7aa2ff",
        fillOpacity: 0.12,
      }).addTo(draftLayer);
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

  map.on("move", scheduleSync);
  map.on("moveend", syncCenterSelection);
  map.on("zoomend", syncCenterSelection);
  syncCenterSelection();

  // ---------- Supabase ----------
  if (!window.supabase?.createClient) {
    // Map still works without Supabase; just warn.
    console.warn("Supabase not loaded. Check supabase-js include.");
  }

  const supabaseUrl = "https://fxlskilssvhnatnkeyjk.supabase.co";
  const supabaseKey = "sb_publishable_5tLqrEAMedhEg04I0ZZ4-A_H2CKvjZf";
  const supabase = window.supabase?.createClient
    ? window.supabase.createClient(supabaseUrl, supabaseKey)
    : null;

  // ---------- UI Elements ----------
  const form = $("#surveyForm");
  const listEl = $("#list");
  const countEl = $("#count");

  const happyEl = $("#happy");
  const greeenEl = $("#greeen");
  const happyVal = $("#happyVal");
  const greeenVal = $("#greeenVal");

  const btnCenterMe = $("#btnCenterMe");
  const btnFinishSurvey = $("#btnFinishSurvey");
  const btnSubmit = $("#btnSubmit");

  // Range UI (guarded so missing elements don't kill the map)
  function setRangeUI() {
    if (happyEl && happyVal) happyVal.textContent = happyEl.value;
    if (greeenEl && greeenVal) greeenVal.textContent = greeenEl.value;
  }
  [happyEl, greeenEl].filter(Boolean).forEach((r) => r.addEventListener("input", setRangeUI));
  setRangeUI();

  // ---------- Data state ----------
  let rows = [];

function popupHTML(row) {
  return `
    <div style="min-width:220px">
      <div style="font-weight:800;margin-bottom:6px">${escapeHTML(row.placeName || "Unnamed place")}</div>
      <div style="font-size:12px;opacity:.9;margin-bottom:8px">
        Happiness: <b>${escapeHTML(row.happy)}</b> • Green: <b>${escapeHTML(row.greeen)}</b>
      </div>
      ${row.comment ? `<div style="font-size:12px;white-space:pre-wrap">${escapeHTML(row.comment)}</div>` : ""}
      <div style="font-size:11px;opacity:.8;margin-top:8px">${new Date(row.timestamp).toLocaleString()}</div>
    </div>
  `;
}

  function renderMarkers() {
    markersLayer.clearLayers();
    for (const row of rows) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      L.circleMarker([lat, lng], {
        radius: 7,
        color: "#ff9500",
        fillColor: "#ff9500",
        fillOpacity: 0.75,
        weight: 2,
      })
        .bindPopup(popupHTML(row))
        .addTo(markersLayer);
    }
  }

  function renderList() {
    if (!listEl || !countEl) return;

    const n = rows.length;
    countEl.textContent = `${n} point${n === 1 ? "" : "s"}`;
    listEl.innerHTML = "";

    for (const row of rows) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="cardTitle">${escapeHTML(row.placeName || "Unnamed place")}</div>
        <div class="cardMeta">
          ${Number.isFinite(lat) ? lat.toFixed(5) : "--"}, ${Number.isFinite(lng) ? lng.toFixed(5) : "--"}<br/>
          Happiness: ${escapeHTML(row.happy)} • Green: ${escapeHTML(row.greeen)}
          ${row.comment ? `<div style="margin-top:6px">${escapeHTML(row.comment)}</div>` : ""}
        </div>
        <div class="cardActions">
          <button class="btn" data-action="zoom">Zoom</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>
      `;

      card.querySelector('[data-action="zoom"]').addEventListener("click", () => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          map.setView([lat, lng], 16, { animate: true });
          syncCenterSelection();
        }
      });

      card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        if (!confirm("Delete this point?")) return;

        try {
          // Delete from Supabase
          if (supabase) {
            const { error } = await supabase.from("submissions").delete().eq("id", row.id);
            if (error) throw error;
          }
          
          // Remove from local session data
          const index = rows.findIndex(r => r.id === row.id);
          if (index > -1) {
            rows.splice(index, 1);
          }
          
          renderMarkers();
          renderList();
        } catch (err) {
          console.error(err);
          alert("Delete failed: " + (err?.message || String(err)));
        }
      });

      listEl.appendChild(card);
    }
  }

  async function reload({ fit = false } = {}) {
    // For session-based surveys, we don't load existing data
    // Only show points submitted in this session
    renderMarkers();
    renderList();

    if (fit && rows.length > 0) {
      const latlngs = rows
        .map((r) => [Number(r.lat), Number(r.lng)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      if (latlngs.length) {
        map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
      }
    }
  }

  // ---------- Form submit ----------
  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      if (!supabase) return alert("Supabase not available.");

      const center = map.getCenter();

      const placeName = ($("#placeName")?.value || "").trim();
      const happy = happyEl ? Number(happyEl.value) : 3;
      const greeen = greeenEl ? Number(greeenEl.value) : 3;
      const comment = ($("#comment")?.value || "").trim();
      const age_group = $("#ageGroup")?.value || "";
      const gender = $("#gender")?.value || "";

      try {
        const { data, error } = await supabase.from("submissions").insert([
          {
            placeName,
            lat: center.lat,
            lng: center.lng,
            happy,
            greeen,
            comment,
            age_group,
            gender,
          },
        ]);
        if (error) throw error;

        // Add to local session data for immediate display
        const newRow = {
          id: data?.[0]?.id || Date.now(), // Use returned ID or fallback
          timestamp: new Date().toISOString(),
          placeName,
          lat: center.lat,
          lng: center.lng,
          happy,
          greeen,
          comment,
          age_group,
          gender,
        };
        rows.unshift(newRow); // Add to beginning of array

        if ($("#placeName")) $("#placeName").value = "";
        if ($("#comment")) $("#comment").value = "";

        renderMarkers();
        renderList();
      } catch (err) {
        console.error(err);
        alert("Error saving submission: " + (err?.message || String(err)));
      }
    });
  }

  // ---------- Center me ----------
  btnCenterMe?.addEventListener("click", () => {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        syncCenterSelection();
      },
      () => alert("Could not get your location (permission denied?).")
    );
  });

  // ---------- Export CSV ----------
function toCSV(data) {
  const headers = ["id","timestamp","placeName","lat","lng","happy","greeen","comment","age_group","gender"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const lines = (data ?? []).map((r) =>
    [
      esc(r.id),
      esc(new Date(r.timestamp).toISOString()),
      esc(r.placeName),
      esc(r.lat),
      esc(r.lng),
      esc(r.happy),
      esc(r.greeen),
      esc(r.comment),
      esc(r.age_group),
      esc(r.gender),
    ].join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

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

  btnFinishSurvey?.addEventListener("click", () => {
    // Export CSV data
    const csv = toCSV(rows);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `ppgis-data-${new Date().toISOString().slice(0, 10)}.csv`
    );

    // Reset the map and clear all data
    rows = [];
    markersLayer.clearLayers();
    renderList();
    
    // Reset map view to initial position
    map.setView([47.07642, 15.436907], 12);
    syncCenterSelection();
  });

  // ---------- Initial load ----------
  // Start with empty session - no existing data loaded
  renderMarkers();
  renderList();
}
