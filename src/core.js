// core.js — Shared kernel: debug logger, VAT-MPA rounding, app state,
// rate persistence, toast, field validation, DOM/date/number utils,
// shared slab calculator, pre-calculate input validation, tonnage rounding.
// Loads FIRST (classic script) — every other module reads/writes the
// state declared here as shared globals. No dependencies of its own.

const DEBUG = false;
const dbg = {
  warn:  (...a) => { if (DEBUG) console.warn(...a); },
  error: (...a) => { if (DEBUG) console.error(...a); },
};


/**
 * MPA-parity VAT calculation.
 * Mirrors C#: Math.Round((TotalBillBDT ?? 0) * VATPercent / 100m, 2)
 * Uses integer poysha-scale math (no float error) + Banker's Rounding
 * (half-to-even), matching C# decimal + Math.Round default behavior.
 * NOTE: VAT is the ONLY figure using half-to-even — all other monetary
 * rounding in this file stays on the r2 half-down port convention.
 *
 * @param {number|null|undefined} totalBillBDT - bill amount in Taka (max 2dp)
 * @param {number} vatPercent - e.g. 15 for 15%
 * @returns {number} VAT in Taka, rounded to 2 decimals
 */
function calcVATmpa(totalBillBDT, vatPercent) {
  // Rule 1: null safety (C# ?? 0)
  const bill = Number(totalBillBDT) || 0;
  const pct = Number(vatPercent) || 0;

  // Rule 2: exact integer math.
  // bill assumed max 2 decimals, pct assumed max 2 decimals (MPA tariff standard).
  const billPoysha = Math.round(bill * 100); // Tk → poysha
  const pctBasis = Math.round(pct * 100); // 15% → 1500

  // bill * pct / 100 (Taka) == billPoysha * pctBasis / 10000 (poysha)
  const numerator = billPoysha * pctBasis; // exact integer
  const divisor = 10000;

  // Rule 3: Banker's Rounding to nearest integer poysha.
  // Math.floor floors toward −∞, so quotient/remainder stay consistent for
  // negative bills (credit notes) and half-to-even holds there too.
  const quotient = Math.floor(numerator / divisor);
  const remainder = numerator - quotient * divisor;
  const half = divisor / 2;

  let vatPoysha;
  if (remainder > half) {
    vatPoysha = quotient + 1;
  } else if (remainder < half) {
    vatPoysha = quotient;
  } else {
    // exact midpoint → round to even
    vatPoysha = quotient % 2 === 0 ? quotient : quotient + 1;
  }

  // Rule 4: single final round done. Poysha → Taka.
  return vatPoysha / 100;
}


const SP_CAR_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
  "<span>Fill in shipment details<br>to see live cost preview</span></div>";
const SP_CARGO_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/>' +
  '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
  "<span>Fill in cargo details<br>to see live cost preview</span></div>";
const SP_REEXPORT_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
  "<span>Fill in Bill of Entry details<br>to see live cost preview</span></div>";
let isAdmin = false;

// ════════════════════════════════════════
//  ADMIN RATE PERSISTENCE  (localStorage)
// ════════════════════════════════════════
const RATE_STORAGE_KEY = "pb_admin_rates";
const RATE_DEFAULTS = {
  // CAR rates
  freeDays: "4",
  rRiver: "33",
  rLanding: "175",
  rWeighment: "2.5",
  rLevy: "1.5",
  vatRate: "15",
  nr1: "70",
  nr2: "185",
  nr3: "295",
  or1: "40",
  or2: "115",
  or3: "185",
  // CARGO rates
  "c-freeDays": "4",
  "c-rRiver": "33",
  "c-rWeighment": "2.5",
  "c-rLevy": "1.5",
  "c-vatRate": "15",
  "c-or1": "10",
  "c-or2": "20",
  "c-or3": "25",
  // RE-EXPORT rates — MPA Tariff (Gazette 26/07/2021 & 16/07/2024)
  "reexport-freeDays": "20",
  "reexport-vatRate": "15",
  "re-rRiver": "33",
  "re-wharfLow": "5",
  "re-wharfHigh": "15",
  "re-hoistPct": "1.25",
  "re-reshipSame": "1.5",
  "re-reshipDiff": "2",
  "re-removalMult": "7",
  "re-rLevy": "1.5",
  "re-land1": "90",
  "re-land2": "180",
  "re-land3": "250",
};

