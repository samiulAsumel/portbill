// platform.js — Cross-cutting platform services: cloud sync (Cloudflare Worker),
// usage analytics, draft auto-save, saved-bills manager, and app bootstrap
// (INIT — runs last). Depends on core.js + admin.js + car.js + cargo.js +
// reexport.js + print.js (all already loaded by the time this file's
// top-level INIT code runs). Printed-invoice building lives in print.js.


document.getElementById("year").textContent = new Date().getFullYear();
globalThis.scrollTo(0, 0);
try {
  history.scrollRestoration = "manual";
} catch (e) {
  dbg.warn("scrollRestoration unsupported:", e);
}

// Native <dialog> event wiring
const overlay = document.getElementById("overlay");
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
overlay.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});

// Tab keyboard navigation (arrow keys)
document.querySelector(".module-tabs").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll(".tab-btn:not([hidden])")];
  const idx = tabs.indexOf(document.activeElement);
  if (idx === -1) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    tabs[(idx + 1) % tabs.length].focus();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    tabs[(idx - 1 + tabs.length) % tabs.length].focus();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    document.activeElement.click();
  }
});

const formatDateForInput = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};
const today = new Date();
document.getElementById("cld").value = formatDateForInput(today);
document.getElementById("delivery").value = formatDateForInput(today);
document.getElementById("c-cld").value = formatDateForInput(today);
document.getElementById("c-delivery").value = formatDateForInput(today);
document.getElementById("reexport-reexportDate").value = formatDateForInput(today);


loadSavedRates();
carRefresh();
cargoRefresh();
syncReexportSegUI();
renderBillOfEntries();
reexportRefresh();
isInitialLoad = false;

// Card stagger animations
document.querySelectorAll(".card").forEach((card, i) => {
  card.style.setProperty("--card-delay", `${0.7 + i * 0.1}s`);
});

// Hidden admin access: Ctrl+Shift+Click anywhere
document.addEventListener("mousedown", (e) => {
  if (e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    toggleAdmin();
  }
});

document.addEventListener("click", (e) => {
  const menu = document.getElementById("adminPassMenu");
  const card = document.getElementById("adminPassCard");
  if (!isAdmin || !menu || !card || card.hidden) return;
  if (!menu.contains(e.target)) closeAdminPasswordPanel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAdminPasswordPanel();
});

