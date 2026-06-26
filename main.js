// ════════════════════════════════════════
//  STATE
// ════════════════════════════════════════
const SP_CAR_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
  "<span>Fill in shipment details<br>to see live cost preview</span></div>";
const SP_CARGO_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="nonhe" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/>' +
  '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
  "<span>Fill in cargo details<br>to see live cost preview</span></div>";
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
  rRemoval: "350",
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
    +parts[1] >= 1 &&
    +parts[1] <= 12 &&
    +parts[0] >= 1 &&
    +parts[0] <= 31
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
  } catch (_) {
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

function resetRatesToDefaults() {
  if (!isAdmin) return;
  if (!confirm("সব rate factory default-এ reset হবে। নিশ্চিত?")) return;
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
const SAVED_BILLS_KEY = "pb_saved_bills";
const BILL_COUNTER_KEY = "pb_bill_counter";
let editingBillNumber = { car: null, cargo: null };

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
//  MODULE SWITCH
// ════════════════════════════════════════
function switchModule(mod) {
  if ((mod === "rotation" || mod === "saved") && !isAdmin) {
    showToast("Admin login required for this module", "warning");
    mod = "car";
  }
  const page = document.getElementById("page-" + mod);
  const activeTab = document.getElementById("tab-" + mod);
  if (!page || !activeTab || activeTab.hidden) return;
  currentModule = mod;
  document
    .querySelectorAll(".module-page")
    .forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  page.classList.add("active");
  activeTab.classList.add("active");
  activeTab.setAttribute("aria-selected", "true");
  document.body.classList.toggle("mode-cargo", mod === "cargo");
  document.body.classList.toggle("mode-rotation", mod === "rotation");
  document.body.classList.toggle("mode-saved", mod === "saved");
  if (mod === "saved") renderSavedBills();
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

function updateAdminNavigation() {
  const rotTab = document.getElementById("tab-rotation");
  const rotPage = document.getElementById("page-rotation");
  const savedTab = document.getElementById("tab-saved");
  const savedPage = document.getElementById("page-saved");
  if (rotTab) {
    rotTab.hidden = !isAdmin;
    rotTab.tabIndex = isAdmin ? 0 : -1;
    rotTab.setAttribute("aria-hidden", isAdmin ? "false" : "true");
  }
  if (savedTab) {
    savedTab.hidden = !isAdmin;
    savedTab.tabIndex = isAdmin ? 0 : -1;
    savedTab.setAttribute("aria-hidden", isAdmin ? "false" : "true");
  }
  if (!isAdmin) {
    closeAdminPasswordPanel();
    if (rotPage) rotPage.classList.remove("active");
    if (savedPage) savedPage.classList.remove("active");
    if (currentModule === "rotation" || currentModule === "saved") switchModule("car");
  }
}

// ════════════════════════════════════════
//  UTILS
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
    blNumber: escHtml(readTextValue(prefix + "-blNumber")),
    cnfName: escHtml(readTextValue(prefix + "-cnfName")),
    billEntryNumber: escHtml(readTextValue(prefix + "-billEntry")),
  };
}
function billDateKey(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}
function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") ?? fallback;
  } catch (_) {
    return fallback;
  }
}
function nextBillNumber(type) {
  const prefix = type === "cargo" ? "GCA" : "CA";
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
  return b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
}
function billInputSnapshot(type) {
  const root = document.getElementById(type === "cargo" ? "cargo-inputSection" : "car-inputSection");
  if (!root) return {};
  const data = {};
  root.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.id) return;
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return data;
}
function billHtmlSnapshot(type) {
  const ids = type === "cargo"
    ? ["cargo-ibar", "cargo-srow", "cargo-insideSec", "cargo-outsideSec", "cargo-breakdownSec", "cargo-grandSec"]
    : ["car-ibar", "car-srow", "car-insideSec", "car-outsideSec", "car-grandSec"];
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
function saveBill(type) {
  const b = type === "cargo" ? lastCargoBill : lastCarBill;
  if (!b) {
    showToast("Generate the bill first before saving.", "warning");
    return;
  }
  const errors = type === "cargo" ? collectCargoErrors() : collectCarErrors();
  if (reportInputErrors(errors)) return;
  if (!b.billNumber) b.billNumber = editingBillNumber[type] || nextBillNumber(type);
  b.savedAt = new Date().toISOString();
  const metadata = {
    blNumber: b.blNumber || "",
    cnfName: b.cnfName || "",
    billEntryNumber: b.billEntryNumber || "",
  };
  persistSavedBill({
    billNumber: b.billNumber,
    type,
    module: type === "cargo" ? "General Cargo" : "Car",
    savedAt: b.savedAt,
    cld: fd(b.cld),
    delivery: b.delivery ? fd(b.delivery) : "",
    metadata,
    total: totalForBill(type, b),
    totalFormatted: fmt(totalForBill(type, b)),
    inputs: billInputSnapshot(type),
    partBillingStages: type === "cargo" ? JSON.parse(JSON.stringify(partBillingStages)) : null,
    html: billHtmlSnapshot(type),
  });
  editingBillNumber[type] = null;
  renderBillNumberBadge(type, b.billNumber);
  showToast(`Saved bill ${b.billNumber}`, "success");
  if (currentModule === "saved") renderSavedBills();
  // Sync to GitHub (async, non-blocking)
  saveBillsToWorker(getSavedBills()).then(ok => {
    if (!ok) showToast("GitHub sync failed — saved locally only", "warning");
  });
}
function renderBillNumberBadge(type, billNumber) {
  if (!billNumber) return;
  const ibar = document.getElementById(type === "cargo" ? "cargo-ibar" : "car-ibar");
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

// ════════════════════════════════════════
//  SLAB CALC (shared)
// ════════════════════════════════════════
// eslint-disable-next-line sonarjs/max-params
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

// ════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════
function toggleAdmin() {
  if (isAdmin) {
    isAdmin = false;
    applyAdmin();
    showToast("Logged out of admin mode", "info");
    return;
  }
  document.getElementById("muser").value = "";
  document.getElementById("mpass").value = "";
  document.getElementById("merr").classList.remove("show");
  const dlg = document.getElementById("overlay");
  dlg.showModal();
  requestAnimationFrame(() => dlg.classList.add("is-open"));
  setTimeout(() => document.getElementById("muser").focus(), 200);
}
function closeModal() {
  const dlg = document.getElementById("overlay");
  dlg.classList.remove("is-open");
  setTimeout(() => dlg.close(), 320);
}
async function doLogin() {
  const u = document.getElementById("muser").value.trim();
  const p = document.getElementById("mpass").value;
  const errEl = document.getElementById("merr");
  if (loginAttempts >= 5) {
    errEl.textContent =
      "Too many failed attempts. Please close this tab and try again.";
    errEl.classList.add("show");
    document.getElementById("mpass").value = "";
    return;
  }
  try {
    const hash = await hashText(p);
    if (u === AU && hash === getAdminPasswordHash()) {
      loginAttempts = 0;
      _setAttempts(0);
      isAdmin = true;
      closeModal();
      applyAdmin();
      switchModule("rotation");
      showToast("Admin mode activated", "success");
    } else {
      loginAttempts++;
      _setAttempts(loginAttempts);
      const remaining = 5 - loginAttempts;
      errEl.textContent =
        remaining > 0
          ? `Invalid username or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many failed attempts. Please close this tab and try again.";
      errEl.classList.add("show");
      document.getElementById("mpass").value = "";
      document.getElementById("mpass").focus();
    }
  } catch (e) {
    errEl.textContent =
      e.message === "no-subtle"
        ? "Login requires a secure context (HTTPS). Open the app via a web server."
        : "Login failed due to a browser error. Please try again.";
    errEl.classList.add("show");
    document.getElementById("mpass").value = "";
  }
}

function closeAdminPasswordPanel() {
  const card = document.getElementById("adminPassCard");
  const badge = document.getElementById("modeBadge");
  if (card) card.hidden = true;
  if (badge) badge.setAttribute("aria-expanded", "false");
}

function openAdminPasswordPanel() {
  if (!isAdmin) return;
  const card = document.getElementById("adminPassCard");
  const badge = document.getElementById("modeBadge");
  const statusEl = document.getElementById("adminPassStatus");
  if (!card) return;
  const willOpen = card.hidden;
  card.hidden = !willOpen;
  if (badge) badge.setAttribute("aria-expanded", willOpen ? "true" : "false");
  if (!willOpen) return;
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "rot-reg-status admin-pass-status";
  }
  requestAnimationFrame(() => {
    const currentEl = document.getElementById("adminCurrentPass");
    if (currentEl) currentEl.focus();
  });
}
async function changeAdminPassword() {
  if (!isAdmin) return;
  const currentEl = document.getElementById("adminCurrentPass");
  const newEl = document.getElementById("adminNewPass");
  const confirmEl = document.getElementById("adminConfirmPass");
  const statusEl = document.getElementById("adminPassStatus");
  const setStatus = (msg, state) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "rot-reg-status admin-pass-status" + (state ? " " + state : "");
  };
  const currentPass = currentEl ? currentEl.value : "";
  const newPass = newEl ? newEl.value : "";
  const confirmPass = confirmEl ? confirmEl.value : "";

  if (!currentPass || !newPass || !confirmPass) {
    setStatus("Please fill all password fields", "err");
    return;
  }
  if (newPass.length < 6) {
    setStatus("New password must be at least 6 characters", "err");
    return;
  }
  if (newPass !== confirmPass) {
    setStatus("New password and confirmation do not match", "err");
    return;
  }

  try {
    if ((await hashText(currentPass)) !== getAdminPasswordHash()) {
      setStatus("Current password is incorrect", "err");
      if (currentEl) currentEl.focus();
      return;
    }
  const newHash = await hashText(newPass);
  localStorage.setItem(ADMIN_PASS_STORAGE_KEY, newHash);
  _cloudPasswordHash = newHash;
  saveConfigToWorker({ adminPasswordHash: newHash });
    loginAttempts = 0;
    _setAttempts(0);
    [currentEl, newEl, confirmEl].forEach((el) => {
      if (el) el.value = "";
    });
    setStatus("Admin password updated", "ok");
    showToast("Admin password updated", "success");
  } catch (e) {
    setStatus(
      e.message === "no-subtle"
        ? "Password change requires HTTPS or localhost"
        : "Password update failed. Please try again.",
      "err",
    );
  }
}

// ════════════════════════════════════════
// RESTORE FROM GITHUB (Admin Only)
// ════════════════════════════════════════

function applyAdmin() {
  document.getElementById("adot").style.background = isAdmin
    ? "var(--gold)"
    : "var(--m2)";
  document.getElementById("adminTxt").textContent = isAdmin
    ? "Logout"
    : "Admin";
  const adminIcon = document.getElementById("adminIcon");
  if (adminIcon) adminIcon.style.display = isAdmin ? "none" : "block";
  const modeBadge = document.getElementById("modeBadge");
  modeBadge.style.display = isAdmin ? "inline-flex" : "none";
  modeBadge.textContent = isAdmin ? "ADMIN" : "USER";
  modeBadge.tabIndex = isAdmin ? 0 : -1;
  modeBadge.setAttribute("aria-label", "Change admin password");
  if (!isAdmin) closeAdminPasswordPanel();
  isAdmin
    ? document.getElementById("adminBtn").classList.add("active")
    : document.getElementById("adminBtn").classList.remove("active");
  const rrb = document.getElementById("resetRatesBtn");
  if (rrb) rrb.style.display = isAdmin ? "inline-flex" : "none";


  // CAR admin fields
  [
    "freeDays",
    "rRiver",
    "rLanding",
    "rRemoval",
    "rWeighment",
    "rHoisting",
    "rLevy",
    "vatRate",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isAdmin) {
      el.removeAttribute("readonly");
      el.classList.remove("ro");
      el.classList.add("ae");
    } else {
      el.setAttribute("readonly", "");
      el.classList.add("ro");
      el.classList.remove("ae");
    }
  });
  ["nr1", "nr2", "nr3", "or1", "or2", "or3"].forEach((id) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById("d" + id);
    if (isAdmin) {
      inp.style.display = "inline-block";
      inp.classList.remove("ro");
      inp.removeAttribute("readonly");
      if (spn) spn.style.display = "none";
    } else {
      inp.style.display = "none";
      inp.classList.add("ro");
      inp.setAttribute("readonly", "");
      if (spn) {
        spn.style.display = "inline";
        spn.textContent = inp.value;
      }
    }
  });

  // CARGO admin fields (Landing/Removal/Hoisting are formula-derived — always locked)
  ["c-freeDays", "c-rRiver", "c-rWeighment", "c-rLevy", "c-vatRate"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isAdmin) {
        el.removeAttribute("readonly");
        el.classList.remove("ro");
        el.classList.add("ae");
      } else {
        el.setAttribute("readonly", "");
        el.classList.add("ro");
        el.classList.remove("ae");
      }
    },
  );
  ["c-or1", "c-or2", "c-or3"].forEach((id) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById(id.replace("c-", "c-d"));
    if (isAdmin) {
      inp.style.display = "inline-block";
      inp.classList.remove("ro");
      inp.removeAttribute("readonly");
      if (spn) spn.style.display = "none";
    } else {
      inp.style.display = "none";
      inp.classList.add("ro");
      inp.setAttribute("readonly", "");
      if (spn) {
        spn.style.display = "inline";
        spn.textContent = inp.value;
      }
    }
  });

  applyRotationAccessState();
  carRefresh();
  cargoRefresh();
}

// ════════════════════════════════════════
//  ── CAR MODULE ──
// ════════════════════════════════════════
function onWeightChange() {
  const w = Number.parseFloat(document.getElementById("weight")?.value);
  const warn = document.getElementById("weightWarn");
  const chkHoisting = document.getElementById("chkHoisting");
  const rHoisting = document.getElementById("rHoisting");
  const rLanding = nn("rLanding");
  if (w > 3) {
    if (chkHoisting) chkHoisting.checked = true;
    if (rHoisting) rHoisting.value = (rLanding * 1.25 * 0.5).toFixed(3);
    warn?.classList.add("show");
  } else {
    if (chkHoisting) chkHoisting.checked = false;
    if (rHoisting) rHoisting.value = 0;
    warn?.classList.remove("show");
  }
  carRefresh();
}

function carCompute() {
  const meta = readMeta("car");
  const cld = pd(document.getElementById("cld").value);
  const _fdRaw = Number.parseInt(document.getElementById("freeDays").value, 10);
  const freeDays = Number.isNaN(_fdRaw) ? 4 : Math.max(0, _fdRaw);
  const freeEnd = freeDays === 0 ? addD(cld, -1) : addD(cld, freeDays - 1);
  const storStart = addD(freeEnd, 1);
  const delivery = pd(document.getElementById("delivery").value);
  const weight = Math.max(
    1,
    Math.round(Number.parseFloat(document.getElementById("weight").value) || 2),
  );
  const vatRate = Math.min(1, Math.max(0, gn("vatRate") / 100));
  const nr1 = nn("nr1"),
    nr2 = nn("nr2"),
    nr3 = nn("nr3");
  const or1 = nn("or1"),
    or2 = nn("or2"),
    or3 = nn("or3");
  const cldBeforeCut = cld < CUT;
  const deliveryCrossCut = delivery >= CUT;
  const hasWharfrent = delivery > freeEnd;
  let slabs = [],
    totalDays = 0,
    isSplit = false,
    rateMode = "new";
  if (hasWharfrent) {
    totalDays = diffD(freeEnd, delivery);
    if (!cldBeforeCut) {
      rateMode = "new";
      slabs = calcSlabs(
        totalDays,
        nr1,
        nr2,
        nr3,
        weight,
        storStart,
        delivery,
        0,
      );
    } else if (deliveryCrossCut === false) {
      rateMode = "old";
      slabs = calcSlabs(
        totalDays,
        or1,
        or2,
        or3,
        weight,
        storStart,
        delivery,
        0,
      );
    } else {
      const oldDays = diffD(freeEnd, CUT_OLD);
      if (oldDays <= 0) {
        // freeEnd is on or after the rate cutoff — wharfrent starts entirely within new rates
        rateMode = "new";
        slabs = calcSlabs(
          totalDays,
          nr1,
          nr2,
          nr3,
          weight,
          storStart,
          delivery,
          0,
        );
      } else {
        isSplit = true;
        rateMode = "split";
        const newDays = diffD(CUT_OLD, delivery);
        const oldSlabs = calcSlabs(
          oldDays,
          or1,
          or2,
          or3,
          weight,
          storStart,
          CUT_OLD,
          0,
        );
        const newSlabs = calcSlabs(
          newDays,
          nr1,
          nr2,
          nr3,
          weight,
          CUT,
          delivery,
          oldDays,
        );
        oldSlabs.forEach((s) => (s.group = "old"));
        newSlabs.forEach((s) => (s.group = "new"));
        slabs = [...oldSlabs, ...newSlabs];
      }
    }
  }
  const insideStor = slabs.reduce((a, s) => a + s.amt, 0);
  const outsideHalf = insideStor * 0.5;
  // Payable charges (always apply) - matching index_base.html logic
  const payables = [];
  if (gb("chkRiver"))
    payables.push({
      label: "River Dues",
      rate: nn("rRiver"),
      amt: nn("rRiver") * weight,
    });
  if (gb("chkLanding"))
    payables.push({
      label: "Landing Charge",
      rate: nn("rLanding"),
      amt: nn("rLanding") * weight,
    });
  if (gb("chkRemoval"))
    payables.push({
      label: "Removal Charge",
      rate: nn("rRemoval"),
      amt: nn("rRemoval") * weight,
    });
  if (gb("chkWeighment"))
    payables.push({
      label: "Weighment Charge",
      rate: nn("rWeighment"),
      amt: nn("rWeighment") * weight,
    });
  if (gb("chkHoisting"))
    payables.push({
      label: "Hoisting Charge",
      rate: nn("rHoisting"),
      rateStr: `${fmtN(nn("rLanding") * 1.25)} × 0.50`,
      amt: nn("rLanding") * 1.25 * 0.5 * weight,
    });
  const levyAmt = gb("chkLevy") ? nn("rLevy") * weight : 0;
  const r2 = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
  const paySub = payables.reduce((a, p) => a + p.amt, 0);
  // Car module: Inside (full rate) and Outside (½ rate) are each a COMPLETE
  // bill — base (wharfrent + payables) + its own VAT + its own Levy. VAT and
  // Levy are shown per section, and the Car Grand Total is their sum.
  const iBase = r2(insideStor + paySub);
  const iVat = r2(iBase * vatRate);
  const iLevy = levyAmt;
  const iTotal = r2(iBase + iVat + iLevy);
  const oBase = r2(outsideHalf + paySub);
  const oVat = r2(oBase * vatRate);
  const oLevy = levyAmt;
  const oTotal = r2(oBase + oVat + oLevy);
  const nBase = r2(paySub);
  const nVat = r2(nBase * vatRate);
  const nLevy = levyAmt;
  const nTotal = r2(nBase + nVat + nLevy);
  return {
    ...meta,
    billNumber: "",
    cld,
    freeEnd,
    storStart,
    delivery,
    weight,
    vatRate,
    cldBeforeCut,
    isSplit,
    rateMode,
    hasWharfrent,
    totalDays,
    slabs,
    insideStor,
    outsideHalf,
    payables,
    paySub,
    levyAmt,
    iBase,
    iVat,
    iLevy,
    iTotal,
    oBase,
    oVat,
    oLevy,
    oTotal,
    nBase,
    nVat,
    nLevy,
    nTotal,
  };
}

function carRefreshNow() {
  try {
    validateDateField("cld", "cld-hint", "CLD");
    validateDateField("delivery", "delivery-hint", "delivery date");
    validateDateOrder("cld", "delivery", "delivery-hint");
    const cld_ = pd(document.getElementById("cld").value);
    const _fd_raw = Number.parseInt(
      document.getElementById("freeDays").value,
      10,
    );
    const fd_ = Number.isNaN(_fd_raw) ? 4 : Math.max(0, _fd_raw);
    const freeEnd = fd_ === 0 ? addD(cld_, -1) : addD(cld_, fd_ - 1);
    const storStartDate = addD(freeEnd, 1);
    document.getElementById("car-freeEnd").textContent = fd(freeEnd);
    document.getElementById("car-storStart").textContent = fd(storStartDate);
    const strip = document.getElementById("car-ftStrip");
    const ftDaysEl = document.getElementById("car-ftDays");
    if (strip && ftDaysEl) {
      const dayLabels = [];
      for (let i = 0; i < fd_; i++) {
        const d = addD(cld_, i);
        dayLabels.push(
          d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          }),
        );
      }
      ftDaysEl.innerHTML =
        fd_ === 0
          ? `<span style="color:var(--m2)">No free time — </span><span style="color:var(--green);font-weight:600;">Car Wharfrent starts ${storStartDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>`
          : '<span style="color:var(--m2)">Free: </span>' +
            dayLabels
              .map(
                (d) =>
                  `<span style="background:rgba(212,175,55,0.13);border:1px solid rgba(212,175,55,0.20);color:var(--gold);border-radius:4px;padding:1px 7px;margin:0 2px;">${d}</span>`,
              )
              .join("") +
            `<span style="color:var(--m2)"> → Car Wharfrent starts </span><span style="color:var(--green);font-weight:600;">${storStartDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>`;
      strip.style.display = "block";
    }
    ["nr1", "nr2", "nr3", "or1", "or2", "or3"].forEach((id) => {
      const sp = document.getElementById("d" + id);
      if (sp) sp.textContent = document.getElementById(id).value;
    });
    const w = Math.max(
      1,
      Math.round(
        Number.parseFloat(document.getElementById("weight").value) || 2,
      ),
    );
    const rLanding = nn("rLanding");
    const rHoistingEl = document.getElementById("rHoisting");
    if (w > 3) {
      rHoistingEl.value = (rLanding * 1.25 * 0.5).toFixed(3);
    } else {
      rHoistingEl.value = 0;
    }
    const b = carCompute();
    if (!b) return;
    const rateBadgeHtml =
      b.rateMode === "split"
        ? '<div class="rbadge rb-split">⚡ SPLIT BILLING — Old + New rates</div>'
        : b.rateMode === "old"
          ? '<div class="rbadge rb-old">● OLD RATES (Up to 22/07/2024)</div>'
          : '<div class="rbadge rb-new">● NEW RATES (From 23/07/2024)</div>';
    document.getElementById("rbadge").innerHTML = rateBadgeHtml;
    const pv = document.getElementById("car-preview");
    if (b.hasWharfrent) {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Car Wharfrent Days</span><span class="pvr-val v-gold">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Total (incl. VAT &amp; Levy)</span><span class="pvr-val v-blue">${fmt(b.iTotal)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Total (incl. VAT &amp; Levy)</span><span class="pvr-val v-purple">${fmt(b.oTotal)}</span></div>` +
        `<div class="pvr pvr-grand"><span class="pvr-lbl">Car Grand Total</span><span class="pvr-val v-gold">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Car Wharfrent</span><span class="pvr-val v-green">Within Free Time ✓</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Car Payable Charges</span><span class="pvr-val">${fmt(b.paySub)}</span></div>` +
        `<div class="pvr pvr-grand"><span class="pvr-lbl">Car Grand Total</span><span class="pvr-val v-gold">${fmt(b.nTotal)}</span></div>`;
    }
    if (isAdmin && !isInitialLoad) saveRates();
  } catch (_) {
    document.getElementById("car-preview").innerHTML = SP_CAR_IDLE;
  }
}
let carRefreshQueued = false;
function carRefresh() {
  if (carRefreshQueued) return;
  carRefreshQueued = true;
  requestAnimationFrame(() => {
    carRefreshQueued = false;
    carRefreshNow();
  });
}

// eslint-disable-next-line sonarjs/cognitive-complexity
// Combined VAT / Levy / Grand-Total summary rows. VAT and Levy are charged ONCE
// on the combined inside+outside base (b.gBase) and shown a single time at the
// foot of the bill — not per section. Shared by both modules, screen + print.
function buildCombinedSummaryRows(b) {
  let rows = `<tr class="tot"><td colspan="5">Total Bill (Base for VAT) — Inside + Outside</td><td>${fmt(b.gBase)}</td></tr>`;
  if (b.gVat > 0)
    rows += `<tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(2)}%</td><td>${fmt(b.gVat)}</td></tr>`;
  if (b.gLevy > 0)
    rows += `<tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(b.gLevy)}</td></tr>`;
  rows += `<tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(b.gTotal)}</td></tr>`;
  return rows;
}
function buildCombinedSummaryTable(b) {
  return `<div class="btw"><table class="bt"><tbody>${buildCombinedSummaryRows(b)}</tbody></table></div>`;
}

function buildCarBillTable(b, side) {
  //NOSONAR
  let rows = "";
  if (side === "inside" || side === "outside") {
    const storAmt = side === "inside" ? b.insideStor : b.outsideHalf;
    const baseAmt = side === "inside" ? b.iBase : b.oBase;
    const vatAmt = side === "inside" ? b.iVat : b.oVat;
    const levyAmt = side === "inside" ? b.iLevy : b.oLevy;
    const totalAmt = side === "inside" ? b.iTotal : b.oTotal;
    const baseLabel =
      side === "inside"
        ? "Inside Sub-Total (Base for VAT)"
        : "Outside Sub-Total (½ Rate · Base for VAT)";
    const storLabel =
      side === "inside"
        ? "Car Wharfrent Sub-Total"
        : "Car Wharfrent Sub-Total (½ Rate)";
    if (b.hasWharfrent) {
      if (b.isSplit) {
        const oldS = b.slabs.filter((s) => s.group === "old");
        const newS = b.slabs.filter((s) => s.group === "new");
        if (oldS.length) {
          rows += `<tr class="sep"><td colspan="6">◀ Old Rate Period — Up to 22/07/2024</td></tr>`;
          oldS.forEach((s) => {
            const da = side === "inside" ? s.amt : s.amt * 0.5;
            rows += `<tr><td>${s.label}</td><td style="color:var(--red)">${fmtN(s.rate)}/t/d${side === "inside" ? "" : " × 0.50"}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
          });
        }
        if (newS.length) {
          rows += `<tr class="sep"><td colspan="6">▶ New Rate Period — From 23/07/2024</td></tr>`;
          newS.forEach((s) => {
            const da = side === "inside" ? s.amt : s.amt * 0.5;
            rows += `<tr><td>${s.label}</td><td style="color:var(--green)">${fmtN(s.rate)}/t/d${side === "inside" ? "" : " × 0.50"}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
          });
        }
      } else {
        b.slabs.forEach((s) => {
          const da = side === "inside" ? s.amt : s.amt * 0.5;
          rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${side === "inside" ? "" : " × 0.50"}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
        });
      }
      rows += `<tr class="sub"><td colspan="4">${storLabel}</td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(storAmt)}</td></tr>`;
    }
    if (b.payables.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
      b.payables.forEach((p) => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">${baseLabel}</td><td>${fmt(baseAmt)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(2)}%</td><td>${fmt(vatAmt)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(levyAmt)}</td></tr><tr class="grand"><td colspan="5">${side === "inside" ? "INSIDE" : "OUTSIDE"} TOTAL</td><td>${fmt(totalAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach((p) => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(2)}%</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(b.nTotal)}</td></tr>`;
  }
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function carCalculate() {
  //NOSONAR
  if (reportInputErrors(collectCarErrors())) return;
  let b;
  try {
    b = carCompute();
  } catch (_) {
    showToast("Billing calculation failed — please check inputs and try again.", "error");
    return;
  }
  if (!b) return;
  lastCarBill = b;
  try {
    document.getElementById("results").style.display = "block";
    const wharfrentStarts = b.hasWharfrent ? fd(b.storStart) : "—";
    const wharfrentDaysText = b.hasWharfrent
      ? `${b.totalDays} days`
      : "In free time";
    const rateModeColor =
      b.rateMode === "split"
        ? "var(--gold)"
        : b.rateMode === "old"
          ? "var(--red)"
          : "var(--green)";
    const rateModeText =
      b.rateMode === "split"
        ? "Split"
        : b.rateMode === "old"
          ? "Old Rates"
          : "New Rates";
    document.getElementById("car-ibar").innerHTML =
      `<div class="ibar"><div>${b.billNumber ? `<div class="ii bill-no-ii"><div class="il">Bill Number</div><div class="iv bill-no-val">${b.billNumber}</div></div>` : ""}${b.blNumber ? `<div class="ii"><div class="il">BL Number</div><div class="iv">${b.blNumber}</div></div>` : ""}${b.billEntryNumber ? `<div class="ii"><div class="il">Bill of Entry</div><div class="iv">${b.billEntryNumber}</div></div>` : ""}${b.cnfName ? `<div class="ii"><div class="il">C&amp;F Agent</div><div class="iv">${b.cnfName}</div></div>` : ""}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Car Wharfrent Starts</div><div class="iv">${wharfrentStarts}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Weight</div><div class="iv">${b.weight} ton(s)</div></div><div class="ii"><div class="il">Car Wharfrent Days</div><div class="iv" style="color:var(--gold)">${wharfrentDaysText}</div></div><div class="ii"><div class="il">Rate Mode</div><div class="iv" style="color:${rateModeColor}">${rateModeText}</div></div></div></div>`;
    if (b.hasWharfrent) {
      document.getElementById("car-srow").innerHTML =
        `<div class="sc cg"><div class="sl">Car Grand Total</div><div class="sv">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">Inside + Outside · incl. VAT &amp; Levy</div></div><div class="sc cb"><div class="sl">Inside Total (Full Rate)</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div><div class="sc cp"><div class="sl">Outside Total (½ Rate)</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div>`;
      document.getElementById("car-insideSec").innerHTML =
        `<div style="margin-bottom:20px;">${b.isSplit ? '<div class="warn">⚡ Split Billing — Old rates applied up to 22/07/2024 · New rates from 23/07/2024</div>' : ""}<div class="slbl sl-in">▪ Inside Car Wharfrent</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, "inside")}</div></div>`;
      document.getElementById("car-outsideSec").innerHTML =
        `<div style="margin-bottom:20px;"><div class="slbl sl-out">▪ Outside Car Wharfrent (½ Rate)</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, "outside")}</div></div>`;
    } else {
      document.getElementById("car-insideSec").innerHTML =
        '<div class="no-stor-note">✓ Delivery within free time — no Car Wharfrent charge applies.</div>';
      document.getElementById("car-outsideSec").innerHTML =
        `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Payable Charges — Inside &amp; Outside</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, "noWharfrent")}</div></div>`;
    }
    const grand = b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
    const carGrandSplitHtml = b.hasWharfrent
      ? `<div><div class="glbl">Inside Total</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">Incl. VAT &amp; Levy</div></div><div><div class="glbl">Outside Total</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">Incl. VAT &amp; Levy</div></div>`
      : `<div><div class="glbl">Payable Charges Only</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">Delivery within free time</div></div><div></div>`;
    document.getElementById("car-grandSec").innerHTML =
      `<div class="gbox"><div class="ginn">${carGrandSplitHtml}<div class="gfin"><div class="glbl">CAR GRAND TOTAL</div><div class="gval">${fmt(grand)}</div><div class="gsub">Tk — VAT &amp; Levy incl.</div></div></div></div>`;
    const carEmpty = document.getElementById("car-empty");
    if (carEmpty) carEmpty.style.display = "none";
    const carGbox = document.querySelector("#car-grandSec .gbox");
    if (carGbox) { carGbox.classList.remove("just-calculated"); void carGbox.offsetWidth; carGbox.classList.add("just-calculated"); }
    if (!isInitialLoad) {
      setTimeout(
        () =>
          document
            .getElementById("results")
            .scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    }
  } catch (_) {
    showToast("Display error — bill may not render correctly.", "warning");
  }
}

function carReset() {
  document.getElementById("results").style.display = "none";
  document.getElementById("car-preview").innerHTML = SP_CAR_IDLE;
  ["car-blNumber", "car-cnfName"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  const carBoE = document.getElementById("car-billEntry");
  if (carBoE) carBoE.value = "C-";
  lastCarBill = null;
  editingBillNumber.car = null;
  document.getElementById("weight").value = 2;
  document.getElementById("chkHoisting").checked = false;
  document.getElementById("weightWarn").classList.remove("show");
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

// ════════════════════════════════════════
//  ── CARGO MODULE ──
// ════════════════════════════════════════
// Security Note: innerHTML usage below is safe as it only uses:
// - Controlled template literals with formatted numbers
// - Static HTML strings with no user input
// - fmt() and fmtN() functions for safe number formatting

// Landing tier: ≤3t=90, 3.001–20t=180, >20t=250 Tk/ton
function getCargoLandingTierRate(totalWeight) {
  if (totalWeight <= 0) return 0;
  if (totalWeight <= 3) return 90;
  if (totalWeight <= 20) return 180;
  return 250;
}

function getCargoTierLabel(totalWeight) {
  if (totalWeight <= 0) return "0t — 0 Tk/ton";
  if (totalWeight <= 3) return "≤3t — 90 Tk/ton";
  if (totalWeight <= 20) return ">3t–≤20t — 180 Tk/ton";
  return ">20t — 250 Tk/ton";
}

/**
 * Validates that inside + outside weights equal total weight
 * Uses cached DOM elements for performance optimization
 * @returns {boolean} True if weights match, false otherwise
 */
function cargoValidateSplit() {
  const total = Math.round(
    Number.parseFloat(document.getElementById("c-weight").value) || 0,
  );
  const inside = Math.round(
    Number.parseFloat(document.getElementById("c-inside").value) || 0,
  );
  const outside = Math.round(
    Number.parseFloat(document.getElementById("c-outside").value) || 0,
  );
  const sum = inside + outside;
  const check =
    domCache.cargo.totalCheck || document.getElementById("c-totalCheck");
  const match = Math.abs(sum - total) < 0.001;
  check.className = "io-total-badge " + (match ? "io-ok" : "io-err");
  check.innerHTML = match
    ? `✓ ${fmtN(sum)} ton(s)`
    : `✗ ${fmtN(sum)} ≠ ${fmtN(total)}`;
  return match;
}

function cargoValidateWeighmentTon(showAlert = false) {
  const weighmentChecked = gb("c-chkWeighment");
  const weighmentTon = Math.round(
    Number.parseFloat(document.getElementById("c-weighmentTon").value) || 0,
  );
  const weighmentInput = document.getElementById("c-weighmentTon");
  const totalWeight = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-weight").value) || 0,
    ),
  );

  const valid =
    !weighmentChecked || (weighmentTon > 0 && weighmentTon <= totalWeight);
  let msg =
    "Enter weighment cargo ton greater than 0 when Weighment Charge is checked.";
  if (weighmentChecked && weighmentTon > totalWeight) {
    msg = "Weighment cargo ton cannot be greater than total weight.";
  }
  weighmentInput.setCustomValidity(valid ? "" : msg);
  if (!valid && showAlert) showToast(msg, "error");
  return valid;
}

function cargoValidateRemovalTon(showAlert = false) {
  const removalChecked = gb("c-chkRemoval");
  const removalTon = Math.round(
    Number.parseFloat(document.getElementById("c-removalTon").value) || 0,
  );
  const removalInput = document.getElementById("c-removalTon");
  const totalWeight = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-weight").value) || 0,
    ),
  );
  const outsideTons = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-outside").value) || 0,
    ),
  );

  // Bounds only matter when the charge is enabled; unchecked = always valid
  const valid =
    !removalChecked ||
    (removalTon > 0 &&
      outsideTons > 0 &&
      removalTon <= totalWeight &&
      removalTon <= outsideTons);
  let msg =
    "Enter removal cargo ton greater than 0 when Removal Charge is checked.";
  if (removalChecked) {
    if (removalTon > totalWeight) {
      msg = "Removal cargo ton cannot be greater than total weight.";
    } else if (outsideTons === 0) {
      msg = "Removal charges cannot be applied when outside tons are 0.";
    } else if (removalTon > outsideTons) {
      msg = "Removal cargo ton cannot be greater than outside tons.";
    }
  }
  removalInput.setCustomValidity(valid ? "" : msg);
  if (!valid && showAlert) showToast(msg, "error");
  return valid;
}

function cargoValidateSelfDriveTon(showAlert = false) {
  const insideChecked = gb("c-chkSelfDriveInside");
  const outsideChecked = gb("c-chkSelfDriveOutside");
  const insideEl = document.getElementById("c-selfDriveTonInside");
  const outsideEl = document.getElementById("c-selfDriveTonOutside");
  const insideTon = Math.round(Number.parseFloat(insideEl?.value) || 0);
  const outsideTon = Math.round(Number.parseFloat(outsideEl?.value) || 0);
  const insideW = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-inside").value) || 0,
    ),
  );
  const outsideW = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-outside").value) || 0,
    ),
  );

  let insideMsg = "";
  let outsideMsg = "";
  if (insideChecked && insideTon <= 0) {
    insideMsg = "Enter inside self drive weight greater than 0.";
  } else if (insideChecked && insideTon > insideW) {
    insideMsg = "Inside self drive weight cannot exceed inside tons.";
  }
  if (outsideChecked && outsideTon <= 0) {
    outsideMsg = "Enter outside self drive weight greater than 0.";
  } else if (outsideChecked && outsideTon > outsideW) {
    outsideMsg = "Outside self drive weight cannot exceed outside tons.";
  }
  if (insideEl) insideEl.setCustomValidity(insideMsg);
  if (outsideEl) outsideEl.setCustomValidity(outsideMsg);
  const valid = insideMsg === "" && outsideMsg === "";
  if (!valid && showAlert) showToast(insideMsg || outsideMsg, "error");
  return valid;
}