// ════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ════════════════════════════════════════
let _toastTimer = null;
function showToast(msg, type = "info") {
  let el = document.getElementById("pb-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "pb-toast";
    document.body.appendChild(el);
  }
  el.className = "pb-toast pb-toast-" + type;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ════════════════════════════════════════
//  FIELD VALIDATION HELPERS
// ════════════════════════════════════════
function isValidDateStr(s) {
  if (!s || s.length < 10) return false;
  const parts = s.split("/");
  if (parts.length !== 3) return false;
  const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getFullYear() === +parts[2] &&
    d.getMonth() + 1 === +parts[1] &&
    d.getDate() === +parts[0]
  );
}
function setFieldState(inputId, hintId, state, msg) {
  const inp = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (!inp) return;
  if (state === "error") {
    inp.classList.add("field-invalid");
    if (hint) {
      hint.className = "field-hint hint-error";
      hint.textContent = msg || "Invalid value";
    }
  } else if (state === "ok") {
    inp.classList.remove("field-invalid");
    if (hint) {
      hint.className = "field-hint hint-ok";
      hint.textContent = msg || "";
    }
  } else {
    inp.classList.remove("field-invalid");
    if (hint) {
      hint.className = "field-hint hint-muted";
      hint.textContent = msg || "";
    }
  }
}
function validateDateField(inputId, hintId, label) {
  const el = document.getElementById(inputId);
  if (!el) return true;
  const v = el.value.trim();
  if (!v) {
    setFieldState(inputId, hintId, "muted", "DD/MM/YYYY");
    return false;
  }
  if (!isValidDateStr(v)) {
    setFieldState(inputId, hintId, "error", `Invalid ${label}`);
    return false;
  }
  setFieldState(inputId, hintId, "ok", v);
  return true;
}

// Cross-field date-order guard: the delivery date must not fall before the CLD.
// Both fields must already hold a well-formed date — format errors are surfaced
// by validateDateField and take precedence, so we no-op while either is invalid.
// Flags the delivery field (the downstream value) on conflict. Returns true when
// the order is valid (or not yet checkable).
function validateDateOrder(cldId, delivId, delivHintId) {
  const cldEl = document.getElementById(cldId);
  const delEl = document.getElementById(delivId);
  if (!cldEl || !delEl) return true;
  const cldV = cldEl.value.trim();
  const delV = delEl.value.trim();
  if (!isValidDateStr(cldV) || !isValidDateStr(delV)) return true;
  if (pd(delV) < pd(cldV)) {
    setFieldState(delivId, delivHintId, "error", "Delivery date is before CLD");
    return false;
  }
  return true;
}

function saveRates() {
  const saved = {};
  Object.keys(RATE_DEFAULTS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) saved[id] = el.value;
  });
  localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(saved));
}

function loadSavedRates() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(RATE_STORAGE_KEY) || "{}");
  } catch (e) {
    dbg.warn("loadSavedRates: corrupted localStorage entry:", e);
    saved = {};
  }
  Object.keys(RATE_DEFAULTS).forEach((id) => {
    let val = saved[id] !== undefined ? saved[id] : RATE_DEFAULTS[id];
    // Guard against corrupted/tampered localStorage: only accept finite numbers
    if (!Number.isFinite(Number.parseFloat(val))) val = RATE_DEFAULTS[id];
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    const spn = document.getElementById(
      id.startsWith("c-") ? "c-d" + id.slice(2) : "d" + id,
    );
    if (spn) spn.textContent = val;
  });
}

async function resetRatesToDefaults() {
  if (!isAdmin) return;
  const ok = await confirmModal('Reset all rates to factory defaults? This cannot be undone.');
  if (!ok) return;
  localStorage.removeItem(RATE_STORAGE_KEY);
  loadSavedRates();
  carRefresh();
  cargoRefresh();
  showToast("Rates reset to factory defaults", "warning");
}