// Floating particles — decorative CSS positioning only, not security-sensitive
/* eslint-disable sonarjs/pseudo-random -- cosmetic randomness, no security implication */
(function () {
  const container = document.createElement("div");
  container.className = "particle-container";
  document.body.appendChild(container);
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 8}s`;
    p.style.animationDuration = `${6 + Math.random() * 4}s`;
    const sz = 2 + Math.random() * 4;
    p.style.width = sz + "px";
    p.style.height = sz + "px";
    container.appendChild(p);
  }
})();
/* eslint-enable sonarjs/pseudo-random */



// Returns headers for authenticated Worker PUT requests.
// The bearer token is the admin password (never stored — held in memory only).
function putHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (_sessionWriteToken) h['Authorization'] = 'Bearer ' + _sessionWriteToken;
  return h;
}

// Save rotations array to Cloudflare Worker.
// On failure (offline, etc.) the change is flagged pending and retried by
// flushSync() once connectivity returns — see markPending/clearPending in core.js.
async function saveRotationsToWorker(rotationsArr) {
  if (!isAdmin || !_sessionWriteToken) return false;
  try {
    var r = await fetch(PROXY_URL + "/rotations", {
      method: "PUT",
      headers: putHeaders(),
      body: JSON.stringify(rotationsArr)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    clearPending('rotations');
    updateSyncBadge();
    return true;
  } catch (e) {
    dbg.error("saveRotationsToWorker failed:", e.message);
    markPending('rotations');
    updateSyncBadge();
    return false;
  }
}

// Save saved-bills array to Cloudflare Worker.
// Bill saving is not admin-gated — any user can save bills.
// Sends bearer token when in admin mode; Worker accepts both authenticated and open writes.
// On failure the change is flagged pending and retried by flushSync() when back online.
async function saveBillsToWorker(billsArr) {
  try {
    const r = await fetch(PROXY_URL + "/saved-bills", {
      method: "PUT",
      headers: putHeaders(),
      body: JSON.stringify(billsArr),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    clearPending('bills');
    updateSyncBadge();
    return true;
  } catch (e) {
    dbg.error("saveBillsToWorker failed:", e.message);
    markPending('bills');
    updateSyncBadge();
    return false;
  }
}

// Explicitly delete a single bill from the GitHub-stored saved-bills.json via the
// Worker's DELETE /saved-bills endpoint. Admin-only: requires an active admin
// session (isAdmin + _sessionWriteToken), same as the other cloud-write helpers.
// This bypasses the PUT merge safety-net on purpose -- see deleteSavedBill().
async function deleteBillFromWorker(billNumber) {
  if (!isAdmin || !_sessionWriteToken) return false;
  try {
    const r = await fetch(PROXY_URL + "/saved-bills", {
      method: "DELETE",
      headers: putHeaders(),
      body: JSON.stringify({ billNumber }),
    });
    if (!r.ok && r.status !== 404) throw new Error("HTTP " + r.status);
    return true;
  } catch (e) {
    dbg.error("deleteBillFromWorker failed:", e.message);
    return false;
  }
}


// On failure the change is flagged pending and retried by flushSync() when back online.
async function saveConfigToWorker(config) {
  if (!isAdmin || !_sessionWriteToken) return false;
  try {
    const res = await fetch(PROXY_URL + '/config', {
      method: 'PUT',
      headers: putHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    clearPending('config');
    updateSyncBadge();
    return true;
  } catch (e) {
    dbg.warn("saveConfigToWorker failed:", e);
    markPending('config');
    updateSyncBadge();
    return false;
  }
}

// Reflects connection + pending-write state in the header pill (#syncBadge).
// Hidden when online with nothing pending; shows "Offline" or "N unsynced" otherwise.
function updateSyncBadge() {
  const el = document.getElementById('syncBadge');
  if (!el) return;
  const pendingCount = Object.keys(getPending()).length;
  if (!navigator.onLine) {
    el.hidden = false;
    el.textContent = 'Offline';
    el.className = 'hbadge sync-badge sync-offline';
  } else if (pendingCount > 0) {
    el.hidden = false;
    el.textContent = `Syncing ${pendingCount}…`;
    el.className = 'hbadge sync-badge sync-pending';
  } else {
    el.hidden = true;
  }
}

// Re-pushes the current local state of every resource flagged pending in
// pb_sync_pending (see markPending/clearPending in core.js). Whole-state
// last-write-wins: each writer re-sends the full current array/object, so
// there is no delta/op-log to replay — just "is this resource dirty".
async function flushSync() {
  if (!navigator.onLine) return;
  const pending = getPending();
  let syncedCount = 0;
  if (pending.bills) {
    if (await saveBillsToWorker(getSavedBills())) syncedCount++;
  }
  if (pending.rotations && isAdmin && _sessionWriteToken) {
    if (await saveRotationsToWorker(readJsonStorage(ROTATIONS_KEY, []))) syncedCount++;
  }
  if (pending.config && isAdmin && _sessionWriteToken) {
    if (await saveConfigToWorker({ adminPasswordHash: getAdminPasswordHash() })) syncedCount++;
  }
  updateSyncBadge();
  if (syncedCount > 0) {
    showToast(`Synced ${syncedCount} offline change${syncedCount > 1 ? 's' : ''}`, 'success');
  }
}

async function loadConfigFromGitHub() {
  try {
    const res = await fetch(PROXY_URL + '/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg && cfg.adminPasswordHash) {
      _cloudPasswordHash = cfg.adminPasswordHash;
      localStorage.setItem(ADMIN_PASS_STORAGE_KEY, cfg.adminPasswordHash);
    }
  } catch (e) {
    dbg.warn("loadConfigFromGitHub failed, using localStorage:", e);
  }
}

// Load saved-bills from Cloudflare Worker on startup (enables cross-device sync)
async function loadBillsFromWorker() {
  try {
    const r = await fetch(PROXY_URL + "/saved-bills");
    if (r.ok) {
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    }
    throw new Error("HTTP " + r.status);
  } catch (e) {
    dbg.warn("loadBillsFromWorker failed:", e.message);
    return null;
  }
}


// Anonymous per-device counting: a random UUID in localStorage identifies the
// browser (no PII, no cookies). One "open" = one browser session (sessionStorage
// guard, so reloads don't inflate counts). Pings fail silently offline — same
// graceful degradation as the bill sync functions.
const DEVICE_ID_KEY = "pb_device_id";
const TRACKED_FLAG_KEY = "pb_tracked";

function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch (e) {
    dbg.warn("getDeviceId: storage unavailable:", e);
  }
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + "-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("");
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch (e) {
      dbg.warn("getDeviceId: storage unavailable:", e);
    }
  }
  return id;
}

async function trackVisit() {
  try {
    if (sessionStorage.getItem(TRACKED_FLAG_KEY)) return;
    const r = await fetch(PROXY_URL + "/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: getDeviceId() }),
    });
    if (r.ok) sessionStorage.setItem(TRACKED_FLAG_KEY, "1");
  } catch (e) {
    dbg.warn("trackVisit failed:", e.message);
  }
}

// Same-day key computation as the Worker: Asia/Dhaka (UTC+6, no DST)
function statsDayKey(offsetDays) {
  return new Date(Date.now() + (6 * 3600 + offsetDays * 86400) * 1000)
    .toISOString()
    .slice(0, 10);
}

// ─── Analytics: near-real-time polling with a cached, offline-first fallback ──
const STATS_POLL_MS = 30000;
const STATS_REQUEST_TIMEOUT_MS = 12000;
const STATS_CACHE_KEY = "pb_stats_cache";
let _statsTimer = null;
let _statsInFlight = false;
let _statsHasLoaded = false;

const STATS_LIVE_LABELS = { live: "LIVE", offline: "OFFLINE", error: "ERROR" };
function setStatsLiveState(state) {
  // state: "live" | "offline" | "error"
  const badge = document.getElementById("statsLiveBadge");
  if (badge) badge.className = "stats-live-badge stats-live-" + state;
  const label = document.getElementById("statsLiveLabel");
  if (label) label.textContent = STATS_LIVE_LABELS[state] || STATS_LIVE_LABELS.error;
}

function setStatsUpdatedNow() {
  const el = document.getElementById("statsUpdated");
  if (el) el.textContent = "Updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function readStatsCache() {
  return readJsonStorage(STATS_CACHE_KEY, null);
}

// Maps a loadStats() failure to a live-state badge + a user-facing reason.
function classifyStatsError(e) {
  if (e.status === 401) return { state: "error", reason: "Admin session expired — log in again to view analytics." };
  if (e.status === 503) return { state: "error", reason: "Stats database is not configured on the Worker yet." };
  if (!navigator.onLine || e.name === "AbortError") return { state: "offline", reason: "You are offline — showing the last known figures." };
  return { state: "offline", reason: "Analytics temporarily unavailable — showing the last known figures." };
}

function handleStatsError(e, msg) {
  dbg.warn("loadStats failed:", e.message);
  const cached = readStatsCache();
  if (cached) renderStats(cached);
  else document.getElementById("statsGrid")?.classList.remove("stats-loading");
  const { state, reason } = classifyStatsError(e);
  msg.hidden = !!cached;
  msg.textContent = cached ? "" : reason;
  if (cached) showToast(reason, "warning");
  setStatsLiveState(state);
}

// loadStats({ silent: true }) is used by the poller and visibility/online
// listeners — it must never blank out numbers already on screen with a
// "Loading…" message just because a background refresh is in flight.
async function loadStats(opts) {
  const silent = !!(opts && opts.silent);
  const msg = document.getElementById("statsMsg");
  const refreshIcon = document.getElementById("statsRefreshIcon");
  if (!msg) return;
  if (_statsInFlight) return;
  _statsInFlight = true;
  if (refreshIcon) refreshIcon.classList.add("spinning");
  if (!silent) {
    if (!_statsHasLoaded) document.getElementById("statsGrid")?.classList.add("stats-loading");
    msg.hidden = false;
    msg.textContent = "Loading usage data…";
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), STATS_REQUEST_TIMEOUT_MS) : null;
  try {
    const headers = {};
    if (_sessionWriteToken) headers["Authorization"] = "Bearer " + _sessionWriteToken;
    const r = await fetch(PROXY_URL + "/stats?days=30", { headers, signal: controller?.signal });
    if (!r.ok) {
      const err = new Error("HTTP " + r.status);
      err.status = r.status;
      throw err;
    }
    const data = await r.json();
    renderStats(data);
    try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
    msg.hidden = true;
    setStatsLiveState("live");
    setStatsUpdatedNow();
  } catch (e) {
    handleStatsError(e, msg);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    _statsInFlight = false;
    if (refreshIcon) refreshIcon.classList.remove("spinning");
  }
}

function _onStatsVisibilityChange() {
  if (document.visibilityState === "visible" && currentModule === "stats") loadStats({ silent: true });
}

function startStatsAutoRefresh() {
  stopStatsAutoRefresh();
  document.addEventListener("visibilitychange", _onStatsVisibilityChange);
  _statsTimer = setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) loadStats({ silent: true });
  }, STATS_POLL_MS);
}

function stopStatsAutoRefresh() {
  if (_statsTimer) clearInterval(_statsTimer);
  _statsTimer = null;
  document.removeEventListener("visibilitychange", _onStatsVisibilityChange);
}

function renderStats(s) {
  _statsHasLoaded = true;
  document.getElementById("statsGrid")?.classList.remove("stats-loading");
  const setNum = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = Number(v || 0).toLocaleString("en-US");
  };
  setNum("stTodayU", s.today?.uniques);
  setNum("stTodayO", s.today?.opens);
  setNum("stWeekU", s.last7?.uniques);
  setNum("stWeekO", s.last7?.opens);
  setNum("stMonthU", s.last30?.uniques);
  setNum("stMonthO", s.last30?.opens);
  setNum("stAllU", s.allTime?.uniques);
  setNum("stAllO", s.allTime?.opens);

  const chart = document.getElementById("statsChart");
  if (!chart) return;
  const byDay = {};
  (s.days || []).forEach((d) => {
    byDay[d.day] = d;
  });
  // Fill the last 30 days (zero for days with no visits) so the axis is continuous
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const key = statsDayKey(-i);
    days.push({ key, uniques: byDay[key] ? Number(byDay[key].uniques) || 0 : 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.uniques));
  const W = 600;
  const H = 150;
  const PAD = 4;
  const LBL = 14;
  const bw = (W - PAD * 2) / days.length;
  let bars = "";
  days.forEach((d, i) => {
    const h = Math.max(d.uniques > 0 ? 2 : 0, Math.round(((H - LBL - 8) * d.uniques) / max));
    const x = (PAD + i * bw).toFixed(1);
    const label = escHtml(d.key.slice(8) + "/" + d.key.slice(5, 7));
    bars +=
      `<rect x="${x}" y="${H - LBL - h}" width="${(bw * 0.68).toFixed(1)}" height="${h}" rx="1.5" class="sbar">` +
      `<title>${escHtml(d.key)} — ${d.uniques} unique user(s)</title></rect>`;
    if (i % 5 === 0 || i === days.length - 1) {
      // Anchor edge labels inward so they don't clip outside the viewBox
      const isFirst = i === 0;
      const isLast = i === days.length - 1;
      let anchor = "middle";
      let tx = PAD + i * bw + bw * 0.34;
      if (isFirst) { anchor = "start"; tx = PAD; }
      else if (isLast) { anchor = "end"; tx = W - PAD; }
      bars += `<text x="${tx.toFixed(1)}" y="${H - 2}" class="sbar-x" text-anchor="${anchor}">${label}</text>`;
    }
  });
  chart.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation" focusable="false">` +
    `<line x1="${PAD}" y1="${((H - LBL) / 2).toFixed(1)}" x2="${W - PAD}" y2="${((H - LBL) / 2).toFixed(1)}" class="sbar-grid"/>` +
    `<line x1="${PAD}" y1="${H - LBL - 0.5}" x2="${W - PAD}" y2="${H - LBL - 0.5}" class="sbar-axis"/>` +
    `<text x="${W - PAD}" y="10" class="sbar-max" text-anchor="end">peak ${max}</text>` +
    bars +
    `</svg>`;
}