// Validate every part-billing stage date against the running timeline. Each
// stage's delivery must fall on/after CLD (delivery within free time is allowed);
// later stages must be strictly after the previous stage's delivery. Mirrors the
// periodDays<=0 "invalid" gate in computePartBillingWharfrent, but surfaces the
// reason inline so the user knows why a stage isn't billing. Returns true when all dates are valid.
function validatePartBillingDates() {
  const cldEl = document.getElementById("c-cld");
  if (!cldEl) return true;
  const cldV = cldEl.value.trim();
  // CLD itself must be valid before stage dates can be anchored to a timeline.
  const cldOk = isValidDateStr(cldV);
  const cld = cldOk ? pd(cldV) : null;
  const _cfd = Number.parseInt(
    document.getElementById("c-freeDays")?.value,
    10,
  );
  const fdDays = Number.isNaN(_cfd) ? 4 : Math.max(0, _cfd);
  const freeEnd = cldOk
    ? fdDays === 0
      ? addD(cld, -1)
      : addD(cld, fdDays - 1)
    : null;

  let allValid = true;
  let prevEnd = freeEnd; // running reference; advances to each valid stage date
  for (let i = 0; i < partBillingStages.length; i++) {
    const hintId = `pb-date-hint-${i}`;
    if (!document.getElementById(hintId)) continue;
    const v = (partBillingStages[i].date || "").trim();
    if (!v) {
      setFieldState(`pb-date-${i}`, hintId, "muted", "DD/MM/YYYY");
      allValid = false;
      continue;
    }
    if (!isValidDateStr(v)) {
      setFieldState(`pb-date-${i}`, hintId, "error", "Invalid date");
      allValid = false;
      continue;
    }
    if (!cldOk) {
      // No valid CLD to order against yet — accept format, defer ordering.
      setFieldState(`pb-date-${i}`, hintId, "ok", v);
      continue;
    }
    const dDate = pd(v);
    const minDate = i === 0 ? cld : addD(prevEnd, 1);
    if (dDate < minDate) {
      const msg =
        i === 0
          ? `Must be on/after CLD (${fd(cld)})`
          : `Must be after ${fd(prevEnd)} (previous delivery)`;
      setFieldState(`pb-date-${i}`, hintId, "error", msg);
      allValid = false;
      // Do not advance prevEnd — subsequent stages still anchor to last valid date.
      continue;
    }
    setFieldState(`pb-date-${i}`, hintId, "ok", v);
    prevEnd = dDate;
  }
  return allValid;
}

// ════════════════════════════════════════
//  PRE-CALCULATE INPUT VALIDATION
// ════════════════════════════════════════
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
//  ── PART BILLING ──
// ════════════════════════════════════════
let partBillingStages = [
  {
    date: "",
    insideAfter: 0,
    outsideAfter: 0,
    sdInsideAfter: 0,
    sdOutsideAfter: 0,
  },
];
let partBillingUpToDate = false;
let cargoIncludeWharfrent = true;
let cargoIncludePayables = true;

function onCargoWharfrentToggle() {
  cargoIncludeWharfrent = !!document.getElementById("c-chkPrintWharfrent")
    ?.checked;
}

function onToggleAllPayables(on) {
  cargoIncludePayables = on;
}

let _pbSavedCharges = null;

function onPartBillingChange() {
  const enabled = !!document.getElementById("c-partBilling")?.checked;
  const pbCard = document.getElementById("c-pbStagesCard");
  const deliveryFg = document.getElementById("c-deliveryFg");
  const chkIds = [
    "c-chkRiver",
    "c-chkLanding",
    "c-chkRemoval",
    "c-chkWeighment",
    "c-chkHoisting",
    "c-chkLevy",
  ];
  if (enabled) {
    // Save current checkbox states before disabling them
    _pbSavedCharges = {};
    chkIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) _pbSavedCharges[id] = el.checked;
    });
    if (partBillingStages.length === 0) {
      partBillingStages = [
        {
          date: document.getElementById("c-delivery").value || "",
          insideAfter: 0,
          outsideAfter: 0,
          sdInsideAfter: 0,
          sdOutsideAfter: 0,
        },
      ];
    } else if (!partBillingStages[0].date) {
      partBillingStages[0].date =
        document.getElementById("c-delivery").value || "";
    }
    if (pbCard) pbCard.style.display = "";
    if (deliveryFg) deliveryFg.style.display = "none";
    chkIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    renderPartBillingStages();
  } else {
    if (pbCard) pbCard.style.display = "none";
    if (deliveryFg) deliveryFg.style.display = "";
    // Restore saved states; if none saved, default to true
    chkIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = _pbSavedCharges ? !!_pbSavedCharges[id] : true;
    });
    _pbSavedCharges = null;
  }
  cargoRefresh();
}

function renderPartBillingStages() {
  const container = document.getElementById("c-pbStagesContainer");
  if (!container) return;
  const total = partBillingStages.length;
  const showSdIn =
    !!document.getElementById("c-chkSelfDriveInside")?.checked &&
    pbMaxSdWeight(0, "inside") > 0;
  const showSdOut =
    !!document.getElementById("c-chkSelfDriveOutside")?.checked &&
    pbMaxSdWeight(0, "outside") > 0;
  container.innerHTML = partBillingStages
    .map((stage, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === total - 1;
      const _n = idx + 1,
        _v = _n % 10,
        _h = _n % 100;
      const _suf =
        _h >= 11 && _h <= 13
          ? "th"
          : _v === 1
            ? "st"
            : _v === 2
              ? "nd"
              : _v === 3
                ? "rd"
                : "th";
      const periodLabel = `${_n}${_suf} Delivery`;
      const maxIn = pbMaxWeight(idx, "inside");
      const maxOut = pbMaxWeight(idx, "outside");
      const maxSdIn = pbMaxSdWeight(idx, "inside");
      const maxSdOut = pbMaxSdWeight(idx, "outside");
      if ((stage.insideAfter || 0) > maxIn) {
        partBillingStages[idx].insideAfter = maxIn;
        stage.insideAfter = maxIn;
      }
      if ((stage.outsideAfter || 0) > maxOut) {
        partBillingStages[idx].outsideAfter = maxOut;
        stage.outsideAfter = maxOut;
      }
      if ((stage.sdInsideAfter || 0) > maxSdIn) {
        partBillingStages[idx].sdInsideAfter = maxSdIn;
        stage.sdInsideAfter = maxSdIn;
      }
      if ((stage.sdOutsideAfter || 0) > maxSdOut) {
        partBillingStages[idx].sdOutsideAfter = maxSdOut;
        stage.sdOutsideAfter = maxSdOut;
      }
      return `<div class="pbs-row${isLast ? " pbs-row-last" : ""}" id="pb-stage-${idx}">
      <div class="pbs-connector">
        <div class="pbs-dot"><span>${_n}</span></div>
        ${!isLast ? '<div class="pbs-line"></div>' : ""}
      </div>
      <div class="pbs-body">
        <div class="pbs-head">
          <div>
            <div class="pbs-title">${periodLabel}</div>
            <div class="pbs-sub">Stage ${_n} of ${total}</div>
          </div>
          ${
            !isFirst
              ? `<button type="button" class="pbs-del-btn" onclick="removePartBillingStage(${idx})" title="Remove stage">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>`
              : ""
          }
        </div>
        <div class="pbs-fields">
          <div class="fg">
            <label class="lbl" for="pb-date-${idx}">Delivery Date</label>
            <div class="date-field-wrap">
              <input type="text" id="pb-date-${idx}" class="cargo-glow" placeholder="DD/MM/YYYY" maxlength="10"
                value="${escHtml(stage.date)}"
                oninput="formatDate(this); partBillingStages[${idx}].date=this.value; cargoRefresh();" />
              <span class="cal" aria-hidden="true"></span>
            </div>
            <div class="field-hint hint-muted" id="pb-date-hint-${idx}">DD/MM/YYYY</div>
          </div>
          <div class="pbs-balance-wrap">
            <div class="pbs-balance-title">Remaining balance after this delivery</div>
            <div class="pbs-balance-grid">
              <div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-inside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--blue)"></span>Inside
                  ${maxIn > 0 ? `<span class="pbs-max-note">${maxSdIn > 0 ? `max&nbsp;${maxIn}t&nbsp;Normal&nbsp;+&nbsp;${maxSdIn}t&nbsp;SD` : `max&nbsp;${maxIn}t`}</span>` : ""}
                </label>
                <input type="number" id="pb-inside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.insideAfter ? `value="${stage.insideAfter}"` : ""} placeholder="0" min="0" ${maxIn > 0 ? `max="${maxIn}"` : ""} step="1"
                  oninput="pbBalanceChange(${idx},'inside',this.value);" />
              </div>
              <div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-outside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--purple)"></span>Outside
                  ${maxOut > 0 ? `<span class="pbs-max-note">${maxSdOut > 0 ? `max&nbsp;${maxOut}t&nbsp;Normal&nbsp;+&nbsp;${maxSdOut}t&nbsp;SD` : `max&nbsp;${maxOut}t`}</span>` : ""}
                </label>
                <input type="number" id="pb-outside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.outsideAfter ? `value="${stage.outsideAfter}"` : ""} placeholder="0" min="0" ${maxOut > 0 ? `max="${maxOut}"` : ""} step="1"
                  oninput="pbBalanceChange(${idx},'outside',this.value);" />
              </div>
              ${
                showSdIn
                  ? `<div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-sd-inside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--gold-hi)"></span><span style="color:var(--gold-hi)">SD</span> Inside
                  ${maxSdIn > 0 ? `<span class="pbs-max-note">max&nbsp;${maxSdIn}t</span>` : ""}
                </label>
                <input type="number" id="pb-sd-inside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.sdInsideAfter ? `value="${stage.sdInsideAfter}"` : ""} placeholder="0" min="0" ${maxSdIn > 0 ? `max="${maxSdIn}"` : ""} step="1"
                  oninput="pbSdBalanceChange(${idx},'inside',this.value);" />
              </div>`
                  : ""
              }
              ${
                showSdOut
                  ? `<div class="fg"${!showSdIn ? ' style="grid-column:2"' : ""}>
                <label class="lbl pbs-bal-lbl" for="pb-sd-outside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--gold-hi)"></span><span style="color:var(--gold-hi)">SD</span> Outside
                  ${maxSdOut > 0 ? `<span class="pbs-max-note">max&nbsp;${maxSdOut}t</span>` : ""}
                </label>
                <input type="number" id="pb-sd-outside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.sdOutsideAfter ? `value="${stage.sdOutsideAfter}"` : ""} placeholder="0" min="0" ${maxSdOut > 0 ? `max="${maxSdOut}"` : ""} step="1"
                  oninput="pbSdBalanceChange(${idx},'outside',this.value);" />
              </div>`
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
    </div>`;
    })
    .join("");
  const countEl = document.getElementById("c-pbStageCount");
  if (countEl)
    countEl.textContent = `${partBillingStages.length} stage${partBillingStages.length !== 1 ? "s" : ""}`;
}

function pbMaxWeight(idx, side) {
  if (idx === 0) {
    const total = Math.max(
      0,
      Math.round(
        parseFloat(
          document.getElementById(side === "inside" ? "c-inside" : "c-outside")
            ?.value,
        ) || 0,
      ),
    );
    const sdChkId =
      side === "inside" ? "c-chkSelfDriveInside" : "c-chkSelfDriveOutside";
    const sdKey =
      side === "inside" ? "c-selfDriveTonInside" : "c-selfDriveTonOutside";
    const sdOn = !!document.getElementById(sdChkId)?.checked;
    const sd = sdOn
      ? Math.min(
          total,
          Math.max(
            0,
            Math.round(parseFloat(document.getElementById(sdKey)?.value) || 0),
          ),
        )
      : 0;
    return total - sd;
  }
  return Math.max(
    0,
    partBillingStages[idx - 1][
      side === "inside" ? "insideAfter" : "outsideAfter"
    ] || 0,
  );
}

function pbMaxSdWeight(idx, side) {
  const sdKey =
    side === "inside" ? "c-selfDriveTonInside" : "c-selfDriveTonOutside";
  const sdChkId =
    side === "inside" ? "c-chkSelfDriveInside" : "c-chkSelfDriveOutside";
  if (idx === 0) {
    const total = Math.max(
      0,
      Math.round(
        parseFloat(
          document.getElementById(side === "inside" ? "c-inside" : "c-outside")
            ?.value,
        ) || 0,
      ),
    );
    const sdOn = !!document.getElementById(sdChkId)?.checked;
    return sdOn
      ? Math.min(
          total,
          Math.max(
            0,
            Math.round(parseFloat(document.getElementById(sdKey)?.value) || 0),
          ),
        )
      : 0;
  }
  return Math.max(
    0,
    partBillingStages[idx - 1][
      side === "inside" ? "sdInsideAfter" : "sdOutsideAfter"
    ] || 0,
  );
}

function pbBalanceChange(idx, side, rawVal) {
  const key = side === "inside" ? "insideAfter" : "outsideAfter";
  const maxVal = pbMaxWeight(idx, side);
  const isEmpty = rawVal === "" || rawVal === null || rawVal === undefined;
  const clamped = Math.min(
    maxVal,
    Math.max(0, Math.round(isEmpty ? 0 : +rawVal)),
  );
  partBillingStages[idx][key] = clamped;
  const inp = document.getElementById(`pb-${side}-${idx}`);
  if (inp) inp.value = isEmpty ? "" : clamped;
  // Cascade clamp normal balance to all subsequent stages (SD is independent)
  for (let i = idx + 1; i < partBillingStages.length; i++) {
    const prevVal = partBillingStages[i - 1][key] || 0;
    if ((partBillingStages[i][key] || 0) > prevVal) {
      partBillingStages[i][key] = prevVal;
      const next = document.getElementById(`pb-${side}-${i}`);
      if (next) {
        next.value = prevVal || "";
        next.max = prevVal;
      }
    }
  }
  cargoRefresh();
}