// Persist attempt count for the session so a page refresh doesn't reset the lockout
const _getAttempts = () => parseInt(sessionStorage.getItem("_la") ?? "0", 10);
const _setAttempts = (v) => sessionStorage.setItem("_la", String(v));
let loginAttempts = _getAttempts();
const AU = "admin";
const AP_HASH =
  "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
const ADMIN_PASS_STORAGE_KEY = "pb_admin_password_hash";
let _cloudPasswordHash = null;
// Plaintext admin password held in memory for the session — used as Worker write bearer token
let _sessionWriteToken = null;
const getAdminPasswordHash = () =>
  _cloudPasswordHash || localStorage.getItem(ADMIN_PASS_STORAGE_KEY) || AP_HASH;
async function hashText(value) {
  if (!crypto?.subtle) throw new Error("no-subtle");
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
let currentModule = "car";
let isInitialLoad = true;
let lastCarBill = null;
let lastCargoBill = null;
let lastReexportBill = null;
const SAVED_BILLS_KEY = "pb_saved_bills";
const BILL_COUNTER_KEY = "pb_bill_counter";
const ROTATIONS_KEY = "pb_rotations_cache";
const SYNC_PENDING_KEY = "pb_sync_pending";
let editingBillNumber = { car: null, cargo: null, reexport: null };

// Performance optimization: Cache frequently accessed DOM elements
const domCache = {
  car: {
    preview: null,
    results: null,
    ibar: null,
    srow: null,
    insideSec: null,
    outsideSec: null,
    grandSec: null,
    rbadge: null,
  },
  cargo: {
    preview: null,
    results: null,
    ibar: null,
    srow: null,
    insideSec: null,
    outsideSec: null,
    grandSec: null,
    rbadge: null,
    tierInfo: null,
    totalCheck: null,
  },
};

// Initialize DOM cache
function initDomCache() {
  // Car module elements
  domCache.car.preview = document.getElementById("car-preview");
  domCache.car.results = document.getElementById("results");
  domCache.car.ibar = document.getElementById("car-ibar");
  domCache.car.srow = document.getElementById("car-srow");
  domCache.car.insideSec = document.getElementById("car-insideSec");
  domCache.car.outsideSec = document.getElementById("car-outsideSec");
  domCache.car.grandSec = document.getElementById("car-grandSec");
  domCache.car.rbadge = document.getElementById("rbadge");

  // Cargo module elements
  domCache.cargo.preview = document.getElementById("cargo-preview");
  domCache.cargo.results = document.getElementById("cargo-results");
  domCache.cargo.ibar = document.getElementById("cargo-ibar");
  domCache.cargo.srow = document.getElementById("cargo-srow");
  domCache.cargo.insideSec = document.getElementById("cargo-insideSec");
  domCache.cargo.outsideSec = document.getElementById("cargo-outsideSec");
  domCache.cargo.grandSec = document.getElementById("cargo-grandSec");
  domCache.cargo.rbadge = document.getElementById("cargo-rbadge");
  domCache.cargo.tierInfo = document.getElementById("cargo-tier-info");
  domCache.cargo.totalCheck = document.getElementById("c-totalCheck");
}

// Initialize cache when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDomCache);
} else {
  initDomCache();
}

// ════════════════════════════════════════

// Escape user-supplied text before interpolating it into HTML strings (XSS guard)
const escHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function formatDate(input) {
  let v = input.value.replaceAll(/\D/g, "");
  if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
  if (v.length > 5) v = v.slice(0, 5) + "/" + v.slice(5, 9);
  input.value = v;
}
// Makes backspace transparent to auto-inserted "/" separators in DD/MM/YYYY inputs.
// When cursor is right after a "/", shift cursor back so the preceding digit is deleted instead.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Backspace") return;
  const inp = e.target;
  if (inp.tagName !== "INPUT" || inp.getAttribute("placeholder") !== "DD/MM/YYYY") return;
  const s = inp.selectionStart;
  if (s !== inp.selectionEnd || s === 0) return;
  if (inp.value[s - 1] === "/") inp.setSelectionRange(s - 1, s - 1);
}, false);

