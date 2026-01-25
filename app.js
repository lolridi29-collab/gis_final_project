/***********************
 * Urban Happiness Mapper
 * Leaflet + Supabase
 *
 * This application allows users to participate in urban happiness surveys by:
 * - Choosing a location via the map center
 * - Rating happiness and green space quality
 * - Collecting demographic information
 * - Showing feedback after submission
 ************************/

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    console.error(err);
    alert(err?.message || "App failed to start. Check console.");
  });
});

async function boot() {
  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const fmt = (n) => Number(n).toFixed(5);

  const DEFAULT_CENTER = [47.07642, 15.436907];

  // ---------- Validate Leaflet ----------
  if (!window.L) throw new Error("Leaflet not loaded. Check leaflet.js include.");

  // ---------- Map ----------
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

  const draftLayer = L.layerGroup().addTo(map);

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
  const supabaseUrl = "https://fxlskilssvhnatnkeyjk.supabase.co";
  const supabaseKey = "sb_publishable_5tLqrEAMedhEg04I0ZZ4-A_H2CKvjZf";
  const supabase = window.supabase?.createClient
    ? window.supabase.createClient(supabaseUrl, supabaseKey)
    : null;

  // ---------- UI Elements ----------
  const form = $("#surveyForm");
  const happyEl = $("#happy");
  const greeenEl = $("#greeen");
  const happyInline = $("#happyInline");
  const greeenInline = $("#greeenInline");
  const ageGroupEl = $("#ageGroup");
  const genderEl = $("#gender");
  const btnCenterMe = $("#btnCenterMeMap");
  const btnSubmit = $("#btnSubmit");
  const submitNotice = $("#submitNotice");
  const submitLabel = btnSubmit?.textContent || "Submit point";

  const statusText = $("#statusText");
  const statusDot = $("#statusDot");
  const modalTriggers = document.querySelectorAll("[data-modal-open]");

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  modalTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const id = trigger.getAttribute("data-modal-open");
      openModal(document.getElementById(id));
    });
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest("[data-modal-close]");
    if (!target) return;
    const modal = target.closest(".modal");
    closeModal(modal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const modal = document.querySelector(".modal.is-open");
    closeModal(modal);
  });

  function setStatus(state, text) {
    if (statusDot) statusDot.dataset.state = state;
    if (statusText) statusText.textContent = text;
  }

  let baseStatus = { state: "warn", text: "Connecting..." };
  let statusTimer = null;

  function setBaseStatus(state, text) {
    baseStatus = { state, text };
    setStatus(state, text);
  }

  function flashStatus(state, text, duration = 2600) {
    setStatus(state, text);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      setStatus(baseStatus.state, baseStatus.text);
    }, duration);
  }

  let noticeTimer = null;
  function showSubmitNotice(message, tone = "ok") {
    if (!submitNotice) return;
    submitNotice.textContent = message;
    submitNotice.dataset.tone = tone;
    submitNotice.classList.add("visible");
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      submitNotice.classList.remove("visible");
    }, 4200);
  }

  if (!supabase) {
    setBaseStatus("error", "Data service unavailable");
    if (btnSubmit) btnSubmit.disabled = true;
  } else {
    setBaseStatus("ok", "Ready to submit");
  }

  // Range UI
  function setRangeUI() {
    if (happyEl && happyInline) happyInline.textContent = `${happyEl.value} / 5`;
    if (greeenEl && greeenInline) greeenInline.textContent = `${greeenEl.value} / 5`;
  }
  [happyEl, greeenEl]
    .filter(Boolean)
    .forEach((r) => r.addEventListener("input", setRangeUI));
  setRangeUI();

  // No stepper flow in the simplified form.

  function setInvalid(el, isInvalid) {
    if (!el) return;
    el.classList.toggle("is-invalid", isInvalid);
  }

  ageGroupEl?.addEventListener("change", () => setInvalid(ageGroupEl, false));
  genderEl?.addEventListener("change", () => setInvalid(genderEl, false));

  // ---------- Form submit ----------
  let isSubmitting = false;

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!supabase) {
      flashStatus("error", "Data service unavailable");
      showSubmitNotice("We could not submit right now. Please try again later.", "warn");
      return;
    }

    const center = map.getCenter();
    const placeName = ($("#placeName")?.value || "").trim();
    const happy = happyEl ? Number(happyEl.value) : 3;
    const greeen = greeenEl ? Number(greeenEl.value) : 3;
    const comment = ($("#comment")?.value || "").trim();
    const age_group = ageGroupEl?.value || "";
    const gender = genderEl?.value || "";

    const ageInvalid = !age_group;
    const genderInvalid = !gender;
    setInvalid(ageGroupEl, ageInvalid);
    setInvalid(genderEl, genderInvalid);

    if (ageInvalid || genderInvalid) {
      flashStatus("warn", "Select age group and gender (or choose Prefer not to say).");
      return;
    }

    const payload = {
      placeName,
      lat: center.lat,
      lng: center.lng,
      happy,
      greeen,
      comment,
      age_group,
      gender,
    };

    isSubmitting = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Saving...";
    }

    try {
      const { error } = await supabase.from("submissions").insert([payload]);
      if (error) throw error;

      flashStatus("ok", "Submission saved");
      showSubmitNotice("Thanks! Your response is saved.");
      if ($("#placeName")) $("#placeName").value = "";
      if ($("#comment")) $("#comment").value = "";
    } catch (err) {
      console.error(err);
      flashStatus("error", "Submission failed");
      showSubmitNotice("We could not submit right now. Please try again.", "warn");
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Submitted!";
        setTimeout(() => {
          btnSubmit.textContent = submitLabel;
        }, 1600);
      }
      isSubmitting = false;
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSubmit();
  });

  // ---------- Center me ----------
  btnCenterMe?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      flashStatus("warn", "Geolocation not supported by this browser.");
      return;
    }

    const originalLabel = btnCenterMe.textContent;
    btnCenterMe.disabled = true;
    btnCenterMe.textContent = "Locating...";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true });
        syncCenterSelection();
        btnCenterMe.disabled = false;
        btnCenterMe.textContent = originalLabel;
      },
      () => {
        flashStatus("warn", "Could not get your location (permission denied?).");
        btnCenterMe.disabled = false;
        btnCenterMe.textContent = originalLabel;
      }
    );
  });
}