function pbSdBalanceChange(idx, side, rawVal) {
  const key = side === "inside" ? "sdInsideAfter" : "sdOutsideAfter";
  const maxVal = pbMaxSdWeight(idx, side);
  const isEmpty = rawVal === "" || rawVal === null || rawVal === undefined;
  const clamped = Math.min(
    maxVal,
    Math.max(0, Math.round(isEmpty ? 0 : +rawVal)),
  );
  partBillingStages[idx][key] = clamped;
  const inp = document.getElementById(`pb-sd-${side}-${idx}`);
  if (inp) inp.value = isEmpty ? "" : clamped;
  // Cascade clamp SD balance to subsequent stages (SD independent of normal balance)
  for (let i = idx + 1; i < partBillingStages.length; i++) {
    const prevSd = partBillingStages[i - 1][key] || 0;
    if ((partBillingStages[i][key] || 0) > prevSd) {
      partBillingStages[i][key] = prevSd;
      const next = document.getElementById(`pb-sd-${side}-${i}`);
      if (next) {
        next.value = prevSd || "";
        next.max = prevSd;
      }
    }
  }
  cargoRefresh();
}

function addPartBillingStage() {
  partBillingStages.push({
    date: "",
    insideAfter: 0,
    outsideAfter: 0,
    sdInsideAfter: 0,
    sdOutsideAfter: 0,
  });
  renderPartBillingStages();
  cargoRefresh();
}

function removePartBillingStage(idx) {
  if (partBillingStages.length <= 1) return;
  partBillingStages.splice(idx, 1);
  renderPartBillingStages();
  cargoRefresh();
}

function onPbUpToDateChange() {
  partBillingUpToDate = !!document.getElementById("c-pbUpToDate")?.checked;
  cargoRefresh();
}

// Car Billing slab calc with old/new rate split — mirrors carCompute() split logic.
// prevEnd: the day before blockStart (freeEnd for period 1, last delivery date for subsequent periods).
function calcCarBillingSdSlabs(
  cld,
  prevEnd,
  blockStart,
  deliveryDate,
  periodDays,
  weight,
  daysOffset,
  or1,
  or2,
  or3,
  nr1,
  nr2,
  nr3,
) {
  if (periodDays <= 0 || weight <= 0) return [];
  if (cld >= CUT) {
    return calcSlabs(
      periodDays,
      nr1,
      nr2,
      nr3,
      weight,
      blockStart,
      deliveryDate,
      daysOffset,
    );
  }
  if (deliveryDate <= CUT_OLD) {
    return calcSlabs(
      periodDays,
      or1,
      or2,
      or3,
      weight,
      blockStart,
      deliveryDate,
      daysOffset,
    );
  }
  if (prevEnd >= CUT_OLD) {
    return calcSlabs(
      periodDays,
      nr1,
      nr2,
      nr3,
      weight,
      blockStart,
      deliveryDate,
      daysOffset,
    );
  }
  // Period crosses the rate cutoff — split
  const oldDays = diffD(prevEnd, CUT_OLD);
  if (oldDays <= 0) {
    return calcSlabs(
      periodDays,
      nr1,
      nr2,
      nr3,
      weight,
      blockStart,
      deliveryDate,
      daysOffset,
    );
  }
  const newDays = diffD(CUT_OLD, deliveryDate);
  const oldSlabs = calcSlabs(
    oldDays,
    or1,
    or2,
    or3,
    weight,
    blockStart,
    CUT_OLD,
    daysOffset,
  );
  const newSlabs = calcSlabs(
    newDays,
    nr1,
    nr2,
    nr3,
    weight,
    CUT,
    deliveryDate,
    daysOffset + oldDays,
  );
  oldSlabs.forEach((s) => (s.group = "old"));
  newSlabs.forEach((s) => (s.group = "new"));
  return [...oldSlabs, ...newSlabs];
}

// Compute multi-period wharfrent for part billing mode
// Slab progression never resets — daysOffset accumulates from original CLD
function computePartBillingWharfrent(
  cld,
  freeEnd,
  storStart,
  initialInside,
  initialOutside,
  or1,
  or2,
  or3,
  insideSdTon = 0,
  outsideSdTon = 0,
  or1Car = 0,
  or2Car = 0,
  or3Car = 0,
  nr1Car = 0,
  nr2Car = 0,
  nr3Car = 0,
) {
  //NOSONAR
  const periods = [];
  let hasWharfrent = false;
  let totalDays = 0;
  for (let i = 0; i < partBillingStages.length; i++) {
    const stage = partBillingStages[i];
    const deliveryDate = pd(stage.date);
    const rawPrevEnd = i === 0 ? freeEnd : pd(partBillingStages[i - 1].date);
    // If a prior stage delivered within free time, clamp so this stage's billing starts at storStart
    const prevEnd = rawPrevEnd < freeEnd ? freeEnd : rawPrevEnd;
    const blockStart = i === 0 ? storStart : addD(prevEnd, 1);
    // insideAfter/outsideAfter stores normal-only remaining; sdInsideAfter stores SD remaining (independent)
    const pNormalInside =
      i === 0
        ? initialInside - insideSdTon
        : Math.max(0, partBillingStages[i - 1].insideAfter || 0);
    const pNormalOutside =
      i === 0
        ? initialOutside - outsideSdTon
        : Math.max(0, partBillingStages[i - 1].outsideAfter || 0);
    const pSdInside =
      i === 0
        ? insideSdTon
        : Math.max(0, partBillingStages[i - 1].sdInsideAfter || 0);
    const pSdOutside =
      i === 0
        ? outsideSdTon
        : Math.max(0, partBillingStages[i - 1].sdOutsideAfter || 0);
    const insideW = pNormalInside + pSdInside;
    const outsideW = pNormalOutside + pSdOutside;
    // daysOffset = chargeable days elapsed before this period (from freeEnd up to prevEnd)
    const daysOffset = i === 0 ? 0 : diffD(freeEnd, prevEnd);
    const periodDays = diffD(prevEnd, deliveryDate);
    if (!stage.date || periodDays <= 0) {
      const freeTimeDelivery = !!(stage.date && deliveryDate <= freeEnd);
      periods.push({
        invalid: true,
        freeTimeDelivery,
        periodNum: i + 1,
        blockStart,
        deliveryDate,
        insideW,
        outsideW,
        periodDays,
        daysOffset,
        balanceInsideAfter: freeTimeDelivery ? Math.max(0, stage.insideAfter || 0) : undefined,
        balanceOutsideAfter: freeTimeDelivery ? Math.max(0, stage.outsideAfter || 0) : undefined,
        balanceSdInsideAfter: freeTimeDelivery ? Math.max(0, stage.sdInsideAfter || 0) : undefined,
        balanceSdOutsideAfter: freeTimeDelivery ? Math.max(0, stage.sdOutsideAfter || 0) : undefined,
      });
      continue;
    }
    hasWharfrent = true;
    totalDays += periodDays;
    const insideNormalSlabs =
      pNormalInside > 0
        ? calcSlabs(
            periodDays,
            or1,
            or2,
            or3,
            pNormalInside,
            blockStart,
            deliveryDate,
            daysOffset,
          )
        : [];
    const outsideNormalSlabs =
      pNormalOutside > 0
        ? calcSlabs(
            periodDays,
            or1,
            or2,
            or3,
            pNormalOutside,
            blockStart,
            deliveryDate,
            daysOffset,
          )
        : [];
    const insideSdSlabs =
      pSdInside > 0
        ? calcCarBillingSdSlabs(
            cld,
            prevEnd,
            blockStart,
            deliveryDate,
            periodDays,
            pSdInside,
            daysOffset,
            or1Car,
            or2Car,
            or3Car,
            nr1Car,
            nr2Car,
            nr3Car,
          )
        : [];
    const outsideSdSlabs =
      pSdOutside > 0
        ? calcCarBillingSdSlabs(
            cld,
            prevEnd,
            blockStart,
            deliveryDate,
            periodDays,
            pSdOutside,
            daysOffset,
            or1Car,
            or2Car,
            or3Car,
            nr1Car,
            nr2Car,
            nr3Car,
          )
        : [];
    const insideWharfrent =
      insideNormalSlabs.reduce((a, s) => a + s.amt, 0) +
      insideSdSlabs.reduce((a, s) => a + s.amt, 0);
    const outsideWharfrent =
      (outsideNormalSlabs.reduce((a, s) => a + s.amt, 0) +
        outsideSdSlabs.reduce((a, s) => a + s.amt, 0)) *
      0.5;
    periods.push({
      invalid: false,
      periodNum: i + 1,
      blockStart,
      deliveryDate,
      periodDays,
      daysOffset,
      insideW,
      outsideW,
      insideNormalW: pNormalInside,
      outsideNormalW: pNormalOutside,
      insideSdW: pSdInside,
      outsideSdW: pSdOutside,
      insideSlabs: insideNormalSlabs,
      outsideSlabs: outsideNormalSlabs,
      insideSdSlabs,
      outsideSdSlabs,
      insideWharfrent,
      outsideWharfrent,
      balanceInsideAfter: Math.max(0, stage.insideAfter || 0),
      balanceOutsideAfter: Math.max(0, stage.outsideAfter || 0),
      balanceSdInsideAfter: Math.max(0, stage.sdInsideAfter || 0),
      balanceSdOutsideAfter: Math.max(0, stage.sdOutsideAfter || 0),
    });
  }
  // Optional: current-date period (from last delivery +1 → today)
  if (partBillingUpToDate && partBillingStages.length > 0) {
    const lastStage = partBillingStages[partBillingStages.length - 1];
    const lastDelivery = pd(lastStage.date);
    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);
    const cwNormalInside = Math.max(0, lastStage.insideAfter || 0);
    const cwNormalOutside = Math.max(0, lastStage.outsideAfter || 0);
    const cwSdInside = Math.max(0, lastStage.sdInsideAfter || 0);
    const cwSdOutside = Math.max(0, lastStage.sdOutsideAfter || 0);
    const cwInside = cwNormalInside + cwSdInside;
    const cwOutside = cwNormalOutside + cwSdOutside;
    if (lastDelivery && cwInside + cwOutside > 0) {
      const cwBlockStart = addD(lastDelivery, 1);
      const cwDaysOffset = diffD(freeEnd, lastDelivery);
      const cwPeriodDays = diffD(lastDelivery, todayD);
      if (cwPeriodDays > 0) {
        hasWharfrent = true;
        totalDays += cwPeriodDays;
        const cwInsideNormalSlabs =
          cwNormalInside > 0
            ? calcSlabs(
                cwPeriodDays,
                or1,
                or2,
                or3,
                cwNormalInside,
                cwBlockStart,
                todayD,
                cwDaysOffset,
              )
            : [];
        const cwOutsideNormalSlabs =
          cwNormalOutside > 0
            ? calcSlabs(
                cwPeriodDays,
                or1,
                or2,
                or3,
                cwNormalOutside,
                cwBlockStart,
                todayD,
                cwDaysOffset,
              )
            : [];
        const cwInsideSdSlabs =
          cwSdInside > 0
            ? calcCarBillingSdSlabs(
                cld,
                lastDelivery,
                cwBlockStart,
                todayD,
                cwPeriodDays,
                cwSdInside,
                cwDaysOffset,
                or1Car,
                or2Car,
                or3Car,
                nr1Car,
                nr2Car,
                nr3Car,
              )
            : [];
        const cwOutsideSdSlabs =
          cwSdOutside > 0
            ? calcCarBillingSdSlabs(
                cld,
                lastDelivery,
                cwBlockStart,
                todayD,
                cwPeriodDays,
                cwSdOutside,
                cwDaysOffset,
                or1Car,
                or2Car,
                or3Car,
                nr1Car,
                nr2Car,
                nr3Car,
              )
            : [];
        periods.push({
          invalid: false,
          periodNum: partBillingStages.length + 1,
          blockStart: cwBlockStart,
          deliveryDate: todayD,
          periodDays: cwPeriodDays,
          daysOffset: cwDaysOffset,
          insideW: cwInside,
          outsideW: cwOutside,
          insideNormalW: cwNormalInside,
          outsideNormalW: cwNormalOutside,
          insideSdW: cwSdInside,
          outsideSdW: cwSdOutside,
          insideSlabs: cwInsideNormalSlabs,
          outsideSlabs: cwOutsideNormalSlabs,
          insideSdSlabs: cwInsideSdSlabs,
          outsideSdSlabs: cwOutsideSdSlabs,
          insideWharfrent:
            cwInsideNormalSlabs.reduce((a, s) => a + s.amt, 0) +
            cwInsideSdSlabs.reduce((a, s) => a + s.amt, 0),
          outsideWharfrent:
            (cwOutsideNormalSlabs.reduce((a, s) => a + s.amt, 0) +
              cwOutsideSdSlabs.reduce((a, s) => a + s.amt, 0)) *
            0.5,
          balanceInsideAfter: cwInside,
          balanceOutsideAfter: cwOutside,
          isCurrentDate: true,
        });
      }
    }
  }

  const validPeriods = periods.filter((p) => !p.invalid);
  return {
    periods,
    totalInsideWharfrent: validPeriods.reduce(
      (a, p) => a + p.insideWharfrent,
      0,
    ),
    totalOutsideWharfrent: validPeriods.reduce(
      (a, p) => a + p.outsideWharfrent,
      0,
    ),
    totalDays,
    hasWharfrent,
  };
}