// ─── STARTUP ────────────────────────────────────────────────────

function applyRotationAccessState() {
  var cldEl = document.getElementById("cld");
  if (cldEl) {
    if (isAdmin) {
      cldEl.removeAttribute("readonly");
      cldEl.classList.remove("cld-locked");
      cldEl.classList.add("ae");
    } else {
      cldEl.setAttribute("readonly", "");
      cldEl.classList.remove("ae");
      cldEl.classList.add("cld-locked");
    }
  }
  updateAdminNavigation();
  toggleRotationRegistry();
}

// ── PWA install banner ────────────────────────────────────────────────────────
(function () {
  // Don't show if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const DISMISS_KEY = 'pb_pwa_install_dismissed';
  const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const recentlyDismissed = () => {
    const ts = Number.parseInt(localStorage.getItem(DISMISS_KEY), 10);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  };

  let deferredPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const closeBtn = document.getElementById('pwaInstallClose');

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (banner && !recentlyDismissed()) {
      // Brief delay so the banner doesn't compete with the page's own
      // entrance animations for attention on first paint.
      setTimeout(() => { banner.hidden = false; }, 600);
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        if (banner) banner.hidden = true;
      });
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      if (banner) banner.hidden = true;
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable — banner just re-shows next load */ }
    });
  }

  // Hide banner once the app is installed
  window.addEventListener('appinstalled', function () {
    if (banner) banner.hidden = true;
    deferredPrompt = null;
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* no-op */ }
  });
}());

