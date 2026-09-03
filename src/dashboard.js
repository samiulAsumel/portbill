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

// Returns a bill's saved date truncated to a local calendar day, or null.
function dashBillDay(b) {
  if (!b.savedAt) return null;
  const d = new Date(b.savedAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Counts bills saved in the current calendar month vs. the previous one, for the delta line.
function dashMonthDelta(bills) {
  const now = new Date();
  const thisKey = now.getFullYear() + "-" + now.getMonth();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = prev.getFullYear() + "-" + prev.getMonth();
  let thisMonth = 0;
  let lastMonth = 0;
  bills.forEach((b) => {
    const d = dashBillDay(b);
    if (!d) return;
    const key = d.getFullYear() + "-" + d.getMonth();
    if (key === thisKey) thisMonth += 1;
    else if (key === prevKey) lastMonth += 1;
  });
  return { thisMonth, lastMonth };
}

// Renders the four summary cards (Total / Car / Cargo / Re-Export) from saved-bill counts.
function renderDashboardSummary(bills) {
  const counts = { car: 0, cargo: 0, reexport: 0 };
  let totalValue = 0;
  bills.forEach((b) => {
    if (counts[b.type] !== undefined) counts[b.type] += 1;
    totalValue += Number(b.total) || 0;
  });
  const delta = dashMonthDelta(bills);
  const deltaFor = (type) => dashMonthDelta(bills.filter((b) => b.type === type));
  const cards = [
    { lbl: "Total Bills", num: bills.length, sub: bills.length ? fmt(totalValue) + " billed" : "All modules combined", color: "var(--accent)", icon: "ic-files", delta: delta.thisMonth },
    { lbl: "Car Bills", num: counts.car, sub: "Saved car wharfrent bills", color: "var(--gold)", icon: "ic-truck", delta: deltaFor("car").thisMonth },
    { lbl: "General Cargo", num: counts.cargo, sub: "Saved cargo bills", color: "var(--sky)", icon: "ic-package", delta: deltaFor("cargo").thisMonth },
    { lbl: "Re-Export", num: counts.reexport, sub: "Saved re-export bills", color: "var(--teal)", icon: "ic-ship", delta: deltaFor("reexport").thisMonth },
  ];
  return cards.map((c) => `
    <div class="dash-card" style="--dash-color:${c.color}">
      <div class="dash-card-top">
        <div class="dash-card-lbl">${escHtml(c.lbl)}</div>
        <svg class="dash-card-icon" aria-hidden="true"><use href="#${c.icon}"></use></svg>
      </div>
      <div class="dash-card-num">${c.num}</div>
      <div class="dash-card-sub">${escHtml(c.sub)}</div>
      ${c.delta > 0 ? `<div class="dash-card-delta">+${c.delta} this month</div>` : ""}
    </div>`).join("");
}

// Renders the 30-day mini bar chart of saved-bill activity (all modules combined).
function renderDashboardActivity(bills) {
  const byDay = {};
  bills.forEach((b) => {
    const d = dashBillDay(b);
    if (!d) return;
    const key = d.getTime();
    byDay[key] = (byDay[key] || 0) + 1;
  });
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({ date: d, count: byDay[d.getTime()] || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  if (!total) {
    return `<div class="bill-empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
      <div class="bes-title">No billing activity in the last 30 days</div>
      <div class="bes-sub">Save a Car, Cargo, or Re-Export bill to see it charted here.</div>
    </div>`;
  }
  const W = 600;
  const H = 120;
  const PAD = 4;
  const LBL = 14;
  const bw = (W - PAD * 2) / days.length;
  let bars = "";
  days.forEach((d, i) => {
    const h = Math.max(d.count > 0 ? 2 : 0, Math.round(((H - LBL - 6) * d.count) / max));
    const x = (PAD + i * bw).toFixed(1);
    const label = d.date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
    bars += `<rect x="${x}" y="${H - LBL - h}" width="${(bw * 0.68).toFixed(1)}" height="${h}" rx="1.5" class="dash-bar">` +
      `<title>${escHtml(label)} — ${d.count} bill(s)</title></rect>`;
    if (i % 5 === 0 || i === days.length - 1) {
      const isFirst = i === 0;
      const isLast = i === days.length - 1;
      let anchor = "middle";
      let tx = PAD + i * bw + bw * 0.34;
      if (isFirst) { anchor = "start"; tx = PAD; }
      else if (isLast) { anchor = "end"; tx = W - PAD; }
      bars += `<text x="${tx.toFixed(1)}" y="${H - 2}" class="dash-bar-x" text-anchor="${anchor}">${escHtml(label)}</text>`;
    }
  });
  return `<svg class="dash-activity-chart" viewBox="0 0 ${W} ${H}" width="100%" role="presentation" focusable="false">` +
    `<line x1="${PAD}" y1="${H - LBL - 0.5}" x2="${W - PAD}" y2="${H - LBL - 0.5}" class="dash-bar-axis"/>` +
    bars +
    `</svg>`;
}

// Renders the Quick Actions row — links straight into the public billing modules.
function renderDashboardQuick() {
  const actions = [
    { mod: "car", label: "New Car Bill", icon: "ic-truck", color: "var(--gold)" },
    { mod: "cargo", label: "New Cargo Bill", icon: "ic-package", color: "var(--sky)" },
    { mod: "reexport", label: "New Re-Export Bill", icon: "ic-ship", color: "var(--teal)" },
  ];
  return actions.map((a) => `
    <button type="button" class="dash-quick-btn" style="--dash-color:${a.color}" onclick="switchModule('${a.mod}')">
      <svg class="dash-quick-icon" aria-hidden="true"><use href="#${a.icon}"></use></svg>
      ${escHtml(a.label)}
    </button>`).join("");
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

// "View all →" link into Saved Bills — shown only for admin, since that module
// is admin-gated and switchModule() would otherwise bounce a non-admin to Car
// with a warning toast.
function renderDashboardRecentAction() {
  if (!isAdmin) return "";
  return `<button type="button" class="dash-view-all" onclick="switchModule('saved')">View all &rarr;</button>`;
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
  const checked = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `<div class="dash-status-grid">${rows.map((r) => renderDashboardStatusRow(r)).join("")}</div>` +
    `<div class="dash-status-checked">Last checked ${checked}</div>`;
}

const DASH_STATUS_PILL = { ok: "status-pill--ok", warn: "status-pill--warn", bad: "status-pill--error" };
function renderDashboardStatusRow(r) {
  const pillClass = DASH_STATUS_PILL[r.state] || DASH_STATUS_PILL.ok;
  return `<div class="dash-status-row">
      <span>${escHtml(r.label)}</span>
      <span class="status-pill ${pillClass}">${escHtml(r.detail)}</span>
    </div>`;
}

// Entry point, called from the Dashboard tab's onclick (index.html) every time
// the tab is opened — cheap to re-run, always reflects current localStorage state.
function renderDashboard() {
  const bills = (typeof getSavedBills === "function") ? getSavedBills() : [];
  const dateEl = document.getElementById("dash-date");
  const summaryEl = document.getElementById("dash-summary");
  const activityEl = document.getElementById("dash-activity");
  const quickEl = document.getElementById("dash-quick");
  const recentEl = document.getElementById("dash-recent");
  const recentActionEl = document.getElementById("dash-recent-action");
  const statusEl = document.getElementById("dash-status");
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (summaryEl) summaryEl.innerHTML = renderDashboardSummary(bills);
  if (activityEl) activityEl.innerHTML = renderDashboardActivity(bills);
  if (quickEl) quickEl.innerHTML = renderDashboardQuick();
  if (recentEl) recentEl.innerHTML = renderDashboardRecent(bills);
  if (recentActionEl) recentActionEl.innerHTML = renderDashboardRecentAction();
  if (statusEl) statusEl.innerHTML = renderDashboardStatus();
}

// ── Topbar breadcrumb/title sync ────────────────────────────────────────────
// updateTopbarForModule() is called directly from switchModule() (admin.js)
// on every module switch, whatever triggered it — a nav-tab click, Saved
// Bills' Edit/Print buttons, the Dashboard Quick Action buttons, its "View
// all" link, or the admin-logout bounce-to-"car". It used to run only from a
// separate click listener on .module-tabs here, which covered nav-tab clicks
// alone (missing every other call site above) and — even for a tab click —
// could show the wrong title if switchModule() internally redirected the
// click (e.g. clicking the admin-only Saved Bills tab while logged out
// bounces to Car, but the listener kept naming the tab you clicked, not the
// page you landed on). Centralizing the call inside switchModule() with its
// final, possibly-redirected `mod` fixes both.
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