const pd = (s) => {
  if (!s || s.trim() === "") return new Date();
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      const d = new Date(
        Number.parseInt(parts[2], 10),
        Number.parseInt(parts[1], 10) - 1,
        Number.parseInt(parts[0], 10),
      );
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
const fd = (d) =>
  d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
const addD = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const diffD = (a, b) => Math.round((b - a) / 86400000);
const gn = (id) => Number.parseFloat(document.getElementById(id)?.value) || 0;
const gb = (id) => document.getElementById(id)?.checked;
const nn = (id) => Math.max(0, gn(id));
const fmt = (n) =>
  "Tk " +
  Number(n).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtN = (n) =>
  Number(n).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function readTextValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}
function readMeta(prefix) {
  return {
    cnfName: escHtml(readTextValue(prefix + "-cnfName")),
    blNumber: escHtml(readTextValue(prefix + "-blNumber")),
    billEntryNumber: escHtml(readTextValue(prefix + "-billEntry")),
    billEntryDate: escHtml(readTextValue(prefix + "-billEntryDate")),
  };
}
function billDateKey(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}
function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") ?? fallback;
  } catch (e) {
    dbg.warn(`readJsonStorage(${key}) failed:`, e);
    return fallback;
  }
}

// Offline-write tracking: which cloud resources have local changes not yet
// pushed to the Worker. Whole-state last-write-wins — no per-change op log,
// each resource just gets re-PUT in full once connectivity returns.
function getPending() {
  return readJsonStorage(SYNC_PENDING_KEY, {});
}
function markPending(resource) {
  const p = getPending();
  p[resource] = true;
  localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify(p));
}
function clearPending(resource) {
  const p = getPending();
  if (!p[resource]) return;
  delete p[resource];
  localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify(p));
}
const BILL_PREFIX_BY_TYPE = { cargo: "GCA", reexport: "RE", car: "CA" };
function nextBillNumber(type) {
  const prefix = BILL_PREFIX_BY_TYPE[type] ?? BILL_PREFIX_BY_TYPE.car;
  const datePart = billDateKey();
  const key = `${prefix}-${datePart}`;
  const counters = readJsonStorage(BILL_COUNTER_KEY, {});
  counters[key] = Math.max(0, Number.parseInt(counters[key] || "0", 10)) + 1;
  localStorage.setItem(BILL_COUNTER_KEY, JSON.stringify(counters));
  return `${prefix}-${datePart}${String(counters[key]).padStart(6, "0")}`;
}
function totalForBill(type, b) {
  if (!b) return 0;
  if (type === "cargo") return b.gTotal || b.nTotal || 0;
  if (type === "reexport") return b.grandTotal || 0;
  return b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
}
function inputRootId(type) {
  if (type === "cargo") return "cargo-inputSection";
  if (type === "reexport") return "reexport-inputSection";
  return "car-inputSection";
}
function billInputSnapshot(type) {
  const root = document.getElementById(inputRootId(type));
  if (!root) return {};
  const data = {};
  root.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.id) return;
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return data;
}
const BILL_SNAPSHOT_IDS_BY_TYPE = {
  cargo: ["cargo-ibar", "cargo-srow", "cargo-insideSec", "cargo-outsideSec", "cargo-breakdownSec", "cargo-grandSec"],
  reexport: ["reexport-ibar", "reexport-srow", "reexport-beSec", "reexport-grandSec"],
  car: ["car-ibar", "car-srow", "car-insideSec", "car-outsideSec", "car-grandSec"],
};
function billHtmlSnapshot(type) {
  const ids = BILL_SNAPSHOT_IDS_BY_TYPE[type] ?? BILL_SNAPSHOT_IDS_BY_TYPE.car;
  return ids.map((id) => `<section data-section="${id}">${document.getElementById(id)?.innerHTML || ""}</section>`).join("");
}
function getSavedBills() {
  const bills = readJsonStorage(SAVED_BILLS_KEY, []);
  return Array.isArray(bills) ? bills : [];
}
function persistSavedBill(record) {
  const bills = getSavedBills();
  const idx = bills.findIndex((b) => b.billNumber === record.billNumber);
  if (idx >= 0) bills[idx] = record;
  else bills.unshift(record);
  localStorage.setItem(SAVED_BILLS_KEY, JSON.stringify(bills));
}
const LAST_BILL_BY_TYPE = { cargo: () => lastCargoBill, reexport: () => lastReexportBill, car: () => lastCarBill };
const COLLECT_ERRORS_BY_TYPE = {
  cargo: () => collectCargoErrors(),
  reexport: () => collectReexportErrors(),
  car: () => collectCarErrors(),
};
const MODULE_LABEL_BY_TYPE = { cargo: "General Cargo", reexport: "Re-Export", car: "Car" };
function saveBill(type) {
  const b = (LAST_BILL_BY_TYPE[type] ?? LAST_BILL_BY_TYPE.car)();
  if (!b) {
    showToast("Generate the bill first before saving.", "warning");
    return;
  }
  const errors = (COLLECT_ERRORS_BY_TYPE[type] ?? COLLECT_ERRORS_BY_TYPE.car)();
  if (reportInputErrors(errors)) return;
  if (!b.billNumber) b.billNumber = editingBillNumber[type] || nextBillNumber(type);
  b.savedAt = new Date().toISOString();
  const metadata = {
    cnfName: b.cnfName || "",
    blNumber: b.blNumber || "",
    billEntryNumber: b.billEntryNumber || "",
    billEntryDate: b.billEntryDate || "",
  };
  let cldDisplay, deliveryDisplay;
  if (type === "reexport") {
    const allClds = (b.beResults || []).flatMap((be) => be.clds.map((c) => c.date));
    const earliestCld = allClds.length ? new Date(Math.min(...allClds.map((d) => d.getTime()))) : null;
    cldDisplay = earliestCld ? fd(earliestCld) : "";
    deliveryDisplay = fd(b.reexportDate);
  } else {
    cldDisplay = fd(b.cld);
    deliveryDisplay = b.delivery ? fd(b.delivery) : "";
  }
  persistSavedBill({
    billNumber: b.billNumber,
    type,
    module: MODULE_LABEL_BY_TYPE[type] ?? MODULE_LABEL_BY_TYPE.car,
    savedAt: b.savedAt,
    cld: cldDisplay,
    delivery: deliveryDisplay,
    metadata,
    total: totalForBill(type, b),
    totalFormatted: fmt(totalForBill(type, b)),
    inputs: billInputSnapshot(type),
    partBillingStages: type === "cargo" ? JSON.parse(JSON.stringify(partBillingStages)) : null,
    reexportBEs: type === "reexport" ? JSON.parse(JSON.stringify(reexportBEs)) : null,
    html: billHtmlSnapshot(type),
  });
  editingBillNumber[type] = null;
  clearDraft(type);
  renderBillNumberBadge(type, b.billNumber);
  showToast(`Saved bill ${b.billNumber}`, "success");
  if (currentModule === "saved") renderSavedBills();
  // Sync to GitHub (async, non-blocking)
  saveBillsToWorker(getSavedBills()).then(ok => {
    if (!ok) showToast("GitHub sync failed — saved locally only", "warning");
  });
}
const IBAR_ID_BY_TYPE = { cargo: "cargo-ibar", reexport: "reexport-ibar", car: "car-ibar" };
function renderBillNumberBadge(type, billNumber) {
  if (!billNumber) return;
  const ibar = document.getElementById(IBAR_ID_BY_TYPE[type] ?? IBAR_ID_BY_TYPE.car);
  const inner = ibar?.querySelector(".ibar > div");
  if (!inner) return;
  const existing = ibar.querySelector(".bill-no-ii");
  if (existing) existing.remove();
  const badge = document.createElement("div");
  badge.className = "ii bill-no-ii";
  badge.innerHTML = `<div class="il">Bill Number</div><div class="iv bill-no-val">${escHtml(billNumber)}</div>`;
  inner.insertBefore(badge, inner.firstChild);
}
const CUT = pd("2024-07-23");
const CUT_OLD = pd("2024-07-22");