// ── Print a saved bill directly without staying in Edit mode ──────────────────
function printSavedBill(billNumber) {
  const all = getSavedBills();
  const record = all.find((b) => b.billNumber === billNumber);
  if (!record) { showToast('Bill not found', 'error'); return; }
  const type = ['cargo', 'reexport'].includes(record.type) ? record.type : 'car';
  editSavedBill(billNumber);
  setTimeout(() => printBill(type), 80);
}

// ── Saved bills search ────────────────────────────────────────────────────────
let _sbCarSearch = '';
let _sbCargoSearch = '';
let _sbReexportSearch = '';
let _sbSearchTimer = null;

function sbSearch(type, q) {
  if (type === 'cargo') _sbCargoSearch = q.trim().toLowerCase();
  else if (type === 'reexport') _sbReexportSearch = q.trim().toLowerCase();
  else _sbCarSearch = q.trim().toLowerCase();
  clearTimeout(_sbSearchTimer);
  _sbSearchTimer = setTimeout(renderSavedBills, 120);
}

// Clears one saved-bills search box (the ✕ button next to it) and re-renders immediately.
function sbClearSearch(type) {
  const ids = { car: 'sbCarSearch', cargo: 'sbCargoSearch', reexport: 'sbReexportSearch' };
  const input = document.getElementById(ids[type]);
  if (input) { input.value = ''; input.focus(); }
  clearTimeout(_sbSearchTimer);
  if (type === 'cargo') _sbCargoSearch = '';
  else if (type === 'reexport') _sbReexportSearch = '';
  else _sbCarSearch = '';
  renderSavedBills();
}