// Build part billing inside/outside detail table for screen display
function buildPartBillingBillTable(b, side) {
  //NOSONAR
  const isIn = side === "inside";
  const allPeriods = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
  let rows = "";
  const halfSuffix = isIn
    ? ""
    : '<span style="font-size:11px;color:var(--m2)"> × 0.50</span>';
  allPeriods.forEach((p, pi) => {
    const isLast = pi === allPeriods.length - 1;
    if (p.freeTimeDelivery) {
      const balSd_ft = isIn ? (p.balanceSdInsideAfter || 0) : (p.balanceSdOutsideAfter || 0);
      const balNorm_ft = isIn ? (p.balanceInsideAfter || 0) : (p.balanceOutsideAfter || 0);
      const balAfterStr_ft = balSd_ft > 0 ? `${balNorm_ft}t Normal + ${balSd_ft}t SD` : `${balNorm_ft}t`;
      const balNote_ft = isLast
        ? " · Final Delivery"
        : isIn
          ? ` · Balance: Inside ${balAfterStr_ft}`
          : ` · Balance: Outside ${balAfterStr_ft}`;
      rows += `<tr class="sep"><td colspan="6">Stage ${p.periodNum}: ${fd(p.deliveryDate)} — ✓ Delivery within free time — no wharfrent charge${balNote_ft}</td></tr>`;
      return;
    }
    const normalSlabs = isIn ? p.insideSlabs : p.outsideSlabs;
    const sdSlabs = isIn ? p.insideSdSlabs || [] : p.outsideSdSlabs || [];
    const w = isIn ? p.insideW : p.outsideW;
    const sdW = isIn ? p.insideSdW || 0 : p.outsideSdW || 0;
    const balSd_s = isIn
      ? p.balanceSdInsideAfter || 0
      : p.balanceSdOutsideAfter || 0;
    const balNorm_s = isIn ? p.balanceInsideAfter : p.balanceOutsideAfter;
    const balAfterStr_s =
      balSd_s > 0 ? `${balNorm_s}t Normal + ${balSd_s}t SD` : `${balNorm_s}t`;
    const balNote = p.isCurrentDate
      ? " · Up to Today"
      : !isLast
        ? isIn
          ? ` · Balance: Inside ${balAfterStr_s}`
          : ` · Balance: Outside ${balAfterStr_s}`
        : " · Final Delivery";
    const tonLabel_s =
      sdW > 0
        ? `Normal: ${fmtN(w - sdW)}t + SD: ${fmtN(sdW)}t`
        : `${fmtN(w)} ton(s)`;
    const dayRange_s = `Day ${p.daysOffset + 1}–${p.daysOffset + p.periodDays}`;
    rows += `<tr class="sep"><td colspan="6">Period ${p.periodNum}: ${fd(p.blockStart)} → ${fd(p.deliveryDate)} | ${tonLabel_s} | ${p.periodDays} days (${dayRange_s})${balNote}</td></tr>`;
    normalSlabs.forEach((s) => {
      const dispAmt = isIn ? s.amt : s.amt * 0.5;
      rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
    });
    if (sdSlabs.length > 0) {
      rows += `<tr class="sep" style="font-style:italic;"><td colspan="6">↳ Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
      sdSlabs.forEach((s) => {
        const dispAmt = isIn ? s.amt : s.amt * 0.5;
        rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
      });
    }
  });
  const wharfTotal = isIn ? b.insideWharfrent : b.outsideWharfrent;
  const halfNote = isIn ? "" : " (½ Rate Applied)";
  rows += `<tr class="sub"><td colspan="3">Wharfrent Sub-Total${halfNote} — ${b.totalDays} days</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(wharfTotal)}</td></tr>`;
  const billPayables = isIn ? b.insidePayables : b.outsidePayables;
  if (billPayables.length > 0) {
    rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
    billPayables.forEach((p) => {
      rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
    });
  }
  const baseAmt = isIn ? b.iBase : b.oBase;
  const subLabel = isIn
    ? "Inside Sub-Total (Base for VAT)"
    : "Outside Sub-Total (½ Rate · Base for VAT)";
  rows += `<tr class="tot"><td colspan="5">${subLabel}</td><td>${fmt(baseAmt)}</td></tr>`;
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Build part billing print section for inside or outside
function buildPartBillingPrintSection(b, side) {
  //NOSONAR
  const allPeriods = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
  const isIn = side === "inside";
  let rows = "";
  allPeriods.forEach((p, pi) => {
    const isLast = pi === allPeriods.length - 1;
    if (p.freeTimeDelivery) {
      const balSd_ft = isIn ? (p.balanceSdInsideAfter || 0) : (p.balanceSdOutsideAfter || 0);
      const balNorm_ft = isIn ? (p.balanceInsideAfter || 0) : (p.balanceOutsideAfter || 0);
      const balAfterStr_ft = balSd_ft > 0 ? `${balNorm_ft}t Normal + ${balSd_ft}t SD` : `${balNorm_ft}t`;
      const balNote_ft = isLast
        ? " | Final Delivery — no cargo remains"
        : isIn
          ? ` | Remaining balance after this delivery: Inside ${balAfterStr_ft}`
          : ` | Remaining balance after this delivery: Outside ${balAfterStr_ft}`;
      rows += `<tr class="sep"><td colspan="6">Stage ${p.periodNum}: ${fd(p.deliveryDate)} &mdash; Delivery within free time &mdash; no wharfrent charge${balNote_ft}</td></tr>`;
      return;
    }
    const normalSlabs = isIn ? p.insideSlabs : p.outsideSlabs;
    const sdSlabs = isIn ? p.insideSdSlabs || [] : p.outsideSdSlabs || [];
    const w = isIn ? p.insideW : p.outsideW;
    const sdW = isIn ? p.insideSdW || 0 : p.outsideSdW || 0;
    const balSd_p = isIn
      ? p.balanceSdInsideAfter || 0
      : p.balanceSdOutsideAfter || 0;
    const balNorm_p = isIn ? p.balanceInsideAfter : p.balanceOutsideAfter;
    const balAfterStr_p =
      balSd_p > 0 ? `${balNorm_p}t Normal + ${balSd_p}t SD` : `${balNorm_p}t`;
    const balNote = p.isCurrentDate
      ? " | Up to Today"
      : !isLast
        ? isIn
          ? ` | Remaining balance after this delivery: Inside ${balAfterStr_p}`
          : ` | Remaining balance after this delivery: Outside ${balAfterStr_p}`
        : " | Final Delivery — no cargo remains";
    const normalW_p = w - sdW;
    const tonLabel_p =
      sdW > 0
        ? `Normal: ${fmtN(normalW_p)}t + SD: ${fmtN(sdW)}t`
        : `${fmtN(w)} ton(s)`;
    const dayRange_p = `Day ${p.daysOffset + 1}–${p.daysOffset + p.periodDays}`;
    rows += `<tr class="sep"><td colspan="6">Stage ${p.periodNum}: ${fd(p.blockStart)} &rarr; ${fd(p.deliveryDate)} &nbsp;|&nbsp; ${tonLabel_p} &nbsp;|&nbsp; ${p.periodDays} day(s) (${dayRange_p})${balNote}</td></tr>`;
    normalSlabs.forEach((s) => {
      const da = isIn ? s.amt : s.amt * 0.5;
      rows += printTr(
        s.label,
        `${fmtN(s.rate)}/t/d${isIn ? "" : " × 0.50"}`,
        fd(s.from),
        fd(s.to),
        s.days,
        fmt(da),
      );
      rows += isIn
        ? printCalcRow(s.rate, normalW_p, s.days, da)
        : printCalcRowHalf(s.rate, normalW_p, s.days, da);
    });
    if (sdSlabs.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
      sdSlabs.forEach((s) => {
        const da = isIn ? s.amt : s.amt * 0.5;
        rows += printTr(
          s.label,
          `${fmtN(s.rate)}/t/d${isIn ? "" : " × 0.50"}`,
          fd(s.from),
          fd(s.to),
          s.days,
          fmt(da),
        );
        rows += isIn
          ? printCalcRow(s.rate, sdW, s.days, da)
          : printCalcRowHalf(s.rate, sdW, s.days, da);
      });
    }
  });
  const rp2 = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
  const wharfTotal = isIn ? b.insideWharfrent : b.outsideWharfrent;
  const filteredPay = cargoIncludePayables
    ? isIn
      ? b.insidePayables
      : b.outsidePayables
    : [];
  // This section shows only the per-portion sub-total (wharfrent + payables).
  // VAT and Levy are charged ONCE on the combined base in the BILL SUMMARY that
  // follows both sections (see buildCombinedSummaryPrintSection).
  const baseAmt = rp2(
    (isIn ? b.iBase : b.oBase) -
      (cargoIncludePayables ? 0 : isIn ? b.insidePaySub : b.outsidePaySub),
  );
  const subLabel = isIn
    ? "Inside Sub-Total (Base for VAT)"
    : "Outside Sub-Total (½ Rate · Base for VAT)";
  const halfNote = isIn ? "" : " (½ Rate)";
  rows += printTotRow(
    `Wharfrent Sub-Total${halfNote} — ${b.totalDays} day(s)`,
    fmt(wharfTotal),
    "sub",
  );
  if (filteredPay.length > 0) {
    rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
    filteredPay.forEach((p) => {
      rows += printTr(
        p.label,
        `${fmtN(p.rate)}/ton`,
        `${fmtN(p.tons)} ton(s)`,
        "—",
        "—",
        fmt(p.amt),
        "sub",
      );
      rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(p.tons)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
    });
  }
  rows += printTotRow(subLabel, fmt(baseAmt));
  const wt = isIn ? b.insideW : b.outsideW;
  const sdWt = isIn ? b.wharfSdInside || 0 : b.wharfSdOutside || 0;
  const headBadge =
    sdWt > 0
      ? isIn
        ? `${fmtN(wt - sdWt)}t Normal + ${fmtN(sdWt)}t SD — Full Rate`
        : `${fmtN(wt - sdWt)}t Normal + ${fmtN(sdWt)}t SD — ½ Rate`
      : isIn
        ? `${fmtN(wt)} ton initial — Full Rate`
        : `${fmtN(wt)} ton initial — ½ Rate`;
  const subNote = `Part Billing — ${allPeriods.length} stage${allPeriods.length !== 1 ? "s" : ""} · ${isIn ? "Full" : "½"} rate · Day-count continuous from CLD`;
  return `${secHead(isIn ? "INSIDE WHARFRENT" : "OUTSIDE WHARFRENT", headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
}

function cargoCompute() {
  // NOSONAR
  const meta = readMeta("c");
  const cld = pd(document.getElementById("c-cld").value);
  const _cfdRaw = Number.parseInt(
    document.getElementById("c-freeDays").value,
    10,
  );
  const freeDays = Number.isNaN(_cfdRaw) ? 4 : Math.max(0, _cfdRaw);
  const freeEnd = freeDays === 0 ? addD(cld, -1) : addD(cld, freeDays - 1);
  const storStart = addD(freeEnd, 1);
  const delivery = pd(document.getElementById("c-delivery").value);
  const totalWeight = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-weight").value) || 0,
    ),
  );
  const insideW = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-inside").value) || 0,
    ),
  );
  const outsideW = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById("c-outside").value) || 0,
    ),
  );
  const vatRate = Math.min(1, Math.max(0, gn("c-vatRate") / 100));
  // Dynamic payable rates based on weight tier — not from input fields
  const tierRate = getCargoLandingTierRate(totalWeight);
  const landingChecked = gb("c-chkLanding");
  const dynamicLandingRate = tierRate;
  const dynamicRemovalRate = tierRate * (landingChecked ? 7 : 8);
  const dynamicHoistingRate = tierRate * 1.25;
  const removalTon = Math.min(
    totalWeight,
    Math.max(
      0,
      Number.parseFloat(document.getElementById("c-removalTon").value) || 0,
    ),
  );
  const weighmentTon = Math.min(
    totalWeight,
    Math.max(
      0,
      Number.parseFloat(document.getElementById("c-weighmentTon").value) || 0,
    ),
  );
  const or1 = nn("c-or1"),
    or2 = nn("c-or2"),
    or3 = nn("c-or3");
  // Car Billing wharf rent rates (old + new, for self-drive ton portion with split billing)
  const or1Car = nn("or1"),
    or2Car = nn("or2"),
    or3Car = nn("or3");
  const nr1Car = nn("nr1"),
    nr2Car = nn("nr2"),
    nr3Car = nn("nr3");

  // Self-drive tons for wharf rent: these tons use Car Billing slab rates instead of GC rates
  // Independent of hoisting checkbox — self-drive affects wharfrent rate regardless of hoisting
  const wharfSdInside = gb("c-chkSelfDriveInside")
    ? Math.min(
        Math.max(
          0,
          Math.round(
            Number.parseFloat(
              document.getElementById("c-selfDriveTonInside")?.value,
            ) || 0,
          ),
        ),
        insideW,
      )
    : 0;
  const wharfSdOutside = gb("c-chkSelfDriveOutside")
    ? Math.min(
        Math.max(
          0,
          Math.round(
            Number.parseFloat(
              document.getElementById("c-selfDriveTonOutside")?.value,
            ) || 0,
          ),
        ),
        outsideW,
      )
    : 0;
  const insideNormalW = insideW - wharfSdInside;
  const outsideNormalW = outsideW - wharfSdOutside;

  // ── Part Billing branch ──
  const isPartBilling = !!document.getElementById("c-partBilling")?.checked;
  let insideSlabs = [],
    outsideSlabs = [],
    insideSdSlabs = [],
    outsideSdSlabs = [];
  let totalDays = 0,
    hasWharfrent = false;
  let pbPeriods = null;

  if (isPartBilling) {
    const pbr = computePartBillingWharfrent(
      cld,
      freeEnd,
      storStart,
      insideW,
      outsideW,
      or1,
      or2,
      or3,
      wharfSdInside,
      wharfSdOutside,
      or1Car,
      or2Car,
      or3Car,
      nr1Car,
      nr2Car,
      nr3Car,
    );
    pbPeriods = pbr.periods;
    hasWharfrent = pbr.hasWharfrent;
    totalDays = pbr.totalDays;
  } else {
    hasWharfrent = delivery > freeEnd;
    if (hasWharfrent) {
      totalDays = diffD(freeEnd, delivery);
      // Normal portion → GC rates
      insideSlabs =
        insideNormalW > 0
          ? calcSlabs(
              totalDays,
              or1,
              or2,
              or3,
              insideNormalW,
              storStart,
              delivery,
              0,
            )
          : [];
      outsideSlabs =
        outsideNormalW > 0
          ? calcSlabs(
              totalDays,
              or1,
              or2,
              or3,
              outsideNormalW,
              storStart,
              delivery,
              0,
            )
          : [];
      // Self-drive portion → Car Billing rates with old/new rate split
      insideSdSlabs =
        wharfSdInside > 0
          ? calcCarBillingSdSlabs(
              cld,
              freeEnd,
              storStart,
              delivery,
              totalDays,
              wharfSdInside,
              0,
              or1Car,
              or2Car,
              or3Car,
              nr1Car,
              nr2Car,
              nr3Car,
            )
          : [];
      outsideSdSlabs =
        wharfSdOutside > 0
          ? calcCarBillingSdSlabs(
              cld,
              freeEnd,
              storStart,
              delivery,
              totalDays,
              wharfSdOutside,
              0,
              or1Car,
              or2Car,
              or3Car,
              nr1Car,
              nr2Car,
              nr3Car,
            )
          : [];
    }
  }

  // Inside wharfrent = GC full rate × normalW + Car full rate × sdW
  const insideWharfrent = isPartBilling
    ? (pbPeriods || [])
        .filter((p) => !p.invalid)
        .reduce((a, p) => a + p.insideWharfrent, 0)
    : insideSlabs.reduce((a, s) => a + s.amt, 0) +
      insideSdSlabs.reduce((a, s) => a + s.amt, 0);
  // Outside wharfrent = ½ × (GC full rate × normalW + Car full rate × sdW)
  const outsideWharfrent = isPartBilling
    ? (pbPeriods || [])
        .filter((p) => !p.invalid)
        .reduce((a, p) => a + p.outsideWharfrent, 0)
    : (outsideSlabs.reduce((a, s) => a + s.amt, 0) +
        outsideSdSlabs.reduce((a, s) => a + s.amt, 0)) *
      0.5;

  // Payable charges - apply based on actual tons (inside or outside)
  const payables = [];

  if (gb("c-chkRiver")) {
    if (hasWharfrent) {
      // Split by portion when wharfrent applies - only for tons > 0
      if (insideW > 0) {
        payables.push({
          label: "River Dues",
          rate: nn("c-rRiver"),
          tons: insideW,
          amt: nn("c-rRiver") * insideW,
          portion: "inside",
        });
      }
      if (outsideW > 0) {
        payables.push({
          label: "River Dues",
          rate: nn("c-rRiver"),
          tons: outsideW,
          amt: nn("c-rRiver") * outsideW,
          portion: "outside",
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: "River Dues",
        rate: nn("c-rRiver"),
        tons: totalWeight,
        amt: nn("c-rRiver") * totalWeight,
        portion: "total",
      });
    }
  }
  if (gb("c-chkLanding")) {
    if (hasWharfrent) {
      // Split by portion when wharfrent applies - only for tons > 0
      if (insideW > 0) {
        payables.push({
          label: "Landing Charge",
          rate: dynamicLandingRate,
          tons: insideW,
          amt: dynamicLandingRate * insideW,
          portion: "inside",
        });
      }
      if (outsideW > 0) {
        payables.push({
          label: "Landing Charge",
          rate: dynamicLandingRate,
          tons: outsideW,
          amt: dynamicLandingRate * outsideW,
          portion: "outside",
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: "Landing Charge",
        rate: dynamicLandingRate,
        tons: totalWeight,
        amt: dynamicLandingRate * totalWeight,
        portion: "total",
      });
    }
  }
  if (gb("c-chkRemoval")) {
    if (hasWharfrent) {
      // Removal charges only for outside portion (if outside > 0)
      if (outsideW > 0) {
        payables.push({
          label: "Removal Charge",
          rate: dynamicRemovalRate,
          tons: removalTon,
          amt: dynamicRemovalRate * removalTon,
          portion: "outside",
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: "Removal Charge",
        rate: dynamicRemovalRate,
        tons: removalTon,
        amt: dynamicRemovalRate * removalTon,
        portion: "total",
      });
    }
  }
  if (gb("c-chkWeighment")) {
    if (hasWharfrent) {
      payables.push({
        label: "Weighment Charge",
        rate: nn("c-rWeighment"),
        tons: weighmentTon,
        amt: nn("c-rWeighment") * weighmentTon,
        portion: "outside",
      });
    } else {
      payables.push({
        label: "Weighment Charge",
        rate: nn("c-rWeighment"),
        tons: weighmentTon,
        amt: nn("c-rWeighment") * weighmentTon,
        portion: "total",
      });
    }
  }
  if (gb("c-chkHoisting")) {
    const insideSelfDriveTon = gb("c-chkSelfDriveInside")
      ? Math.min(
          Math.max(
            0,
            Math.round(
              Number.parseFloat(
                document.getElementById("c-selfDriveTonInside")?.value,
              ) || 0,
            ),
          ),
          insideW,
        )
      : 0;
    const outsideSelfDriveTon = gb("c-chkSelfDriveOutside")
      ? Math.min(
          Math.max(
            0,
            Math.round(
              Number.parseFloat(
                document.getElementById("c-selfDriveTonOutside")?.value,
              ) || 0,
            ),
          ),
          outsideW,
        )
      : 0;
    const sdHoistRateStr = `${fmtN(dynamicHoistingRate)} × 0.50`;

    if (hasWharfrent) {
      const insideNormal = insideW - insideSelfDriveTon;
      const outsideNormal = outsideW - outsideSelfDriveTon;
      if (insideNormal > 0) {
        payables.push({
          label: "Hoisting Charge",
          rate: dynamicHoistingRate,
          tons: insideNormal,
          amt: dynamicHoistingRate * insideNormal,
          portion: "inside",
        });
      }
      if (insideSelfDriveTon > 0) {
        payables.push({
          label: "Hoisting Charge (Self Drive)",
          rate: dynamicHoistingRate * 0.5,
          rateStr: sdHoistRateStr,
          tons: insideSelfDriveTon,
          amt: dynamicHoistingRate * 0.5 * insideSelfDriveTon,
          portion: "inside",
        });
      }
      if (outsideNormal > 0) {
        payables.push({
          label: "Hoisting Charge",
          rate: dynamicHoistingRate,
          tons: outsideNormal,
          amt: dynamicHoistingRate * outsideNormal,
          portion: "outside",
        });
      }
      if (outsideSelfDriveTon > 0) {
        payables.push({
          label: "Hoisting Charge (Self Drive)",
          rate: dynamicHoistingRate * 0.5,
          rateStr: sdHoistRateStr,
          tons: outsideSelfDriveTon,
          amt: dynamicHoistingRate * 0.5 * outsideSelfDriveTon,
          portion: "outside",
        });
      }
    } else {
      const totalSelfDrive = insideSelfDriveTon + outsideSelfDriveTon;
      const normalTons = totalWeight - totalSelfDrive;
      if (normalTons > 0) {
        payables.push({
          label: "Hoisting Charge",
          rate: dynamicHoistingRate,
          tons: normalTons,
          amt: dynamicHoistingRate * normalTons,
          portion: "total",
        });
      }
      if (totalSelfDrive > 0) {
        payables.push({
          label: "Hoisting Charge (Self Drive)",
          rate: dynamicHoistingRate * 0.5,
          rateStr: sdHoistRateStr,
          tons: totalSelfDrive,
          amt: dynamicHoistingRate * 0.5 * totalSelfDrive,
          portion: "total",
        });
      }
    }
  }
  // Levy charge based on inside/outside tons
  const insideLevy = gb("c-chkLevy") ? nn("c-rLevy") * insideW : 0;
  const outsideLevy = gb("c-chkLevy") ? nn("c-rLevy") * outsideW : 0;
  const totalLevy = insideLevy + outsideLevy;

  // Separate payable amounts for inside and outside portions
  const insidePayables = payables.filter((p) => p.portion === "inside");
  const outsidePayables = payables.filter((p) => p.portion === "outside");
  const insidePaySub = insidePayables.reduce((a, p) => a + p.amt, 0);
  const outsidePaySub = outsidePayables.reduce((a, p) => a + p.amt, 0);
  const paySub = payables.reduce((a, p) => a + p.amt, 0);

  const r2 = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
  // Per-portion sub-totals = wharfrent + payables (the VAT base). These show as
  // "Inside / Outside Sub-Total" on the bill — NO VAT or Levy per section.
  const iBase = r2(insideWharfrent + insidePaySub);
  const oBase = r2(outsideWharfrent + outsidePaySub);
  const iLevy = insideLevy;
  const oLevy = outsideLevy;
  // VAT and Levy are charged ONCE, on the COMBINED inside+outside base, so they
  // appear a single time at the foot of the bill. A single rounding here also
  // avoids the per-portion double-rounding cent drift (history: 113441.94/.96).
  const gBase = r2(iBase + oBase);
  const gVat = r2(gBase * vatRate);
  const gLevy = iLevy + oLevy;
  const gTotal = r2(gBase + gVat + gLevy);
  // No wharfrent (payable-only): combined base already, single VAT.
  const nBase = r2(paySub);
  const nVat = r2(nBase * vatRate);
  const nLevy = totalLevy;
  const nTotal = r2(nBase + nVat + nLevy);

  return {
    cld,
    freeEnd,
    storStart,
    delivery,
    totalWeight,
    insideW,
    outsideW,
    vatRate,
    removalTon,
    weighmentTon,
    hasWharfrent,
    tierRate,
    dynamicLandingRate,
    dynamicRemovalRate,
    dynamicHoistingRate,
    totalDays,
    insideSlabs,
    outsideSlabs,
    insideSdSlabs,
    outsideSdSlabs,
    wharfSdInside,
    wharfSdOutside,
    insideNormalW,
    outsideNormalW,
    insideWharfrent,
    outsideWharfrent,
    payables,
    insidePayables,
    outsidePayables,
    paySub,
    insidePaySub,
    outsidePaySub,
    totalLevy,
    iBase,
    iLevy,
    oBase,
    oLevy,
    gBase,
    gVat,
    gLevy,
    gTotal,
    nBase,
    nVat,
    nLevy,
    nTotal,
    isPartBilling,
    pbPeriods,
    ...meta,
    billNumber: "",
  };
}

function syncPbMaxLabels() {
  partBillingStages.forEach((stage, idx) => {
    const maxIn = pbMaxWeight(idx, "inside");
    const maxOut = pbMaxWeight(idx, "outside");
    const maxSdIn = pbMaxSdWeight(idx, "inside");
    const maxSdOut = pbMaxSdWeight(idx, "outside");
    const inpIn = document.getElementById(`pb-inside-${idx}`);
    const inpOut = document.getElementById(`pb-outside-${idx}`);
    const inpSdIn = document.getElementById(`pb-sd-inside-${idx}`);
    const inpSdOut = document.getElementById(`pb-sd-outside-${idx}`);
    const lblIn = document.querySelector(`label[for="pb-inside-${idx}"]`);
    const lblOut = document.querySelector(`label[for="pb-outside-${idx}"]`);
    const lblSdIn = document.querySelector(`label[for="pb-sd-inside-${idx}"]`);
    const lblSdOut = document.querySelector(
      `label[for="pb-sd-outside-${idx}"]`,
    );
    const syncInp = (inp, max) => {
      if (!inp) return;
      if (max > 0) inp.max = max;
      else inp.removeAttribute("max");
    };
    const syncLbl = (lbl, max, maxSd = 0) => {
      if (!lbl) return;
      let note = lbl.querySelector(".pbs-max-note");
      if (max > 0) {
        if (!note) {
          note = document.createElement("span");
          note.className = "pbs-max-note";
          lbl.appendChild(note);
        }
        note.textContent =
          maxSd > 0 ? `max ${max}t Normal + ${maxSd}t SD` : `max ${max}t`;
      } else if (note) note.remove();
    };
    syncInp(inpIn, maxIn);
    syncLbl(lblIn, maxIn, maxSdIn);
    syncInp(inpOut, maxOut);
    syncLbl(lblOut, maxOut, maxSdOut);
    syncInp(inpSdIn, maxSdIn);
    syncLbl(lblSdIn, maxSdIn);
    syncInp(inpSdOut, maxSdOut);
    syncLbl(lblSdOut, maxSdOut);
  });
}

function cargoRefreshNow() {
  try {
    validateDateField("c-cld", "c-cld-hint", "CLD");
    validateDateField("c-delivery", "c-delivery-hint", "delivery date");
    validateDateOrder("c-cld", "c-delivery", "c-delivery-hint");
    cargoValidateSplit();
    cargoValidateRemovalTon();
    cargoValidateWeighmentTon();
    cargoValidateSelfDriveTon();
    if (document.getElementById("c-partBilling")?.checked) {
      const wantSdIn =
        !!document.getElementById("c-chkSelfDriveInside")?.checked &&
        pbMaxSdWeight(0, "inside") > 0;
      const wantSdOut =
        !!document.getElementById("c-chkSelfDriveOutside")?.checked &&
        pbMaxSdWeight(0, "outside") > 0;
      const hasSdIn = !!document.getElementById("pb-sd-inside-0");
      const hasSdOut = !!document.getElementById("pb-sd-outside-0");
      if (wantSdIn !== hasSdIn || wantSdOut !== hasSdOut)
        renderPartBillingStages();
      else syncPbMaxLabels();
      validatePartBillingDates();
    }
    const cld_ = pd(document.getElementById("c-cld").value);
    const _cfd_raw = Number.parseInt(
      document.getElementById("c-freeDays").value,
      10,
    );
    const fd_ = Number.isNaN(_cfd_raw) ? 4 : Math.max(0, _cfd_raw);
    const freeEnd = fd_ === 0 ? addD(cld_, -1) : addD(cld_, fd_ - 1);
    const storStartDate = addD(freeEnd, 1);
    document.getElementById("cargo-freeEnd").textContent = fd(freeEnd);
    document.getElementById("cargo-storStart").textContent = fd(storStartDate);
    const strip = document.getElementById("cargo-ftStrip");
    const ftDaysEl = document.getElementById("cargo-ftDays");
    if (strip && ftDaysEl) {
      const dayLabels = [];
      for (let i = 0; i < fd_; i++) {
        const d = addD(cld_, i);
        dayLabels.push(
          d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          }),
        );
      }
      ftDaysEl.innerHTML =
        fd_ === 0
          ? `<span style="color:var(--m2)">No free time — </span><span style="color:var(--green);font-weight:600;">Wharfrent starts ${storStartDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>`
          : '<span style="color:var(--m2)">Free: </span>' +
            dayLabels
              .map(
                (d) =>
                  `<span style="background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.2);color:var(--cargo-accent);border-radius:4px;padding:1px 7px;margin:0 2px;">${d}</span>`,
              )
              .join("") +
            `<span style="color:var(--m2)"> → Wharfrent starts </span><span style="color:var(--green);font-weight:600;">${storStartDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>`;
      strip.style.display = "block";
    }
    ["c-or1", "c-or2", "c-or3"].forEach((id) => {
      const inp = document.getElementById(id);
      const sp = document.getElementById(id.replace("c-", "c-d"));
      if (inp && sp) sp.textContent = inp.value;
    });
    const b = cargoCompute();
    if (!b) return;
    // Sync ton field active/inactive state + inline error
    // maxVal: if > 0, also validates that entered value does not exceed this limit
    const syncTon = (chkId, inputId, errId, maxVal = 0) => {
      const on = document.getElementById(chkId)?.checked;
      const inp = document.getElementById(inputId);
      const err = document.getElementById(errId);
      if (!inp) return;
      if (maxVal > 0) inp.max = maxVal;
      else inp.removeAttribute("max");
      if (on) {
        inp.classList.remove("ton-inactive");
        const v = Math.round(Number.parseFloat(inp.value) || 0);
        let showErr = false;
        if (v <= 0) {
          if (err) err.textContent = "⚠ Enter weight > 0";
          showErr = true;
        } else if (maxVal > 0 && v > maxVal) {
          if (err) err.textContent = `⚠ Cannot exceed ${maxVal} ton(s)`;
          showErr = true;
        }
        if (err) err.classList.toggle("show", showErr);
      } else {
        inp.classList.add("ton-inactive");
        if (err) err.classList.remove("show");
      }
    };
    syncTon("c-chkRemoval", "c-removalTon", "c-removalTon-err");
    syncTon("c-chkWeighment", "c-weighmentTon", "c-weighmentTon-err");
    syncTon(
      "c-chkSelfDriveInside",
      "c-selfDriveTonInside",
      "c-selfDriveTonInside-err",
      b.insideW,
    );
    syncTon(
      "c-chkSelfDriveOutside",
      "c-selfDriveTonOutside",
      "c-selfDriveTonOutside-err",
      b.outsideW,
    );
    // Sync derived rate display fields (always readonly — formula-based)
    document.getElementById("c-rLanding").value = b.dynamicLandingRate;
    document.getElementById("c-rRemoval").value = b.dynamicRemovalRate;
    document.getElementById("c-rHoisting").value = b.dynamicHoistingRate;
    // Update rate tier badge
    const tierEl = document.getElementById("cargo-tier-info");
    if (tierEl) {
      tierEl.innerHTML =
        `<span style="color:var(--m2)">Landing Tier: </span><strong style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</strong>` +
        `<span style="color:var(--m2)"> · Removal: </span><strong style="color:var(--gold)">${b.dynamicRemovalRate} Tk/ton</strong>` +
        `<span style="color:var(--m2)"> · Hoisting: </span><strong style="color:var(--gold)">${b.dynamicHoistingRate} Tk/ton</strong>`;
    }
    document.getElementById("cargo-rbadge").innerHTML = b.isPartBilling
      ? `<div class="rbadge rb-new" style="background:rgba(14,165,233,0.10);border-color:rgba(14,165,233,0.28);color:var(--sky);">📦 PART BILLING — ${(b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery).length} Delivery Stage(s)</div>`
      : `<div class="rbadge rb-new">● CARGO RATES — Landing Tier: ${getCargoTierLabel(b.totalWeight)}</div>`;
    const pv = document.getElementById("cargo-preview");
    const inside = Math.round(
      Number.parseFloat(document.getElementById("c-inside").value) || 0,
    );
    const outside = Math.round(
      Number.parseFloat(document.getElementById("c-outside").value) || 0,
    );
    if (b.isPartBilling) {
      const vp = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Part Billing Stages</span><span class="pvr-val v-cyan">${vp.length} stage${vp.length !== 1 ? "s" : ""}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Total Wharfrent Days</span><span class="pvr-val v-cyan">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Sub-Total (before VAT)</span><span class="pvr-val v-blue">${fmt(b.iBase)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Sub-Total (before VAT)</span><span class="pvr-val v-purple">${fmt(b.oBase)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">Grand Total (incl. VAT &amp; Levy)</span><span class="pvr-val v-cyan">${fmt(b.gTotal)}</span></div>`;
    } else if (b.hasWharfrent) {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Wharfrent Days</span><span class="pvr-val v-cyan">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Sub-Total (before VAT)</span><span class="pvr-val v-blue">${fmt(b.iBase)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Sub-Total (before VAT)</span><span class="pvr-val v-purple">${fmt(b.oBase)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Grand Total (incl. VAT &amp; Levy)</span><span class="pvr-val v-cyan">${fmt(b.gTotal)}</span></div>`;
    } else {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Wharfrent</span><span class="pvr-val v-green">Within Free Time ✓</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Payable Charges</span><span class="pvr-val">${fmt(b.paySub)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Grand Total</span><span class="pvr-val v-cyan">${fmt(b.nTotal)}</span></div>`;
    }
    if (isAdmin && !isInitialLoad) saveRates();
  } catch (_) {
    document.getElementById("cargo-preview").innerHTML = SP_CARGO_IDLE;
  }
}
let cargoRefreshQueued = false;
function cargoRefresh() {
  if (cargoRefreshQueued) return;
  cargoRefreshQueued = true;
  requestAnimationFrame(() => {
    cargoRefreshQueued = false;
    cargoRefreshNow();
  });
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function buildCargoBillTable(b, side) {
  //NOSONAR
  // side: 'inside' | 'outside' | 'noWharfrent'
  let rows = "";
  if (side === "inside" || side === "outside") {
    const isIn = side === "inside";
    const normalSlabs = isIn ? b.insideSlabs : b.outsideSlabs;
    const sdSlabs = isIn ? b.insideSdSlabs : b.outsideSdSlabs;
    const normalW = isIn ? b.insideNormalW : b.outsideNormalW;
    const sdW = isIn ? b.wharfSdInside : b.wharfSdOutside;
    const wharfAmt = isIn ? b.insideWharfrent : b.outsideWharfrent;
    const weight = isIn ? b.insideW : b.outsideW;
    const baseAmt = isIn ? b.iBase : b.oBase;
    const subLabel = isIn
      ? "Inside Sub-Total (Base for VAT)"
      : "Outside Sub-Total (½ Rate · Base for VAT)";
    const halfNote = isIn ? "" : " (½ Rate Applied)";
    const halfSuffix = isIn
      ? ""
      : '<span style="font-size:11px;color:var(--m2)"> × 0.50</span>';

    if (b.hasWharfrent) {
      // Normal GC-rate portion
      normalSlabs.forEach((s) => {
        const dispAmt = isIn ? s.amt : s.amt * 0.5;
        rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
      });
      // Self-drive Car-rate portion
      if (sdSlabs.length > 0) {
        rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
        sdSlabs.forEach((s) => {
          const dispAmt = isIn ? s.amt : s.amt * 0.5;
          rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
        });
      }
      // Sub-total row(s)
      if (normalSlabs.length > 0 && sdSlabs.length > 0) {
        const normalAmt = isIn
          ? normalSlabs.reduce((a, s) => a + s.amt, 0)
          : normalSlabs.reduce((a, s) => a + s.amt, 0) * 0.5;
        const sdAmt = isIn
          ? sdSlabs.reduce((a, s) => a + s.amt, 0)
          : sdSlabs.reduce((a, s) => a + s.amt, 0) * 0.5;
        rows += `<tr class="sub"><td colspan="3">Cargo Wharfrent Sub-Total${halfNote} — ${fmtN(normalW)} ton(s)</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(normalAmt)}</td></tr>`;
        rows += `<tr class="sub"><td colspan="3">Self Drive Wharfrent Sub-Total${halfNote} — ${fmtN(sdW)} ton(s)</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(sdAmt)}</td></tr>`;
      } else {
        const subLabel =
          sdSlabs.length > 0
            ? `Self Drive Wharfrent Sub-Total${halfNote} — ${fmtN(sdW)} ton(s)`
            : `Cargo Wharfrent Sub-Total${halfNote} — ${fmtN(weight)} ton(s)`;
        rows += `<tr class="sub"><td colspan="3">${subLabel}</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(wharfAmt)}</td></tr>`;
      }
    }
    // Use appropriate payables based on bill type
    const billPayables = isIn ? b.insidePayables : b.outsidePayables;
    if (billPayables.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
      billPayables.forEach((p) => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">${subLabel}</td><td>${fmt(baseAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach((p) => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons ?? b.totalWeight)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(2)}%</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(b.nTotal)}</td></tr>`;
  }
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ────────────────────────────────────────────────
//  Charge Breakdown — Wharfrent vs Payable composition
// ────────────────────────────────────────────────
//  Layout (hasWharfrent):
//    Charge Type        | Inside | Outside | VAT | Levy | Total
//    Wharfrent Charge   |   iW   |   oW    | wVat|  0   | wTotal
//    Payable Charge     | iPaySub| oPaySub | pVat| levy | pTotal
//    Grand Total        |  iBase |  oBase  | tVat| levy | grand
//
//  VAT split: vatRate × wharfrentBase → wVat ; pVat = totalVat − wVat (residual,
//             so wVat + pVat exactly equals the actual VAT charged on the bill)
//  Levy:      Per-ton port charge — entirely attributed to Payable row
function cargoBreakdownData(b) {
  const r2 = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
  if (!b.hasWharfrent) {
    return {
      hasWharfrent: false,
      vatPct: (b.vatRate * 100).toFixed(2),
      // Wharfrent row — all zero, within free time
      wInside: 0,
      wOutside: 0,
      wVat: 0,
      wLevy: 0,
      wTotal: 0,
      // Payable row — uses no-wharfrent flat values (payables not split inside/outside)
      pInside: 0,
      pOutside: 0,
      pBase: b.paySub,
      pVat: b.nVat,
      pLevy: b.nLevy,
      pTotal: b.nTotal,
      // Grand row
      gInside: 0,
      gOutside: 0,
      gBase: b.nBase,
      gVat: b.nVat,
      gLevy: b.nLevy,
      gTotal: b.nTotal,
    };
  }
  const wharfrentBase = b.insideWharfrent + b.outsideWharfrent;
  const payableBase = b.insidePaySub + b.outsidePaySub;
  const totalVat = b.gVat;
  const totalLevy = b.gLevy;
  const grand = b.gTotal;
  const wVat = r2(wharfrentBase * b.vatRate);
  const pVat = r2(totalVat - wVat);
  const wLevy = 0;
  const pLevy = totalLevy;
  const wTotal = r2(wharfrentBase + wVat + wLevy);
  const pTotal = r2(payableBase + pVat + pLevy);
  return {
    hasWharfrent: true,
    vatPct: (b.vatRate * 100).toFixed(2),
    wInside: b.insideWharfrent,
    wOutside: b.outsideWharfrent,
    wVat,
    wLevy,
    wTotal,
    pInside: b.insidePaySub,
    pOutside: b.outsidePaySub,
    pVat,
    pLevy,
    pTotal,
    gInside: b.iBase,
    gOutside: b.oBase,
    gVat: totalVat,
    gLevy: totalLevy,
    gTotal: grand,
  };
}

function buildCargoBreakdownHtml(b) {
  const d = cargoBreakdownData(b);
  if (!d.hasWharfrent) {
    return `<div style="margin-bottom:20px;">
      <div class="slbl sl-cin">▪ Charge Composition Breakdown</div>
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="btw">
          <table class="bt">
            <thead>
              <tr>
                <th>Charge Component</th>
                <th style="text-align:right">Base Amount</th>
                <th style="text-align:right">VAT (${d.vatPct}%)</th>
                <th style="text-align:right">Levy (no VAT)</th>
                <th style="text-align:right">Sub-Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Wharfrent Charge</td>
                <td style="text-align:right;color:var(--green);font-style:italic">Within Free Time</td>
                <td style="text-align:right">${fmt(0)}</td>
                <td style="text-align:right">${fmt(0)}</td>
                <td style="text-align:right;font-weight:700">${fmt(0)}</td>
              </tr>
              <tr>
                <td>Total Payable Charge</td>
                <td style="text-align:right;font-weight:600">${fmt(d.pBase)}</td>
                <td style="text-align:right;color:var(--sky)">${fmt(d.pVat)}</td>
                <td style="text-align:right;color:var(--green)">${fmt(d.pLevy)}</td>
                <td style="text-align:right;font-weight:700">${fmt(d.pTotal)}</td>
              </tr>
              <tr class="grand">
                <td>GRAND TOTAL</td>
                <td style="text-align:right">${fmt(d.gBase)}</td>
                <td style="text-align:right">${fmt(d.gVat)}</td>
                <td style="text-align:right">${fmt(d.gLevy)}</td>
                <td style="text-align:right;color:var(--cargo-accent)">${fmt(d.gTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }
  return `<div style="margin-bottom:20px;">
    <div class="slbl sl-cin">▪ Charge Composition Breakdown</div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="btw">
        <table class="bt">
          <thead>
            <tr>
              <th>Charge Component</th>
              <th style="text-align:right">Inside (${fmtN(b.insideW)}t)</th>
              <th style="text-align:right">Outside (${fmtN(b.outsideW)}t)</th>
              <th style="text-align:right">VAT (${d.vatPct}%)</th>
              <th style="text-align:right">Levy (no VAT)</th>
              <th style="text-align:right">Sub-Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total Wharfrent Charge</td>
              <td style="text-align:right;color:var(--blue);font-weight:600">${fmt(d.wInside)}</td>
              <td style="text-align:right;color:var(--purple);font-weight:600">${fmt(d.wOutside)}</td>
              <td style="text-align:right;color:var(--sky)">${fmt(d.wVat)}</td>
              <td style="text-align:right;color:var(--green)">${fmt(d.wLevy)}</td>
              <td style="text-align:right;font-weight:700">${fmt(d.wTotal)}</td>
            </tr>
            <tr>
              <td>Total Payable Charge</td>
              <td style="text-align:right;color:var(--blue);font-weight:600">${fmt(d.pInside)}</td>
              <td style="text-align:right;color:var(--purple);font-weight:600">${fmt(d.pOutside)}</td>
              <td style="text-align:right;color:var(--sky)">${fmt(d.pVat)}</td>
              <td style="text-align:right;color:var(--green)">${fmt(d.pLevy)}</td>
              <td style="text-align:right;font-weight:700">${fmt(d.pTotal)}</td>
            </tr>
            <tr class="grand">
              <td>GRAND TOTAL</td>
              <td style="text-align:right">${fmt(d.gInside)}</td>
              <td style="text-align:right">${fmt(d.gOutside)}</td>
              <td style="text-align:right">${fmt(d.gVat)}</td>
              <td style="text-align:right">${fmt(d.gLevy)}</td>
              <td style="text-align:right;color:var(--cargo-accent)">${fmt(d.gTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function buildCargoBreakdownPrintHtml(b) {
  const d = cargoBreakdownData(b);
  const head = secHead("CHARGE COMPOSITION BREAKDOWN", "Wharfrent vs Payable");
  const sub =
    '<div class="section-sub">Inside + Outside + VAT + Levy attribution per charge type</div>';
  if (!d.hasWharfrent) {
    return `${head}${sub}<div class="no-break"><div style="overflow-x:auto;"><table>
      <thead><tr>
        <th style="width:35%">Charge Component</th>
        <th style="text-align:right">Base Amount</th>
        <th style="text-align:right">VAT (${d.vatPct}%)</th>
        <th style="text-align:right">Levy</th>
        <th style="text-align:right">Sub-Total</th>
      </tr></thead>
      <tbody>
        <tr><td>Total Wharfrent Charge</td><td style="text-align:right;font-style:italic">Within Free Time</td><td style="text-align:right">${fmt(0)}</td><td style="text-align:right">${fmt(0)}</td><td style="text-align:right;font-weight:700">${fmt(0)}</td></tr>
        <tr><td>Total Payable Charge</td><td style="text-align:right">${fmt(d.pBase)}</td><td style="text-align:right">${fmt(d.pVat)}</td><td style="text-align:right">${fmt(d.pLevy)}</td><td style="text-align:right;font-weight:700">${fmt(d.pTotal)}</td></tr>
        <tr class="grand"><td>GRAND TOTAL</td><td style="text-align:right">${fmt(d.gBase)}</td><td style="text-align:right">${fmt(d.gVat)}</td><td style="text-align:right">${fmt(d.gLevy)}</td><td style="text-align:right">${fmt(d.gTotal)}</td></tr>
      </tbody>
    </table></div></div>`;
  }
  return `${head}${sub}<div class="no-break"><div style="overflow-x:auto;"><table>
    <thead><tr>
      <th style="width:28%">Charge Component</th>
      <th style="text-align:right">Inside (${fmtN(b.insideW)}t)</th>
      <th style="text-align:right">Outside (${fmtN(b.outsideW)}t)</th>
      <th style="text-align:right">VAT (${d.vatPct}%)</th>
      <th style="text-align:right">Levy</th>
      <th style="text-align:right">Sub-Total</th>
    </tr></thead>
    <tbody>
      <tr><td>Total Wharfrent Charge</td><td style="text-align:right">${fmt(d.wInside)}</td><td style="text-align:right">${fmt(d.wOutside)}</td><td style="text-align:right">${fmt(d.wVat)}</td><td style="text-align:right">${fmt(d.wLevy)}</td><td style="text-align:right;font-weight:700">${fmt(d.wTotal)}</td></tr>
      <tr><td>Total Payable Charge</td><td style="text-align:right">${fmt(d.pInside)}</td><td style="text-align:right">${fmt(d.pOutside)}</td><td style="text-align:right">${fmt(d.pVat)}</td><td style="text-align:right">${fmt(d.pLevy)}</td><td style="text-align:right;font-weight:700">${fmt(d.pTotal)}</td></tr>
      <tr class="grand"><td>GRAND TOTAL</td><td style="text-align:right">${fmt(d.gInside)}</td><td style="text-align:right">${fmt(d.gOutside)}</td><td style="text-align:right">${fmt(d.gVat)}</td><td style="text-align:right">${fmt(d.gLevy)}</td><td style="text-align:right">${fmt(d.gTotal)}</td></tr>
    </tbody>
  </table></div></div>`;
}

function cargoCalculate() {
  if (reportInputErrors(collectCargoErrors())) return;
  let b;
  try {
    b = cargoCompute();
  } catch (_) {
    showToast("Billing calculation failed — please check inputs and try again.", "error");
    return;
  }
  if (!b) return;
  lastCargoBill = b;
  try {
    document.getElementById("cargo-results").style.display = "block";

    if (b.isPartBilling) {
      const vp = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
      const firstDel = vp.length > 0 ? fd(vp[0].deliveryDate) : "—";
      const lastDel = vp.length > 0 ? fd(vp[vp.length - 1].deliveryDate) : "—";
      document.getElementById("cargo-ibar").innerHTML =
        `<div class="ibar"><div>${b.billNumber ? `<div class="ii bill-no-ii"><div class="il">Bill Number</div><div class="iv bill-no-val">${b.billNumber}</div></div>` : ""}${b.blNumber ? `<div class="ii"><div class="il">BL Number</div><div class="iv" style="color:var(--sky)">${b.blNumber}</div></div>` : ""}${b.billEntryNumber ? `<div class="ii"><div class="il">Bill of Entry</div><div class="iv">${b.billEntryNumber}</div></div>` : ""}${b.cnfName ? `<div class="ii"><div class="il">C&F Agent</div><div class="iv">${b.cnfName}</div></div>` : ""}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${fd(b.storStart)}</div></div><div class="ii"><div class="il">First Delivery</div><div class="iv">${firstDel}</div></div><div class="ii"><div class="il">Last Delivery</div><div class="iv">${lastDel}</div></div><div class="ii"><div class="il">Delivery Stages</div><div class="iv" style="color:var(--cargo-accent)">${vp.length} stages</div></div><div class="ii"><div class="il">Initial Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Total Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.totalDays} days</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
      document.getElementById("cargo-srow").innerHTML =
        `<div class="sc cg"><div class="sl">Grand Total — Part Billing</div><div class="sv" style="color:var(--cargo-accent)">${fmtN(b.gTotal)}</div><div class="ss">${vp.length} stages · incl. VAT &amp; Levy</div></div><div class="sc cb"><div class="sl">Inside Sub-Total</div><div class="sv">${fmtN(b.iBase)}</div><div class="ss">Before VAT &amp; Levy · ${b.totalDays} days</div></div><div class="sc cp"><div class="sl">Outside Sub-Total</div><div class="sv">${fmtN(b.oBase)}</div><div class="ss">Before VAT &amp; Levy · ${b.totalDays} days</div></div>`;
      const pbInDesc =
        b.wharfSdInside > 0
          ? `${fmtN(b.insideNormalW)}t Normal + ${fmtN(b.wharfSdInside)}t SD`
          : `${fmtN(b.insideW)} ton(s)`;
      const pbOutDesc =
        b.wharfSdOutside > 0
          ? `${fmtN(b.outsideNormalW)}t Normal + ${fmtN(b.wharfSdOutside)}t SD`
          : `${fmtN(b.outsideW)} ton(s)`;
      document.getElementById("cargo-insideSec").innerHTML =
        `<div style="margin-bottom:20px;"><div class="cargo-split-info">Part Billing — ${vp.length} stage(s) · Initial Inside: <strong>${pbInDesc}</strong> · Full rate · Slab progression continuous from CLD</div><div class="slbl sl-cin">▪ Inside Wharfrent — Part Billing</div><div class="card" style="padding:0;overflow:hidden;">${buildPartBillingBillTable(b, "inside")}</div></div>`;
      document.getElementById("cargo-outsideSec").innerHTML =
        `<div style="margin-bottom:20px;"><div class="cargo-split-info" style="background:rgba(192,132,252,0.06);border-color:rgba(192,132,252,0.2);color:var(--purple);">Part Billing — ${vp.length} stage(s) · Initial Outside: <strong>${pbOutDesc}</strong> · ½ rate</div><div class="slbl sl-cout">▪ Outside Wharfrent — Part Billing — ½ Rate</div><div class="card" style="padding:0;overflow:hidden;">${buildPartBillingBillTable(b, "outside")}</div></div>` +
        `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Bill Summary — VAT &amp; Levy on Inside + Outside</div><div class="card" style="padding:0;overflow:hidden;">${buildCombinedSummaryTable(b)}</div></div>`;
    } else {
      document.getElementById("cargo-ibar").innerHTML =
        `<div class="ibar"><div>${b.billNumber ? `<div class="ii bill-no-ii"><div class="il">Bill Number</div><div class="iv bill-no-val">${b.billNumber}</div></div>` : ""}${b.blNumber ? `<div class="ii"><div class="il">BL Number</div><div class="iv" style="color:var(--sky)">${b.blNumber}</div></div>` : ""}${b.billEntryNumber ? `<div class="ii"><div class="il">Bill of Entry</div><div class="iv">${b.billEntryNumber}</div></div>` : ""}${b.cnfName ? `<div class="ii"><div class="il">C&F Agent</div><div class="iv">${b.cnfName}</div></div>` : ""}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${b.hasWharfrent ? fd(b.storStart) : "—"}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Total Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.hasWharfrent ? b.totalDays + " days" : "In free time"}</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
      if (b.hasWharfrent) {
        document.getElementById("cargo-srow").innerHTML =
          `<div class="sc cg"><div class="sl">General Cargo Grand Total</div><div class="sv" style="color:var(--cargo-accent)">${fmtN(b.gTotal)}</div><div class="ss">incl. VAT &amp; Levy</div></div><div class="sc cb"><div class="sl">Inside Sub-Total</div><div class="sv">${fmtN(b.iBase)}</div><div class="ss">Full rate · before VAT</div></div><div class="sc cp"><div class="sl">Outside Sub-Total</div><div class="sv">${fmtN(b.oBase)}</div><div class="ss">½ rate · before VAT</div></div>`;
        const inTonDesc =
          b.wharfSdInside > 0
            ? `${fmtN(b.insideNormalW)}t Normal + ${fmtN(b.wharfSdInside)}t SD`
            : `${fmtN(b.insideW)} ton(s)`;
        const outTonDesc =
          b.wharfSdOutside > 0
            ? `${fmtN(b.outsideNormalW)}t Normal + ${fmtN(b.wharfSdOutside)}t SD`
            : `${fmtN(b.outsideW)} ton(s)`;
        document.getElementById("cargo-insideSec").innerHTML =
          `<div style="margin-bottom:20px;"><div class="cargo-split-info">Inside: <strong>${inTonDesc}</strong> — Full wharfrent rate</div><div class="slbl sl-cin">▪ Inside Wharfrent</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, "inside")}</div></div>`;
        document.getElementById("cargo-outsideSec").innerHTML =
          `<div style="margin-bottom:20px;"><div class="cargo-split-info" style="background:rgba(192,132,252,0.06);border-color:rgba(192,132,252,0.2);color:var(--purple);">Outside: <strong>${outTonDesc}</strong> — ½ wharfrent rate</div><div class="slbl sl-cout">▪ Outside Wharfrent — ½ Rate</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, "outside")}</div></div>` +
          `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Bill Summary — VAT &amp; Levy on Inside + Outside</div><div class="card" style="padding:0;overflow:hidden;">${buildCombinedSummaryTable(b)}</div></div>`;
      } else {
        document.getElementById("cargo-insideSec").innerHTML =
          '<div class="no-stor-note">✓ Delivery within free time — no wharfrent charge applies.</div>';
        document.getElementById("cargo-outsideSec").innerHTML =
          `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Payable Charges — Inside &amp; Outside</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, "noWharfrent")}</div></div>`;
      }
    }

    // Charge Breakdown — Wharfrent vs Payable composition of the bill
    document.getElementById("cargo-breakdownSec").innerHTML =
      buildCargoBreakdownHtml(b);

    const grand =
      b.hasWharfrent || b.isPartBilling ? b.gTotal : b.nTotal;
    const cargoGrandSplitHtml =
      b.hasWharfrent || b.isPartBilling
        ? `<div><div class="glbl">Inside Sub-Total${b.isPartBilling ? " — Part Billing" : ""}</div><div class="gval" style="color:var(--blue)">${fmt(b.iBase)}</div><div class="gsub">Full rate · before VAT</div></div><div><div class="glbl">Outside Sub-Total${b.isPartBilling ? " — Part Billing" : ""}</div><div class="gval" style="color:var(--purple)">${fmt(b.oBase)}</div><div class="gsub">½ rate · before VAT</div></div>`
        : `<div><div class="glbl">Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No wharfrent — payable charges only</div></div><div></div>`;
    document.getElementById("cargo-grandSec").innerHTML =
      `<div class="gbox cargo-grand"><div class="ginn">${cargoGrandSplitHtml}<div class="gfin"><div class="glbl">GENERAL CARGO GRAND TOTAL</div><div class="gval" style="color:var(--cargo-accent)">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;
    const cargoEmpty = document.getElementById("cargo-empty");
    if (cargoEmpty) cargoEmpty.style.display = "none";
    const cargoGbox = document.querySelector("#cargo-grandSec .gbox");
    if (cargoGbox) { cargoGbox.classList.remove("just-calculated"); void cargoGbox.offsetWidth; cargoGbox.classList.add("just-calculated"); }

    if (!isInitialLoad) {
      setTimeout(
        () =>
          document
            .getElementById("cargo-results")
            .scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    }
  } catch (_) {
    showToast("Display error — bill may not render correctly.", "warning");
  }
}

function cargoReset() {
  document.getElementById("cargo-results").style.display = "none";
  document.getElementById("cargo-preview").innerHTML = SP_CARGO_IDLE;
  ["c-blNumber", "c-cnfName"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  const cargoBoE = document.getElementById("c-billEntry");
  if (cargoBoE) cargoBoE.value = "C-";
  lastCargoBill = null;
  editingBillNumber.cargo = null;
  cargoIncludePayables = true;
  cargoIncludeWharfrent = true;
  const allPayEl = document.getElementById("c-chkAllPayables");
  if (allPayEl) allPayEl.checked = true;
  const whEl = document.getElementById("c-chkPrintWharfrent");
  if (whEl) whEl.checked = true;
  // Reset part billing state — restore charge checkboxes bypassed when pb mode was active
  const pbChk = document.getElementById("c-partBilling");
  if (pbChk) pbChk.checked = false;
  const _chargeDefaults = {
    "c-chkRiver": true,
    "c-chkLanding": true,
    "c-chkRemoval": false,
    "c-chkWeighment": false,
    "c-chkHoisting": true,
    "c-chkLevy": true,
  };
  Object.entries(_chargeDefaults).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (el) el.checked = _pbSavedCharges ? !!_pbSavedCharges[id] : def;
  });
  _pbSavedCharges = null;
  partBillingStages = [
    {
      date: "",
      insideAfter: 0,
      outsideAfter: 0,
      sdInsideAfter: 0,
      sdOutsideAfter: 0,
    },
  ];
  partBillingUpToDate = false;
  const pbUtd = document.getElementById("c-pbUpToDate");
  if (pbUtd) pbUtd.checked = false;
  const pbCard = document.getElementById("c-pbStagesCard");
  if (pbCard) pbCard.style.display = "none";
  const deliveryFg = document.getElementById("c-deliveryFg");
  if (deliveryFg) deliveryFg.style.display = "";
  const pbContainer = document.getElementById("c-pbStagesContainer");
  if (pbContainer) pbContainer.innerHTML = "";
  // Uncheck and reset self-drive inputs
  ["c-chkSelfDriveInside", "c-chkSelfDriveOutside"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  ["c-selfDriveTonInside", "c-selfDriveTonOutside"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.classList.add("ton-inactive");
      el.setCustomValidity("");
    }
  });
  // Reset removal and weighment ton inputs to 0 and clear state
  ["c-removalTon", "c-weighmentTon"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.classList.add("ton-inactive");
      el.setCustomValidity("");
    }
  });
  // Clear all inline error messages
  [
    "c-removalTon-err",
    "c-weighmentTon-err",
    "c-selfDriveTonInside-err",
    "c-selfDriveTonOutside-err",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
  });
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

// ════════════════════════════════════════
//  PRINT / INVOICE
// ════════════════════════════════════════


function buildInvoiceHtml(opts) {
  const {
    title,
    subtitle,
    billRef,
    today,
    infoHtml,
    sectionsHtml,
    grandTotal,
    grandLabel,
    vatRate,
    isSplit,
    isCargo,
  } = opts;

  const accentColor  = isCargo ? "#0ea5c9" : "#c09230";
  const accentHi     = isCargo ? "#22c1e0" : "#d4a840";
  const accentLo     = isCargo ? "#0a7f9a" : "#9a7020";
  const accentBg     = isCargo ? "#edfafd" : "#fdf8ee";
  const accentBdr    = isCargo ? "#82d4e4" : "#e8d080";

  const hasLevy = (opts.totalLevy || 0) > 0;
  const grandSubNote = hasLevy ? "Incl. VAT &amp; Levy" : "Incl. VAT";

  const splitSummaryHtml = opts.showSplit
    ? `<div class="io-summary no-break">
        <div class="io-cell io-inside">
          <div class="io-tag">Inside &mdash; Full Rate</div>
          <div class="io-label">${opts.insideLabel}</div>
          <div class="io-amount">${fmt(opts.iSub)}</div>
          <div class="io-note">${opts.ioNote}</div>
        </div>
        <div class="io-divider"></div>
        <div class="io-cell io-outside">
          <div class="io-tag">Outside &mdash; Half Rate</div>
          <div class="io-label">${opts.outsideLabel}</div>
          <div class="io-amount">${fmt(opts.oSub)}</div>
          <div class="io-note">${opts.ioNote}</div>
        </div>
      </div>`
    : "";

  const splitWarnHtml = isSplit
    ? `<div class="split-warn"><span class="sw-icon">&#9889;</span><strong>SPLIT BILLING APPLIED</strong> &mdash; Old rates applied up to 22/07/2024 &bull; New rates applied from 23/07/2024 onwards</div>`
    : "";

  const issueTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const emblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="${accentColor}" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="29.5" stroke-width="2.5"/><circle cx="32" cy="12" r="3.8" stroke-width="2.2"/><line x1="32" y1="15.8" x2="32" y2="50.5" stroke-width="2.8"/><line x1="20" y1="21.5" x2="44" y2="21.5" stroke-width="2.8"/><circle cx="20" cy="21.5" r="2.5" fill="${accentColor}" stroke="none"/><circle cx="44" cy="21.5" r="2.5" fill="${accentColor}" stroke="none"/><path d="M32,50.5 Q22,49 17,41" stroke-width="2.6"/><polygon points="13.5,38 17.5,45 24,42" fill="${accentColor}" stroke="none"/><path d="M32,50.5 Q42,49 47,41" stroke-width="2.6"/><polygon points="50.5,38 46.5,45 40,42" fill="${accentColor}" stroke="none"/><path d="M22,56 Q27,53 32,56 Q37,59 42,56" stroke-width="2"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${billRef}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,900;1,9..40,400&display=swap" rel="stylesheet">
<style>
/* ══ DESIGN TOKENS ══ */
:root{
  --navy:       #0b1d3c;
  --navy-2:     #16305c;
  --navy-3:     #1e4282;
  --accent:     ${accentColor};
  --accent-hi:  ${accentHi};
  --accent-lo:  ${accentLo};
  --accent-bg:  ${accentBg};
  --accent-bdr: ${accentBdr};
  --blue:       #1050a8;
  --blue-bg:    #eaf2ff;
  --blue-bdr:   #96bae8;
  --indigo:     #5020b0;
  --indigo-bg:  #f0eaff;
  --indigo-bdr: #b8a0e8;
  --green:      #0a5c3c;
  --green-bg:   #eaf8f0;
  --green-bdr:  #7ccaa4;
  --border:     #ccd3e2;
  --border-lo:  #e2e6f2;
  --bg:         #f2f4fb;
  --bg-cell:    #f8f9fd;
  --text:       #0e1c34;
  --text-mid:   #384f6c;
  --text-muted: #6a7e98;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:10pt;}
body{
  font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;
  color:var(--text);background:#fff;
  line-height:1.55;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
body *{font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}

/* ══ DOCUMENT SHELL ══ */
.invoice{max-width:900px;margin:0 auto;background:#fff;overflow:hidden;}
@media screen{
  .invoice{
    margin:28px auto 64px;border-radius:6px;
    box-shadow:
      0 1px 4px rgba(8,16,40,0.08),
      0 8px 28px rgba(8,16,40,0.12),
      0 32px 80px rgba(8,16,40,0.16);
  }
}

/* ══ ACCENT BAND ══ */
.inv-band{
  height:0;
  border-top:5px solid var(--accent);
}

/* ══ CLASSIFICATION STRIP ══ */
.cls-strip{
  display:flex;justify-content:space-between;align-items:center;
  background:#fff;
  border-bottom:1px solid var(--border);
  padding:5px 30px;
}
.cls-strip .cls-l{
  font-family:'DM Mono',monospace;font-size:6.8pt;
  letter-spacing:2px;text-transform:uppercase;
  color:var(--text-mid);
}
.cls-strip .cls-r{
  font-family:'DM Mono',monospace;font-size:6.2pt;
  letter-spacing:1.5px;text-transform:uppercase;
  color:var(--text-muted);
}

/* ══ LETTERHEAD ══ */
.lh{
  display:flex;justify-content:space-between;align-items:flex-start;
  padding:22px 30px 20px;
  background:#fff;
  border-bottom:3px solid var(--accent);
}
.lh-left{display:flex;align-items:flex-start;gap:16px;}
.lh-emblem{flex-shrink:0;margin-top:2px;}
.lh-logo{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:19pt;letter-spacing:5px;
  color:var(--navy);text-transform:uppercase;line-height:1;
}
.lh-rule{
  width:44px;height:3px;margin:7px 0 8px;
  background:var(--accent);
}
.lh-sub{
  font-family:'DM Mono',monospace;font-size:7.5pt;
  letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);
}
.lh-right{text-align:right;}
.lh-doc-label{
  display:inline-block;margin-bottom:8px;
  padding:3px 12px;
  background:#fff;color:var(--accent);
  border:1px solid var(--accent);
  font-family:'DM Mono',monospace;font-size:6.8pt;
  letter-spacing:2.5px;text-transform:uppercase;border-radius:2px;
}
.lh-bill-name{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:13pt;color:var(--navy);
  letter-spacing:1.5px;text-transform:uppercase;
  line-height:1.15;margin-bottom:11px;
}
.lh-meta{border-collapse:collapse;margin-left:auto;}
.lh-meta-lbl{
  font-family:'DM Mono',monospace;font-size:7pt;color:var(--text-muted);
  text-transform:uppercase;letter-spacing:0.5px;
  padding:2.5px 14px 2.5px 0;text-align:left;white-space:nowrap;
}
.lh-meta-val{
  font-family:'DM Mono',monospace;font-size:8.5pt;
  color:var(--text);font-weight:700;
  text-align:right;padding:2.5px 0;white-space:nowrap;
}
.lh-badge{
  display:inline-block;margin-top:9px;
  padding:3px 10px;
  border:1px solid var(--border);
  background:#fff;color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:6.5pt;
  letter-spacing:1px;text-transform:uppercase;border-radius:2px;
}

/* ══ TITLE BAND ══ */
.title-band{
  display:flex;justify-content:space-between;align-items:center;
  padding:12px 30px;
  border-left:5px solid var(--accent);
  border-top:1px solid var(--border-lo);
  border-bottom:1px solid var(--border-lo);
  background:#fff;margin-top:1px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.title-band h1{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:11pt;color:var(--navy);
  letter-spacing:2.5px;text-transform:uppercase;
}
.title-band p{font-size:8.5pt;color:var(--text-mid);letter-spacing:0.3px;margin-top:3px;}

/* ══ SPLIT WARNING ══ */
.split-warn{
  display:flex;align-items:center;gap:10px;
  background:#fff;
  border-top:3px solid var(--accent);border-bottom:1px solid var(--border);
  padding:10px 30px;font-size:8.8pt;color:var(--text-mid);letter-spacing:0.2px;
}
.sw-icon{font-size:12pt;flex-shrink:0;}

/* ══ CONSIGNMENT LABEL ══ */
.info-section-label{
  font-family:'DM Mono',monospace;font-size:7pt;
  color:var(--text-muted);text-transform:uppercase;
  letter-spacing:2.5px;padding:16px 30px 6px;
}

/* ══ INFO GRID ══ */
.info-grid{
  display:grid;grid-template-columns:repeat(4,1fr);
  margin:0 30px 6px;
  border:1px solid var(--border);
  border-radius:3px;overflow:hidden;
}
.info-cell{
  padding:11px 14px;
  border-right:1px solid var(--border);
  border-bottom:1px solid var(--border);
  background:#fff;
  border-left:3px solid transparent;
}
.info-cell:nth-child(4n+1){border-left-color:var(--accent);}
.info-label{
  font-family:'DM Mono',monospace;
  font-size:6.8pt;color:var(--text-muted);
  text-transform:uppercase;letter-spacing:0.7px;margin-bottom:4px;
}
.info-value{
  font-family:'DM Mono',monospace;
  font-size:9pt;color:var(--text);font-weight:600;
}

/* ══ SECTION HEADERS ══ */
.section-head{
  display:flex;justify-content:space-between;align-items:center;
  padding:9px 30px 8px;margin-top:22px;
  border-left:5px solid var(--accent);
  border-bottom:2px solid var(--navy);
  background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.section-head>span:first-child{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;color:var(--navy);
}
.sh-accent{
  font-family:'DM Mono',monospace;font-size:7.8pt;font-weight:500;
  letter-spacing:0.5px;white-space:nowrap;
  color:var(--text-mid);border:1px solid var(--border);
  padding:2px 9px;border-radius:2px;background:#fff;
}
.section-head.inside-head{
  border-left-color:var(--blue);border-bottom-color:var(--blue);
}
.section-head.inside-head>span:first-child{color:var(--blue);}
.section-head.inside-head .sh-accent{border-color:var(--blue-bdr);color:var(--blue);}
.inside-head+.section-sub{border-left-color:var(--blue);}

.section-head.outside-head{
  border-left-color:var(--indigo);border-bottom-color:var(--indigo);
}
.section-head.outside-head>span:first-child{color:var(--indigo);}
.section-head.outside-head .sh-accent{border-color:var(--indigo-bdr);color:var(--indigo);}
.outside-head+.section-sub{border-left-color:var(--indigo);}

.section-head.payable-head{
  border-left-color:var(--green);border-bottom-color:var(--green);
}
.section-head.payable-head>span:first-child{color:var(--green);}
.section-head.payable-head .sh-accent{border-color:var(--green-bdr);color:var(--green);}
.payable-head+.section-sub{border-left-color:var(--green);}

.section-sub{
  background:#fff;border-left:5px solid var(--accent);
  padding:6px 30px;font-size:8.2pt;color:var(--text-mid);
  letter-spacing:0.3px;border-bottom:1px solid var(--border);
}

/* ══ CHARGE TABLES ══ */
table{width:100%;border-collapse:collapse;font-size:8.8pt;}
thead th{
  background:#fff;
  border-bottom:2px solid var(--navy);border-top:1px solid var(--border);
  padding:8px 10px;text-align:left;
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:7.5pt;letter-spacing:0.5px;text-transform:uppercase;
  color:var(--navy);white-space:nowrap;
}
thead th:first-child{width:30%;padding-left:30px;}
thead th:nth-child(2){width:17%;}
thead th:nth-child(3),thead th:nth-child(4){width:11%;text-align:center;}
thead th:nth-child(5){width:8%;text-align:center;}
thead th:last-child{width:16%;text-align:right;min-width:90px;padding-right:30px;}
td{padding:7px 10px;border-bottom:1px solid var(--border-lo);vertical-align:middle;color:var(--text-mid);}
td:first-child{padding-left:30px;}
td:last-child{text-align:right;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);padding-right:30px;}
td:nth-child(2){color:var(--text-mid);white-space:nowrap;font-size:8.2pt;font-family:'DM Mono',monospace;}
td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center;color:var(--text-muted);font-size:8.2pt;font-family:'DM Mono',monospace;}
tr.sep td{
  background:#fff;color:var(--navy-2);font-weight:700;
  font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;
  padding:5.5px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);
}
tr.sep td:first-child{padding-left:30px;}
tr.sub td{background:#fff;color:var(--text-mid);}
tr.sub td:last-child{color:var(--text);font-weight:700;}
tr.sub td:first-child{padding-left:30px;}
tr.tot td{
  background:#fff;font-weight:700;color:var(--navy);
  border-top:2px solid var(--navy);border-bottom:1px solid var(--border);
  font-size:9pt;
}
tr.tot td:first-child{padding-left:30px;}
tr.vrow td{
  background:#fff;color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
}
tr.vrow td:first-child{padding-left:30px;}
tr.lrow td{
  background:#fff;color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
  border-bottom:2px solid var(--border);
}
tr.lrow td:first-child{padding-left:30px;}

/* Grand total row — accent border + text, white background */
tr.grand td{
  background:#fff;color:var(--accent);
  font-weight:700;font-size:10pt;padding:12px 10px;
  border-top:3px solid var(--accent);border-bottom:2px solid var(--accent);
}
tr.grand td:first-child{padding-left:30px;}
tr.grand td:last-child{color:var(--accent);font-size:12pt;letter-spacing:1px;padding-right:30px;}

/* Slab calculation sub-rows */
tr.calc-row td{
  background:#fff;color:var(--text-muted);
  font-size:7.5pt;font-family:'DM Mono',monospace;font-style:italic;
  padding:2px 10px 4px;border-bottom:1px solid var(--border-lo);
}
tr.calc-row td:first-child{padding-left:44px;}

/* ══ INSIDE / OUTSIDE SPLIT ══ */
.io-summary{
  display:grid;grid-template-columns:1fr 1px 1fr;
  margin:22px 30px 0;
  border:1px solid var(--border);border-radius:4px;overflow:hidden;
}
.io-cell{padding:20px 24px;background:#fff;}
.io-inside{background:#fff;border-top:4px solid var(--blue);}
.io-outside{background:#fff;border-top:4px solid var(--indigo);}
.io-divider{background:var(--border);}
.io-tag{
  font-family:'DM Mono',monospace;font-size:6.8pt;
  letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;font-weight:600;
}
.io-inside .io-tag{color:var(--blue);}
.io-outside .io-tag{color:var(--indigo);}
.io-label{font-size:8pt;color:var(--text-mid);margin-bottom:9px;line-height:1.4;}
.io-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:16pt;line-height:1;margin-bottom:5px;
}
.io-inside .io-amount{color:var(--blue);}
.io-outside .io-amount{color:var(--indigo);}
.io-note{font-size:7.5pt;color:var(--text-muted);}

/* ══ GRAND TOTAL BAR ══ */
.grand-bar{
  margin:22px 30px 0;
  border:1px solid var(--border);
  border-top:4px solid var(--accent);
  border-radius:4px;overflow:hidden;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.gb-inner{display:flex;justify-content:space-between;align-items:stretch;}
.gb-left{
  padding:22px 28px;flex:1;
  border-right:1px solid var(--border-lo);
}
.gb-left .gb-label{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:2px;text-transform:uppercase;
  color:var(--navy);margin-bottom:6px;
}
.gb-left .gb-sub{
  font-family:'DM Mono',monospace;font-size:8pt;
  color:var(--text-mid);letter-spacing:1px;text-transform:uppercase;
}
.gb-right{
  padding:24px 32px;
  background:#fff;
  border-left:1px solid var(--border);
  display:flex;flex-direction:column;justify-content:center;align-items:flex-end;
  min-width:230px;
}
.gb-currency-label{
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;color:var(--accent-lo);margin-bottom:4px;
}
.gb-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:24pt;color:var(--accent-lo);
  letter-spacing:0.5px;line-height:1;
}
.gb-vat-note{
  font-family:'DM Mono',monospace;font-size:7pt;
  color:var(--text-muted);letter-spacing:0.5px;
  text-transform:uppercase;margin-top:6px;
}

/* ══ AUTHORIZATION ══ */
.auth-section{margin:26px 0 0;border-top:2px solid var(--accent);}
.auth-row{display:grid;grid-template-columns:1fr 1fr 1fr;}
.auth-col{
  padding:24px 36px 28px;
  border-right:1px solid var(--border-lo);
  text-align:center;
}
.auth-col:first-child{padding-left:30px;}
.auth-col:last-child{border-right:none;padding-right:30px;}
.auth-sig-space{min-height:0.9in;}
.auth-sig-line{border-bottom:1.5px solid var(--border);margin-bottom:7px;}
.auth-role{
  font-family:'DM Mono',monospace;font-size:7pt;
  color:var(--text-mid);text-transform:uppercase;letter-spacing:1.8px;
}

/* ══ DISCLAIMER ══ */
.disclaimer{
  margin:18px 30px 0;padding:12px 16px;
  border:1px solid var(--border);border-left:4px solid var(--accent);
  background:#fff;
  font-size:7.8pt;color:var(--text-mid);line-height:1.75;
  font-family:'DM Mono',monospace;border-radius:0 3px 3px 0;
}
.disclaimer strong{color:var(--text);}

/* ══ DOCUMENT FOOTER ══ */
.doc-footer{
  display:flex;justify-content:space-between;align-items:center;
  margin:12px 30px 26px;padding-top:10px;
  border-top:1px solid var(--border-lo);
  font-family:'DM Mono',monospace;font-size:7pt;color:var(--text-muted);
}
.doc-footer .df-ref{font-weight:500;color:var(--text-mid);}

/* ══ EXPLANATION BOX ══ */
.exp-box{
  margin:16px 30px 0;
  border:1px solid var(--border);border-left:4px solid var(--accent);
  background:#fff;padding:15px 20px;
  page-break-inside:avoid;break-inside:avoid;border-radius:0 3px 3px 0;
}
.exp-box-title{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:8pt;color:var(--navy);letter-spacing:1.5px;text-transform:uppercase;
  margin-bottom:11px;padding-bottom:8px;border-bottom:1px solid var(--border);
}
.exp-row{
  display:grid;grid-template-columns:148px 1fr;
  gap:0 12px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border-lo);
}
.exp-row:last-of-type{border-bottom:none;}
.exp-key{
  font-family:'DM Mono',monospace;font-size:7.5pt;font-weight:600;
  color:var(--navy);text-transform:uppercase;letter-spacing:0.4px;padding-top:2px;
}
.exp-val{font-size:8.5pt;color:var(--text-mid);line-height:1.55;}
.exp-val strong{color:var(--text);}
.exp-formula{
  margin-top:11px;padding:9px 14px;
  background:#fff;border:1px solid var(--border);border-radius:3px;
  font-family:'DM Mono',monospace;font-size:8pt;color:var(--navy);
  font-weight:600;letter-spacing:0.2px;
}
.exp-formula-label{font-size:7pt;font-weight:400;color:var(--text-mid);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.8px;}

/* ══ RESPONSIVE ══ */
@media(max-width:700px){
  .invoice{margin:0;border-radius:0;}
  .lh{flex-direction:column;gap:14px;padding:16px;}
  .lh-right{text-align:left;}
  .info-grid{grid-template-columns:repeat(2,1fr);margin:0 16px 4px;}
  .info-section-label,.cls-strip,.exp-box,.disclaimer,.doc-footer{margin-left:16px;margin-right:16px;}
  .info-grid,.io-summary,.grand-bar{margin-left:16px;margin-right:16px;}
  .section-head,.section-sub,.title-band{padding-left:16px;padding-right:16px;}
  thead th:first-child{padding-left:16px;}
  td:first-child,tr.sep td:first-child,tr.sub td:first-child,tr.tot td:first-child,
  tr.vrow td:first-child,tr.lrow td:first-child,tr.grand td:first-child{padding-left:16px;}
  td:last-child,tr.grand td:last-child{padding-right:16px;}
  .io-summary{grid-template-columns:1fr;grid-template-rows:auto 1px auto;}
  .io-divider{height:1px;width:100%;}
  .gb-inner{flex-direction:column;}
  .gb-right{align-items:flex-start;min-width:auto;}
  .auth-row{grid-template-columns:1fr;gap:0;}
  .auth-col{padding:20px 16px 24px !important;border-right:none !important;text-align:left;}
  .split-warn{padding:8px 16px;}
}

/* ══ FONT SCALE ══ */
html{font-size:11.5pt;}
.lh-logo{font-size:20pt;}
.lh-sub{font-size:8.5pt;}
.lh-doc-label{font-size:7.5pt;}
.lh-bill-name{font-size:14pt;}
.lh-meta-lbl{font-size:8pt;}
.lh-meta-val{font-size:9.5pt;}
.lh-badge{font-size:7.5pt;}
.cls-strip .cls-l{font-size:7.5pt;}
.cls-strip .cls-r{font-size:7pt;}
.title-band h1{font-size:12pt;}
.title-band p{font-size:9.5pt;}
.split-warn{font-size:9.5pt;}
.info-section-label{font-size:8.5pt;}
.info-label{font-size:8pt;}
.info-value{font-size:10.5pt;}
.section-head>span:first-child{font-size:10.5pt;}
.sh-accent{font-size:9pt;}
.section-sub{font-size:9.5pt;}
table{font-size:10.5pt;}
thead th{font-size:8.5pt;}
td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){font-size:9.5pt;}
tr.sep td{font-size:8.5pt;}
tr.vrow td,tr.lrow td{font-size:9.5pt;}
tr.tot td{font-size:10.5pt;}
tr.grand td{font-size:11pt;}
tr.grand td:last-child{font-size:13pt;}
.io-tag{font-size:8.5pt;}
.io-label{font-size:10pt;}
.io-amount{font-size:20pt;}
.io-note{font-size:9.5pt;}
.gb-left .gb-label{font-size:11pt;}
.gb-left .gb-sub{font-size:9.5pt;}
.gb-amount{font-size:28pt;}
.gb-currency-label{font-size:8.5pt;}
.gb-vat-note{font-size:9pt;}
.auth-role{font-size:8.5pt;}
.disclaimer{font-size:9.5pt;}
.doc-footer{font-size:8.5pt;}
.exp-box-title{font-size:9pt;}
.exp-key{font-size:8.5pt;}
.exp-val{font-size:9.5pt;}
.exp-formula{font-size:9pt;}
tr.calc-row td{font-size:8.5pt;}

/* ══ PAGE CONTROL ══ */
.no-break{page-break-inside:avoid;break-inside:avoid;}
@page{margin:10mm 12mm;size:A4 portrait;}

/* ══ PRINT STYLES ══ */
@media print{
  *,*::before,*::after{animation:none !important;transition:none !important;box-shadow:none !important;}
  html,body{width:210mm;font-size:7.5pt;line-height:1.3;color:var(--text);}
  .invoice{width:100%;max-width:100%;margin:0;border-radius:0;}

  /* Diagonal watermark */
  body::after{
    content:"UNOFFICIAL ESTIMATE";
    position:fixed;top:50%;left:50%;
    transform:translate(-50%,-50%) rotate(-38deg);
    font-family:'DM Sans',sans-serif;font-weight:900;
    font-size:46pt;color:rgba(0,0,0,0.025);
    white-space:nowrap;pointer-events:none;z-index:9999;letter-spacing:10px;
  }

  /* Layout tightening for A4 */
  .inv-band{border-top-width:3pt !important;}
  .cls-strip{padding:2px 0 !important;}
  .cls-strip .cls-l{font-size:5.8pt !important;}
  .cls-strip .cls-r{font-size:5.2pt !important;}
  .lh{padding:8px 0 !important;}
  .lh-emblem svg{width:40px !important;height:40px !important;}
  .lh-logo{font-size:12pt !important;letter-spacing:3px !important;}
  .lh-rule{width:28px !important;height:2pt !important;margin:3px 0 4px !important;}
  .lh-sub{font-size:6.5pt !important;letter-spacing:1px !important;}
  .lh-doc-label{font-size:5.5pt !important;padding:2px 7px !important;margin-bottom:4px !important;}
  .lh-bill-name{font-size:9.5pt !important;letter-spacing:1px !important;margin-bottom:6px !important;}
  .lh-meta-lbl{font-size:5.8pt !important;padding-right:8px !important;}
  .lh-meta-val{font-size:7pt !important;}
  .lh-badge{font-size:5.5pt !important;padding:1px 6px !important;margin-top:4px !important;}
  .title-band{padding:5px 0 !important;margin-top:4px !important;border-left-width:3pt !important;}
  .title-band h1{font-size:8.5pt !important;letter-spacing:1.5px !important;}
  .title-band p{font-size:6.5pt !important;margin-top:1px !important;}
  .split-warn{padding:4px 0 !important;font-size:7pt !important;}
  .info-section-label{font-size:6pt !important;padding:5px 0 3px !important;letter-spacing:2px !important;}
  .info-grid{margin:0 0 4px !important;border-radius:0 !important;border-width:0.5pt !important;}
  .info-cell{padding:4px 8px !important;border-left-width:2pt !important;}
  .info-label{font-size:5.5pt !important;margin-bottom:2px !important;}
  .info-value{font-size:7.5pt !important;}
  .section-head{padding:4px 0 !important;margin-top:7px !important;border-left-width:3pt !important;border-bottom-width:1.5pt !important;}
  .section-head>span:first-child{font-size:7.5pt !important;letter-spacing:1px !important;}
  .sh-accent{font-size:6pt !important;padding:1px 6px !important;}
  .section-sub{padding:2px 0 !important;font-size:6.5pt !important;border-left-width:3pt !important;}

  table{font-size:7pt !important;}
  thead th{border-bottom-width:1.5pt !important;border-top-width:0.5pt !important;padding:4px 6px !important;font-size:6pt !important;}
  thead th:first-child{padding-left:0 !important;width:30%;}
  thead th:nth-child(2){width:18%;}
  thead th:nth-child(3),thead th:nth-child(4){width:11%;}
  thead th:nth-child(5){width:7%;}
  thead th:last-child{padding-right:0 !important;}
  td{padding:2.5px 6px !important;border-bottom-width:0.4pt !important;}
  td:first-child{padding-left:0 !important;}
  td:last-child{padding-right:0 !important;}
  td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){font-size:7pt !important;}
  tr.sep td{font-size:5.8pt !important;padding:2.5px 6px !important;}
  tr.sep td:first-child{padding-left:0 !important;}
  tr.sub td:first-child{padding-left:0 !important;}
  tr.tot td{border-top-width:1.5pt !important;font-size:7.5pt !important;padding:3px 6px !important;}
  tr.tot td:first-child{padding-left:0 !important;}
  tr.vrow td,tr.lrow td{font-size:6.5pt !important;padding:2px 6px !important;}
  tr.vrow td:first-child,tr.lrow td:first-child{padding-left:0 !important;}
  tr.grand td{border-top-width:2pt !important;border-bottom-width:1.5pt !important;font-size:8.5pt !important;padding:4.5px 6px !important;}
  tr.grand td:first-child{padding-left:0 !important;}
  tr.grand td:last-child{font-size:10pt !important;padding-right:0 !important;}
  tr.calc-row td{font-size:6pt !important;padding:1px 6px 2.5px !important;}
  tr.calc-row td:first-child{padding-left:18px !important;}

  .io-summary{margin:6px 0 0 !important;border-radius:0 !important;border-width:0.5pt !important;}
  .io-cell{padding:6px 10px !important;}
  .io-inside{border-top-width:2pt !important;}
  .io-outside{border-top-width:2pt !important;}
  .io-tag{font-size:5.5pt !important;margin-bottom:2px !important;}
  .io-label{font-size:6.5pt !important;margin-bottom:3px !important;}
  .io-amount{font-size:11pt !important;margin-bottom:2px !important;}
  .io-note{font-size:5.8pt !important;}
  .grand-bar{margin:8px 0 0 !important;border-radius:0 !important;border-top-width:2.5pt !important;border-width:0.5pt !important;}
  .gb-left{padding:7px 10px !important;}
  .gb-left .gb-label{font-size:7.5pt !important;margin-bottom:3px !important;}
  .gb-left .gb-sub{font-size:6pt !important;}
  .gb-right{padding:7px 12px !important;min-width:130px !important;}
  .gb-currency-label{font-size:6pt !important;margin-bottom:2px !important;}
  .gb-amount{font-size:16pt !important;}
  .gb-vat-note{font-size:6pt !important;margin-top:3px !important;}
  .auth-section{margin:9px 0 0 !important;border-top-width:1.5pt !important;}
  .auth-col{padding:8px 14px 11px !important;}
  .auth-col:first-child{padding-left:0 !important;}
  .auth-col:last-child{padding-right:0 !important;border-right:none !important;}
  .auth-sig-space{min-height:13mm !important;}
  .auth-sig-line{border-bottom-width:1pt !important;margin-bottom:5px !important;}
  .auth-role{font-size:6pt !important;letter-spacing:1px !important;}
  .disclaimer{margin:7px 0 0 !important;padding:5px 9px !important;border-left-width:2.5pt !important;font-size:6.2pt !important;border-radius:0 !important;}
  .doc-footer{margin:5px 0 0 !important;padding-top:4px !important;font-size:5.8pt !important;}
  .exp-box{margin:5px 0 0 !important;padding:7px 12px !important;border-left-width:3pt !important;border-radius:0 !important;}
  .exp-box-title{font-size:7pt !important;margin-bottom:5px !important;padding-bottom:4px !important;}
  .exp-row{grid-template-columns:95pt 1fr !important;gap:0 8px !important;padding:2.5px 0 !important;}
  .exp-key{font-size:6pt !important;}
  .exp-val{font-size:7pt !important;}
  .exp-formula{padding:5px 10px !important;font-size:6.5pt !important;margin-top:6px !important;}
  .exp-formula-label{font-size:5.8pt !important;}
}
</style>
</head>
<body>
<div class="invoice">

  <!-- ACCENT BAND -->
  <div class="inv-band"></div>

  <!-- CLASSIFICATION STRIP -->
  <div class="cls-strip">
    <span class="cls-l">Port Authority &mdash; Billing &amp; Charge Computation System</span>
    <span class="cls-r">Unofficial Computation &mdash; Not an Official Invoice</span>
  </div>

  <!-- LETTERHEAD -->
  <div class="lh">
    <div class="lh-left">
      <div class="lh-emblem">${emblemSvg}</div>
      <div>
        <div class="lh-logo">Port Authority</div>
        <div class="lh-rule"></div>
        <div class="lh-sub">Wharfrent &amp; Payable Charge Computation System</div>
      </div>
    </div>
    <div class="lh-right">
      <div class="lh-doc-label">Billing Document</div>
      <div class="lh-bill-name">${title}</div>
      <table class="lh-meta">
        <tr><td class="lh-meta-lbl">Document Ref</td><td class="lh-meta-val">${billRef}</td></tr>
        <tr><td class="lh-meta-lbl">Issue Date</td><td class="lh-meta-val">${today}</td></tr>
        <tr><td class="lh-meta-lbl">Issue Time</td><td class="lh-meta-val">${issueTime}</td></tr>
      </table>
      <div style="text-align:right"><div class="lh-badge">Unofficial &mdash; For Estimation Only</div></div>
    </div>
  </div>

  <!-- TITLE BAND -->
  <div class="title-band">
    <div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
  </div>

  ${splitWarnHtml}

  <!-- CONSIGNMENT DETAILS -->
  <div class="info-section-label">Consignment Details</div>
  ${infoHtml}

  <!-- CHARGE SECTIONS -->
  <div>${sectionsHtml}</div>

  <!-- INSIDE / OUTSIDE SPLIT SUMMARY -->
  ${splitSummaryHtml}

  <!-- GRAND TOTAL -->
  <div class="grand-bar no-break">
    <div class="gb-inner">
      <div class="gb-left">
        <div class="gb-label">${grandLabel}</div>
        <div class="gb-sub">BDT &mdash; ${grandSubNote}</div>
      </div>
      <div class="gb-right">
        <div class="gb-currency-label">Bangladeshi Taka</div>
        <div class="gb-amount">${fmt(grandTotal)}</div>
        <div class="gb-vat-note">VAT @ ${(vatRate * 100).toFixed(2)}% included</div>
      </div>
    </div>
  </div>

  <!-- AUTHORIZATION -->
  <div class="auth-section no-break">
    <div class="auth-row">
      <div class="auth-col">
        <div class="auth-sig-space"></div>
        <div class="auth-sig-line"></div>
        <div class="auth-role">Prepared By</div>
      </div>
      <div class="auth-col">
        <div class="auth-sig-space"></div>
        <div class="auth-sig-line"></div>
        <div class="auth-role">Verified By</div>
      </div>
      <div class="auth-col">
        <div class="auth-sig-space"></div>
        <div class="auth-sig-line"></div>
        <div class="auth-role">Authorized By</div>
      </div>
    </div>
  </div>

  <!-- DISCLAIMER -->
  <div class="disclaimer no-break">
    <strong>&#9888; Disclaimer:</strong>
    This document is generated for <strong>informational and estimation purposes only</strong> and does <strong>not constitute an official invoice</strong> or legally binding charge statement.
    Final billing is subject to official verification by the Port Authority at the time of delivery or clearance.
    VAT at <strong>${(vatRate * 100).toFixed(2)}%</strong> is applied on all applicable base charges. Levy is computed separately and is not subject to VAT.
    All figures are indicative and subject to revision.
  </div>

  <!-- DOCUMENT FOOTER -->
  <div class="doc-footer">
    <span class="df-ref">${billRef} &mdash; ${today}, ${issueTime}</span>
    <span>AI Assistant &mdash; Designed, Systemized, and Deployed by samiulAsumel</span>
  </div>

</div>
</body>
</html>`;
}

function buildPrintTable(rows) {
  return `<div style="overflow-x:auto;"><table><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount (Tk)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function printTr(desc, rate, from, to, days, amt, cls) {
  const rowClassAttr = cls ? ` class="${cls}"` : "";
  return `<tr${rowClassAttr}><td>${desc}</td><td>${rate}</td><td>${from}</td><td>${to}</td><td>${days}</td><td>${amt}</td></tr>`;
}

function printTotRow(desc, amt, cls) {
  return `<tr class="${cls || "tot"}"><td colspan="5">${desc}</td><td>${amt}</td></tr>`;
}

function secHead(label, badge) {
  const badgeHtml = badge ? `<span class="sh-accent">${badge}</span>` : "";
  const cls = /inside/i.test(label)
    ? " inside-head"
    : /outside/i.test(label)
      ? " outside-head"
      : /payable/i.test(label)
        ? " payable-head"
        : "";
  return `<div class="section-head${cls}"><span>${label}</span>${badgeHtml}</div>`;
}

// Combined VAT / Levy / Grand-Total summary section for the printed invoice.
// VAT and Levy are charged ONCE on the combined inside+outside base. Values are
// passed in so callers can pass toggle-adjusted figures (cargo payable toggle).
function buildCombinedSummaryPrintSection(gBase, gVat, gLevy, gTotal, vatRate) {
  const pct = (vatRate * 100).toFixed(2);
  let rows = printTotRow("Total Bill (Base for VAT) — Inside + Outside", fmt(gBase));
  if (gVat > 0)
    rows += printTotRow(`VAT @ ${pct}%  ·  ${fmt(gBase)} × ${pct}% = ${fmt(gVat)}`, fmt(gVat), "vrow");
  if (gLevy > 0)
    rows += printTotRow("Levy Charge (VAT-exempt)", fmt(gLevy), "lrow");
  rows += printTotRow("GRAND TOTAL", fmt(gTotal), "grand");
  return `${secHead("BILL SUMMARY", "VAT & Levy on Inside + Outside")}<div class="no-break">${buildPrintTable(rows)}</div>`;
}

function printCalcRow(rate, weight, days, amt) {
  return `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(rate)}&nbsp;Tk/ton/day &times; ${fmtN(weight)}&nbsp;ton(s) &times; ${days}&nbsp;day(s) = ${fmt(amt)}</td></tr>`;
}
function printCalcRowHalf(fullRate, weight, days, amt) {
  return `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(fullRate)}&nbsp;&times;&nbsp;0.50&nbsp;Tk/ton/day &times; ${fmtN(weight)}&nbsp;ton(s) &times; ${days}&nbsp;day(s) = ${fmt(amt)}</td></tr>`;
}

function expRow(key, val) {
  return `<div class="exp-row"><span class="exp-key">${key}</span><span class="exp-val">${val}</span></div>`;
}

function buildCarExplanationHtml(b) {
  const rawFd = Number.parseInt(document.getElementById("freeDays")?.value, 10);
  const freeDays = Number.isNaN(rawFd) ? 4 : Math.max(0, rawFd);
  const freeInfo =
    freeDays === 0
      ? `<strong>No free time</strong> — wharfrent applies from CLD itself (<strong>${fd(b.cld)}</strong>)`
      : `First <strong>${freeDays} day(s)</strong> from CLD are free (no charge). Free period: <strong>${fd(b.cld)}</strong> to <strong>${fd(b.freeEnd)}</strong>`;
  const wharfInfo = b.hasWharfrent
    ? `Starts <strong>${fd(b.storStart)}</strong>. Vehicle billed for <strong>${b.totalDays} chargeable day(s)</strong>.`
    : `Vehicle delivered within free time — <strong>no wharfrent charge applies</strong>.`;
  const splitRow = b.isSplit
    ? expRow(
        "Rate Period",
        `<strong>Split Billing applied</strong> — old rates used up to 22/07/2024; new (higher) rates from 23/07/2024 onwards. Both periods appear in the table below.`,
      )
    : "";
  return `<div class="exp-box no-break">
<div class="exp-box-title">How This Car Bill Is Calculated</div>
${expRow("CLD", `Cargo Landing Date — your vehicle arrived at the port on <strong>${fd(b.cld)}</strong>`)}
${expRow("Free Time", freeInfo)}
${expRow("Wharfrent", wharfInfo)}
${expRow("Slab System", `Daily rate has <strong>3 tiers</strong>: <strong>Days&nbsp;1–7</strong> (lowest) &rarr; <strong>Days&nbsp;8–14</strong> (mid) &rarr; <strong>Day&nbsp;15+</strong> (highest). Rate increases the longer the vehicle stays.`)}
${expRow("Vehicle Weight", `<strong>${fmtN(b.weight)} ton(s)</strong> — multiplied against the daily rate to get the charge`)}
${expRow("Inside Rate", `Vehicles stored <strong>inside the covered shed</strong> — charged at the <strong>full daily rate</strong>`)}
${expRow("Outside Rate", `Vehicles stored <strong>outside (open yard)</strong> — charged at exactly <strong>half (&frac12;) of the inside rate</strong> for the same period`)}
${expRow("VAT", `Value Added Tax at <strong>${(b.vatRate * 100).toFixed(2)}%</strong> — applied on the total wharfrent + payable charges subtotal`)}
${expRow("Levy", `Fixed regulatory charge — <strong>VAT does not apply</strong> to this amount; added separately`)}
${splitRow}
<div class="exp-formula"><div class="exp-formula-label">Calculation Formula</div>Amount per slab = Rate (Tk/ton/day) &times; ${fmtN(b.weight)} ton(s) &times; Number of days in that slab</div>
</div>`;
}

function buildCargoExplanationHtml(b) {
  const rawFd = Number.parseInt(
    document.getElementById("c-freeDays")?.value,
    10,
  );
  const freeDays = Number.isNaN(rawFd) ? 4 : Math.max(0, rawFd);
  const freeInfo =
    freeDays === 0
      ? `<strong>No free time</strong> — wharfrent applies from CLD itself (<strong>${fd(b.cld)}</strong>)`
      : `First <strong>${freeDays} day(s)</strong> from CLD are free of charge. Free period: <strong>${fd(b.cld)}</strong> to <strong>${fd(b.freeEnd)}</strong>`;
  const wharfInfo =
    b.hasWharfrent || b.isPartBilling
      ? `Wharfrent starts <strong>${fd(b.storStart)}</strong>. Total chargeable days: <strong>${b.totalDays}</strong>.`
      : `Cargo delivered within free time — <strong>no wharfrent charge applies</strong>.`;
  const tierLabel = getCargoTierLabel(b.totalWeight);
  const pbRow = b.isPartBilling
    ? expRow(
        "Part Billing",
        `Cargo delivered in <strong>${(b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery).length} stage(s)</strong>. The day-count runs <strong>continuously from CLD</strong> — it does not reset between stages. Only the billable weight changes after each partial delivery.`,
      )
    : "";
  const sdRow =
    b.wharfSdInside > 0 || b.wharfSdOutside > 0
      ? expRow(
          "Self Drive Tons",
          `Inside SD: <strong>${fmtN(b.wharfSdInside || 0)}t</strong>, Outside SD: <strong>${fmtN(b.wharfSdOutside || 0)}t</strong> — billed at <strong>Car Billing slab rates</strong> (not GC rates), shown as separate slab rows.`,
        )
      : "";
  return `<div class="exp-box no-break">
<div class="exp-box-title">How This General Cargo Bill Is Calculated</div>
${expRow("CLD", `Cargo Landing Date — goods arrived at the port on <strong>${fd(b.cld)}</strong>`)}
${expRow("Free Time", freeInfo)}
${expRow("Wharfrent", wharfInfo)}
${expRow("Total Weight", `<strong>${fmtN(b.totalWeight)} ton(s)</strong> split into Inside and Outside portions`)}
${expRow("Inside Weight", `<strong>${fmtN(b.insideW)} ton(s)</strong> stored inside the shed — charged at the <strong>full GC daily rate</strong>`)}
${expRow("Outside Weight", `<strong>${fmtN(b.outsideW)} ton(s)</strong> stored outside the shed — charged at <strong>half (&frac12;) of the inside rate</strong>`)}
${expRow("Landing Rate Tier", `Based on total weight <strong>${fmtN(b.totalWeight)}t</strong>: Tier = <strong>${tierLabel}</strong>. Heavier shipments use a higher tier rate.`)}
${expRow("Slab System", `Daily rate has <strong>3 tiers</strong>: <strong>Days&nbsp;1–7</strong> &rarr; <strong>Days&nbsp;8–14</strong> &rarr; <strong>Day&nbsp;15+</strong>. The rate increases the longer the cargo stays.`)}
${expRow("VAT", `<strong>${(b.vatRate * 100).toFixed(2)}%</strong> Value Added Tax — applied on the wharfrent + payable charges subtotal`)}
${expRow("Levy", `Fixed regulatory charge — <strong>VAT-exempt</strong>; added after VAT is calculated`)}
${pbRow}
${sdRow}
<div class="exp-formula"><div class="exp-formula-label">Calculation Formula</div>Inside Wharfrent = Rate (Tk/ton/day) &times; Inside tons &times; Days &nbsp;|&nbsp; Outside Wharfrent = (Rate &times; Outside tons &times; Days) &divide; 2</div>
</div>`;
}

function openPrintPreview(html, title, billRef, isCargo) {
  const dialog = document.getElementById("ppvDialog");
  const frame = document.getElementById("ppvFrame");
  const titleEl = document.getElementById("ppvTitle");
  const refEl = document.getElementById("ppvRef");
  const bar = document.getElementById("ppvBar");
  const printBtn = document.getElementById("ppvPrintBtn");
  const closeBtn = document.getElementById("ppvCloseBtn");

  const accentColor = isCargo ? "var(--sky)" : "var(--gold)";
  const btnTextColor = "#fff";
  bar.style.borderTopColor = accentColor;
  bar.querySelector(".ppv-logo-mark").style.color = accentColor;
  printBtn.style.background = accentColor;
  printBtn.style.color = btnTextColor;

  titleEl.textContent = title;
  refEl.textContent = billRef;

  frame.style.height = "";
  frame.onload = () => {
    try {
      const h = frame.contentDocument.documentElement.scrollHeight;
      if (h > 200) frame.style.height = h + 40 + "px";
    } catch (e) {}
  };
  frame.srcdoc = html;

  printBtn.onclick = () => {
    const fw = frame.contentWindow;
    if (!fw) return;
    const fontsApi =
      frame.contentDocument && "fonts" in frame.contentDocument
        ? frame.contentDocument.fonts
        : null;
    if (fontsApi) {
      fontsApi.ready.finally(() => setTimeout(() => fw.print(), 180));
    } else {
      setTimeout(() => fw.print(), 600);
    }
  };

  closeBtn.onclick = () => dialog.close();
  dialog.onclose = () => {
    frame.srcdoc = "";
    frame.style.height = "";
  };

  dialog.showModal();
}

function printBill(type) {
  // NOSONAR
  const b = type === "car" ? lastCarBill : lastCargoBill;
  if (!b) {
    showToast("Generate the bill first before printing.", "warning");
    return;
  }
  // Re-validate before printing in case inputs were edited after the bill was
  // generated — surface exactly what is wrong instead of printing an invalid bill.
  const printErrors =
    type === "car" ? collectCarErrors() : collectCargoErrors();
  if (reportInputErrors(printErrors)) return;
  try {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const billRef = b.billNumber || nextBillNumber(type);
    if (!b.billNumber) {
      b.billNumber = billRef;
      renderBillNumberBadge(type, billRef);
    }

    let sectionsHtml = "";
    let grandTotal, grandLabel;
    let infoHtml, opts;

    if (type === "car") {
      // ── INFO GRID ──
      const rateMode =
        b.rateMode === "split"
          ? "Split (Old + New)"
          : b.rateMode === "old"
            ? "Old Rates (Pre-23/07/2024)"
            : "New Rates (From 23/07/2024)";
      infoHtml = `<div class="info-grid">
      ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
      ${b.billEntryNumber ? `<div class="info-cell"><div class="info-label">Bill of Entry</div><div class="info-value">${b.billEntryNumber}</div></div>` : ""}
      ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
      <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
      <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
      <div class="info-cell"><div class="info-label">Car Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : "—"}</div></div>
      <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
      <div class="info-cell"><div class="info-label">Vehicle Weight</div><div class="info-value">${b.weight} ton(s)</div></div>
      <div class="info-cell"><div class="info-label">Car Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + " days" : "Free Time"}</div></div>
      <div class="info-cell"><div class="info-label">Rate Mode</div><div class="info-value">${rateMode}</div></div>
      <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
    </div>`;

      // ── SECTIONS ──
      if (b.hasWharfrent) {
        ["inside", "outside"].forEach((side) => {
          // NOSONAR
          const isIn = side === "inside";
          const storAmt = isIn ? b.insideStor : b.outsideHalf;
          const baseAmt = isIn ? b.iBase : b.oBase;
          const vatAmt = isIn ? b.iVat : b.oVat;
          const levyAmt = isIn ? b.iLevy : b.oLevy;
          const totAmt = isIn ? b.iTotal : b.oTotal;
          const subLabel = isIn
            ? "Inside Sub-Total (Base for VAT)"
            : "Outside Sub-Total (½ Rate · Base for VAT)";
          let rows = "";
          if (b.isSplit) {
            const oldS = b.slabs.filter((s) => s.group === "old");
            const newS = b.slabs.filter((s) => s.group === "new");
            if (oldS.length) {
              rows += `<tr class="sep"><td colspan="6">OLD RATE PERIOD — Up to 22/07/2024</td></tr>`;
              oldS.forEach((s) => {
                const da = isIn ? s.amt : s.amt * 0.5;
                rows += printTr(
                  s.label,
                  `${fmtN(s.rate)}/t/d${isIn ? "" : " × 0.50"}`,
                  fd(s.from),
                  fd(s.to),
                  s.days,
                  fmt(da),
                );
                rows += isIn
                  ? printCalcRow(s.rate, b.weight, s.days, da)
                  : printCalcRowHalf(s.rate, b.weight, s.days, da);
              });
            }
            if (newS.length) {
              rows += `<tr class="sep"><td colspan="6">NEW RATE PERIOD — From 23/07/2024</td></tr>`;
              newS.forEach((s) => {
                const da = isIn ? s.amt : s.amt * 0.5;
                rows += printTr(
                  s.label,
                  `${fmtN(s.rate)}/t/d${isIn ? "" : " × 0.50"}`,
                  fd(s.from),
                  fd(s.to),
                  s.days,
                  fmt(da),
                );
                rows += isIn
                  ? printCalcRow(s.rate, b.weight, s.days, da)
                  : printCalcRowHalf(s.rate, b.weight, s.days, da);
              });
            }
          } else {
            b.slabs.forEach((s) => {
              const da = isIn ? s.amt : s.amt * 0.5;
              rows += printTr(
                s.label,
                `${fmtN(s.rate)}/t/d${isIn ? "" : " × 0.50"}`,
                fd(s.from),
                fd(s.to),
                s.days,
                fmt(da),
              );
              rows += isIn
                ? printCalcRow(s.rate, b.weight, s.days, da)
                : printCalcRowHalf(s.rate, b.weight, s.days, da);
            });
          }
          rows += printTotRow(
            `Car Wharfrent Sub-Total${isIn ? " (Full Rate)" : " (Half Rate = Inside ÷ 2)"} — ${b.totalDays} chargeable day(s)`,
            fmt(storAmt),
            "sub",
          );
          if (b.payables.length > 0) {
            rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
            b.payables.forEach((p) => {
              rows += printTr(
                p.label,
                `${p.rateStr ?? fmtN(p.rate)}/ton`,
                `${b.weight} ton(s)`,
                "—",
                "—",
                fmt(p.amt),
                "sub",
              );
              rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(b.weight)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
            });
          }
          rows += printTotRow(subLabel, fmt(baseAmt));
          rows += printTotRow(
            `VAT @ ${(b.vatRate * 100).toFixed(2)}%  ·  ${fmt(baseAmt)} × ${(b.vatRate * 100).toFixed(2)}% = ${fmt(vatAmt)}`,
            fmt(vatAmt),
            "vrow",
          );
          rows += printTotRow("Levy Charge (VAT-exempt)", fmt(levyAmt), "lrow");
          rows += printTotRow(
            `${isIn ? "INSIDE" : "OUTSIDE"} TOTAL`,
            fmt(totAmt),
            "grand",
          );
          const headLabel = isIn ? "INSIDE WHARFRENT" : "OUTSIDE WHARFRENT";
          const headBadge = isIn
            ? `${fmtN(b.weight)} ton(s) — Full Rate`
            : `${fmtN(b.weight)} ton(s) — ½ Rate`;
          const subNote = isIn
            ? "Full rate — inside shed / warehouse"
            : "½ rate — outside shed / warehouse";
          sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        });
        grandTotal = b.iTotal + b.oTotal;
        grandLabel = "CAR GRAND TOTAL";
      } else {
        let rows = "";
        b.payables.forEach((p) => {
          rows += printTr(
            p.label,
            `${p.rateStr ?? fmtN(p.rate)}/ton`,
            `${b.weight} ton(s)`,
            "—",
            "—",
            fmt(p.amt),
            "sub",
          );
          rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(b.weight)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
        });
        rows += printTotRow("Total Payable (Base for VAT)", fmt(b.nBase));
        rows += printTotRow(
          `VAT @ ${(b.vatRate * 100).toFixed(2)}%  ·  ${fmt(b.nBase)} × ${(b.vatRate * 100).toFixed(2)}% = ${fmt(b.nVat)}`,
          fmt(b.nVat),
          "vrow",
        );
        rows += printTotRow("Levy Charge (VAT-exempt)", fmt(b.nLevy), "lrow");
        rows += printTotRow("GRAND TOTAL", fmt(b.nTotal), "grand");
        sectionsHtml += `${secHead("PAYABLE CHARGES", "Within Free Time")}<div class="section-sub">No wharfrent — delivery within free storage period</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        grandTotal = b.nTotal;
        grandLabel = "CAR GRAND TOTAL";
      }
      opts = {
        title: "CAR BILL",
        subtitle: "Port Authority — Car Wharfrent & Payable Charges",
        billRef,
        today,
        infoHtml,
        sectionsHtml,
        grandTotal,
        grandLabel,
        vatRate: b.vatRate,
        isSplit: b.isSplit,
        showSplit: b.hasWharfrent,
        insideLabel: "Inside Wharfrent",
        outsideLabel: "Outside Wharfrent (½ Rate)",
        iSub: b.hasWharfrent ? b.iTotal : 0,
        oSub: b.hasWharfrent ? b.oTotal : 0,
        ioNote: `Full bill — incl. VAT${(b.levyAmt || 0) > 0 ? " &amp; Levy" : ""}`,
        totalLevy: b.levyAmt || 0,
        isCargo: false,
      };
    } else {
      // ── CARGO INFO GRID ──
      if (b.isPartBilling) {
        const vp = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
        const firstDel = vp.length > 0 ? fd(vp[0].deliveryDate) : "—";
        const lastDel =
          vp.length > 0 ? fd(vp[vp.length - 1].deliveryDate) : "—";
        infoHtml = `<div class="info-grid">
        ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
        ${b.billEntryNumber ? `<div class="info-cell"><div class="info-label">Bill of Entry</div><div class="info-value">${b.billEntryNumber}</div></div>` : ""}
        ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
        <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
        <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Starts</div><div class="info-value">${fd(b.storStart)}</div></div>
        <div class="info-cell"><div class="info-label">Billing Mode</div><div class="info-value">Part Billing</div></div>
        <div class="info-cell"><div class="info-label">Delivery Stages</div><div class="info-value">${vp.length} stages</div></div>
        <div class="info-cell"><div class="info-label">First Delivery</div><div class="info-value">${firstDel}</div></div>
        <div class="info-cell"><div class="info-label">Last Delivery</div><div class="info-value">${lastDel}</div></div>
        <div class="info-cell"><div class="info-label">Total Wharfrent Days</div><div class="info-value">${b.totalDays} days</div></div>
        <div class="info-cell"><div class="info-label">Initial Total Weight</div><div class="info-value">${fmtN(b.totalWeight)} ton(s)</div></div>
        <div class="info-cell"><div class="info-label">Inside / Outside (Initial)</div><div class="info-value">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div>
        <div class="info-cell"><div class="info-label">Landing Tier</div><div class="info-value">${getCargoTierLabel(b.totalWeight)}</div></div>
        <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
      </div>`;
      } else {
        infoHtml = `<div class="info-grid">
        ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
        ${b.billEntryNumber ? `<div class="info-cell"><div class="info-label">Bill of Entry</div><div class="info-value">${b.billEntryNumber}</div></div>` : ""}
        ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
        <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
        <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : "—"}</div></div>
        <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
        <div class="info-cell"><div class="info-label">Total Weight</div><div class="info-value">${fmtN(b.totalWeight)} ton(s)</div></div>
        <div class="info-cell"><div class="info-label">Inside / Outside</div><div class="info-value">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + " days" : "Free Time"}</div></div>
        <div class="info-cell"><div class="info-label">Landing Tier</div><div class="info-value">${getCargoTierLabel(b.totalWeight)}</div></div>
        <div class="info-cell"><div class="info-label">River Dues</div><div class="info-value">${nn("c-rRiver")} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">Landing Rate</div><div class="info-value">${b.dynamicLandingRate} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">Removal Rate</div><div class="info-value">${b.dynamicRemovalRate} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
      </div>`;
      }

      // ── CARGO SECTIONS ──
      const includeWharfrent = cargoIncludeWharfrent;
      if (b.isPartBilling && includeWharfrent) {
        ["inside", "outside"].forEach((side) => {
          sectionsHtml += buildPartBillingPrintSection(b, side);
        });
        // VAT + Levy charged ONCE on the combined base (toggle-adjusted).
        const _rp = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
        const _pbInBase = _rp(b.iBase - (cargoIncludePayables ? 0 : b.insidePaySub));
        const _pbOutBase = _rp(b.oBase - (cargoIncludePayables ? 0 : b.outsidePaySub));
        const _pbGBase = _rp(_pbInBase + _pbOutBase);
        const _pbGVat = _rp(_pbGBase * b.vatRate);
        const _pbGLevy = cargoIncludePayables ? b.gLevy : 0;
        const _pbGTotal = _rp(_pbGBase + _pbGVat + _pbGLevy);
        sectionsHtml += buildCombinedSummaryPrintSection(
          _pbGBase,
          _pbGVat,
          _pbGLevy,
          _pbGTotal,
          b.vatRate,
        );
        grandTotal = _pbGTotal;
        grandLabel = "GENERAL CARGO GRAND TOTAL — PART BILLING";
      } else if (b.hasWharfrent && includeWharfrent) {
        // Per-portion sub-totals (toggle-adjusted). VAT + Levy are charged ONCE
        // on the combined base in the BILL SUMMARY appended after both sections.
        const _rp = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
        const inAdjBase = _rp(b.iBase - (cargoIncludePayables ? 0 : b.insidePaySub));
        const outAdjBase = _rp(b.oBase - (cargoIncludePayables ? 0 : b.outsidePaySub));
        const gBaseAdj = _rp(inAdjBase + outAdjBase);
        const gVatAdj = _rp(gBaseAdj * b.vatRate);
        const gLevyAdj = cargoIncludePayables ? b.gLevy : 0;
        const gTotalAdj = _rp(gBaseAdj + gVatAdj + gLevyAdj);
        ["inside", "outside"].forEach((side) => {
          const isIn = side === "inside";
          const normalSlabs = isIn ? b.insideSlabs : b.outsideSlabs;
          const sdSlabs = isIn ? b.insideSdSlabs || [] : b.outsideSdSlabs || [];
          const normalW = isIn ? b.insideNormalW : b.outsideNormalW;
          const sdW = isIn ? b.wharfSdInside : b.wharfSdOutside;
          const wharfAmt = isIn ? b.insideWharfrent : b.outsideWharfrent;
          const weight = isIn ? b.insideW : b.outsideW;
          const rawBillPayables = isIn ? b.insidePayables : b.outsidePayables;
          const filteredPayables = cargoIncludePayables ? rawBillPayables : [];
          const baseAmt = isIn ? inAdjBase : outAdjBase;
          const subLabel = isIn
            ? "Inside Sub-Total (Base for VAT)"
            : "Outside Sub-Total (½ Rate · Base for VAT)";
          const rateSuffix = isIn ? "" : " × 0.50";
          let rows = "";
          // Normal GC-rate slabs
          normalSlabs.forEach((s) => {
            const da = isIn ? s.amt : s.amt * 0.5;
            rows += printTr(
              s.label,
              `${fmtN(s.rate)}/t/d${rateSuffix}`,
              fd(s.from),
              fd(s.to),
              s.days,
              fmt(da),
            );
            rows += isIn
              ? printCalcRow(s.rate, normalW, s.days, da)
              : printCalcRowHalf(s.rate, normalW, s.days, da);
          });
          // Self-drive Car-rate slabs
          if (sdSlabs.length > 0) {
            rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
            sdSlabs.forEach((s) => {
              const da = isIn ? s.amt : s.amt * 0.5;
              rows += printTr(
                s.label,
                `${fmtN(s.rate)}/t/d${rateSuffix}`,
                fd(s.from),
                fd(s.to),
                s.days,
                fmt(da),
              );
              rows += isIn
                ? printCalcRow(s.rate, sdW, s.days, da)
                : printCalcRowHalf(s.rate, sdW, s.days, da);
            });
          }
          const wharfrentHalfNote = isIn ? "" : " (½ Rate)";
          if (normalSlabs.length > 0 && sdSlabs.length > 0) {
            const normalAmt = isIn
              ? normalSlabs.reduce((a, s) => a + s.amt, 0)
              : normalSlabs.reduce((a, s) => a + s.amt, 0) * 0.5;
            const sdAmt = isIn
              ? sdSlabs.reduce((a, s) => a + s.amt, 0)
              : sdSlabs.reduce((a, s) => a + s.amt, 0) * 0.5;
            rows += printTotRow(
              `GC Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(normalW)} normal ton(s) × ${b.totalDays} day(s)`,
              fmt(normalAmt),
              "sub",
            );
            rows += printTotRow(
              `Self Drive Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(sdW)} SD ton(s) × ${b.totalDays} day(s)`,
              fmt(sdAmt),
              "sub",
            );
          } else {
            const subLbl =
              sdSlabs.length > 0
                ? `Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(sdW)} ton(s) × ${b.totalDays} day(s)`
                : `Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(weight)} ton(s) × ${b.totalDays} day(s)`;
            rows += printTotRow(subLbl, fmt(wharfAmt), "sub");
          }
          if (filteredPayables.length > 0) {
            rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
            filteredPayables.forEach((p) => {
              rows += printTr(
                p.label,
                `${p.rateStr ?? fmtN(p.rate)}/ton`,
                `${fmtN(p.tons)} ton(s)`,
                "—",
                "—",
                fmt(p.amt),
                "sub",
              );
              rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(p.tons)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
            });
          }
          rows += printTotRow(subLabel, fmt(baseAmt));
          const headLabel = isIn ? `INSIDE WHARFRENT` : `OUTSIDE WHARFRENT`;
          const sdWp = isIn ? b.wharfSdInside || 0 : b.wharfSdOutside || 0;
          const wWp = isIn ? b.insideW : b.outsideW;
          const headBadge =
            sdWp > 0
              ? isIn
                ? `${fmtN(wWp - sdWp)}t Normal + ${fmtN(sdWp)}t SD — Full Rate`
                : `${fmtN(wWp - sdWp)}t Normal + ${fmtN(sdWp)}t SD — ½ Rate`
              : isIn
                ? `${fmtN(b.insideW)} ton(s) — Full Rate`
                : `${fmtN(b.outsideW)} ton(s) — ½ Rate`;
          const subNote = isIn
            ? "Full rate — inside shed / warehouse"
            : "½ rate — outside shed / warehouse";
          sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        });
        sectionsHtml += buildCombinedSummaryPrintSection(
          gBaseAdj,
          gVatAdj,
          gLevyAdj,
          gTotalAdj,
          b.vatRate,
        );
        grandTotal = gTotalAdj;
        grandLabel = "GENERAL CARGO GRAND TOTAL";
      } else {
        // Payable-only: either free time OR wharfrent toggled off
        let rows = "";
        const rawPayList = cargoIncludePayables
          ? b.payables && b.payables.length > 0
            ? b.payables
            : [...(b.insidePayables || []), ...(b.outsidePayables || [])]
          : [];
        // When wharfrent is excluded, merge inside+outside rows of the same charge into one total-tons row
        const payList = !includeWharfrent
          ? (() => {
              const map = new Map();
              rawPayList.forEach((p) => {
                if (map.has(p.label)) {
                  const e = map.get(p.label);
                  e.tons = (e.tons || 0) + (p.tons || 0);
                  e.amt = (e.amt || 0) + (p.amt || 0);
                } else {
                  map.set(p.label, {
                    ...p,
                    tons: p.tons || 0,
                    amt: p.amt || 0,
                  });
                }
              });
              return [...map.values()];
            })()
          : rawPayList;
        payList.forEach((p) => {
          const tons = p.tons ?? b.totalWeight;
          rows += printTr(
            p.label,
            `${p.rateStr ?? fmtN(p.rate)}/ton`,
            `${fmtN(tons)} ton(s)`,
            "—",
            "—",
            fmt(p.amt),
            "sub",
          );
          rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(tons)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
        });
        const adjNBase = cargoIncludePayables ? b.nBase : 0;
        const adjNVat = cargoIncludePayables ? b.nVat : 0;
        const adjNLevy = cargoIncludePayables ? b.nLevy : 0;
        const adjNTotal = adjNBase + adjNVat + adjNLevy;
        if (adjNBase > 0)
          rows += printTotRow("Total Payable (Base for VAT)", fmt(adjNBase));
        if (adjNVat > 0)
          rows += printTotRow(
            `VAT @ ${(b.vatRate * 100).toFixed(2)}%  ·  ${fmt(adjNBase)} × ${(b.vatRate * 100).toFixed(2)}% = ${fmt(adjNVat)}`,
            fmt(adjNVat),
            "vrow",
          );
        if (adjNLevy > 0)
          rows += printTotRow(
            "Levy Charge (VAT-exempt)",
            fmt(adjNLevy),
            "lrow",
          );
        rows += printTotRow("GRAND TOTAL", fmt(adjNTotal), "grand");
        const payableBadge = `${fmtN(b.totalWeight)} ton(s)${!includeWharfrent ? " — Wharfrent Excluded" : " — Within Free Time"}`;
        const payableNote = !includeWharfrent
          ? "Wharfrent charges excluded — payable charges only"
          : "No wharfrent — delivery within free storage period";
        sectionsHtml += `${secHead("PAYABLE CHARGES", payableBadge)}<div class="section-sub">${payableNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        grandTotal = adjNTotal;
        grandLabel = "GENERAL CARGO GRAND TOTAL";
      }
      // Charge composition breakdown — only when wharfrent is included
      if (includeWharfrent && cargoIncludePayables)
        sectionsHtml += buildCargoBreakdownPrintHtml(b);
      const hasW = (b.hasWharfrent || b.isPartBilling) && includeWharfrent;
      opts = {
        title: !includeWharfrent
          ? "GENERAL CARGO BILL — PAYABLE CHARGES"
          : b.isPartBilling
            ? "GENERAL CARGO BILL — PART BILLING"
            : "GENERAL CARGO BILL",
        subtitle: !includeWharfrent
          ? "Port Authority — Payable Charges Only (Wharfrent Excluded)"
          : b.isPartBilling
            ? `Port Authority — General Cargo Part Billing · ${(b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery).length} delivery stages`
            : "Port Authority — General Cargo Wharfrent & Payable Charges",
        billRef,
        today,
        infoHtml,
        sectionsHtml,
        grandTotal,
        grandLabel,
        vatRate: b.vatRate,
        isSplit: false,
        showSplit: hasW,
        insideLabel: `Inside Wharfrent${b.isPartBilling ? " — Part Billing" : ""}`,
        outsideLabel: `Outside Wharfrent (½ Rate)${b.isPartBilling ? " — Part Billing" : ""}`,
        iSub: hasW ? b.iBase : 0,
        oSub: hasW ? b.oBase : 0,
        ioNote: `Sub-total &mdash; before VAT${(b.totalLevy || 0) > 0 ? " &amp; Levy" : ""}`,
        totalLevy: b.totalLevy || 0,
        isCargo: true,
      };
    }

    const html = buildInvoiceHtml(opts);
    openPrintPreview(html, opts.title, billRef, type === "cargo");
  } catch (_) {
    showToast("Error building print preview. Please try again.", "error");
  }
}

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
document.getElementById("year").textContent = new Date().getFullYear();
globalThis.scrollTo(0, 0);
try {
  history.scrollRestoration = "manual";
} catch (_) {}

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


loadSavedRates();
carRefresh();
cargoRefresh();
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

// Floating particles
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


// ═══════════════════════════════════════════════════════════════
// ROTATION NUMBER SYSTEM — Car Billing Module
// ═══════════════════════════════════════════════════════════════

const PROXY_URL = "https://portbill-proxy.sa-sumel91.workers.dev";

// Rotation state
let _rotations = [];
let _selectedRotation = null;

// Load rotations from Cloudflare Worker on startup
async function loadRotations() {
  try {
    const r = await fetch(PROXY_URL + "/rotations");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    _rotations = Array.isArray(data) ? data : [];
    populateYearDropdown();
    if (isAdmin) renderRotationTable();
  } catch (e) {
    console.warn("loadRotations failed:", e.message);
    _rotations = [];
  }
}

// Populate year dropdown from loaded rotations
function populateYearDropdown() {
  const yearSel = document.getElementById("rotYear");
  if (!yearSel) return;
  const years = [...new Set(_rotations.map(r => r.year))].sort((a, b) => b - a);
  yearSel.innerHTML = '<option value="">&#8212; Year &#8212;</option>';
  years.forEach(function(y) {
    var opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSel.appendChild(opt);
  });
  // Re-select previous if available
  if (_selectedRotation) {
    yearSel.value = _selectedRotation.year;
    populateNumberDropdown(_selectedRotation.year);
    var numSel = document.getElementById("rotNum");
    if (numSel) numSel.value = _selectedRotation.id;
  }
}

// Populate number dropdown when a year is selected
function populateNumberDropdown(year) {
  var numSel = document.getElementById("rotNum");
  if (!numSel) return;
  var filtered = _rotations.filter(function(r) { return String(r.year) === String(year); });
  numSel.innerHTML = '<option value="">&#8212; No. &#8212;</option>';
  numSel.disabled = filtered.length === 0;
  filtered.forEach(function(r) {
    var opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = year + "/" + r.num;
    numSel.appendChild(opt);
  });
}

// Called when year dropdown changes
function onRotYearChange() {
  var yearSel = document.getElementById("rotYear");
  var year = yearSel.value;
  populateNumberDropdown(year);
  // Clear previous selection
  _selectedRotation = null;
  var badge = document.getElementById("rotBadge");
  if (badge) badge.textContent = "";
  // Clear CLD (only if not admin)
  var cldEl = document.getElementById("cld");
  if (cldEl && !isAdmin) { cldEl.value = ""; carRefresh(); }
}

// Called when number dropdown changes — fills CLD
function onRotNumChange() {
  var numSel = document.getElementById("rotNum");
  var id = numSel.value;
  if (!id) {
    _selectedRotation = null;
    var badge = document.getElementById("rotBadge");
    if (badge) badge.textContent = "";
    var cldEl = document.getElementById("cld");
    if (cldEl && !isAdmin) { cldEl.value = ""; carRefresh(); }
    return;
  }
  var rot = _rotations.find(function(r) { return String(r.id) === String(id); });
  if (!rot) return;
  _selectedRotation = rot;
  // Set badge
  var badge = document.getElementById("rotBadge");
  if (badge) badge.textContent = rot.year + "/" + rot.num;
  // Fill CLD field
  var cldEl = document.getElementById("cld");
  if (cldEl) {
    cldEl.value = rot.cld;
    carRefresh();
  }
  // Show rotation No in bill if already generated
  refreshRotationInBill();
}

// Get selected rotation display string
function getSelectedRotationStr() {
  if (!_selectedRotation) return "";
  return _selectedRotation.year + "/" + _selectedRotation.num;
}

// Show rotation No in bill statement info bar
function refreshRotationInBill() {
  var ibar = document.getElementById("car-ibar");
  if (!ibar || !ibar.querySelector) return;
  // Remove any existing rotation badge
  var existingBadge = document.getElementById("rot-bill-badge");
  if (existingBadge) existingBadge.remove();
  if (!_selectedRotation) return;
  // Add rotation info to the ibar
  var rotStr = _selectedRotation.year + "/" + _selectedRotation.num;
  var badge = document.createElement("div");
  badge.id = "rot-bill-badge";
  badge.className = "ii rot-bill-ii";
  badge.innerHTML = '<div class="il">Rotation No</div><div class="iv rot-val">' + rotStr + '</div>';
  // Insert as first child of first div in ibar
  var firstDiv = ibar.querySelector(".ibar > div");
  if (firstDiv) firstDiv.insertBefore(badge, firstDiv.firstChild);
}

// ─── ADMIN ROTATION REGISTRY ───────────────────────────────────

// Show/hide rotation registry based on admin state
function toggleRotationRegistry() {
  var reg = document.getElementById("rotRegistry");
  if (!reg) return;
  if (isAdmin) {
    reg.style.display = "block";
    renderRotationTable();
    // Open the admin modal if not open
  } else {
    reg.style.display = "none";
  }
}

// Add a new rotation (admin only)
async function addRotation() {
  if (!isAdmin) return;
  var yearEl = document.getElementById("rotRegYear");
  var numEl = document.getElementById("rotRegNum");
  var cldEl = document.getElementById("rotRegCld");
  var statusEl = document.getElementById("rotRegStatus");

  var year = yearEl ? yearEl.value.trim() : "";
  var num = numEl ? numEl.value.trim() : "";
  var cld = cldEl ? cldEl.value.trim() : "";

  if (!year || !num || !cld) {
    if (statusEl) { statusEl.textContent = "Please fill all fields"; statusEl.className = "rot-reg-status err"; }
    return;
  }
  // Validate year
  if (!/^[0-9]{4}$/.test(year)) {
    if (statusEl) { statusEl.textContent = "Year must be 4 digits (e.g. 2026)"; statusEl.className = "rot-reg-status err"; }
    return;
  }
  // Validate CLD date format
  if (!/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(cld)) {
    if (statusEl) { statusEl.textContent = "CLD must be DD/MM/YYYY"; statusEl.className = "rot-reg-status err"; }
    return;
  }
  // Check for duplicate
  var isDup = _rotations.some(function(r) { return String(r.year) === year && String(r.num) === num; });
  if (isDup) {
    if (statusEl) { statusEl.textContent = "Rotation " + year + "/" + num + " already exists"; statusEl.className = "rot-reg-status err"; }
    return;
  }

  var newRot = { id: Date.now().toString(), year: parseInt(year, 10), num: num, cld: cld };
  var updated = _rotations.concat([newRot]);

  if (statusEl) { statusEl.textContent = "Saving..."; statusEl.className = "rot-reg-status"; }
  var ok = await saveRotationsToWorker(updated);
  if (ok) {
    _rotations = updated;
    if (yearEl) yearEl.value = "";
    if (numEl) numEl.value = "";
    if (cldEl) cldEl.value = "";
    if (statusEl) { statusEl.textContent = "Rotation " + year + "/" + num + " added"; statusEl.className = "rot-reg-status ok"; }
    renderRotationTable();
    populateYearDropdown();
  } else {
    if (statusEl) { statusEl.textContent = "Save failed — check console"; statusEl.className = "rot-reg-status err"; }
  }
}

// Delete a rotation (admin only)
async function deleteRotation(id) {
  if (!isAdmin) return;
  var statusEl = document.getElementById("rotRegStatus");
  var updated = _rotations.filter(function(r) { return String(r.id) !== String(id); });
  if (statusEl) { statusEl.textContent = "Deleting..."; statusEl.className = "rot-reg-status"; }
  var ok = await saveRotationsToWorker(updated);
  if (ok) {
    _rotations = updated;
    if (_selectedRotation && String(_selectedRotation.id) === String(id)) {
      _selectedRotation = null;
      var badge = document.getElementById("rotBadge");
      if (badge) badge.textContent = "";
      var cldField = document.getElementById("cld");
      if (cldField) { cldField.value = ""; carRefresh(); }
    }
    if (statusEl) { statusEl.textContent = "Rotation deleted"; statusEl.className = "rot-reg-status ok"; }
    renderRotationTable();
    populateYearDropdown();
  } else {
    if (statusEl) { statusEl.textContent = "Delete failed — check console"; statusEl.className = "rot-reg-status err"; }
  }
}

// Render the rotation registry table
function renderRotationTable() {
  var tbody = document.getElementById("rotRegTbody");
  if (!tbody) return;
  // Sort by CLD descending (newest first)
  var sorted = _rotations.slice().sort(function(a, b) {
    function parseDMY(s) {
      if (!s) return 0;
      var p = s.split("/");
      return new Date(+p[2], +p[1] - 1, +p[0]).getTime();
    }
    return parseDMY(b.cld) - parseDMY(a.cld);
  });
  tbody.innerHTML = sorted.map(function(r) {
    return '<tr><td>' + r.year + '/' + r.num + '</td><td>' + r.cld + '</td>' +
      '<td><button class="rot-del-btn" onclick="deleteRotation(\''+r.id+'\')">✕</button></td></tr>';
  }).join("");
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--m2);padding:12px;">No rotations added yet</td></tr>';
  }
}

// Save rotations array to Cloudflare Worker
async function saveRotationsToWorker(rotationsArr) {
  try {
    var r = await fetch(PROXY_URL + "/rotations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rotationsArr)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return true;
  } catch (e) {
    console.error("saveRotationsToWorker failed:", e.message);
    return false;
  }
}


// Save saved-bills array to GitHub (via direct API or proxy)
async function saveBillsToWorker(billsArr) {
  try {
    // Try proxy first (/saved-bills endpoint)
    const r = await fetch(PROXY_URL + "/saved-bills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(billsArr),
    });
    if (r.ok) return true;
    // If proxy returns 404/error, proxy doesn't support /saved-bills yet
    if (r.status === 404) {
      console.warn("Worker /saved-bills not supported yet — update Cloudflare Worker");
      return false;
    }
    throw new Error("HTTP " + r.status);
  } catch (e) {
    console.error("saveBillsToWorker failed:", e.message);
    return false;
  }
}

async function saveConfigToWorker(config) {
  const WORKER = 'https://portbill-proxy.sa-sumel91.workers.dev';
  try {
    const res = await fetch(WORKER + '/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.ok;
  } catch (_) { return false; }
}

async function loadConfigFromGitHub() {
  const WORKER = 'https://portbill-proxy.sa-sumel91.workers.dev';
  try {
    const res = await fetch(WORKER + '/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg && cfg.adminPasswordHash) {
      _cloudPasswordHash = cfg.adminPasswordHash;
      localStorage.setItem(ADMIN_PASS_STORAGE_KEY, cfg.adminPasswordHash);
    }
  } catch (_) { /* offline — use localStorage */ }
}

// Load saved-bills from GitHub (via proxy)
async function loadBillsFromWorker() {
  try {
    const r = await fetch(PROXY_URL + "/saved-bills");
    if (r.ok) {
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    }
    if (r.status === 404) {
      console.warn("Worker /saved-bills not supported yet — update Cloudflare Worker");
      return null;
    }
    throw new Error("HTTP " + r.status);
  } catch (e) {
    console.error("loadBillsFromWorker failed:", e.message);
    return null;
  }
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

// Initialize rotation system when page loads
document.addEventListener("DOMContentLoaded", function() {
  loadConfigFromGitHub();
  updateAdminNavigation();
  applyRotationAccessState();
  loadRotations();
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
    if (numSel) { numSel.innerHTML = '<option value="">&#8212; No. &#8212;</option>'; numSel.disabled = true; }
    if (badge) badge.textContent = "";
    // Remove rotation from bill
    var billBadge = document.getElementById("rot-bill-badge");
    if (billBadge) billBadge.remove();
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

// ════════════════════════════════════════
//  SAVED BILLS MODULE
// ════════════════════════════════════════

// Switch between Car / GC sub-tabs inside the Saved Bills module
function switchSavedTab(type) {
  const carPanel   = document.getElementById("saved-car-panel");
  const cargoPanel = document.getElementById("saved-cargo-panel");
  const carBtn     = document.getElementById("saved-sub-car");
  const cargoBtn   = document.getElementById("saved-sub-cargo");
  const isCar = type !== "cargo";
  if (carPanel)   carPanel.style.display   = isCar ? "" : "none";
  if (cargoPanel) cargoPanel.style.display = isCar ? "none" : "";
  if (carBtn)   { carBtn.classList.toggle("active", isCar);   carBtn.setAttribute("aria-selected",  String(isCar)); }
  if (cargoBtn) { cargoBtn.classList.toggle("active", !isCar); cargoBtn.setAttribute("aria-selected", String(!isCar)); }
}

// Parse a bill number back into its parts: prefix, datePart (YYYYMMDD), seq
function parseBillNumber(num) {
  if (!num) return null;
  const m = String(num).match(/^([A-Z]+)-(\d{8})(\d{6})$/);
  if (!m) return null;
  return { prefix: m[1], datePart: m[2], seq: parseInt(m[3], 10) };
}

// Re-render both Car and GC saved-bills tables
function renderSavedBills() {
  const carTbody = document.getElementById("savedCarTbody");
  const cargoTbody = document.getElementById("savedCargoTbody");
  if (!carTbody || !cargoTbody) return;

  const all = getSavedBills();
  const carBills = all.filter((b) => b.type !== "cargo").sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const cargoBills = all.filter((b) => b.type === "cargo").sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  function buildRows(bills) {
    if (!bills.length) {
      return '<tr><td colspan="7" style="text-align:center;color:var(--tx-2);padding:14px;">No saved bills yet</td></tr>';
    }
    return bills.map((b, i) => {
      const meta = b.metadata || {};
      const cnf = escHtml(meta.cnfName || "—");
      const bl = escHtml(meta.blNumber || "—");
      const label = cnf !== "—" ? cnf : bl;
      const savedDate = b.savedAt ? new Date(b.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
      return `<tr>
        <td>${i + 1}</td>
        <td style="font-variant-numeric:tabular-nums lining-nums;font-family:var(--font-mono)">${escHtml(b.billNumber || "")}</td>
        <td>${escHtml(b.cld || "—")}</td>
        <td>${escHtml(b.delivery || "—")}</td>
        <td>${label}</td>
        <td style="font-variant-numeric:tabular-nums lining-nums">${escHtml(b.totalFormatted || "—")}</td>
        <td>${savedDate}</td>
        <td>
          <button type="button" class="rot-reg-add-btn saved-edit-btn" onclick="editSavedBill(${escHtml(JSON.stringify(b.billNumber))})">Edit</button>
          <button type="button" class="rot-del-btn" onclick="deleteSavedBill(${escHtml(JSON.stringify(b.billNumber))})">Delete</button>
        </td>
      </tr>`;
    }).join("");
  }

  carTbody.innerHTML = buildRows(carBills);
  cargoTbody.innerHTML = buildRows(cargoBills);
}

// Load a saved bill back into the Car/GC form for editing
function editSavedBill(billNumber) {
  const all = getSavedBills();
  const record = all.find((b) => b.billNumber === billNumber);
  if (!record) { showToast("Bill not found", "error"); return; }

  const type = record.type;
  switchModule(type === "cargo" ? "cargo" : "car");

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

  // Mark as editing so next Save overwrites this bill number
  editingBillNumber[type] = billNumber;

  // Re-run calculation to populate results
  if (type === "cargo") cargoCalculate();
  else carCalculate();

  showToast(`Editing ${billNumber} — modify and Save to update`, "info");
}

// Delete a saved bill and resequence numbers in its date group
function deleteSavedBill(billNumber) {
  if (!window.confirm(`Delete bill ${billNumber}? This cannot be undone.`)) return;

  const parsed = parseBillNumber(billNumber);
  let all = getSavedBills();
  const target = all.find((b) => b.billNumber === billNumber);
  if (!target) return;
  const type = target.type;
  const prefix = parsed ? parsed.prefix : (type === "cargo" ? "GCA" : "CA");

  // Remove the bill
  all = all.filter((b) => b.billNumber !== billNumber);

  if (parsed) {
    // Resequence within the same date group for this type
    const dateKey = parsed.datePart;
    const sameGroup = all
      .filter((b) => {
        const p = parseBillNumber(b.billNumber);
        return p && p.prefix === prefix && p.datePart === dateKey;
      })
      .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));

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
  // Sync to GitHub (async, non-blocking)
  saveBillsToWorker(getSavedBills()).then(ok => {
    if (!ok) showToast("GitHub sync failed — deleted locally only", "warning");
  });
}