function syncSpan(inputId, spanId) {
  const inp = document.getElementById(inputId);
  const sp = document.getElementById(spanId);
  if (inp && sp) sp.textContent = inp.value;
}


function calcSlabs( //NOSONAR
  totalDays,
  r1,
  r2,
  r3,
  weight,
  blockStart,
  endDate,
  daysOffset,
) {
  const slabs = [];
  let offset = daysOffset,
    remaining = totalDays;
  let cur = new Date(blockStart);
  if (offset < 7 && remaining > 0) {
    const use = Math.min(7 - offset, remaining);
    slabs.push({
      label: "1st 7 days",
      rate: r1,
      days: use,
      from: new Date(cur),
      to: addD(cur, use - 1),
      amt: r1 * use * weight,
    });
    cur = addD(cur, use);
    remaining -= use;
  }
  if (offset < 14 && remaining > 0) {
    // Account for slab-2 days already consumed when daysOffset > 7 (split billing)
    const slab2Used = Math.max(0, offset - 7);
    const use = Math.min(7 - slab2Used, remaining);
    slabs.push({
      label: "8th to 14th day",
      rate: r2,
      days: use,
      from: new Date(cur),
      to: addD(cur, use - 1),
      amt: r2 * use * weight,
    });
    cur = addD(cur, use);
    remaining -= use;
  }
  if (remaining > 0) {
    slabs.push({
      label: "15th day onwards",
      rate: r3,
      days: remaining,
      from: new Date(cur),
      to: new Date(endDate),
      amt: r3 * remaining * weight,
    });
  }
  return slabs;
}