function matchesBillSearch(b, q) {
  if (!q) return true;
  const meta = b.metadata || {};
  const haystack = [
    b.billNumber, b.cld, b.delivery,
    meta.cnfName, meta.blNumber, meta.billEntryNumber,
    b.totalFormatted,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

// ── Draft auto-save ───────────────────────────────────────────────────────────
const DRAFT_TTL = 24 * 60 * 60 * 1000;
const DRAFT_KEYS = { car: 'pb_draft_car', cargo: 'pb_draft_cargo', reexport: 'pb_draft_reexport' };

function saveDraft(type) {
  try {
    const payload = { ts: Date.now(), inputs: billInputSnapshot(type) };
    if (type === 'reexport') payload.reexportBEs = JSON.parse(JSON.stringify(reexportBEs));
    localStorage.setItem(DRAFT_KEYS[type], JSON.stringify(payload));
  } catch (e) {
    dbg.warn(`saveDraft(${type}) failed:`, e);
  }
}

function clearDraft(type) {
  try {
    localStorage.removeItem(DRAFT_KEYS[type]);
  } catch (e) {
    dbg.warn(`clearDraft(${type}) failed:`, e);
  }
}

function getDraft(type) {
  try {
    const raw = localStorage.getItem(DRAFT_KEYS[type]);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.inputs || Date.now() - d.ts > DRAFT_TTL) {
      localStorage.removeItem(DRAFT_KEYS[type]);
      return null;
    }
    return d;
  } catch (e) {
    dbg.warn(`getDraft(${type}) failed:`, e);
    return null;
  }
}

function hasMeaningfulDraft(inputs, type) {
  if (type === 'car') {
    return !!(inputs['car-blNumber'] || inputs['car-cnfName'] ||
              (inputs['car-billEntry'] && inputs['car-billEntry'] !== 'C-'));
  }
  if (type === 'reexport') {
    return !!(inputs['reexport-blNumber'] || inputs['reexport-cnfName']);
  }
  return !!(inputs['c-blNumber'] || inputs['c-cnfName'] ||
            (inputs['c-billEntry'] && inputs['c-billEntry'] !== 'C-'));
}

function restoreFormDraft(type) {
  const draft = getDraft(type);
  if (!draft || !hasMeaningfulDraft(draft.inputs, type)) return;
  const root = document.getElementById(inputRootId(type));
  if (!root) return;
  Object.entries(draft.inputs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
  if (type === 'cargo') {
    cargoRefresh();
  } else if (type === 'reexport') {
    if (Array.isArray(draft.reexportBEs) && draft.reexportBEs.length > 0) {
      reexportBEs = JSON.parse(JSON.stringify(draft.reexportBEs));
    }
    syncReexportFreeTimeVisibility(document.getElementById("reexport-type")?.value === "overside");
    syncReexportSegUI();
    renderBillOfEntries();
    reexportRefresh();
  } else {
    carRefresh();
  }
  showToast('Draft restored from your last session.', 'info');
}

window.addEventListener('online', function() {
  updateSyncBadge();
  flushSync();
  if (currentModule === 'stats') loadStats({ silent: true });
});
window.addEventListener('offline', updateSyncBadge);

document.addEventListener("DOMContentLoaded", async function() {
  updateSyncBadge();
  loadConfigFromGitHub();
  updateAdminNavigation();
  applyRotationAccessState();
  loadRotations();
  trackVisit();
  // Push any offline-made bill changes up first, so the cloud-read below can
  // never overwrite a local bill that hasn't reached the Worker yet.
  await flushSync();
  // Pull saved bills from cloud — cloud is source of truth for cross-device sync.
  // Falls back silently to existing localStorage data when offline or on 404.
  // Skipped when a local bill change is still pending (flushSync above failed,
  // e.g. offline) to avoid clobbering it.
  if (!getPending().bills) {
    loadBillsFromWorker().then(function(bills) {
      if (!Array.isArray(bills)) return;
      localStorage.setItem(SAVED_BILLS_KEY, JSON.stringify(bills));
      if (currentModule === 'saved') renderSavedBills();
    });
  }

  // Restore drafts for both modules after defaults are set
  setTimeout(() => {
    restoreFormDraft('car');
    restoreFormDraft('cargo');
    restoreFormDraft('reexport');
  }, 0);

  // Auto-save draft every 10 seconds
  setInterval(() => {
    saveDraft('car');
    saveDraft('cargo');
    saveDraft('reexport');
  }, 10000);
});

// Patch carReset to also reset rotation state
var _origCarReset = typeof carReset === "function" ? carReset : null;
if (_origCarReset) {
  window.carReset = function() {
    _origCarReset();
    // Reset rotation dropdowns
    _selectedRotation = null;
    var yearSel = document.getElementById("rotYear");
    var numSel = document.getElementById("rotNum");
    var badge = document.getElementById("rotBadge");
    if (yearSel) yearSel.value = "";
    if (numSel) { numSel.innerHTML = '<option value="">Rotation Number</option>'; numSel.disabled = true; }
    if (badge) badge.textContent = "";
    // Remove rotation from bill
    var billBadge = document.getElementById("rot-bill-badge");
    if (billBadge) billBadge.remove();
    // clearDraft('car') already called inside _origCarReset()
  };
}

// Patch carCalculate to add rotation to bill after generation
var _origCarCalculate = typeof carCalculate === "function" ? carCalculate : null;
if (_origCarCalculate) {
  window.carCalculate = function() {
    _origCarCalculate();
    // After bill generation, add rotation info to bill
    setTimeout(refreshRotationInBill, 50);
  };
}



// Switch between Car / GC sub-tabs inside the Saved Bills module
function switchSavedTab(type) {
  const panels = {
    car: document.getElementById("saved-car-panel"),
    cargo: document.getElementById("saved-cargo-panel"),
    reexport: document.getElementById("saved-reexport-panel"),
  };
  const btns = {
    car: document.getElementById("saved-sub-car"),
    cargo: document.getElementById("saved-sub-cargo"),
    reexport: document.getElementById("saved-sub-reexport"),
  };
  const active = panels[type] ? type : "car";
  Object.entries(panels).forEach(([k, el]) => { if (el) el.style.display = k === active ? "" : "none"; });
  Object.entries(btns).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("active", k === active);
    el.setAttribute("aria-selected", String(k === active));
  });
}

