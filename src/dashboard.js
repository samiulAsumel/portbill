// dashboard.js — Operations overview page. Read-only presentation over data the
// app already owns (getSavedBills(), the rotation cache, sync-pending state) —
// no new calculation engine, no invented figures, no existing function touched.
// Loaded after reexport.js, before platform.js. Depends on core.js globals
// (getSavedBills, getPending, escHtml, fmt) which are already defined by then.

// Small label/icon map so the dashboard and topbar agree on module naming
// without reaching into car.js/cargo.js/reexport.js internals.
const DASH_MODULE_META = {
  car: { label: "Car Billing", icon: "ic-truck", color: "var(--gold)" },
  cargo: { label: "General Cargo", icon: "ic-package", color: "var(--sky)" },
  reexport: { label: "Re-Export", icon: "ic-ship", color: "var(--teal)" },
};

// Renders the four summary cards (Total / Car / Cargo / Re-Export) from saved-bill counts.
function renderDashboardSummary(bills) {
  const counts = { car: 0, cargo: 0, reexport: 0 };
  bills.forEach((b) => { if (counts[b.type] !== undefined) counts[b.type] += 1; });
  const cards = [
    { lbl: "Total Bills", num: bills.length, sub: "All modules combined", color: "var(--accent)" },
    { lbl: "Car Bills", num: counts.car, sub: "Saved car wharfrent bills", color: "var(--gold)" },
    { lbl: "General Cargo", num: counts.cargo, sub: "Saved cargo bills", color: "var(--sky)" },
    { lbl: "Re-Export", num: counts.reexport, sub: "Saved re-export bills", color: "var(--teal)" },
  ];
  return cards.map((c) => `
    <div class="dash-card" style="--dash-color:${c.color}">
      <div class="dash-card-lbl">${escHtml(c.lbl)}</div>
      <div class="dash-card-num">${c.num}</div>
      <div class="dash-card-sub">${escHtml(c.sub)}</div>
    </div>`).join("");
}

// Renders the most recently saved bills (newest first) across all modules.
function renderDashboardRecent(bills) {
  const recent = [...bills]
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))
    .slice(0, 6);
  if (!recent.length) {
    return `<div class="bill-empty-state">
      <div class="bes-title">No bills saved yet</div>
      <div class="bes-sub">Generate and save a bill in Car, Cargo, or Re-Export to see recent activity here.</div>
    </div>`;
  }
  return `<div class="dash-recent-list">${recent.map((b) => {
    const meta = DASH_MODULE_META[b.type] || DASH_MODULE_META.car;
    const when = b.savedAt ? new Date(b.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
    return `<div class="dash-recent-row">
      <svg width="14" height="14" style="color:${meta.color};flex-shrink:0" aria-hidden="true"><use href="#${meta.icon}"></use></svg>
      <div style="flex:1;min-width:0">
        <div>${escHtml(b.billNumber || "—")} &middot; ${escHtml(meta.label)}</div>
        <div class="dash-recent-meta">${escHtml(b.metadata?.cnfName || "")} ${b.metadata?.cnfName ? "&middot;" : ""} ${escHtml(when)}</div>
      </div>
      <div class="dash-recent-amt">${escHtml(b.totalFormatted || "")}</div>
    </div>`;
  }).join("")}</div>`;
}

// Renders system-status rows: billing engine (always ok — the page loaded),
// storage (localStorage reachable), rotation data (cached count), connectivity.
function renderDashboardStatus() {
  let rotationCount = 0;
  try { rotationCount = (JSON.parse(localStorage.getItem("pb_rotations_cache") || "[]") || []).length; } catch { /* ignore malformed cache */ }
  let storageOk = true;
  try { localStorage.setItem("__pb_probe", "1"); localStorage.removeItem("__pb_probe"); } catch { storageOk = false; }
  const pending = (typeof getPending === "function") ? getPending() : {};
  const pendingCount = Object.values(pending).filter(Boolean).length;
  const online = navigator.onLine;

  let syncState = "ok";
  let syncDetail = "Up to date";
  if (!online) {
    syncState = "warn";
    syncDetail = "Offline";
  } else if (pendingCount) {
    syncState = "warn";
    syncDetail = `${pendingCount} pending`;
  }

  const rows = [
    { label: "Billing Engine", state: "ok", detail: "Operational" },
    { label: "Local Storage", state: storageOk ? "ok" : "bad", detail: storageOk ? "Available" : "Unavailable" },
    { label: "Rotation Data", state: rotationCount ? "ok" : "warn", detail: `${rotationCount} registered` },
    { label: "Cloud Sync", state: syncState, detail: syncDetail },
  ];
  return `<div class="dash-status-grid">${rows.map((r) => renderDashboardStatusRow(r)).join("")}</div>`;
}

function renderDashboardStatusRow(r) {
  const dotClass = r.state === "ok" ? "" : r.state;
  return `<div class="dash-status-row">
      <span class="dash-status-dot ${dotClass}"></span>
      <span>${escHtml(r.label)} — ${escHtml(r.detail)}</span>
    </div>`;
}

// Entry point, called from the Dashboard tab's onclick (index.html) every time
// the tab is opened — cheap to re-run, always reflects current localStorage state.
function renderDashboard() {
  const bills = (typeof getSavedBills === "function") ? getSavedBills() : [];
  const summaryEl = document.getElementById("dash-summary");
  const recentEl = document.getElementById("dash-recent");
  const statusEl = document.getElementById("dash-status");
  if (summaryEl) summaryEl.innerHTML = renderDashboardSummary(bills);
  if (recentEl) recentEl.innerHTML = renderDashboardRecent(bills);
  if (statusEl) statusEl.innerHTML = renderDashboardStatus();
}

// ── Topbar breadcrumb/title sync — purely additive, does not modify switchModule() ──
const DASH_TOPBAR_META = {
  dashboard: { group: "Overview", title: "Dashboard" },
  car: { group: "Billing", title: "Car Billing" },
  cargo: { group: "Billing", title: "General Cargo" },
  reexport: { group: "Billing", title: "Re-Export" },
  rotation: { group: "Operations", title: "Rotation Registry" },
  saved: { group: "Operations", title: "Saved Bills" },
  stats: { group: "Insights", title: "Analytics" },
};
function updateTopbarForModule(mod) {
  const meta = DASH_TOPBAR_META[mod] || DASH_TOPBAR_META.car;
  const crumb = document.getElementById("topbarBreadcrumb");
  const title = document.getElementById("topbarTitle");
  if (crumb) crumb.textContent = `PortBill / ${meta.group}`;
  if (title) title.textContent = meta.title;
  document.title = `${meta.title} — PortBill`;
}
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".module-tabs");
  if (!nav) return;
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const mod = btn.id.replace("tab-", "");
    updateTopbarForModule(mod);
    document.body.classList.remove("sidebar-open"); // close mobile drawer after navigating
  });
});