// Gather every failing input as a human-readable { id, msg } so the user is told
// exactly what is wrong (and which field to fix) before a bill is generated or
// printed. reportInputErrors() surfaces them all in a single toast and focuses
// the first offending field. These are guards only — no calculation is changed.
function collectCarErrors() {
  const errors = [];
  const cldV = (document.getElementById("cld")?.value || "").trim();
  const delV = (document.getElementById("delivery")?.value || "").trim();
  if (!cldV) errors.push({ id: "cld", msg: "CLD is required (DD/MM/YYYY)." });
  else if (!isValidDateStr(cldV))
    errors.push({ id: "cld", msg: "CLD is not a valid date (DD/MM/YYYY)." });
  if (!delV)
    errors.push({
      id: "delivery",
      msg: "Delivery date is required (DD/MM/YYYY).",
    });
  else if (!isValidDateStr(delV))
    errors.push({
      id: "delivery",
      msg: "Delivery date is not a valid date (DD/MM/YYYY).",
    });
  if (isValidDateStr(cldV) && isValidDateStr(delV) && pd(delV) < pd(cldV))
    errors.push({ id: "delivery", msg: "Delivery date is before the CLD." });
  const carBeDate = (document.getElementById("car-billEntryDate")?.value || "").trim();
  if (carBeDate && !isValidDateStr(carBeDate))
    errors.push({ id: "car-billEntryDate", msg: "Bill of Entry Date is not a valid date (DD/MM/YYYY)." });
  // Vehicle weight must be a positive number — guards the `|| 2` compute fallback
  // so a cleared/zero field can't silently bill as the 2-ton default.
  const wV = (document.getElementById("weight")?.value || "").trim();
  const wNum = Number.parseFloat(wV);
  if (wV === "" || Number.isNaN(wNum) || wNum <= 0)
    errors.push({
      id: "weight",
      msg: "Vehicle weight must be greater than 0 ton.",
    });
  return errors;
}