// Parse a bill number back into its parts: prefix, datePart (YYYYMMDD), seq
function parseBillNumber(num) {
  if (!num) return null;
  const m = String(num).match(/^([A-Z]+)-(\d{8})(\d{6})$/);
  if (!m) return null;
  return { prefix: m[1], datePart: m[2], seq: parseInt(m[3], 10) };
}

// Stable creation-order comparator for saved bills, keyed off the bill
// number itself (date part, then sequence) rather than savedAt. billNumber
// is assigned once at first-save and never changes on a later edit/re-save
// (saveBill() reuses editingBillNumber[type]), so sorting by it — instead of
// by the mutable savedAt timestamp — keeps each bill's SL/serial position
// fixed no matter how many times it (or any other bill) gets edited and
// saved again. Falls back to a plain string compare for any legacy/malformed
// bill numbers that don't match the CA-/GCA-/RE- pattern.
function compareBillsBySerial(a, b) {
  const pa = parseBillNumber(a.billNumber);
  const pb = parseBillNumber(b.billNumber);
  if (pa && pb) {
    if (pa.datePart !== pb.datePart) return pa.datePart < pb.datePart ? -1 : 1;
    return pa.seq - pb.seq;
  }
  return String(a.billNumber || "").localeCompare(String(b.billNumber || ""));
}

// Re-render Car, GC, and Re-Export saved-bills tables
function renderSavedBills() {
  const carTbody = document.getElementById("savedCarTbody");
  const cargoTbody = document.getElementById("savedCargoTbody");
  const reexportTbody = document.getElementById("savedReexportTbody");
  if (!carTbody || !cargoTbody || !reexportTbody) return;

  const all = getSavedBills();
  // SL is each bill's stable creation-order rank (1 = oldest of that type/date
  // group, keyed off the bill number itself via compareBillsBySerial() above —
  // never off savedAt, and never off row position). withSl() computes that
  // rank ascending, then the list is reversed so the table itself DISPLAYS
  // most-recently-created bills first — SL 1 is the oldest bill and always
  // sits at the bottom of the table, no matter how many times any bill here
  // has been edited/re-saved since.
  function withSl(list) {
    return list.sort(compareBillsBySerial).map((b, i) => Object.assign({}, b, { _sl: i + 1 })).reverse();
  }
  const carBills = withSl(all.filter((b) => b.type !== "cargo" && b.type !== "reexport"));
  const cargoBills = withSl(all.filter((b) => b.type === "cargo"));
  const reexportBills = withSl(all.filter((b) => b.type === "reexport"));

  function setSbCount(id, visible, total, hasQuery) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = hasQuery && total ? `${visible} of ${total}` : '';
  }

  function buildRows(countId, bills, searchQ) {
    const visible = searchQ ? bills.filter((b) => matchesBillSearch(b, searchQ)) : bills;
    setSbCount(countId, visible.length, bills.length, !!searchQ);
    if (!bills.length) {
      return '<tr><td colspan="8" style="text-align:center;color:var(--tx-2);padding:14px;">No saved bills yet</td></tr>';
    }
    if (!visible.length) {
      return '<tr><td colspan="8" style="text-align:center;color:var(--tx-2);padding:14px;">No bills match your search</td></tr>';
    }
    return visible.map((b) => {
      const meta = b.metadata || {};
      const cnf = escHtml(meta.cnfName || "—");
      const bl = escHtml(meta.blNumber || "—");
      const label = cnf !== "—" ? cnf : bl;
      const savedDate = b.savedAt ? new Date(b.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
      const bn = escHtml(JSON.stringify(b.billNumber));
      return `<tr>
        <td>${b._sl}</td>
        <td style="font-variant-numeric:tabular-nums lining-nums;font-family:var(--font-mono)">${escHtml(b.billNumber || "")}</td>
        <td>${escHtml(b.cld || "—")}</td>
        <td>${escHtml(b.delivery || "—")}</td>
        <td>${label}</td>
        <td style="font-variant-numeric:tabular-nums lining-nums">${escHtml(b.totalFormatted || "—")}</td>
        <td>${savedDate}</td>
        <td>
          <div class="sb-actions"><button type="button" class="sb-action-btn sb-edit-btn" onclick="editSavedBill(${bn})">Edit</button>
          <button type="button" class="sb-action-btn sb-print-btn" onclick="printSavedBill(${bn})">Print</button>
          ${isAdmin ? `<button type="button" class="sb-action-btn sb-del-btn" onclick="deleteSavedBill(${bn})">Delete</button>` : ""}</div>
        </td>
      </tr>`;
    }).join("");
  }

  carTbody.innerHTML = buildRows('sbCarCount', carBills, _sbCarSearch);
  cargoTbody.innerHTML = buildRows('sbCargoCount', cargoBills, _sbCargoSearch);
  reexportTbody.innerHTML = buildRows('sbReexportCount', reexportBills, _sbReexportSearch);
}