// Pre-calculate validation gate for Cargo (see CLAUDE.md "Pre-calculate input validation") —
// each branch is one independent field guard; cargoCalculate/printBill rely on this being the
// single source of truth for what blocks a bill, so splitting it risks a guard silently
// stopping being enforced.
// eslint-disable-next-line sonarjs/cognitive-complexity
function collectCargoErrors() {
  const errors = [];
  const cldV = (document.getElementById("c-cld")?.value || "").trim();
  if (!cldV) errors.push({ id: "c-cld", msg: "CLD is required (DD/MM/YYYY)." });
  else if (!isValidDateStr(cldV))
    errors.push({ id: "c-cld", msg: "CLD is not a valid date (DD/MM/YYYY)." });

  // Total cargo weight must be positive — a zero/blank total otherwise passes the
  // split check (0 inside + 0 outside == 0 total) and generates an all-zero bill.
  const twV = (document.getElementById("c-weight")?.value || "").trim();
  const twNum = Number.parseFloat(twV);
  if (twV === "" || Number.isNaN(twNum) || twNum <= 0)
    errors.push({
      id: "c-weight",
      msg: "Total weight must be greater than 0 ton.",
    });

  const cargoBeDate = (document.getElementById("c-billEntryDate")?.value || "").trim();
  if (cargoBeDate && !isValidDateStr(cargoBeDate))
    errors.push({ id: "c-billEntryDate", msg: "Bill of Entry Date is not a valid date (DD/MM/YYYY)." });
  const isPb = !!document.getElementById("c-partBilling")?.checked;
  if (isPb) {
    validatePartBillingDates(); // refresh inline stage hints first
    for (let i = 0; i < partBillingStages.length; i++) {
      const inp = document.getElementById(`pb-date-${i}`);
      if (!inp) continue;
      const v = (partBillingStages[i].date || "").trim();
      if (!v) {
        errors.push({
          id: `pb-date-${i}`,
          msg: `Stage ${i + 1}: delivery date is required.`,
        });
      } else if (inp.classList.contains("field-invalid")) {
        const hint = document.getElementById(`pb-date-hint-${i}`);
        errors.push({
          id: `pb-date-${i}`,
          msg: `Stage ${i + 1}: ${hint?.textContent || "delivery date is invalid"}.`,
        });
      }
    }
  } else {
    const delV = (document.getElementById("c-delivery")?.value || "").trim();
    if (!delV)
      errors.push({
        id: "c-delivery",
        msg: "Delivery date is required (DD/MM/YYYY).",
      });
    else if (!isValidDateStr(delV))
      errors.push({
        id: "c-delivery",
        msg: "Delivery date is not a valid date (DD/MM/YYYY).",
      });
    if (isValidDateStr(cldV) && isValidDateStr(delV) && pd(delV) < pd(cldV))
      errors.push({ id: "c-delivery", msg: "Delivery date is before the CLD." });
  }

  if (!cargoValidateSplit())
    errors.push({
      id: "c-inside",
      msg: "Inside + Outside weight must equal Total Weight.",
    });
  if (!cargoValidateRemovalTon())
    errors.push({
      id: "c-removalTon",
      msg:
        document.getElementById("c-removalTon")?.validationMessage ||
        "Removal cargo ton is invalid.",
    });
  if (!cargoValidateWeighmentTon())
    errors.push({
      id: "c-weighmentTon",
      msg:
        document.getElementById("c-weighmentTon")?.validationMessage ||
        "Weighment cargo ton is invalid.",
    });
  if (!cargoValidateSelfDriveTon()) {
    const iEl = document.getElementById("c-selfDriveTonInside");
    const oEl = document.getElementById("c-selfDriveTonOutside");
    const bad = iEl?.validationMessage ? iEl : oEl;
    errors.push({
      id: bad?.id || "c-selfDriveTonInside",
      msg: bad?.validationMessage || "Self-drive ton is invalid.",
    });
  }
  return errors;
}

// Surface collected errors in one toast; focus the first field. Returns true
// when there was at least one error (caller should abort).
function reportInputErrors(errors) {
  if (!errors || errors.length === 0) return false;
  const msg =
    errors.length === 1
      ? errors[0].msg
      : `Please fix ${errors.length} input issues:\n• ` +
        errors.map((e) => e.msg).join("\n• ");
  showToast(msg, "error");
  document.getElementById(errors[0].id)?.focus();
  return true;
}


// ════════════════════════════════════════
//  SHARED CONFIG (relocated from ROTATION section — used by car.js, platform.js)
// ════════════════════════════════════════
const PROXY_URL = "https://portbill-proxy.sasas.workers.dev";

// ════════════════════════════════════════
//  TONNAGE ROUNDING  (whole numbers only, rounded UP)
// ════════════════════════════════════════
// All weight/tonnage inputs across Car, Cargo, and Re-Export are whole
// numbers — fractional tons are always rounded UP to the next integer.
// Single source of truth; never use Math.round/Math.floor on tonnage.
function ceilTon(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : 0;
}