// Load a saved bill back into the Car/GC/Re-Export form for editing
function editSavedBill(billNumber) {
  const all = getSavedBills();
  const record = all.find((b) => b.billNumber === billNumber);
  if (!record) { showToast("Bill not found", "error"); return; }

  const type = ["cargo", "reexport"].includes(record.type) ? record.type : "car";
  switchModule(type);

  // Restore scalar inputs from snapshot
  const inputs = record.inputs || {};
  Object.entries(inputs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val;
  });

  // For cargo: restore part-billing stages then trigger the stage UI
  if (type === "cargo") {
    const savedStages = record.partBillingStages;
    if (Array.isArray(savedStages) && savedStages.length > 0) {
      partBillingStages = JSON.parse(JSON.stringify(savedStages));
    }
    // onPartBillingChange reads the checkbox state we already restored above
    onPartBillingChange();
  }

  // For re-export: restore the nested Bill of Entry / CLD state then re-render
  if (type === "reexport") {
    const savedBEs = record.reexportBEs;
    if (Array.isArray(savedBEs) && savedBEs.length > 0) {
      reexportBEs = JSON.parse(JSON.stringify(savedBEs));
    }
    syncReexportFreeTimeVisibility(document.getElementById("reexport-type")?.value === "overside");
    syncReexportSegUI();
    renderBillOfEntries();
  }

  // Mark as editing so next Save overwrites this bill number
  editingBillNumber[type] = billNumber;

  // Re-run calculation to populate results
  if (type === "cargo") cargoCalculate();
  else if (type === "reexport") reexportCalculate();
  else carCalculate();

  showToast(`Editing ${billNumber} — modify and Save to update`, "info");
}

// Delete a saved bill and resequence numbers in its date group
async function deleteSavedBill(billNumber) {
  if (!isAdmin) { showToast("Admin login required to delete bills", "error"); return; }
  
  const ok = await confirmModal(`Delete bill ${billNumber}? This cannot be undone.`);
  if (!ok) return;

  const parsed = parseBillNumber(billNumber);
  let all = getSavedBills();
  const target = all.find((b) => b.billNumber === billNumber);
  if (!target) return;
  const type = target.type;
  const prefix = parsed ? parsed.prefix : (BILL_PREFIX_BY_TYPE[type] ?? BILL_PREFIX_BY_TYPE.car);

  // Remove the bill
  all = all.filter((b) => b.billNumber !== billNumber);

  if (parsed) {
    // Resequence within the same date group for this type
    const dateKey = parsed.datePart;
    // Order by each bill's existing sequence number, not by savedAt: an
    // older bill that was later edited (and so re-saved more recently than
    // its same-day siblings) must keep its original creation-order slot,
    // not jump to the end just because it was touched last. See
    // compareBillsBySerial() above for the same principle applied to the
    // Saved Bills table's display order.
    const sameGroup = all
      .filter((b) => {
        const p = parseBillNumber(b.billNumber);
        return p && p.prefix === prefix && p.datePart === dateKey;
      })
      .sort((a, b) => parseBillNumber(a.billNumber).seq - parseBillNumber(b.billNumber).seq);

    sameGroup.forEach((b, idx) => {
      b.billNumber = `${prefix}-${dateKey}${String(idx + 1).padStart(6, "0")}`;
    });

    // Rebuild the counter so future saves continue from the right place
    const counters = readJsonStorage(BILL_COUNTER_KEY, {});
    const cKey = `${prefix}-${dateKey}`;
    counters[cKey] = sameGroup.length;
    localStorage.setItem(BILL_COUNTER_KEY, JSON.stringify(counters));
  }

  localStorage.setItem(SAVED_BILLS_KEY, JSON.stringify(all));

  // If this bill was being edited, clear the editing marker
  if (editingBillNumber[type] === billNumber) editingBillNumber[type] = null;

  showToast(`Deleted ${billNumber}`, "success");
  renderSavedBills();
// Remove from GitHub explicitly first -- the merge safety-net in the Worker's
  // PUT handler means a plain saveBillsToWorker() call can no longer delete a
  // bill, so we call the dedicated DELETE endpoint for the removed bill, then
  // push the (possibly resequenced) remaining bills as a follow-up sync.
  deleteBillFromWorker(billNumber).then(delOk => {
    if (!delOk) showToast("GitHub delete failed — removed locally only", "warning");
  });
  saveBillsToWorker(getSavedBills()).then(ok => {
    if (!ok) showToast("GitHub sync failed — deleted locally only", "warning");
  });
}
