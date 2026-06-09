// ════════════════════════════════════════
//  STATE
// ════════════════════════════════════════
const SP_CAR_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
  '<span>Fill in shipment details<br>to see live cost preview</span></div>';
const SP_CARGO_IDLE =
  '<div class="sp-idle">' +
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/>' +
  '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
  '<span>Fill in cargo details<br>to see live cost preview</span></div>';
let isAdmin = false;

// ════════════════════════════════════════
//  ADMIN RATE PERSISTENCE  (localStorage)
// ════════════════════════════════════════
const RATE_STORAGE_KEY = 'pb_admin_rates';
const RATE_DEFAULTS = {
  // CAR rates
  freeDays: '4', rRiver: '33', rLanding: '175', rRemoval: '350',
  rWeighment: '2.5', rLevy: '1.5', vatRate: '15',
  nr1: '70', nr2: '185', nr3: '295',
  or1: '40', or2: '115', or3: '185',
  // CARGO rates
  'c-freeDays': '4', 'c-rRiver': '33', 'c-rWeighment': '2.5',
  'c-rLevy': '1.5', 'c-vatRate': '15',
  'c-or1': '10', 'c-or2': '20', 'c-or3': '25',
};

// ════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ════════════════════════════════════════
let _toastTimer = null;
function showToast(msg, type = 'info') {
  let el = document.getElementById('pb-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pb-toast';
    document.body.appendChild(el);
  }
  el.className = 'pb-toast pb-toast-' + type;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ════════════════════════════════════════
//  FIELD VALIDATION HELPERS
// ════════════════════════════════════════
function isValidDateStr(s) {
  if (!s || s.length < 10) return false;
  const parts = s.split('/');
  if (parts.length !== 3) return false;
  const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  return !Number.isNaN(d.getTime()) && +parts[1] >= 1 && +parts[1] <= 12 && +parts[0] >= 1 && +parts[0] <= 31;
}
function setFieldState(inputId, hintId, state, msg) {
  const inp = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (!inp) return;
  if (state === 'error') {
    inp.classList.add('field-invalid');
    if (hint) { hint.className = 'field-hint hint-error'; hint.textContent = msg || 'Invalid value'; }
  } else if (state === 'ok') {
    inp.classList.remove('field-invalid');
    if (hint) { hint.className = 'field-hint hint-ok'; hint.textContent = msg || ''; }
  } else {
    inp.classList.remove('field-invalid');
    if (hint) { hint.className = 'field-hint hint-muted'; hint.textContent = msg || ''; }
  }
}
function validateDateField(inputId, hintId, label) {
  const el = document.getElementById(inputId);
  if (!el) return true;
  const v = el.value.trim();
  if (!v) { setFieldState(inputId, hintId, 'muted', 'DD/MM/YYYY'); return false; }
  if (!isValidDateStr(v)) { setFieldState(inputId, hintId, 'error', `Invalid ${label}`); return false; }
  setFieldState(inputId, hintId, 'ok', v);
  return true;
}

function saveRates() {
  const saved = {};
  Object.keys(RATE_DEFAULTS).forEach(id => {
    const el = document.getElementById(id);
    if (el) saved[id] = el.value;
  });
  localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(saved));
}

function loadSavedRates() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(RATE_STORAGE_KEY) || '{}'); } catch (_) { saved = {}; }
  Object.keys(RATE_DEFAULTS).forEach(id => {
    const val = saved[id] !== undefined ? saved[id] : RATE_DEFAULTS[id];
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    const spn = document.getElementById(id.startsWith('c-') ? 'c-d' + id.slice(2) : 'd' + id);
    if (spn) spn.textContent = val;
  });
}

function resetRatesToDefaults() {
  if (!isAdmin) return;
  if (!confirm('সব rate factory default-এ reset হবে। নিশ্চিত?')) return;
  localStorage.removeItem(RATE_STORAGE_KEY);
  loadSavedRates();
  carRefresh();
  cargoRefresh();
  showToast('Rates reset to factory defaults', 'warning');
}

// Persist attempt count for the session so a page refresh doesn't reset the lockout
const _getAttempts = () => parseInt(sessionStorage.getItem('_la') ?? '0', 10);
const _setAttempts = v => sessionStorage.setItem('_la', String(v));
let loginAttempts = _getAttempts();
const AU = 'admin';
const AP_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
let currentModule = 'car';
let isInitialLoad = true;
let lastCarBill = null;
let lastCargoBill = null;

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
  domCache.car.preview = document.getElementById('car-preview');
  domCache.car.results = document.getElementById('results');
  domCache.car.ibar = document.getElementById('car-ibar');
  domCache.car.srow = document.getElementById('car-srow');
  domCache.car.insideSec = document.getElementById('car-insideSec');
  domCache.car.outsideSec = document.getElementById('car-outsideSec');
  domCache.car.grandSec = document.getElementById('car-grandSec');
  domCache.car.rbadge = document.getElementById('rbadge');

  // Cargo module elements
  domCache.cargo.preview = document.getElementById('cargo-preview');
  domCache.cargo.results = document.getElementById('cargo-results');
  domCache.cargo.ibar = document.getElementById('cargo-ibar');
  domCache.cargo.srow = document.getElementById('cargo-srow');
  domCache.cargo.insideSec = document.getElementById('cargo-insideSec');
  domCache.cargo.outsideSec = document.getElementById('cargo-outsideSec');
  domCache.cargo.grandSec = document.getElementById('cargo-grandSec');
  domCache.cargo.rbadge = document.getElementById('cargo-rbadge');
  domCache.cargo.tierInfo = document.getElementById('cargo-tier-info');
  domCache.cargo.totalCheck = document.getElementById('c-totalCheck');
}

// Initialize cache when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDomCache);
} else {
  initDomCache();
}

// ════════════════════════════════════════
//  MODULE SWITCH
// ════════════════════════════════════════
function switchModule(mod) {
  currentModule = mod;
  document
    .querySelectorAll('.module-page')
    .forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.getElementById('page-' + mod).classList.add('active');
  const activeTab = document.getElementById('tab-' + mod);
  activeTab.classList.add('active');
  activeTab.setAttribute('aria-selected', 'true');
  globalThis.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════
function formatDate(input) {
  let v = input.value.replaceAll(/\D/g, '');
  if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
  if (v.length >= 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
  input.value = v;
}
class CalendarPicker {
  constructor(inputId) {
    this.inputId = inputId;
    this.input = document.getElementById(inputId);
    if (!this.input) return;
    this.isOpen = false;
    this.currentDate = new Date();
    this.selectedDate = null;
    this.init();
  }

  init() {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.width = '100%';

    this.input.parentNode.insertBefore(wrapper, this.input);
    wrapper.appendChild(this.input);
    this.input.style.paddingRight = '40px';

    const icon = document.createElement('span');
    icon.innerHTML = '📅';
    icon.style.cssText =
      'position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:16px;z-index:10;pointer-events:auto;padding:4px;border-radius:4px;transition:all .2s ease;';
    icon.onmouseover = () => {
      icon.style.background = 'var(--glass-bg)';
      icon.style.transform = 'translateY(-50%) scale(1.1)';
    };
    icon.onmouseout = () => {
      icon.style.background = 'transparent';
      icon.style.transform = 'translateY(-50%) scale(1)';
    };
    icon.onclick = () => this.toggle();
    wrapper.appendChild(icon);

    this.calendar = document.createElement('div');
    this.calendar.style.cssText =
      'position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px;box-shadow:var(--shadow-glow-gold);z-index:1000;display:none;min-width:276px;font-size:14px;';
    document.body.appendChild(this.calendar);

    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target) && !this.calendar.contains(e.target)) {
        this.close();
      }
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }
  open() {
    this.isOpen = true;
    this.calendar.style.display = 'block';
    this.positionCalendar();
    this.render();
  }
  close() {
    this.isOpen = false;
    this.calendar.style.display = 'none';
  }

  positionCalendar() {
    const rect = this.input.getBoundingClientRect();
    const calendarHeight = 299;
    const calendarWidth = 276;
    let top = rect.bottom + globalThis.scrollY + 5;
    let left = rect.left + globalThis.scrollX;
    if (top + calendarHeight > globalThis.innerHeight + globalThis.scrollY) {
      top = rect.top + globalThis.scrollY - calendarHeight - 5;
    }
    if (left + calendarWidth > globalThis.innerWidth + globalThis.scrollX) {
      left = rect.right + globalThis.scrollX - calendarWidth;
    }
    this.calendar.style.top = top + 'px';
    this.calendar.style.left = left + 'px';
  }

  render() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;">
      <button type="button" onclick="event.stopPropagation(); calendarPickers['${this.inputId}'].previousMonth()" style="background:var(--gold);border:none;border-radius:3px;padding:4px 7px;cursor:pointer;font-size:13px;">&lsaquo;</button>
      <span style="color:var(--m1);font-weight:600;font-size:14px;">${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
      <button type="button" onclick="event.stopPropagation(); calendarPickers['${this.inputId}'].nextMonth()" style="background:var(--gold);border:none;border-radius:3px;padding:4px 7px;cursor:pointer;font-size:13px;">&rsaquo;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;text-align:center;">
  `;
    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    days.forEach(day => {
      html += `<div style="color:var(--m2);font-size:12px;padding:3px;">${day}</div>`;
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) html += '<div></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const selectedDate = this.selectedDate;
      const isSelected =
        selectedDate?.getDate() === date.getDate() &&
        selectedDate?.getMonth() === date.getMonth() &&
        selectedDate?.getFullYear() === date.getFullYear();
      html += `<div onclick="calendarPickers['${this.inputId}'].selectDate(${year}, ${month}, ${day})" style="padding:5px;cursor:pointer;border-radius:3px;font-size:13px;${isSelected ? 'background:var(--gold);color:var(--bg);' : 'color:var(--m1);'}">${day}</div>`;
    }

    html += '</div>';
    this.calendar.innerHTML = html;
  }

  previousMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.render();
  }
  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.render();
  }
  selectDate(year, month, day) {
    this.selectedDate = new Date(year, month, day);
    const d = String(this.selectedDate.getDate()).padStart(2, '0');
    const m = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
    const y = this.selectedDate.getFullYear();
    this.input.value = `${d}/${m}/${y}`;
    this.input.dispatchEvent(new Event('input'));
    this.close();
  }
}
globalThis.calendarPickers = {};

const pd = s => {
  if (!s || s.trim() === '') return new Date();
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const d = new Date(
        Number.parseInt(parts[2], 10),
        Number.parseInt(parts[1], 10) - 1,
        Number.parseInt(parts[0], 10)
      );
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
const fd = d =>
  d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
const addD = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const diffD = (a, b) => Math.round((b - a) / 86400000);
const gn = id => Number.parseFloat(document.getElementById(id)?.value) || 0;
const gb = id => document.getElementById(id)?.checked;
const nn = id => Math.max(0, gn(id));
const fmt = n =>
  'Tk ' +
  Number(n).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtN = n =>
  Number(n).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const CUT = pd('2024-07-23');
const CUT_OLD = pd('2024-07-22');

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
  daysOffset
) {
  const slabs = [];
  let offset = daysOffset,
    remaining = totalDays;
  let cur = new Date(blockStart);
  if (offset < 7 && remaining > 0) {
    const use = Math.min(7 - offset, remaining);
    slabs.push({
      label: '1st 7 days',
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
      label: '8th to 14th day',
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
      label: '15th day onwards',
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
    showToast('Logged out of admin mode', 'info');
    return;
  }
  document.getElementById('muser').value = '';
  document.getElementById('mpass').value = '';
  document.getElementById('merr').classList.remove('show');
  const dlg = document.getElementById('overlay');
  dlg.showModal();
  requestAnimationFrame(() => dlg.classList.add('is-open'));
  setTimeout(() => document.getElementById('muser').focus(), 200);
}
function closeModal() {
  const dlg = document.getElementById('overlay');
  dlg.classList.remove('is-open');
  setTimeout(() => dlg.close(), 320);
}
async function doLogin() {
  const u = document.getElementById('muser').value.trim();
  const p = document.getElementById('mpass').value;
  const errEl = document.getElementById('merr');
  if (loginAttempts >= 5) {
    errEl.textContent = 'Too many failed attempts. Please close this tab and try again.';
    errEl.classList.add('show');
    document.getElementById('mpass').value = '';
    return;
  }
  try {
    if (!crypto?.subtle) throw new Error('no-subtle');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
    const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (u === AU && hash === AP_HASH) {
      loginAttempts = 0;
      _setAttempts(0);
      isAdmin = true;
      closeModal();
      applyAdmin();
      showToast('Admin mode activated', 'success');
    } else {
      loginAttempts++;
      _setAttempts(loginAttempts);
      const remaining = 5 - loginAttempts;
      errEl.textContent = remaining > 0
        ? `Invalid username or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many failed attempts. Please close this tab and try again.';
      errEl.classList.add('show');
      document.getElementById('mpass').value = '';
      document.getElementById('mpass').focus();
    }
  } catch (e) {
    errEl.textContent = e.message === 'no-subtle'
      ? 'Login requires a secure context (HTTPS). Open the app via a web server.'
      : 'Login failed due to a browser error. Please try again.';
    errEl.classList.add('show');
    document.getElementById('mpass').value = '';
  }
}
function applyAdmin() {
  document.getElementById('adot').style.background = isAdmin
    ? 'var(--gold)'
    : 'var(--m2)';
  document.getElementById('adminTxt').textContent = isAdmin ? 'Logout' : 'Admin';
  const adminIcon = document.getElementById('adminIcon');
  if (adminIcon) adminIcon.style.display = isAdmin ? 'none' : 'block';
  document.getElementById('modeBadge').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('modeBadge').textContent = isAdmin ? 'ADMIN' : 'USER';
  isAdmin
    ? document.getElementById('adminBtn').classList.add('active')
    : document.getElementById('adminBtn').classList.remove('active');
  const rrb = document.getElementById('resetRatesBtn');
  if (rrb) rrb.style.display = isAdmin ? 'inline-flex' : 'none';

  // CAR admin fields
  [
    'freeDays',
    'rRiver',
    'rLanding',
    'rRemoval',
    'rWeighment',
    'rHoisting',
    'rLevy',
    'vatRate',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isAdmin) {
      el.removeAttribute('readonly');
      el.classList.remove('ro');
      el.classList.add('ae');
    } else {
      el.setAttribute('readonly', '');
      el.classList.add('ro');
      el.classList.remove('ae');
    }
  });
  ['nr1', 'nr2', 'nr3', 'or1', 'or2', 'or3'].forEach(id => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById('d' + id);
    if (isAdmin) {
      inp.style.display = 'inline-block';
      inp.classList.remove('ro');
      inp.removeAttribute('readonly');
      if (spn) spn.style.display = 'none';
    } else {
      inp.style.display = 'none';
      inp.classList.add('ro');
      inp.setAttribute('readonly', '');
      if (spn) {
        spn.style.display = 'inline';
        spn.textContent = inp.value;
      }
    }
  });

  // CARGO admin fields (Landing/Removal/Hoisting are formula-derived — always locked)
  ['c-freeDays', 'c-rRiver', 'c-rWeighment', 'c-rLevy', 'c-vatRate'].forEach(
    id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isAdmin) {
        el.removeAttribute('readonly');
        el.classList.remove('ro');
        el.classList.add('ae');
      } else {
        el.setAttribute('readonly', '');
        el.classList.add('ro');
        el.classList.remove('ae');
      }
    }
  );
  ['c-or1', 'c-or2', 'c-or3'].forEach(id => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById(id.replace('c-', 'c-d'));
    if (isAdmin) {
      inp.style.display = 'inline-block';
      inp.classList.remove('ro');
      inp.removeAttribute('readonly');
      if (spn) spn.style.display = 'none';
    } else {
      inp.style.display = 'none';
      inp.classList.add('ro');
      inp.setAttribute('readonly', '');
      if (spn) {
        spn.style.display = 'inline';
        spn.textContent = inp.value;
      }
    }
  });

  carRefresh();
  cargoRefresh();
}

// ════════════════════════════════════════
//  ── CAR MODULE ──
// ════════════════════════════════════════
function onWeightChange() {
  const w = Number.parseFloat(document.getElementById('weight')?.value);
  const warn = document.getElementById('weightWarn');
  const chkHoisting = document.getElementById('chkHoisting');
  const rHoisting = document.getElementById('rHoisting');
  const rLanding = nn('rLanding');
  if (w > 3) {
    if (chkHoisting) chkHoisting.checked = true;
    if (rHoisting) rHoisting.value = (rLanding * 1.25 * 0.50).toFixed(3);
    warn?.classList.add('show');
  } else {
    if (chkHoisting) chkHoisting.checked = false;
    if (rHoisting) rHoisting.value = 0;
    warn?.classList.remove('show');
  }
  carRefresh();
}

function carCompute() {
  const cld = pd(document.getElementById('cld').value);
  const _fdRaw = Number.parseInt(document.getElementById('freeDays').value, 10);
  const freeDays = Number.isNaN(_fdRaw) ? 4 : Math.max(0, _fdRaw);
  const freeEnd = freeDays === 0 ? addD(cld, -1) : addD(cld, freeDays - 1);
  const storStart = addD(freeEnd, 1);
  const delivery = pd(document.getElementById('delivery').value);
  const weight = Math.max(
    1,
    Math.round(
      Number.parseFloat(document.getElementById('weight').value) || 2
    )
  );
  const vatRate = Math.min(1, Math.max(0, gn('vatRate') / 100));
  const nr1 = nn('nr1'),
    nr2 = nn('nr2'),
    nr3 = nn('nr3');
  const or1 = nn('or1'),
    or2 = nn('or2'),
    or3 = nn('or3');
  const cldBeforeCut = cld < CUT;
  const deliveryCrossCut = delivery >= CUT;
  const hasWharfrent = delivery > freeEnd;
  let slabs = [],
    totalDays = 0,
    isSplit = false,
    rateMode = 'new';
  if (hasWharfrent) {
    totalDays = diffD(freeEnd, delivery);
    if (!cldBeforeCut) {
      rateMode = 'new';
      slabs = calcSlabs(
        totalDays,
        nr1,
        nr2,
        nr3,
        weight,
        storStart,
        delivery,
        0
      );
    } else if (deliveryCrossCut === false) {
      rateMode = 'old';
      slabs = calcSlabs(
        totalDays,
        or1,
        or2,
        or3,
        weight,
        storStart,
        delivery,
        0
      );
    } else {
      const oldDays = diffD(freeEnd, CUT_OLD);
      if (oldDays <= 0) {
        // freeEnd is on or after the rate cutoff — wharfrent starts entirely within new rates
        rateMode = 'new';
        slabs = calcSlabs(totalDays, nr1, nr2, nr3, weight, storStart, delivery, 0);
      } else {
        isSplit = true;
        rateMode = 'split';
        const newDays = diffD(CUT_OLD, delivery);
        const oldSlabs = calcSlabs(
          oldDays,
          or1,
          or2,
          or3,
          weight,
          storStart,
          CUT_OLD,
          0
        );
        const newSlabs = calcSlabs(
          newDays,
          nr1,
          nr2,
          nr3,
          weight,
          CUT,
          delivery,
          oldDays
        );
        oldSlabs.forEach(s => (s.group = 'old'));
        newSlabs.forEach(s => (s.group = 'new'));
        slabs = [...oldSlabs, ...newSlabs];
      }
    }
  }
  const insideStor = slabs.reduce((a, s) => a + s.amt, 0);
  const outsideHalf = insideStor / 2;
  // Payable charges (always apply) - matching index_base.html logic
  const payables = [];
  if (gb('chkRiver'))
    payables.push({
      label: 'River Dues',
      rate: nn('rRiver'),
      amt: nn('rRiver') * weight,
    });
  if (gb('chkLanding'))
    payables.push({
      label: 'Landing Charge',
      rate: nn('rLanding'),
      amt: nn('rLanding') * weight,
    });
  if (gb('chkRemoval'))
    payables.push({
      label: 'Removal Charge',
      rate: nn('rRemoval'),
      amt: nn('rRemoval') * weight,
    });
  if (gb('chkWeighment'))
    payables.push({
      label: 'Weighment Charge',
      rate: nn('rWeighment'),
      amt: nn('rWeighment') * weight,
    });
  if (gb('chkHoisting'))
    payables.push({
      label: 'Hoisting Charge',
      rate: nn('rHoisting'),
      rateStr: Number(nn('rHoisting')).toLocaleString('en-BD', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
      amt: nn('rLanding') * 1.25 * 0.50 * weight,
    });
  const levyAmt = gb('chkLevy') ? nn('rLevy') * weight : 0;
  const r2 = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
  const paySub = payables.reduce((a, p) => a + p.amt, 0);
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
    validateDateField('cld', 'cld-hint', 'CLD');
    validateDateField('delivery', 'delivery-hint', 'delivery date');
    const cld_ = pd(document.getElementById('cld').value);
    const _fd_raw = Number.parseInt(document.getElementById('freeDays').value, 10);
    const fd_ = Number.isNaN(_fd_raw) ? 4 : Math.max(0, _fd_raw);
    const freeEnd = fd_ === 0 ? addD(cld_, -1) : addD(cld_, fd_ - 1);
    const storStartDate = addD(freeEnd, 1);
    document.getElementById('car-freeEnd').textContent = fd(freeEnd);
    document.getElementById('car-storStart').textContent = fd(storStartDate);
    const strip = document.getElementById('car-ftStrip');
    const ftDaysEl = document.getElementById('car-ftDays');
    if (strip && ftDaysEl) {
      const dayLabels = [];
      for (let i = 0; i < fd_; i++) {
        const d = addD(cld_, i);
        dayLabels.push(
          d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          })
        );
      }
      ftDaysEl.innerHTML = fd_ === 0
        ? `<span style="color:var(--m2)">No free time — </span><span style="color:var(--green);font-weight:600;">Car Wharfrent starts ${storStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>`
        : '<span style="color:var(--m2)">Free: </span>' +
          dayLabels.map(d => `<span style="background:rgba(212,175,55,0.13);border:1px solid rgba(212,175,55,0.20);color:var(--gold);border-radius:4px;padding:1px 7px;margin:0 2px;">${d}</span>`).join('') +
          `<span style="color:var(--m2)"> → Car Wharfrent starts </span><span style="color:var(--green);font-weight:600;">${storStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>`;
      strip.style.display = 'block';
    }
    ['nr1', 'nr2', 'nr3', 'or1', 'or2', 'or3'].forEach(id => {
      const sp = document.getElementById('d' + id);
      if (sp) sp.textContent = document.getElementById(id).value;
    });
    const w = Math.max(
      1,
      Math.round(
        Number.parseFloat(document.getElementById('weight').value) || 2
      )
    );
    const rLanding = nn('rLanding');
    const rHoistingEl = document.getElementById('rHoisting');
    if (w > 3) {
      rHoistingEl.value = (rLanding * 1.25 * 0.50).toFixed(3);
    } else {
      rHoistingEl.value = 0;
    }
    const b = carCompute();
    if (!b) return;
    const rateBadgeHtml =
      b.rateMode === 'split'
        ? '<div class="rbadge rb-split">⚡ SPLIT BILLING — Old + New rates</div>'
        : b.rateMode === 'old'
        ? '<div class="rbadge rb-old">● OLD RATES (Up to 22/07/2024)</div>'
        : '<div class="rbadge rb-new">● NEW RATES (From 23/07/2024)</div>';
    document.getElementById('rbadge').innerHTML = rateBadgeHtml;
    const pv = document.getElementById('car-preview');
    if (b.hasWharfrent) {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Car Wharfrent Days</span><span class="pvr-val v-gold">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Car Wharfrent Bill</span><span class="pvr-val v-blue">${fmt(b.iTotal)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Car Wharfrent Bill</span><span class="pvr-val v-purple">${fmt(b.oTotal)}</span></div>` +
        `<div class="pvr pvr-grand"><span class="pvr-lbl">Car Grand Total</span><span class="pvr-val v-gold">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Car Wharfrent</span><span class="pvr-val v-green">Within Free Time ✓</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Car Payable Charges</span><span class="pvr-val">${fmt(b.paySub)}</span></div>` +
        `<div class="pvr pvr-grand"><span class="pvr-lbl">Car Grand Total</span><span class="pvr-val v-gold">${fmt(b.nTotal)}</span></div>`;
    }
  if (isAdmin && !isInitialLoad) saveRates();
  } catch (e) {
    console.error('carRefreshNow error', e);
    document.getElementById('car-preview').innerHTML = SP_CAR_IDLE;
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
function buildCarBillTable(b, side) {
  //NOSONAR
  let rows = '';
  if (side === 'inside' || side === 'outside') {
    const storAmt = side === 'inside' ? b.insideStor : b.outsideHalf;
    const baseAmt = side === 'inside' ? b.iBase : b.oBase;
    const vatAmt = side === 'inside' ? b.iVat : b.oVat;
    const levyAmt = side === 'inside' ? b.iLevy : b.oLevy;
    const totalAmt = side === 'inside' ? b.iTotal : b.oTotal;
    const storLabel =
      side === 'inside'
        ? 'Car Wharfrent Sub-Total'
        : 'Car Wharfrent Sub-Total (½ Rate)';
    if (b.hasWharfrent) {
      if (b.isSplit) {
        const oldS = b.slabs.filter(s => s.group === 'old');
        const newS = b.slabs.filter(s => s.group === 'new');
        if (oldS.length) {
          rows += `<tr class="sep"><td colspan="6">◀ Old Rate Period — Up to 22/07/2024</td></tr>`;
          oldS.forEach(s => {
            const da = side === 'inside' ? s.amt : s.amt / 2;
            rows += `<tr><td>${s.label}</td><td style="color:var(--red)">${fmtN(s.rate)}/t/d${side === 'inside' ? '' : ' × 0.50'}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
          });
        }
        if (newS.length) {
          rows += `<tr class="sep"><td colspan="6">▶ New Rate Period — From 23/07/2024</td></tr>`;
          newS.forEach(s => {
            const da = side === 'inside' ? s.amt : s.amt / 2;
            rows += `<tr><td>${s.label}</td><td style="color:var(--green)">${fmtN(s.rate)}/t/d${side === 'inside' ? '' : ' × 0.50'}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
          });
        }
      } else {
        b.slabs.forEach(s => {
          const da = side === 'inside' ? s.amt : s.amt / 2;
          rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${side === 'inside' ? '' : ' × 0.50'}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
        });
      }
      rows += `<tr class="sub"><td colspan="4">${storLabel}</td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(storAmt)}</td></tr>`;
    }
    if (b.payables.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
      b.payables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(1)}%</td><td>${fmt(vatAmt)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(levyAmt)}</td></tr><tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(totalAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(1)}%</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(b.nTotal)}</td></tr>`;
  }
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function carCalculate() {
  //NOSONAR
  let b;
  try {
    b = carCompute();
  } catch (e) {
    console.error('carCalculate compute error', e);
    return;
  }
  if (!b) return;
  lastCarBill = b;
  try {
  document.getElementById('results').style.display = 'block';
  const wharfrentStarts = b.hasWharfrent ? fd(b.storStart) : '—';
  const wharfrentDaysText = b.hasWharfrent
    ? `${b.totalDays} days`
    : 'In free time';
  const rateModeColor =
    b.rateMode === 'split' ? 'var(--gold)' :
    b.rateMode === 'old'   ? 'var(--red)'  : 'var(--green)';
  const rateModeText =
    b.rateMode === 'split' ? 'Split' :
    b.rateMode === 'old'   ? 'Old Rates' : 'New Rates';
  document.getElementById('car-ibar').innerHTML =
    `<div class="ibar"><div><div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Car Wharfrent Starts</div><div class="iv">${wharfrentStarts}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Weight</div><div class="iv">${b.weight} ton(s)</div></div><div class="ii"><div class="il">Car Wharfrent Days</div><div class="iv" style="color:var(--gold)">${wharfrentDaysText}</div></div><div class="ii"><div class="il">Rate Mode</div><div class="iv" style="color:${rateModeColor}">${rateModeText}</div></div></div></div>`;
  if (b.hasWharfrent) {
    document.getElementById('car-srow').innerHTML =
      `<div class="sc cg"><div class="sl">Car Grand Total</div><div class="sv">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside Car Bill (Full Rate)</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">VAT &amp; Levy incl.</div></div><div class="sc cp"><div class="sl">Outside Car Bill (½ Rate)</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">VAT &amp; Levy incl.</div></div>`;
    document.getElementById('car-insideSec').innerHTML =
      `<div style="margin-bottom:20px;">${b.isSplit ? '<div class="warn">⚡ Split Billing — Old rates applied up to 22/07/2024 · New rates from 23/07/2024</div>' : ''}<div class="slbl sl-in">▪ Inside Car Wharfrent</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, 'inside')}</div></div>`;
    document.getElementById('car-outsideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="slbl sl-out">▪ Outside Car Wharfrent (½ Rate)</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, 'outside')}</div></div>`;
  } else {
    document.getElementById('car-insideSec').innerHTML =
      '<div class="no-stor-note">✓ Delivery within free time — no Car Wharfrent charge applies.</div>';
    document.getElementById('car-outsideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Payable Charges — Inside &amp; Outside</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, 'noWharfrent')}</div></div>`;
  }
  const grand = b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
  const carGrandSplitHtml = b.hasWharfrent
    ? `<div><div class="glbl">Inside Grand Total</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">VAT &amp; Levy incl.</div></div><div><div class="glbl">Outside Grand Total</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">VAT &amp; Levy incl.</div></div>`
    : `<div><div class="glbl">Payable Charges Only</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">Delivery within free time</div></div><div></div>`;
  document.getElementById('car-grandSec').innerHTML =
    `<div class="gbox"><div class="ginn">${carGrandSplitHtml}<div class="gfin"><div class="glbl">CAR GRAND TOTAL</div><div class="gval">${fmt(grand)}</div><div class="gsub">Tk — VAT &amp; Levy incl.</div></div></div></div>`;
  const carEmpty = document.getElementById('car-empty');
  if (carEmpty) carEmpty.style.display = 'none';
  if (!isInitialLoad) {
    setTimeout(
      () =>
        document
          .getElementById('results')
          .scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80
    );
  }
  } catch (e) {
    console.error('carCalculate render error', e);
  }
}

function carReset() {
  document.getElementById('results').style.display = 'none';
  document.getElementById('car-preview').innerHTML = SP_CAR_IDLE;
  document.getElementById('weight').value = 2;
  document.getElementById('chkHoisting').checked = false;
  document.getElementById('weightWarn').classList.remove('show');
  globalThis.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (totalWeight <= 0) return '0t — 0 Tk/ton';
  if (totalWeight <= 3) return '≤3t — 90 Tk/ton';
  if (totalWeight <= 20) return '>3t–≤20t — 180 Tk/ton';
  return '>20t — 250 Tk/ton';
}

/**
 * Validates that inside + outside weights equal total weight
 * Uses cached DOM elements for performance optimization
 * @returns {boolean} True if weights match, false otherwise
 */
function cargoValidateSplit() {
  const total = Math.round(
    Number.parseFloat(document.getElementById('c-weight').value) || 0
  );
  const inside = Math.round(
    Number.parseFloat(document.getElementById('c-inside').value) || 0
  );
  const outside = Math.round(
    Number.parseFloat(document.getElementById('c-outside').value) || 0
  );
  const sum = inside + outside;
  const check =
    domCache.cargo.totalCheck || document.getElementById('c-totalCheck');
  const match = Math.abs(sum - total) < 0.001;
  check.className = 'io-total-badge ' + (match ? 'io-ok' : 'io-err');
  check.innerHTML = match
    ? `✓ ${fmtN(sum)} ton(s)`
    : `✗ ${fmtN(sum)} ≠ ${fmtN(total)}`;
  return match;
}

function cargoValidateWeighmentTon(showAlert = false) {
  const weighmentChecked = gb('c-chkWeighment');
  const weighmentTon = Math.round(
    Number.parseFloat(document.getElementById('c-weighmentTon').value) || 0
  );
  const weighmentInput = document.getElementById('c-weighmentTon');
  const totalWeight = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById('c-weight').value) || 0
    )
  );

  const valid =
    !weighmentChecked || (weighmentTon > 0 && weighmentTon <= totalWeight);
  let msg =
    'Enter weighment cargo ton greater than 0 when Weighment Charge is checked.';
  if (weighmentChecked && weighmentTon > totalWeight) {
    msg = 'Weighment cargo ton cannot be greater than total weight.';
  }
  weighmentInput.setCustomValidity(valid ? '' : msg);
  if (!valid && showAlert) showToast(msg, 'error');
  return valid;
}

function cargoValidateRemovalTon(showAlert = false) {
  const removalChecked = gb('c-chkRemoval');
  const removalTon = Math.round(
    Number.parseFloat(document.getElementById('c-removalTon').value) || 0
  );
  const removalInput = document.getElementById('c-removalTon');
  const totalWeight = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById('c-weight').value) || 0
    )
  );
  const outsideTons = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById('c-outside').value) || 0
    )
  );

  // Bounds only matter when the charge is enabled; unchecked = always valid
  const valid =
    !removalChecked ||
    (removalTon > 0 && outsideTons > 0 && removalTon <= totalWeight && removalTon <= outsideTons);
  let msg =
    'Enter removal cargo ton greater than 0 when Removal Charge is checked.';
  if (removalChecked) {
    if (removalTon > totalWeight) {
      msg = 'Removal cargo ton cannot be greater than total weight.';
    } else if (outsideTons === 0) {
      msg = 'Removal charges cannot be applied when outside tons are 0.';
    } else if (removalTon > outsideTons) {
      msg = 'Removal cargo ton cannot be greater than outside tons.';
    }
  }
  removalInput.setCustomValidity(valid ? '' : msg);
  if (!valid && showAlert) showToast(msg, 'error');
  return valid;
}

function cargoValidateSelfDriveTon(showAlert = false) {
  const insideChecked = gb('c-chkSelfDriveInside');
  const outsideChecked = gb('c-chkSelfDriveOutside');
  const insideEl = document.getElementById('c-selfDriveTonInside');
  const outsideEl = document.getElementById('c-selfDriveTonOutside');
  const insideTon = Math.round(Number.parseFloat(insideEl?.value) || 0);
  const outsideTon = Math.round(Number.parseFloat(outsideEl?.value) || 0);
  const insideW = Math.max(0, Math.round(Number.parseFloat(document.getElementById('c-inside').value) || 0));
  const outsideW = Math.max(0, Math.round(Number.parseFloat(document.getElementById('c-outside').value) || 0));

  let insideMsg = '';
  let outsideMsg = '';
  if (insideChecked && insideTon <= 0) {
    insideMsg = 'Enter inside self drive weight greater than 0.';
  } else if (insideChecked && insideTon > insideW) {
    insideMsg = 'Inside self drive weight cannot exceed inside tons.';
  }
  if (outsideChecked && outsideTon <= 0) {
    outsideMsg = 'Enter outside self drive weight greater than 0.';
  } else if (outsideChecked && outsideTon > outsideW) {
    outsideMsg = 'Outside self drive weight cannot exceed outside tons.';
  }
  if (insideEl) insideEl.setCustomValidity(insideMsg);
  if (outsideEl) outsideEl.setCustomValidity(outsideMsg);
  const valid = insideMsg === '' && outsideMsg === '';
  if (!valid && showAlert) showToast(insideMsg || outsideMsg, 'error');
  return valid;
}

// ════════════════════════════════════════
//  ── PART BILLING ──
// ════════════════════════════════════════
let partBillingStages = [{ date: '', insideAfter: 0, outsideAfter: 0, sdInsideAfter: 0, sdOutsideAfter: 0 }];
let partBillingUpToDate = false;
let cargoIncludeWharfrent = true;
let cargoIncludePayables  = true;

function onCargoWharfrentToggle() {
  cargoIncludeWharfrent = !!document.getElementById('c-chkPrintWharfrent')?.checked;
}

function onToggleAllPayables(on) {
  cargoIncludePayables = on;
}

let _pbSavedCharges = null;

function onPartBillingChange() {
  const enabled = !!document.getElementById('c-partBilling')?.checked;
  const pbCard = document.getElementById('c-pbStagesCard');
  const deliveryFg = document.getElementById('c-deliveryFg');
  const chkIds = ['c-chkRiver','c-chkLanding','c-chkRemoval','c-chkWeighment','c-chkHoisting','c-chkLevy'];
  if (enabled) {
    // Save current checkbox states before disabling them
    _pbSavedCharges = {};
    chkIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) _pbSavedCharges[id] = el.checked;
    });
    if (partBillingStages.length === 0) {
      partBillingStages = [{ date: document.getElementById('c-delivery').value || '', insideAfter: 0, outsideAfter: 0, sdInsideAfter: 0, sdOutsideAfter: 0 }];
    } else if (!partBillingStages[0].date) {
      partBillingStages[0].date = document.getElementById('c-delivery').value || '';
    }
    if (pbCard) pbCard.style.display = '';
    if (deliveryFg) deliveryFg.style.display = 'none';
    chkIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    renderPartBillingStages();
  } else {
    if (pbCard) pbCard.style.display = 'none';
    if (deliveryFg) deliveryFg.style.display = '';
    // Restore saved states; if none saved, default to true
    chkIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = _pbSavedCharges ? !!_pbSavedCharges[id] : true;
    });
    _pbSavedCharges = null;
  }
  cargoRefresh();
}

function renderPartBillingStages() {
  const container = document.getElementById('c-pbStagesContainer');
  if (!container) return;
  // Clean up previous calendar pickers for pb-date-* inputs
  Object.keys(globalThis.calendarPickers).filter(k => k.startsWith('pb-date-')).forEach(k => {
    const picker = globalThis.calendarPickers[k];
    if (picker && picker.calendar && picker.calendar.parentNode) picker.calendar.parentNode.removeChild(picker.calendar);
    delete globalThis.calendarPickers[k];
  });
  const total = partBillingStages.length;
  const showSdIn  = !!document.getElementById('c-chkSelfDriveInside')?.checked  && pbMaxSdWeight(0, 'inside')  > 0;
  const showSdOut = !!document.getElementById('c-chkSelfDriveOutside')?.checked && pbMaxSdWeight(0, 'outside') > 0;
  container.innerHTML = partBillingStages.map((stage, idx) => {
    const isFirst = idx === 0;
    const isLast  = idx === total - 1;
    const _n = idx + 1, _v = _n % 10, _h = _n % 100;
    const _suf = (_h >= 11 && _h <= 13) ? 'th' : _v === 1 ? 'st' : _v === 2 ? 'nd' : _v === 3 ? 'rd' : 'th';
    const periodLabel = `${_n}${_suf} Delivery`;
    const maxIn  = pbMaxWeight(idx, 'inside');
    const maxOut = pbMaxWeight(idx, 'outside');
    const maxSdIn  = pbMaxSdWeight(idx, 'inside');
    const maxSdOut = pbMaxSdWeight(idx, 'outside');
    if ((stage.insideAfter  || 0) > maxIn)  { partBillingStages[idx].insideAfter  = maxIn;  stage.insideAfter  = maxIn; }
    if ((stage.outsideAfter || 0) > maxOut) { partBillingStages[idx].outsideAfter = maxOut; stage.outsideAfter = maxOut; }
    if ((stage.sdInsideAfter  || 0) > maxSdIn)  { partBillingStages[idx].sdInsideAfter  = maxSdIn;  stage.sdInsideAfter  = maxSdIn; }
    if ((stage.sdOutsideAfter || 0) > maxSdOut) { partBillingStages[idx].sdOutsideAfter = maxSdOut; stage.sdOutsideAfter = maxSdOut; }
    return `<div class="pbs-row${isLast ? ' pbs-row-last' : ''}" id="pb-stage-${idx}">
      <div class="pbs-connector">
        <div class="pbs-dot"><span>${_n}</span></div>
        ${!isLast ? '<div class="pbs-line"></div>' : ''}
      </div>
      <div class="pbs-body">
        <div class="pbs-head">
          <div>
            <div class="pbs-title">${periodLabel}</div>
            <div class="pbs-sub">Stage ${_n} of ${total}</div>
          </div>
          ${!isFirst ? `<button type="button" class="pbs-del-btn" onclick="removePartBillingStage(${idx})" title="Remove stage">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>` : ''}
        </div>
        <div class="pbs-fields">
          <div class="fg">
            <label class="lbl" for="pb-date-${idx}">Delivery Date</label>
            <input type="text" id="pb-date-${idx}" class="cargo-glow" placeholder="DD/MM/YYYY" maxlength="10"
              value="${stage.date}"
              oninput="formatDate(this); partBillingStages[${idx}].date=this.value; cargoRefresh();" />
          </div>
          <div class="pbs-balance-wrap">
            <div class="pbs-balance-title">Remaining balance after this delivery</div>
            <div class="pbs-balance-grid">
              <div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-inside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--blue)"></span>Inside
                  ${maxIn > 0 ? `<span class="pbs-max-note">${maxSdIn > 0 ? `max&nbsp;${maxIn}t&nbsp;Normal&nbsp;+&nbsp;${maxSdIn}t&nbsp;SD` : `max&nbsp;${maxIn}t`}</span>` : ''}
                </label>
                <input type="number" id="pb-inside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.insideAfter ? `value="${stage.insideAfter}"` : ''} placeholder="0" min="0" ${maxIn > 0 ? `max="${maxIn}"` : ''} step="1"
                  oninput="pbBalanceChange(${idx},'inside',this.value);" />
              </div>
              <div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-outside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--purple)"></span>Outside
                  ${maxOut > 0 ? `<span class="pbs-max-note">${maxSdOut > 0 ? `max&nbsp;${maxOut}t&nbsp;Normal&nbsp;+&nbsp;${maxSdOut}t&nbsp;SD` : `max&nbsp;${maxOut}t`}</span>` : ''}
                </label>
                <input type="number" id="pb-outside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.outsideAfter ? `value="${stage.outsideAfter}"` : ''} placeholder="0" min="0" ${maxOut > 0 ? `max="${maxOut}"` : ''} step="1"
                  oninput="pbBalanceChange(${idx},'outside',this.value);" />
              </div>
              ${showSdIn ? `<div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-sd-inside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--gold-hi)"></span><span style="color:var(--gold-hi)">SD</span> Inside
                  ${maxSdIn > 0 ? `<span class="pbs-max-note">max&nbsp;${maxSdIn}t</span>` : ''}
                </label>
                <input type="number" id="pb-sd-inside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.sdInsideAfter ? `value="${stage.sdInsideAfter}"` : ''} placeholder="0" min="0" ${maxSdIn > 0 ? `max="${maxSdIn}"` : ''} step="1"
                  oninput="pbSdBalanceChange(${idx},'inside',this.value);" />
              </div>` : ''}
              ${showSdOut ? `<div class="fg"${!showSdIn ? ' style="grid-column:2"' : ''}>
                <label class="lbl pbs-bal-lbl" for="pb-sd-outside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--gold-hi)"></span><span style="color:var(--gold-hi)">SD</span> Outside
                  ${maxSdOut > 0 ? `<span class="pbs-max-note">max&nbsp;${maxSdOut}t</span>` : ''}
                </label>
                <input type="number" id="pb-sd-outside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.sdOutsideAfter ? `value="${stage.sdOutsideAfter}"` : ''} placeholder="0" min="0" ${maxSdOut > 0 ? `max="${maxSdOut}"` : ''} step="1"
                  oninput="pbSdBalanceChange(${idx},'outside',this.value);" />
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  const countEl = document.getElementById('c-pbStageCount');
  if (countEl) countEl.textContent = `${partBillingStages.length} stage${partBillingStages.length !== 1 ? 's' : ''}`;
  // Attach calendar pickers to new date inputs
  setTimeout(() => {
    partBillingStages.forEach((_, idx) => {
      if (!globalThis.calendarPickers[`pb-date-${idx}`]) {
        globalThis.calendarPickers[`pb-date-${idx}`] = new CalendarPicker(`pb-date-${idx}`);
      }
    });
  }, 60);
}

function pbMaxWeight(idx, side) {
  if (idx === 0) {
    const total   = Math.max(0, Math.round(parseFloat(document.getElementById(side === 'inside' ? 'c-inside' : 'c-outside')?.value) || 0));
    const sdChkId = side === 'inside' ? 'c-chkSelfDriveInside' : 'c-chkSelfDriveOutside';
    const sdKey   = side === 'inside' ? 'c-selfDriveTonInside'  : 'c-selfDriveTonOutside';
    const sdOn    = !!document.getElementById(sdChkId)?.checked;
    const sd      = sdOn ? Math.min(total, Math.max(0, Math.round(parseFloat(document.getElementById(sdKey)?.value) || 0))) : 0;
    return total - sd;
  }
  return Math.max(0, partBillingStages[idx - 1][side === 'inside' ? 'insideAfter' : 'outsideAfter'] || 0);
}

function pbMaxSdWeight(idx, side) {
  const sdKey   = side === 'inside' ? 'c-selfDriveTonInside' : 'c-selfDriveTonOutside';
  const sdChkId = side === 'inside' ? 'c-chkSelfDriveInside' : 'c-chkSelfDriveOutside';
  if (idx === 0) {
    const total = Math.max(0, Math.round(parseFloat(document.getElementById(side === 'inside' ? 'c-inside' : 'c-outside')?.value) || 0));
    const sdOn  = !!document.getElementById(sdChkId)?.checked;
    return sdOn ? Math.min(total, Math.max(0, Math.round(parseFloat(document.getElementById(sdKey)?.value) || 0))) : 0;
  }
  return Math.max(0, partBillingStages[idx - 1][side === 'inside' ? 'sdInsideAfter' : 'sdOutsideAfter'] || 0);
}

function pbBalanceChange(idx, side, rawVal) {
  const key = side === 'inside' ? 'insideAfter' : 'outsideAfter';
  const maxVal = pbMaxWeight(idx, side);
  const isEmpty = rawVal === '' || rawVal === null || rawVal === undefined;
  const clamped = Math.min(maxVal, Math.max(0, Math.round(isEmpty ? 0 : +rawVal)));
  partBillingStages[idx][key] = clamped;
  const inp = document.getElementById(`pb-${side}-${idx}`);
  if (inp) inp.value = isEmpty ? '' : clamped;
  // Cascade clamp normal balance to all subsequent stages (SD is independent)
  for (let i = idx + 1; i < partBillingStages.length; i++) {
    const prevVal = partBillingStages[i - 1][key] || 0;
    if ((partBillingStages[i][key] || 0) > prevVal) {
      partBillingStages[i][key] = prevVal;
      const next = document.getElementById(`pb-${side}-${i}`);
      if (next) { next.value = prevVal || ''; next.max = prevVal; }
    }
  }
  cargoRefresh();
}

function pbSdBalanceChange(idx, side, rawVal) {
  const key = side === 'inside' ? 'sdInsideAfter' : 'sdOutsideAfter';
  const maxVal = pbMaxSdWeight(idx, side);
  const isEmpty = rawVal === '' || rawVal === null || rawVal === undefined;
  const clamped = Math.min(maxVal, Math.max(0, Math.round(isEmpty ? 0 : +rawVal)));
  partBillingStages[idx][key] = clamped;
  const inp = document.getElementById(`pb-sd-${side}-${idx}`);
  if (inp) inp.value = isEmpty ? '' : clamped;
  // Cascade clamp SD balance to subsequent stages (SD independent of normal balance)
  for (let i = idx + 1; i < partBillingStages.length; i++) {
    const prevSd = partBillingStages[i - 1][key] || 0;
    if ((partBillingStages[i][key] || 0) > prevSd) {
      partBillingStages[i][key] = prevSd;
      const next = document.getElementById(`pb-sd-${side}-${i}`);
      if (next) { next.value = prevSd || ''; next.max = prevSd; }
    }
  }
  cargoRefresh();
}

function addPartBillingStage() {
  partBillingStages.push({ date: '', insideAfter: 0, outsideAfter: 0, sdInsideAfter: 0, sdOutsideAfter: 0 });
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
  partBillingUpToDate = !!document.getElementById('c-pbUpToDate')?.checked;
  cargoRefresh();
}

// Car Billing slab calc with old/new rate split — mirrors carCompute() split logic.
// prevEnd: the day before blockStart (freeEnd for period 1, last delivery date for subsequent periods).
function calcCarBillingSdSlabs(cld, prevEnd, blockStart, deliveryDate, periodDays, weight, daysOffset, or1, or2, or3, nr1, nr2, nr3) {
  if (periodDays <= 0 || weight <= 0) return [];
  if (cld >= CUT) {
    return calcSlabs(periodDays, nr1, nr2, nr3, weight, blockStart, deliveryDate, daysOffset);
  }
  if (deliveryDate <= CUT_OLD) {
    return calcSlabs(periodDays, or1, or2, or3, weight, blockStart, deliveryDate, daysOffset);
  }
  if (prevEnd >= CUT_OLD) {
    return calcSlabs(periodDays, nr1, nr2, nr3, weight, blockStart, deliveryDate, daysOffset);
  }
  // Period crosses the rate cutoff — split
  const oldDays = diffD(prevEnd, CUT_OLD);
  if (oldDays <= 0) {
    return calcSlabs(periodDays, nr1, nr2, nr3, weight, blockStart, deliveryDate, daysOffset);
  }
  const newDays = diffD(CUT_OLD, deliveryDate);
  const oldSlabs = calcSlabs(oldDays, or1, or2, or3, weight, blockStart, CUT_OLD, daysOffset);
  const newSlabs = calcSlabs(newDays, nr1, nr2, nr3, weight, CUT, deliveryDate, daysOffset + oldDays);
  oldSlabs.forEach(s => (s.group = 'old'));
  newSlabs.forEach(s => (s.group = 'new'));
  return [...oldSlabs, ...newSlabs];
}

// Compute multi-period wharfrent for part billing mode
// Slab progression never resets — daysOffset accumulates from original CLD
function computePartBillingWharfrent(cld, freeEnd, storStart, initialInside, initialOutside, or1, or2, or3, insideSdTon = 0, outsideSdTon = 0, or1Car = 0, or2Car = 0, or3Car = 0, nr1Car = 0, nr2Car = 0, nr3Car = 0) { //NOSONAR
  const periods = [];
  let hasWharfrent = false;
  let totalDays = 0;
  for (let i = 0; i < partBillingStages.length; i++) {
    const stage = partBillingStages[i];
    const deliveryDate = pd(stage.date);
    const prevEnd    = i === 0 ? freeEnd : pd(partBillingStages[i - 1].date);
    const blockStart = i === 0 ? storStart : addD(prevEnd, 1);
    // insideAfter/outsideAfter stores normal-only remaining; sdInsideAfter stores SD remaining (independent)
    const pNormalInside  = i === 0 ? (initialInside  - insideSdTon)  : Math.max(0, partBillingStages[i - 1].insideAfter  || 0);
    const pNormalOutside = i === 0 ? (initialOutside - outsideSdTon) : Math.max(0, partBillingStages[i - 1].outsideAfter || 0);
    const pSdInside      = i === 0 ? insideSdTon  : Math.max(0, partBillingStages[i - 1].sdInsideAfter  || 0);
    const pSdOutside     = i === 0 ? outsideSdTon : Math.max(0, partBillingStages[i - 1].sdOutsideAfter || 0);
    const insideW  = pNormalInside  + pSdInside;
    const outsideW = pNormalOutside + pSdOutside;
    // daysOffset = chargeable days elapsed before this period (from freeEnd up to prevEnd)
    const daysOffset  = i === 0 ? 0 : diffD(freeEnd, prevEnd);
    const periodDays  = diffD(prevEnd, deliveryDate);
    if (!stage.date || periodDays <= 0) {
      periods.push({ invalid: true, periodNum: i + 1, blockStart, deliveryDate, insideW, outsideW, periodDays, daysOffset });
      continue;
    }
    hasWharfrent = true;
    totalDays += periodDays;
    const insideNormalSlabs  = pNormalInside  > 0 ? calcSlabs(periodDays, or1, or2, or3, pNormalInside,  blockStart, deliveryDate, daysOffset) : [];
    const outsideNormalSlabs = pNormalOutside > 0 ? calcSlabs(periodDays, or1, or2, or3, pNormalOutside, blockStart, deliveryDate, daysOffset) : [];
    const insideSdSlabs      = pSdInside  > 0 ? calcCarBillingSdSlabs(cld, prevEnd, blockStart, deliveryDate, periodDays, pSdInside,  daysOffset, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car) : [];
    const outsideSdSlabs     = pSdOutside > 0 ? calcCarBillingSdSlabs(cld, prevEnd, blockStart, deliveryDate, periodDays, pSdOutside, daysOffset, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car) : [];
    const insideWharfrent  = insideNormalSlabs.reduce((a, s) => a + s.amt, 0)  + insideSdSlabs.reduce((a, s) => a + s.amt, 0);
    const outsideWharfrent = (outsideNormalSlabs.reduce((a, s) => a + s.amt, 0) + outsideSdSlabs.reduce((a, s) => a + s.amt, 0)) / 2;
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
      balanceInsideAfter:    Math.max(0, stage.insideAfter    || 0),
      balanceOutsideAfter:   Math.max(0, stage.outsideAfter   || 0),
      balanceSdInsideAfter:  Math.max(0, stage.sdInsideAfter  || 0),
      balanceSdOutsideAfter: Math.max(0, stage.sdOutsideAfter || 0),
    });
  }
  // Optional: current-date period (from last delivery +1 → today)
  if (partBillingUpToDate && partBillingStages.length > 0) {
    const lastStage = partBillingStages[partBillingStages.length - 1];
    const lastDelivery = pd(lastStage.date);
    const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
    const cwNormalInside  = Math.max(0, lastStage.insideAfter  || 0);
    const cwNormalOutside = Math.max(0, lastStage.outsideAfter || 0);
    const cwSdInside      = Math.max(0, lastStage.sdInsideAfter  || 0);
    const cwSdOutside     = Math.max(0, lastStage.sdOutsideAfter || 0);
    const cwInside  = cwNormalInside  + cwSdInside;
    const cwOutside = cwNormalOutside + cwSdOutside;
    if (lastDelivery && (cwInside + cwOutside) > 0) {
      const cwBlockStart  = addD(lastDelivery, 1);
      const cwDaysOffset  = diffD(freeEnd, lastDelivery);
      const cwPeriodDays  = diffD(lastDelivery, todayD);
      if (cwPeriodDays > 0) {
        hasWharfrent = true;
        totalDays += cwPeriodDays;
        const cwInsideNormalSlabs  = cwNormalInside  > 0 ? calcSlabs(cwPeriodDays, or1, or2, or3, cwNormalInside,  cwBlockStart, todayD, cwDaysOffset) : [];
        const cwOutsideNormalSlabs = cwNormalOutside > 0 ? calcSlabs(cwPeriodDays, or1, or2, or3, cwNormalOutside, cwBlockStart, todayD, cwDaysOffset) : [];
        const cwInsideSdSlabs      = cwSdInside  > 0 ? calcCarBillingSdSlabs(cld, lastDelivery, cwBlockStart, todayD, cwPeriodDays, cwSdInside,  cwDaysOffset, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car) : [];
        const cwOutsideSdSlabs     = cwSdOutside > 0 ? calcCarBillingSdSlabs(cld, lastDelivery, cwBlockStart, todayD, cwPeriodDays, cwSdOutside, cwDaysOffset, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car) : [];
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
          insideWharfrent:  cwInsideNormalSlabs.reduce((a, s) => a + s.amt, 0) + cwInsideSdSlabs.reduce((a, s) => a + s.amt, 0),
          outsideWharfrent: (cwOutsideNormalSlabs.reduce((a, s) => a + s.amt, 0) + cwOutsideSdSlabs.reduce((a, s) => a + s.amt, 0)) / 2,
          balanceInsideAfter: cwInside,
          balanceOutsideAfter: cwOutside,
          isCurrentDate: true,
        });
      }
    }
  }

  const validPeriods = periods.filter(p => !p.invalid);
  return {
    periods,
    totalInsideWharfrent:  validPeriods.reduce((a, p) => a + p.insideWharfrent,  0),
    totalOutsideWharfrent: validPeriods.reduce((a, p) => a + p.outsideWharfrent, 0),
    totalDays,
    hasWharfrent,
  };
}

// Build part billing inside/outside detail table for screen display
function buildPartBillingBillTable(b, side) { //NOSONAR
  const isIn = side === 'inside';
  const validPeriods = (b.pbPeriods || []).filter(p => !p.invalid);
  let rows = '';
  const halfSuffix = isIn ? '' : '<span style="font-size:11px;color:var(--m2)"> × 0.50</span>';
  validPeriods.forEach((p, pi) => {
    const normalSlabs = isIn ? p.insideSlabs    : p.outsideSlabs;
    const sdSlabs     = isIn ? (p.insideSdSlabs  || []) : (p.outsideSdSlabs || []);
    const w           = isIn ? p.insideW  : p.outsideW;
    const sdW         = isIn ? (p.insideSdW  || 0) : (p.outsideSdW || 0);
    const isLast  = pi === validPeriods.length - 1;
    const balSd_s = isIn ? (p.balanceSdInsideAfter || 0) : (p.balanceSdOutsideAfter || 0);
    const balNorm_s = isIn ? p.balanceInsideAfter : p.balanceOutsideAfter;
    const balAfterStr_s = balSd_s > 0 ? `${balNorm_s}t Normal + ${balSd_s}t SD` : `${balNorm_s}t`;
    const balNote = p.isCurrentDate
      ? ' · Up to Today'
      : (!isLast
          ? (isIn
              ? ` · Balance: Inside ${balAfterStr_s}`
              : ` · Balance: Outside ${balAfterStr_s}`)
          : ' · Final Delivery');
    const tonLabel_s = sdW > 0 ? `Normal: ${fmtN(w - sdW)}t + SD: ${fmtN(sdW)}t` : `${fmtN(w)} ton(s)`;
    const dayRange_s = `Day ${p.daysOffset + 1}–${p.daysOffset + p.periodDays}`;
    rows += `<tr class="sep"><td colspan="6">Period ${p.periodNum}: ${fd(p.blockStart)} → ${fd(p.deliveryDate)} | ${tonLabel_s} | ${p.periodDays} days (${dayRange_s})${balNote}</td></tr>`;
    normalSlabs.forEach(s => {
      const dispAmt  = isIn ? s.amt  : s.amt  / 2;
      rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
    });
    if (sdSlabs.length > 0) {
      rows += `<tr class="sep" style="font-style:italic;"><td colspan="6">↳ Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
      sdSlabs.forEach(s => {
        const dispAmt  = isIn ? s.amt  : s.amt  / 2;
        rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
      });
    }
  });
  const wharfTotal   = isIn ? b.insideWharfrent : b.outsideWharfrent;
  const halfNote     = isIn ? '' : ' (½ Rate Applied)';
  rows += `<tr class="sub"><td colspan="3">Wharfrent Sub-Total${halfNote} — ${b.totalDays} days</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(wharfTotal)}</td></tr>`;
  const billPayables  = isIn ? b.insidePayables : b.outsidePayables;
  if (billPayables.length > 0) {
    rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
    billPayables.forEach(p => {
      rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
    });
  }
  const baseAmt   = isIn ? b.iBase  : b.oBase;
  const vatAmt    = isIn ? b.iVat   : b.oVat;
  const levyAmt   = isIn ? b.iLevy  : b.oLevy;
  const totalAmt  = isIn ? b.iTotal : b.oTotal;
  const billPayables2 = isIn ? b.insidePayables : b.outsidePayables;
  if (billPayables2.length > 0) rows += `<tr class="tot"><td colspan="5">Total Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr>`;
  if (vatAmt  > 0) rows += `<tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(1)}%</td><td>${fmt(vatAmt)}</td></tr>`;
  if (levyAmt > 0) rows += `<tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(levyAmt)}</td></tr>`;
  rows += `<tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(totalAmt)}</td></tr>`;
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Build part billing print section for inside or outside
function buildPartBillingPrintSection(b, side) { //NOSONAR
  const validPeriods = (b.pbPeriods || []).filter(p => !p.invalid);
  const isIn = side === 'inside';
  let rows = '';
  validPeriods.forEach((p, pi) => {
    const normalSlabs = isIn ? p.insideSlabs         : p.outsideSlabs;
    const sdSlabs     = isIn ? (p.insideSdSlabs  || []) : (p.outsideSdSlabs || []);
    const w           = isIn ? p.insideW  : p.outsideW;
    const sdW         = isIn ? (p.insideSdW  || 0) : (p.outsideSdW || 0);
    const isLast = pi === validPeriods.length - 1;
    const balSd_p = isIn ? (p.balanceSdInsideAfter || 0) : (p.balanceSdOutsideAfter || 0);
    const balNorm_p = isIn ? p.balanceInsideAfter : p.balanceOutsideAfter;
    const balAfterStr_p = balSd_p > 0 ? `${balNorm_p}t Normal + ${balSd_p}t SD` : `${balNorm_p}t`;
    const balNote = p.isCurrentDate
      ? ' | Up to Today'
      : (!isLast
          ? (isIn
              ? ` | Remaining balance after this delivery: Inside ${balAfterStr_p}`
              : ` | Remaining balance after this delivery: Outside ${balAfterStr_p}`)
          : ' | Final Delivery — no cargo remains');
    const normalW_p = w - sdW;
    const tonLabel_p = sdW > 0 ? `Normal: ${fmtN(normalW_p)}t + SD: ${fmtN(sdW)}t` : `${fmtN(w)} ton(s)`;
    const dayRange_p = `Day ${p.daysOffset + 1}–${p.daysOffset + p.periodDays}`;
    rows += `<tr class="sep"><td colspan="6">Stage ${p.periodNum}: ${fd(p.blockStart)} &rarr; ${fd(p.deliveryDate)} &nbsp;|&nbsp; ${tonLabel_p} &nbsp;|&nbsp; ${p.periodDays} day(s) (${dayRange_p})${balNote}</td></tr>`;
    normalSlabs.forEach(s => {
      const da = isIn ? s.amt  : s.amt  / 2;
      rows += printTr(s.label, `${fmtN(s.rate)}/t/d${isIn ? '' : ' × 0.50'}`, fd(s.from), fd(s.to), s.days, fmt(da));
      rows += isIn ? printCalcRow(s.rate, normalW_p, s.days, da) : printCalcRowHalf(s.rate, normalW_p, s.days, da);
    });
    if (sdSlabs.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
      sdSlabs.forEach(s => {
        const da = isIn ? s.amt  : s.amt  / 2;
        rows += printTr(s.label, `${fmtN(s.rate)}/t/d${isIn ? '' : ' × 0.50'}`, fd(s.from), fd(s.to), s.days, fmt(da));
        rows += isIn ? printCalcRow(s.rate, sdW, s.days, da) : printCalcRowHalf(s.rate, sdW, s.days, da);
      });
    }
  });
  const rp2 = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
  const wharfTotal      = isIn ? b.insideWharfrent  : b.outsideWharfrent;
  const filteredPay     = cargoIncludePayables ? (isIn ? b.insidePayables : b.outsidePayables) : [];
  const paySubAdj2      = cargoIncludePayables ? 0 : (isIn ? b.insidePaySub : b.outsidePaySub);
  const baseAmt         = rp2((isIn ? b.iBase : b.oBase) - paySubAdj2);
  const vatAmt          = rp2(baseAmt * b.vatRate);
  const levyAmt         = cargoIncludePayables ? (isIn ? b.iLevy : b.oLevy) : 0;
  const totAmt          = rp2(baseAmt + vatAmt + levyAmt);
  const halfNote        = isIn ? '' : ' (½ Rate)';
  rows += printTotRow(`Wharfrent Sub-Total${halfNote} — ${b.totalDays} day(s)`, fmt(wharfTotal), 'sub');
  if (filteredPay.length > 0) {
    rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
    filteredPay.forEach(p => {
      rows += printTr(p.label, `${fmtN(p.rate)}/ton`, `${fmtN(p.tons)} ton(s)`, '—', '—', fmt(p.amt), 'sub');
      rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(p.tons)}&nbsp;ton(s) = Tk&nbsp;${fmt(p.amt)}</td></tr>`;
    });
    rows += printTotRow('Total Bill (Base for VAT)', fmt(baseAmt));
  }
  if (vatAmt  > 0) rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%  ·  ${fmt(baseAmt)} × ${(b.vatRate * 100).toFixed(1)}% = ${fmt(vatAmt)}`, fmt(vatAmt), 'vrow');
  if (levyAmt > 0) rows += printTotRow('Levy Charge (VAT-exempt)', fmt(levyAmt), 'lrow');
  rows += printTotRow(`${isIn ? 'INSIDE' : 'OUTSIDE'} GRAND TOTAL`, fmt(totAmt), 'grand');
  const wt       = isIn ? b.insideW : b.outsideW;
  const sdWt     = isIn ? (b.wharfSdInside || 0) : (b.wharfSdOutside || 0);
  const headBadge = sdWt > 0
    ? (isIn ? `${fmtN(wt - sdWt)}t Normal + ${fmtN(sdWt)}t SD — Full Rate` : `${fmtN(wt - sdWt)}t Normal + ${fmtN(sdWt)}t SD — ½ Rate`)
    : (isIn ? `${fmtN(wt)} ton initial — Full Rate` : `${fmtN(wt)} ton initial — ½ Rate`);
  const subNote   = `Part Billing — ${validPeriods.length} stage${validPeriods.length !== 1 ? 's' : ''} · ${isIn ? 'Full' : '½'} rate · Day-count continuous from CLD`;
  return `${secHead(isIn ? 'INSIDE WHARFRENT' : 'OUTSIDE WHARFRENT', headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
}

function cargoCompute() {
  // NOSONAR
  const blNumber = (document.getElementById('c-blNumber')?.value || '').trim();
  const cnfName  = (document.getElementById('c-cnfName')?.value  || '').trim();
  const cld = pd(document.getElementById('c-cld').value);
  const _cfdRaw = Number.parseInt(document.getElementById('c-freeDays').value, 10);
  const freeDays = Number.isNaN(_cfdRaw) ? 4 : Math.max(0, _cfdRaw);
  const freeEnd = freeDays === 0 ? addD(cld, -1) : addD(cld, freeDays - 1);
  const storStart = addD(freeEnd, 1);
  const delivery = pd(document.getElementById('c-delivery').value);
  const totalWeight = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById('c-weight').value) || 0
    )
  );
  const insideW = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById('c-inside').value) || 0
    )
  );
  const outsideW = Math.max(
    0,
    Math.round(
      Number.parseFloat(document.getElementById('c-outside').value) || 0
    )
  );
  const vatRate = Math.min(1, Math.max(0, gn('c-vatRate') / 100));
  // Dynamic payable rates based on weight tier — not from input fields
  const tierRate = getCargoLandingTierRate(totalWeight);
  const landingChecked = gb('c-chkLanding');
  const dynamicLandingRate = tierRate;
  const dynamicRemovalRate = tierRate * (landingChecked ? 7 : 8);
  const dynamicHoistingRate = tierRate * 1.25;
  const removalTon = Math.min(
    totalWeight,
    Math.max(
      0,
      Number.parseFloat(document.getElementById('c-removalTon').value) || 0
    )
  );
  const weighmentTon = Math.min(
    totalWeight,
    Math.max(
      0,
      Number.parseFloat(document.getElementById('c-weighmentTon').value) || 0
    )
  );
  const or1 = nn('c-or1'),
    or2 = nn('c-or2'),
    or3 = nn('c-or3');
  // Car Billing wharf rent rates (old + new, for self-drive ton portion with split billing)
  const or1Car = nn('or1'), or2Car = nn('or2'), or3Car = nn('or3');
  const nr1Car = nn('nr1'), nr2Car = nn('nr2'), nr3Car = nn('nr3');

  // Self-drive tons for wharf rent: these tons use Car Billing slab rates instead of GC rates
  // Independent of hoisting checkbox — self-drive affects wharfrent rate regardless of hoisting
  const wharfSdInside = gb('c-chkSelfDriveInside')
    ? Math.min(Math.max(0, Math.round(Number.parseFloat(document.getElementById('c-selfDriveTonInside')?.value) || 0)), insideW)
    : 0;
  const wharfSdOutside = gb('c-chkSelfDriveOutside')
    ? Math.min(Math.max(0, Math.round(Number.parseFloat(document.getElementById('c-selfDriveTonOutside')?.value) || 0)), outsideW)
    : 0;
  const insideNormalW  = insideW  - wharfSdInside;
  const outsideNormalW = outsideW - wharfSdOutside;

  // ── Part Billing branch ──
  const isPartBilling = !!document.getElementById('c-partBilling')?.checked;
  let insideSlabs = [], outsideSlabs = [], insideSdSlabs = [], outsideSdSlabs = [];
  let totalDays = 0, hasWharfrent = false;
  let pbPeriods = null;

  if (isPartBilling) {
    const pbr = computePartBillingWharfrent(cld, freeEnd, storStart, insideW, outsideW, or1, or2, or3, wharfSdInside, wharfSdOutside, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car);
    pbPeriods    = pbr.periods;
    hasWharfrent = pbr.hasWharfrent;
    totalDays    = pbr.totalDays;
  } else {
    hasWharfrent = delivery > freeEnd;
    if (hasWharfrent) {
      totalDays    = diffD(freeEnd, delivery);
      // Normal portion → GC rates
      insideSlabs  = insideNormalW  > 0 ? calcSlabs(totalDays, or1, or2, or3, insideNormalW,  storStart, delivery, 0) : [];
      outsideSlabs = outsideNormalW > 0 ? calcSlabs(totalDays, or1, or2, or3, outsideNormalW, storStart, delivery, 0) : [];
      // Self-drive portion → Car Billing rates with old/new rate split
      insideSdSlabs  = wharfSdInside  > 0 ? calcCarBillingSdSlabs(cld, freeEnd, storStart, delivery, totalDays, wharfSdInside,  0, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car) : [];
      outsideSdSlabs = wharfSdOutside > 0 ? calcCarBillingSdSlabs(cld, freeEnd, storStart, delivery, totalDays, wharfSdOutside, 0, or1Car, or2Car, or3Car, nr1Car, nr2Car, nr3Car) : [];
    }
  }

  // Inside wharfrent = GC full rate × normalW + Car full rate × sdW
  const insideWharfrent = isPartBilling
    ? (pbPeriods || []).filter(p => !p.invalid).reduce((a, p) => a + p.insideWharfrent, 0)
    : insideSlabs.reduce((a, s) => a + s.amt, 0) + insideSdSlabs.reduce((a, s) => a + s.amt, 0);
  // Outside wharfrent = ½ × (GC full rate × normalW + Car full rate × sdW)
  const outsideWharfrent = isPartBilling
    ? (pbPeriods || []).filter(p => !p.invalid).reduce((a, p) => a + p.outsideWharfrent, 0)
    : (outsideSlabs.reduce((a, s) => a + s.amt, 0) + outsideSdSlabs.reduce((a, s) => a + s.amt, 0)) / 2;

  // Payable charges - apply based on actual tons (inside or outside)
  const payables = [];

  if (gb('c-chkRiver')) {
    if (hasWharfrent) {
      // Split by portion when wharfrent applies - only for tons > 0
      if (insideW > 0) {
        payables.push({
          label: 'River Dues',
          rate: nn('c-rRiver'),
          tons: insideW,
          amt: nn('c-rRiver') * insideW,
          portion: 'inside',
        });
      }
      if (outsideW > 0) {
        payables.push({
          label: 'River Dues',
          rate: nn('c-rRiver'),
          tons: outsideW,
          amt: nn('c-rRiver') * outsideW,
          portion: 'outside',
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: 'River Dues',
        rate: nn('c-rRiver'),
        tons: totalWeight,
        amt: nn('c-rRiver') * totalWeight,
        portion: 'total',
      });
    }
  }
  if (gb('c-chkLanding')) {
    if (hasWharfrent) {
      // Split by portion when wharfrent applies - only for tons > 0
      if (insideW > 0) {
        payables.push({
          label: 'Landing Charge',
          rate: dynamicLandingRate,
          tons: insideW,
          amt: dynamicLandingRate * insideW,
          portion: 'inside',
        });
      }
      if (outsideW > 0) {
        payables.push({
          label: 'Landing Charge',
          rate: dynamicLandingRate,
          tons: outsideW,
          amt: dynamicLandingRate * outsideW,
          portion: 'outside',
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: 'Landing Charge',
        rate: dynamicLandingRate,
        tons: totalWeight,
        amt: dynamicLandingRate * totalWeight,
        portion: 'total',
      });
    }
  }
  if (gb('c-chkRemoval')) {
    if (hasWharfrent) {
      // Removal charges only for outside portion (if outside > 0)
      if (outsideW > 0) {
        payables.push({
          label: 'Removal Charge',
          rate: dynamicRemovalRate,
          tons: removalTon,
          amt: dynamicRemovalRate * removalTon,
          portion: 'outside',
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: 'Removal Charge',
        rate: dynamicRemovalRate,
        tons: removalTon,
        amt: dynamicRemovalRate * removalTon,
        portion: 'total',
      });
    }
  }
  if (gb('c-chkWeighment')) {
    if (hasWharfrent) {
      payables.push({
        label: 'Weighment Charge',
        rate: nn('c-rWeighment'),
        tons: weighmentTon,
        amt: nn('c-rWeighment') * weighmentTon,
        portion: 'outside',
      });
    } else {
      payables.push({
        label: 'Weighment Charge',
        rate: nn('c-rWeighment'),
        tons: weighmentTon,
        amt: nn('c-rWeighment') * weighmentTon,
        portion: 'total',
      });
    }
  }
  if (gb('c-chkHoisting')) {
    const insideSelfDriveTon = gb('c-chkSelfDriveInside')
      ? Math.min(Math.max(0, Math.round(Number.parseFloat(document.getElementById('c-selfDriveTonInside')?.value) || 0)), insideW)
      : 0;
    const outsideSelfDriveTon = gb('c-chkSelfDriveOutside')
      ? Math.min(Math.max(0, Math.round(Number.parseFloat(document.getElementById('c-selfDriveTonOutside')?.value) || 0)), outsideW)
      : 0;
    const halfRate = dynamicHoistingRate * 0.5;

    if (hasWharfrent) {
      const insideNormal = insideW - insideSelfDriveTon;
      const outsideNormal = outsideW - outsideSelfDriveTon;
      if (insideNormal > 0) {
        payables.push({ label: 'Hoisting Charge', rate: dynamicHoistingRate, tons: insideNormal, amt: dynamicHoistingRate * insideNormal, portion: 'inside' });
      }
      if (insideSelfDriveTon > 0) {
        payables.push({ label: 'Hoisting Charge (Self Drive)', rate: halfRate, tons: insideSelfDriveTon, amt: halfRate * insideSelfDriveTon, portion: 'inside' });
      }
      if (outsideNormal > 0) {
        payables.push({ label: 'Hoisting Charge', rate: dynamicHoistingRate, tons: outsideNormal, amt: dynamicHoistingRate * outsideNormal, portion: 'outside' });
      }
      if (outsideSelfDriveTon > 0) {
        payables.push({ label: 'Hoisting Charge (Self Drive)', rate: halfRate, tons: outsideSelfDriveTon, amt: halfRate * outsideSelfDriveTon, portion: 'outside' });
      }
    } else {
      const totalSelfDrive = insideSelfDriveTon + outsideSelfDriveTon;
      const normalTons = totalWeight - totalSelfDrive;
      if (normalTons > 0) {
        payables.push({ label: 'Hoisting Charge', rate: dynamicHoistingRate, tons: normalTons, amt: dynamicHoistingRate * normalTons, portion: 'total' });
      }
      if (totalSelfDrive > 0) {
        payables.push({ label: 'Hoisting Charge (Self Drive)', rate: halfRate, tons: totalSelfDrive, amt: halfRate * totalSelfDrive, portion: 'total' });
      }
    }
  }
  // Levy charge based on inside/outside tons
  const insideLevy = gb('c-chkLevy') ? nn('c-rLevy') * insideW : 0;
  const outsideLevy = gb('c-chkLevy') ? nn('c-rLevy') * outsideW : 0;
  const totalLevy = insideLevy + outsideLevy;

  // Separate payable amounts for inside and outside portions
  const insidePayables = payables.filter(p => p.portion === 'inside');
  const outsidePayables = payables.filter(p => p.portion === 'outside');
  const insidePaySub = insidePayables.reduce((a, p) => a + p.amt, 0);
  const outsidePaySub = outsidePayables.reduce((a, p) => a + p.amt, 0);
  const paySub = payables.reduce((a, p) => a + p.amt, 0);

  const r2 = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
  // Bills
  // Inside: (insideWharfrent + insidePaySub) → VAT → + insideLevy
  const iBase = r2(insideWharfrent + insidePaySub);
  const iVat = r2(iBase * vatRate);
  const iLevy = insideLevy;
  const iTotal = r2(iBase + iVat + iLevy);
  // Outside: (outsideWharfrent + outsidePaySub) → VAT → + outsideLevy
  const oBase = r2(outsideWharfrent + outsidePaySub);
  const oVat = r2(oBase * vatRate);
  const oLevy = outsideLevy;
  const oTotal = r2(oBase + oVat + oLevy);
  // No wharfrent
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
    isPartBilling,
    pbPeriods,
    blNumber,
    cnfName,
  };
}

function syncPbMaxLabels() {
  partBillingStages.forEach((stage, idx) => {
    const maxIn    = pbMaxWeight(idx, 'inside');
    const maxOut   = pbMaxWeight(idx, 'outside');
    const maxSdIn  = pbMaxSdWeight(idx, 'inside');
    const maxSdOut = pbMaxSdWeight(idx, 'outside');
    const inpIn    = document.getElementById(`pb-inside-${idx}`);
    const inpOut   = document.getElementById(`pb-outside-${idx}`);
    const inpSdIn  = document.getElementById(`pb-sd-inside-${idx}`);
    const inpSdOut = document.getElementById(`pb-sd-outside-${idx}`);
    const lblIn    = document.querySelector(`label[for="pb-inside-${idx}"]`);
    const lblOut   = document.querySelector(`label[for="pb-outside-${idx}"]`);
    const lblSdIn  = document.querySelector(`label[for="pb-sd-inside-${idx}"]`);
    const lblSdOut = document.querySelector(`label[for="pb-sd-outside-${idx}"]`);
    const syncInp = (inp, max) => { if (!inp) return; if (max > 0) inp.max = max; else inp.removeAttribute('max'); };
    const syncLbl = (lbl, max, maxSd = 0) => {
      if (!lbl) return;
      let note = lbl.querySelector('.pbs-max-note');
      if (max > 0) {
        if (!note) { note = document.createElement('span'); note.className = 'pbs-max-note'; lbl.appendChild(note); }
        note.textContent = maxSd > 0 ? `max ${max}t Normal + ${maxSd}t SD` : `max ${max}t`;
      } else if (note) note.remove();
    };
    syncInp(inpIn,   maxIn);   syncLbl(lblIn,   maxIn,   maxSdIn);
    syncInp(inpOut,  maxOut);  syncLbl(lblOut,  maxOut,  maxSdOut);
    syncInp(inpSdIn, maxSdIn); syncLbl(lblSdIn, maxSdIn);
    syncInp(inpSdOut,maxSdOut);syncLbl(lblSdOut,maxSdOut);
  });
}

function cargoRefreshNow() {
  try {
    validateDateField('c-cld', 'c-cld-hint', 'CLD');
    validateDateField('c-delivery', 'c-delivery-hint', 'delivery date');
    cargoValidateSplit();
    cargoValidateRemovalTon();
    cargoValidateWeighmentTon();
    cargoValidateSelfDriveTon();
    if (document.getElementById('c-partBilling')?.checked) {
      const wantSdIn  = !!document.getElementById('c-chkSelfDriveInside')?.checked  && pbMaxSdWeight(0, 'inside')  > 0;
      const wantSdOut = !!document.getElementById('c-chkSelfDriveOutside')?.checked && pbMaxSdWeight(0, 'outside') > 0;
      const hasSdIn   = !!document.getElementById('pb-sd-inside-0');
      const hasSdOut  = !!document.getElementById('pb-sd-outside-0');
      if (wantSdIn !== hasSdIn || wantSdOut !== hasSdOut) renderPartBillingStages();
      else syncPbMaxLabels();
    }
    const cld_ = pd(document.getElementById('c-cld').value);
    const _cfd_raw = Number.parseInt(document.getElementById('c-freeDays').value, 10);
    const fd_ = Number.isNaN(_cfd_raw) ? 4 : Math.max(0, _cfd_raw);
    const freeEnd = fd_ === 0 ? addD(cld_, -1) : addD(cld_, fd_ - 1);
    const storStartDate = addD(freeEnd, 1);
    document.getElementById('cargo-freeEnd').textContent = fd(freeEnd);
    document.getElementById('cargo-storStart').textContent = fd(storStartDate);
    const strip = document.getElementById('cargo-ftStrip');
    const ftDaysEl = document.getElementById('cargo-ftDays');
    if (strip && ftDaysEl) {
      const dayLabels = [];
      for (let i = 0; i < fd_; i++) {
        const d = addD(cld_, i);
        dayLabels.push(
          d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          })
        );
      }
      ftDaysEl.innerHTML = fd_ === 0
        ? `<span style="color:var(--m2)">No free time — </span><span style="color:var(--green);font-weight:600;">Wharfrent starts ${storStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>`
        : '<span style="color:var(--m2)">Free: </span>' +
          dayLabels.map(d => `<span style="background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.2);color:var(--cargo-accent);border-radius:4px;padding:1px 7px;margin:0 2px;">${d}</span>`).join('') +
          `<span style="color:var(--m2)"> → Wharfrent starts </span><span style="color:var(--green);font-weight:600;">${storStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>`;
      strip.style.display = 'block';
    }
    ['c-or1', 'c-or2', 'c-or3'].forEach(id => {
      const inp = document.getElementById(id);
      const sp = document.getElementById(id.replace('c-', 'c-d'));
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
      if (maxVal > 0) inp.max = maxVal; else inp.removeAttribute('max');
      if (on) {
        inp.classList.remove('ton-inactive');
        const v = Math.round(Number.parseFloat(inp.value) || 0);
        let showErr = false;
        if (v <= 0) {
          if (err) err.textContent = '⚠ Enter weight > 0';
          showErr = true;
        } else if (maxVal > 0 && v > maxVal) {
          if (err) err.textContent = `⚠ Cannot exceed ${maxVal} ton(s)`;
          showErr = true;
        }
        if (err) err.classList.toggle('show', showErr);
      } else {
        inp.classList.add('ton-inactive');
        if (err) err.classList.remove('show');
      }
    };
    syncTon('c-chkRemoval',          'c-removalTon',          'c-removalTon-err');
    syncTon('c-chkWeighment',        'c-weighmentTon',         'c-weighmentTon-err');
    syncTon('c-chkSelfDriveInside',  'c-selfDriveTonInside',   'c-selfDriveTonInside-err',  b.insideW);
    syncTon('c-chkSelfDriveOutside', 'c-selfDriveTonOutside',  'c-selfDriveTonOutside-err', b.outsideW);
    // Sync derived rate display fields (always readonly — formula-based)
    document.getElementById('c-rLanding').value = b.dynamicLandingRate;
    document.getElementById('c-rRemoval').value = b.dynamicRemovalRate;
    document.getElementById('c-rHoisting').value = b.dynamicHoistingRate;
    // Update rate tier badge
    const tierEl = document.getElementById('cargo-tier-info');
    if (tierEl) {
      tierEl.innerHTML =
        `<span style="color:var(--m2)">Landing Tier: </span><strong style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</strong>` +
        `<span style="color:var(--m2)"> · Removal: </span><strong style="color:var(--gold)">${b.dynamicRemovalRate} Tk/ton</strong>` +
        `<span style="color:var(--m2)"> · Hoisting: </span><strong style="color:var(--gold)">${b.dynamicHoistingRate} Tk/ton</strong>`;
    }
    document.getElementById('cargo-rbadge').innerHTML = b.isPartBilling
      ? `<div class="rbadge rb-new" style="background:rgba(14,165,233,0.10);border-color:rgba(14,165,233,0.28);color:var(--sky);">📦 PART BILLING — ${(b.pbPeriods||[]).filter(p=>!p.invalid).length} Delivery Stage(s)</div>`
      : `<div class="rbadge rb-new">● CARGO RATES — Landing Tier: ${getCargoTierLabel(b.totalWeight)}</div>`;
    const pv = document.getElementById('cargo-preview');
    const inside = Math.round(
      Number.parseFloat(document.getElementById('c-inside').value) || 0
    );
    const outside = Math.round(
      Number.parseFloat(document.getElementById('c-outside').value) || 0
    );
    if (b.isPartBilling) {
      const vp = (b.pbPeriods || []).filter(p => !p.invalid);
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Part Billing Stages</span><span class="pvr-val v-cyan">${vp.length} stage${vp.length !== 1 ? 's' : ''}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Total Wharfrent Days</span><span class="pvr-val v-cyan">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Wharfrent Total</span><span class="pvr-val v-blue">${fmt(b.iTotal)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Wharfrent Total</span><span class="pvr-val v-purple">${fmt(b.oTotal)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">Grand Total — Part Billing</span><span class="pvr-val v-cyan">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else if (b.hasWharfrent) {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Wharfrent Days</span><span class="pvr-val v-cyan">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Wharfrent</span><span class="pvr-val v-blue">${fmt(b.iTotal)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Wharfrent</span><span class="pvr-val v-purple">${fmt(b.oTotal)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Grand Total</span><span class="pvr-val v-cyan">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Wharfrent</span><span class="pvr-val v-green">Within Free Time ✓</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Payable Charges</span><span class="pvr-val">${fmt(b.paySub)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Grand Total</span><span class="pvr-val v-cyan">${fmt(b.nTotal)}</span></div>`;
    }
  if (isAdmin && !isInitialLoad) saveRates();
  } catch (e) {
    console.error('cargoRefreshNow error', e);
    document.getElementById('cargo-preview').innerHTML = SP_CARGO_IDLE;
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
  let rows = '';
  if (side === 'inside' || side === 'outside') {
    const isIn       = side === 'inside';
    const normalSlabs = isIn ? b.insideSlabs    : b.outsideSlabs;
    const sdSlabs     = isIn ? b.insideSdSlabs  : b.outsideSdSlabs;
    const normalW     = isIn ? b.insideNormalW  : b.outsideNormalW;
    const sdW         = isIn ? b.wharfSdInside  : b.wharfSdOutside;
    const wharfAmt    = isIn ? b.insideWharfrent : b.outsideWharfrent;
    const weight      = isIn ? b.insideW  : b.outsideW;
    const baseAmt     = isIn ? b.iBase    : b.oBase;
    const vatAmt      = isIn ? b.iVat     : b.oVat;
    const levyAmt     = isIn ? b.iLevy    : b.oLevy;
    const totalAmt    = isIn ? b.iTotal   : b.oTotal;
    const halfNote    = isIn ? '' : ' (½ Rate Applied)';
    const halfSuffix  = isIn ? '' : '<span style="font-size:11px;color:var(--m2)"> × 0.50</span>';

    if (b.hasWharfrent) {
      // Normal GC-rate portion
      normalSlabs.forEach(s => {
        const dispAmt  = isIn ? s.amt  : s.amt  / 2;
        rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
      });
      // Self-drive Car-rate portion
      if (sdSlabs.length > 0) {
        rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
        sdSlabs.forEach(s => {
          const dispAmt  = isIn ? s.amt  : s.amt  / 2;
          rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d${halfSuffix}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
        });
      }
      // Sub-total row(s)
      if (normalSlabs.length > 0 && sdSlabs.length > 0) {
        const normalAmt = isIn ? normalSlabs.reduce((a, s) => a + s.amt, 0) : normalSlabs.reduce((a, s) => a + s.amt, 0) / 2;
        const sdAmt     = isIn ? sdSlabs.reduce((a, s) => a + s.amt, 0)     : sdSlabs.reduce((a, s) => a + s.amt, 0)     / 2;
        rows += `<tr class="sub"><td colspan="3">Cargo Wharfrent Sub-Total${halfNote} — ${fmtN(normalW)} ton(s)</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(normalAmt)}</td></tr>`;
        rows += `<tr class="sub"><td colspan="3">Self Drive Wharfrent Sub-Total${halfNote} — ${fmtN(sdW)} ton(s)</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(sdAmt)}</td></tr>`;
      } else {
        const subLabel = sdSlabs.length > 0 ? `Self Drive Wharfrent Sub-Total${halfNote} — ${fmtN(sdW)} ton(s)` : `Cargo Wharfrent Sub-Total${halfNote} — ${fmtN(weight)} ton(s)`;
        rows += `<tr class="sub"><td colspan="3">${subLabel}</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(wharfAmt)}</td></tr>`;
      }
    }
    // Use appropriate payables based on bill type
    const billPayables = isIn ? b.insidePayables : b.outsidePayables;
    if (billPayables.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
      billPayables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(1)}%</td><td>${fmt(vatAmt)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(levyAmt)}</td></tr><tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(totalAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons ?? b.totalWeight)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT @ ${(b.vatRate * 100).toFixed(1)}%</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (No VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">GRAND TOTAL</td><td>${fmt(b.nTotal)}</td></tr>`;
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
  const r2 = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
  if (!b.hasWharfrent) {
    return {
      hasWharfrent: false,
      vatPct: (b.vatRate * 100).toFixed(1),
      // Wharfrent row — all zero, within free time
      wInside: 0, wOutside: 0, wVat: 0, wLevy: 0, wTotal: 0,
      // Payable row — uses no-wharfrent flat values (payables not split inside/outside)
      pInside: 0, pOutside: 0, pBase: b.paySub,
      pVat: b.nVat, pLevy: b.nLevy, pTotal: b.nTotal,
      // Grand row
      gInside: 0, gOutside: 0, gBase: b.nBase,
      gVat: b.nVat, gLevy: b.nLevy, gTotal: b.nTotal,
    };
  }
  const wharfrentBase = b.insideWharfrent + b.outsideWharfrent;
  const payableBase = b.insidePaySub + b.outsidePaySub;
  const totalVat = b.iVat + b.oVat;
  const totalLevy = b.iLevy + b.oLevy;
  const grand = b.iTotal + b.oTotal;
  const wVat = r2(wharfrentBase * b.vatRate);
  const pVat = r2(totalVat - wVat);
  const wLevy = 0;
  const pLevy = totalLevy;
  const wTotal = r2(wharfrentBase + wVat + wLevy);
  const pTotal = r2(payableBase + pVat + pLevy);
  return {
    hasWharfrent: true,
    vatPct: (b.vatRate * 100).toFixed(1),
    wInside: b.insideWharfrent, wOutside: b.outsideWharfrent,
    wVat, wLevy, wTotal,
    pInside: b.insidePaySub, pOutside: b.outsidePaySub,
    pVat, pLevy, pTotal,
    gInside: b.iBase, gOutside: b.oBase,
    gVat: totalVat, gLevy: totalLevy, gTotal: grand,
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
  const head = secHead('CHARGE COMPOSITION BREAKDOWN', 'Wharfrent vs Payable');
  const sub = '<div class="section-sub">Inside + Outside + VAT + Levy attribution per charge type</div>';
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
  if (!cargoValidateSplit()) {
    showToast('Inside + Outside weight must equal Total Weight.', 'error');
    return;
  }
  if (!cargoValidateRemovalTon(true)) {
    document.getElementById('c-removalTon').focus();
    return;
  }
  if (!cargoValidateWeighmentTon(true)) {
    document.getElementById('c-weighmentTon').focus();
    return;
  }
  if (!cargoValidateSelfDriveTon(true)) {
    const iEl = document.getElementById('c-selfDriveTonInside');
    const oEl = document.getElementById('c-selfDriveTonOutside');
    (iEl?.validationMessage ? iEl : oEl)?.focus();
    return;
  }
  let b;
  try {
    b = cargoCompute();
  } catch (e) {
    console.error('cargoCalculate compute error', e);
    return;
  }
  if (!b) return;
  lastCargoBill = b;
  try {
  document.getElementById('cargo-results').style.display = 'block';

  if (b.isPartBilling) {
    const vp = (b.pbPeriods || []).filter(p => !p.invalid);
    const firstDel = vp.length > 0 ? fd(vp[0].deliveryDate)  : '—';
    const lastDel  = vp.length > 0 ? fd(vp[vp.length - 1].deliveryDate) : '—';
    document.getElementById('cargo-ibar').innerHTML =
      `<div class="ibar"><div>${b.blNumber ? `<div class="ii"><div class="il">BL Number</div><div class="iv" style="color:var(--sky)">${b.blNumber}</div></div>` : ''}${b.cnfName ? `<div class="ii"><div class="il">C&F Agent</div><div class="iv">${b.cnfName}</div></div>` : ''}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${fd(b.storStart)}</div></div><div class="ii"><div class="il">First Delivery</div><div class="iv">${firstDel}</div></div><div class="ii"><div class="il">Last Delivery</div><div class="iv">${lastDel}</div></div><div class="ii"><div class="il">Delivery Stages</div><div class="iv" style="color:var(--cargo-accent)">${vp.length} stages</div></div><div class="ii"><div class="il">Initial Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Total Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.totalDays} days</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
    document.getElementById('cargo-srow').innerHTML =
      `<div class="sc cg"><div class="sl">Grand Total — Part Billing</div><div class="sv" style="color:var(--cargo-accent)">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">${vp.length} stages · Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside Wharfrent Total</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Full rate · ${b.totalDays} days</div></div><div class="sc cp"><div class="sl">Outside Wharfrent Total</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">½ rate · ${b.totalDays} days</div></div>`;
    const pbInDesc  = b.wharfSdInside  > 0 ? `${fmtN(b.insideNormalW)}t Normal + ${fmtN(b.wharfSdInside)}t SD`  : `${fmtN(b.insideW)} ton(s)`;
    const pbOutDesc = b.wharfSdOutside > 0 ? `${fmtN(b.outsideNormalW)}t Normal + ${fmtN(b.wharfSdOutside)}t SD` : `${fmtN(b.outsideW)} ton(s)`;
    document.getElementById('cargo-insideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="cargo-split-info">Part Billing — ${vp.length} stage(s) · Initial Inside: <strong>${pbInDesc}</strong> · Full rate · Slab progression continuous from CLD</div><div class="slbl sl-cin">▪ Inside Wharfrent — Part Billing</div><div class="card" style="padding:0;overflow:hidden;">${buildPartBillingBillTable(b, 'inside')}</div></div>`;
    document.getElementById('cargo-outsideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="cargo-split-info" style="background:rgba(192,132,252,0.06);border-color:rgba(192,132,252,0.2);color:var(--purple);">Part Billing — ${vp.length} stage(s) · Initial Outside: <strong>${pbOutDesc}</strong> · ½ rate</div><div class="slbl sl-cout">▪ Outside Wharfrent — Part Billing — ½ Rate</div><div class="card" style="padding:0;overflow:hidden;">${buildPartBillingBillTable(b, 'outside')}</div></div>`;
  } else {
    document.getElementById('cargo-ibar').innerHTML =
      `<div class="ibar"><div>${b.blNumber ? `<div class="ii"><div class="il">BL Number</div><div class="iv" style="color:var(--sky)">${b.blNumber}</div></div>` : ''}${b.cnfName ? `<div class="ii"><div class="il">C&F Agent</div><div class="iv">${b.cnfName}</div></div>` : ''}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${b.hasWharfrent ? fd(b.storStart) : '—'}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Total Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.hasWharfrent ? b.totalDays + ' days' : 'In free time'}</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
    if (b.hasWharfrent) {
      document.getElementById('cargo-srow').innerHTML =
        `<div class="sc cg"><div class="sl">General Cargo Grand Total</div><div class="sv" style="color:var(--cargo-accent)">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside Wharfrent</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Full rate · incl. VAT</div></div><div class="sc cp"><div class="sl">Outside Wharfrent</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">½ rate · incl. VAT</div></div>`;
      const inTonDesc  = b.wharfSdInside  > 0 ? `${fmtN(b.insideNormalW)}t Normal + ${fmtN(b.wharfSdInside)}t SD`  : `${fmtN(b.insideW)} ton(s)`;
      const outTonDesc = b.wharfSdOutside > 0 ? `${fmtN(b.outsideNormalW)}t Normal + ${fmtN(b.wharfSdOutside)}t SD` : `${fmtN(b.outsideW)} ton(s)`;
      document.getElementById('cargo-insideSec').innerHTML =
        `<div style="margin-bottom:20px;"><div class="cargo-split-info">Inside: <strong>${inTonDesc}</strong> — Full wharfrent rate</div><div class="slbl sl-cin">▪ Inside Wharfrent</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, 'inside')}</div></div>`;
      document.getElementById('cargo-outsideSec').innerHTML =
        `<div style="margin-bottom:20px;"><div class="cargo-split-info" style="background:rgba(192,132,252,0.06);border-color:rgba(192,132,252,0.2);color:var(--purple);">Outside: <strong>${outTonDesc}</strong> — ½ wharfrent rate</div><div class="slbl sl-cout">▪ Outside Wharfrent — ½ Rate</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, 'outside')}</div></div>`;
    } else {
      document.getElementById('cargo-insideSec').innerHTML =
        '<div class="no-stor-note">✓ Delivery within free time — no wharfrent charge applies.</div>';
      document.getElementById('cargo-outsideSec').innerHTML =
        `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Payable Charges — Inside &amp; Outside</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, 'noWharfrent')}</div></div>`;
    }
  }

  // Charge Breakdown — Wharfrent vs Payable composition of the bill
  document.getElementById('cargo-breakdownSec').innerHTML =
    buildCargoBreakdownHtml(b);

  const grand = (b.hasWharfrent || b.isPartBilling) ? b.iTotal + b.oTotal : b.nTotal;
  const cargoGrandSplitHtml = (b.hasWharfrent || b.isPartBilling)
    ? `<div><div class="glbl">Inside Wharfrent Total${b.isPartBilling ? ' — Part Billing' : ''}</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">Full rate + VAT + Levy</div></div><div><div class="glbl">Outside Wharfrent Total${b.isPartBilling ? ' — Part Billing' : ''}</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">½ rate + VAT + Levy</div></div>`
    : `<div><div class="glbl">Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No wharfrent — payable charges only</div></div><div></div>`;
  document.getElementById('cargo-grandSec').innerHTML =
    `<div class="gbox cargo-grand"><div class="ginn">${cargoGrandSplitHtml}<div class="gfin"><div class="glbl">GENERAL CARGO GRAND TOTAL</div><div class="gval" style="color:var(--cargo-accent)">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;
  const cargoEmpty = document.getElementById('cargo-empty');
  if (cargoEmpty) cargoEmpty.style.display = 'none';

  if (!isInitialLoad) {
    setTimeout(
      () =>
        document
          .getElementById('cargo-results')
          .scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80
    );
  }
  } catch (e) {
    console.error('cargoCalculate render error', e);
  }
}

function cargoReset() {
  document.getElementById('cargo-results').style.display = 'none';
  document.getElementById('cargo-preview').innerHTML = SP_CARGO_IDLE;
  cargoIncludePayables = true;
  cargoIncludeWharfrent = true;
  const allPayEl = document.getElementById('c-chkAllPayables');
  if (allPayEl) allPayEl.checked = true;
  const whEl = document.getElementById('c-chkPrintWharfrent');
  if (whEl) whEl.checked = true;
  // Reset part billing state — restore charge checkboxes bypassed when pb mode was active
  const pbChk = document.getElementById('c-partBilling');
  if (pbChk) pbChk.checked = false;
  const _chargeDefaults = { 'c-chkRiver': true, 'c-chkLanding': true, 'c-chkRemoval': false, 'c-chkWeighment': false, 'c-chkHoisting': true, 'c-chkLevy': true };
  Object.entries(_chargeDefaults).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (el) el.checked = _pbSavedCharges ? !!_pbSavedCharges[id] : def;
  });
  _pbSavedCharges = null;
  partBillingStages = [{ date: '', insideAfter: 0, outsideAfter: 0, sdInsideAfter: 0, sdOutsideAfter: 0 }];
  partBillingUpToDate = false;
  const pbUtd = document.getElementById('c-pbUpToDate');
  if (pbUtd) pbUtd.checked = false;
  const pbCard = document.getElementById('c-pbStagesCard');
  if (pbCard) pbCard.style.display = 'none';
  const deliveryFg = document.getElementById('c-deliveryFg');
  if (deliveryFg) deliveryFg.style.display = '';
  const pbContainer = document.getElementById('c-pbStagesContainer');
  if (pbContainer) pbContainer.innerHTML = '';
  // Uncheck and reset self-drive inputs
  ['c-chkSelfDriveInside', 'c-chkSelfDriveOutside'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  ['c-selfDriveTonInside', 'c-selfDriveTonOutside'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.add('ton-inactive'); el.setCustomValidity(''); }
  });
  // Reset removal and weighment ton inputs to 0 and clear state
  ['c-removalTon', 'c-weighmentTon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.add('ton-inactive'); el.setCustomValidity(''); }
  });
  // Clear all inline error messages
  ['c-removalTon-err', 'c-weighmentTon-err', 'c-selfDriveTonInside-err', 'c-selfDriveTonOutside-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  globalThis.scrollTo({ top: 0, behavior: 'smooth' });
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
  } = opts;

  const hasLevy = (opts.totalLevy || 0) > 0;
  const levySuffix = hasLevy ? ' &amp; Levy' : '';
  const grandSubNote = hasLevy ? 'Incl. VAT &amp; Levy' : 'Incl. VAT';

  const splitSummaryHtml = opts.showSplit
    ? `<div class="io-summary no-break">
        <div class="io-cell io-inside">
          <div class="io-tag">Inside &mdash; Full Rate</div>
          <div class="io-label">${opts.insideLabel}</div>
          <div class="io-amount">${fmt(opts.iTotal)}</div>
          <div class="io-note">Full wharfrent rate &mdash; incl. VAT${levySuffix}</div>
        </div>
        <div class="io-divider"></div>
        <div class="io-cell io-outside">
          <div class="io-tag">Outside &mdash; Half Rate</div>
          <div class="io-label">${opts.outsideLabel}</div>
          <div class="io-amount">${fmt(opts.oTotal)}</div>
          <div class="io-note">Half wharfrent rate &mdash; incl. VAT${levySuffix}</div>
        </div>
      </div>`
    : '';

  const splitWarnHtml = isSplit
    ? `<div class="split-warn"><span class="sw-icon">&#9889;</span><strong>SPLIT BILLING APPLIED</strong> &mdash; Old rates applied up to 22/07/2024 &bull; New rates applied from 23/07/2024 onwards</div>`
    : '';

  const issueTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const emblemSvg = `<svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="23" cy="23" r="21" stroke="#c4943a" stroke-width="1.8"/>
    <circle cx="23" cy="23" r="7" stroke="#c4943a" stroke-width="1.8"/>
    <line x1="23" y1="2" x2="23" y2="44" stroke="#c4943a" stroke-width="1.2"/>
    <line x1="2" y1="23" x2="44" y2="23" stroke="#c4943a" stroke-width="1.2"/>
    <line x1="8.2" y1="8.2" x2="37.8" y2="37.8" stroke="#c4943a" stroke-width="1.2"/>
    <line x1="37.8" y1="8.2" x2="8.2" y2="37.8" stroke="#c4943a" stroke-width="1.2"/>
    <circle cx="23" cy="2" r="2.2" fill="#c4943a"/>
    <circle cx="23" cy="44" r="2.2" fill="#c4943a"/>
    <circle cx="2" cy="23" r="2.2" fill="#c4943a"/>
    <circle cx="44" cy="23" r="2.2" fill="#c4943a"/>
  </svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${billRef}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,900;1,9..40,400&display=swap" rel="stylesheet">
<style>
/* ── DESIGN TOKENS ── */
:root{
  --navy:#0c2046;
  --navy-mid:#1a3560;
  --gold:#c4943a;
  --gold-hi:#dab050;
  --gold-lo:#a87828;
  --blue:#1450a8;
  --blue-bg:#eaf2ff;
  --blue-bdr:#9bbce8;
  --indigo:#5528b0;
  --indigo-bg:#f0eaff;
  --indigo-bdr:#c0a8e8;
  --green:#0c6e48;
  --green-bg:#e8f8f0;
  --green-bdr:#7ecaa8;
  --border:#d8dde8;
  --border-lo:#eaecf2;
  --bg-strip:#f4f6fb;
  --bg-cell:#f8f9fc;
  --text:#1a2535;
  --text-mid:#4a5870;
  --text-muted:#7a8a9a;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:10pt;}
body{font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;color:var(--text);background:#e4e8f0;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

.invoice{max-width:900px;margin:0 auto;background:#fff;overflow:hidden;}
@media screen{.invoice{margin:24px auto 56px;border-radius:4px;box-shadow:0 2px 12px rgba(10,20,50,0.10),0 16px 48px rgba(10,20,50,0.12);}}
.inv-band{height:5px;background:linear-gradient(90deg,var(--navy) 0%,var(--gold-lo) 25%,var(--gold-hi) 50%,var(--gold-lo) 75%,var(--navy) 100%);-webkit-print-color-adjust:exact;print-color-adjust:exact;}

.cls-strip{display:flex;justify-content:space-between;align-items:center;background:var(--bg-strip);padding:5px 28px;font-family:'DM Mono',monospace;font-size:7pt;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid var(--border);}
.cls-strip .cls-l{color:var(--text-mid);}
.cls-strip .cls-r{color:var(--text-muted);font-size:6.5pt;}

.lh{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 28px 18px;border-bottom:2.5px solid var(--navy);background:#fff;}
.lh-left{display:flex;align-items:flex-start;gap:14px;}
.lh-emblem{flex-shrink:0;margin-top:1px;}
.lh-logo{font-family:'DM Sans',sans-serif;font-weight:900;font-size:18pt;letter-spacing:4px;color:var(--navy);line-height:1;text-transform:uppercase;}
.lh-rule{width:40px;height:3px;background:linear-gradient(90deg,var(--gold-lo),var(--gold-hi),var(--gold-lo));margin:7px 0 8px;}
.lh-sub{font-size:8pt;color:var(--text-mid);letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono',monospace;}
.lh-right{text-align:right;}
.lh-doc-label{display:inline-block;padding:3px 10px;background:transparent;color:var(--text-mid);border:1px solid var(--border);font-family:'DM Mono',monospace;font-size:7pt;letter-spacing:2px;text-transform:uppercase;border-radius:2px;margin-bottom:8px;}
.lh-bill-name{font-family:'DM Sans',sans-serif;font-weight:700;font-size:13pt;color:var(--navy);letter-spacing:1.5px;text-transform:uppercase;line-height:1.15;margin-bottom:10px;}
.lh-meta{border-collapse:collapse;margin-left:auto;}
.lh-meta-lbl{font-size:7.5pt;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;padding:2.5px 14px 2.5px 0;text-align:left;font-family:'DM Mono',monospace;white-space:nowrap;}
.lh-meta-val{font-size:8.5pt;color:var(--text);font-weight:700;font-family:'DM Mono',monospace;text-align:right;padding:2.5px 0;white-space:nowrap;}
.lh-badge{display:inline-block;margin-top:8px;padding:3px 9px;border:1px solid var(--gold);color:var(--gold);font-size:7pt;letter-spacing:1px;text-transform:uppercase;font-family:'DM Mono',monospace;border-radius:2px;}

.title-band{background:#fff;padding:12px 28px;border-left:5px solid var(--gold);border-top:1px solid var(--border-lo);border-bottom:1px solid var(--border-lo);margin-top:2px;}
.title-band h1{font-family:'DM Sans',sans-serif;font-weight:700;font-size:11pt;color:var(--navy);letter-spacing:2.5px;text-transform:uppercase;}
.title-band p{font-size:8.5pt;color:var(--text-mid);letter-spacing:0.3px;margin-top:3px;}

/* ─── SPLIT WARNING ─── */
.split-warn{
  display:flex;align-items:baseline;gap:8px;
  background:#fff8e6;border-top:3px solid var(--gold);border-bottom:1px solid #f0dfa0;
  padding:9px 26px;font-size:8.8pt;color:#5a3a00;letter-spacing:0.2px;
}
.sw-icon{font-size:11pt;flex-shrink:0;}

/* ─── SECTION LABEL ─── */
.info-section-label{
  font-family:'DM Mono',monospace;font-size:7pt;color:var(--text-muted);
  text-transform:uppercase;letter-spacing:2.5px;
  padding:14px 26px 6px;
}

/* ─── INFO GRID ─── */
.info-grid{
  display:grid;grid-template-columns:repeat(4,1fr);
  border-top:1px solid var(--border);border-left:1px solid var(--border);
  margin:0 26px 4px;
}
.info-cell{
  padding:11px 14px;
  border-right:1px solid var(--border);border-bottom:1px solid var(--border);
  background:#fff;
}
.info-cell:nth-child(odd){background:var(--bg-cell);}
.info-label{
  font-size:7.2pt;color:var(--text-muted);text-transform:uppercase;
  letter-spacing:0.7px;margin-bottom:5px;font-family:'DM Mono',monospace;
}
.info-value{
  font-size:9.2pt;color:var(--text);font-weight:600;font-family:'DM Mono',monospace;
}

/* ─── SECTION HEADERS ─── */
.section-head{
  background:#fff;color:var(--text);
  padding:9px 26px 8px;margin-top:22px;
  border-left:5px solid var(--gold);
  border-bottom:2px solid var(--navy);
  display:flex;justify-content:space-between;align-items:center;
}
.section-head>span:first-child{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;
  color:var(--navy);
}
.sh-accent{
  font-family:'DM Mono',monospace;font-size:7.8pt;font-weight:500;
  letter-spacing:0.5px;white-space:nowrap;
  color:var(--text-mid);border:1px solid var(--border);padding:2px 9px;border-radius:2px;
}
/* Inside Port = Royal Blue */
.section-head.inside-head{border-left-color:var(--blue);border-bottom-color:var(--blue);background:var(--blue-bg);}
.section-head.inside-head>span:first-child{color:var(--blue);}
.section-head.inside-head .sh-accent{border-color:var(--blue-bdr);color:var(--blue);background:#f0f6ff;}
.inside-head+.section-sub{border-left-color:var(--blue);background:#f2f7ff;}
/* Outside Port = Indigo */
.section-head.outside-head{border-left-color:var(--indigo);border-bottom-color:var(--indigo);background:var(--indigo-bg);}
.section-head.outside-head>span:first-child{color:var(--indigo);}
.section-head.outside-head .sh-accent{border-color:var(--indigo-bdr);color:var(--indigo);background:#f8f4ff;}
.outside-head+.section-sub{border-left-color:var(--indigo);background:#f5f0ff;}
/* Payable Charges = Forest Green */
.section-head.payable-head{border-left-color:var(--green);border-bottom-color:var(--green);background:var(--green-bg);}
.section-head.payable-head>span:first-child{color:var(--green);}
.section-head.payable-head .sh-accent{border-color:var(--green-bdr);color:var(--green);background:#f0faf5;}
.payable-head+.section-sub{border-left-color:var(--green);background:#ecf8f3;}
.section-sub{
  background:var(--bg-cell);border-left:5px solid var(--gold);
  padding:6px 26px;font-size:8.2pt;color:var(--text-mid);
  letter-spacing:0.3px;border-bottom:1px solid var(--border);
}

/* ─── TABLES ─── */
table{width:100%;border-collapse:collapse;font-size:8.8pt;}
thead th{
  background:var(--bg-strip);
  border-bottom:2px solid var(--navy);border-top:1px solid var(--border);
  padding:8px 10px;text-align:left;
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:7.8pt;letter-spacing:0.5px;text-transform:uppercase;
  color:var(--navy);white-space:nowrap;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
thead th:first-child{width:29%;padding-left:26px;}
thead th:nth-child(2){width:18%;}
thead th:nth-child(3),thead th:nth-child(4){width:11%;text-align:center;}
thead th:nth-child(5){width:8%;text-align:center;}
thead th:last-child{width:17%;text-align:right;min-width:90px;padding-right:26px;}
td{padding:7px 10px;border-bottom:1px solid var(--border-lo);vertical-align:middle;color:var(--text-mid);}
td:first-child{padding-left:26px;}
td:last-child{text-align:right;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);padding-right:26px;}
td:nth-child(2){color:var(--text-mid);white-space:nowrap;font-size:8.2pt;font-family:'DM Mono',monospace;}
td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center;color:var(--text-muted);font-size:8.2pt;font-family:'DM Mono',monospace;}
tbody tr:nth-child(even) td{background:var(--bg-cell);}
tr.sep td{
  background:#e4eaf6;color:var(--navy-mid);font-weight:700;
  font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;
  padding:6px 10px;border-top:1px solid #c4ccdf;border-bottom:1px solid #c4ccdf;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
tr.sep td:first-child{padding-left:26px;}
tr.sub td{background:var(--bg-strip);color:var(--text-mid);}
tr.sub td:last-child{color:var(--text);font-weight:700;}
tr.sub td:first-child{padding-left:26px;}
tr.tot td{
  background:#dce6f4;font-weight:700;color:var(--navy);
  border-top:2px solid var(--navy);border-bottom:1px solid var(--border);
  font-size:9pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
tr.tot td:first-child{padding-left:26px;}
tr.vrow td{
  background:var(--bg-cell);color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
}
tr.vrow td:first-child{padding-left:26px;}
tr.lrow td{
  background:var(--bg-cell);color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
  border-bottom:2px solid var(--border);
}
tr.lrow td:first-child{padding-left:26px;}
tr.grand td{
  background:#e8f0fa;color:var(--navy);font-weight:700;
  font-size:10pt;padding:11px 10px;border:none;
  border-top:2px solid var(--navy);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
tr.grand td:first-child{padding-left:26px;}
tr.grand td:last-child{color:var(--gold);font-size:11.5pt;letter-spacing:1px;padding-right:26px;}

/* ─── INSIDE / OUTSIDE SUMMARY ─── */
.io-summary{
  display:grid;grid-template-columns:1fr 1px 1fr;
  margin:20px 26px 0;
  border:1px solid var(--border);border-radius:3px;overflow:hidden;
}
.io-cell{padding:18px 22px;background:#fff;}
.io-inside{background:var(--blue-bg);border-top:4px solid var(--blue);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.io-outside{background:var(--indigo-bg);border-top:4px solid var(--indigo);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.io-divider{background:var(--border);}
.io-tag{
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;font-weight:600;
}
.io-inside .io-tag{color:var(--blue);}
.io-outside .io-tag{color:var(--indigo);}
.io-label{font-size:8.2pt;color:var(--text-mid);margin-bottom:8px;line-height:1.4;}
.io-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:16pt;line-height:1;margin-bottom:5px;
}
.io-inside .io-amount{color:var(--blue);}
.io-outside .io-amount{color:var(--indigo);}
.io-note{font-size:7.8pt;color:var(--text-muted);}

/* ─── GRAND TOTAL BAR ─── */
.grand-bar{
  background:#fffaf0;padding:20px 26px;
  margin:20px 26px 0;
  border:1px solid var(--border);border-top:4px solid var(--gold);
  display:flex;justify-content:space-between;align-items:center;
  border-radius:3px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.gb-left .gb-label{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:2px;text-transform:uppercase;color:var(--navy);
}
.gb-left .gb-sub{
  font-family:'DM Mono',monospace;font-size:7.8pt;
  color:var(--text-mid);letter-spacing:1px;text-transform:uppercase;margin-top:5px;
}
.gb-right{text-align:right;}
.gb-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:21pt;color:var(--gold-lo);letter-spacing:1px;line-height:1;
}
.gb-vat-note{
  font-family:'DM Mono',monospace;font-size:7.8pt;
  color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-top:4px;
}

/* ─── AUTHORIZATION ─── */
.auth-section{margin:24px 0 0;border-top:2px solid var(--navy);}
.auth-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.auth-col{padding:28px 36px 32px;border-right:1px solid var(--border);}
.auth-col:first-child{padding-left:26px;}
.auth-col:last-child{border-right:none;padding-right:26px;}
.auth-role{
  font-family:'DM Mono',monospace;font-size:6.8pt;color:var(--text-mid);
  text-transform:uppercase;letter-spacing:1.8px;text-align:center;
  padding-top:8px;
}
.auth-sig-space{min-height:1in;}
.auth-sig-line{border-bottom:1.5px dashed var(--navy);}

/* ─── DISCLAIMER ─── */
.disclaimer{
  margin:16px 26px 0;padding:11px 15px;
  border:1px solid var(--border);border-left:3px solid var(--gold);
  background:#fffef8;
  font-size:7.8pt;color:var(--text-mid);line-height:1.8;font-family:'DM Mono',monospace;
}
.disclaimer strong{color:var(--text);}

/* ─── DOCUMENT FOOTER ─── */
.doc-footer{
  display:flex;justify-content:space-between;align-items:center;
  margin:13px 26px 22px;padding-top:9px;
  border-top:1px solid var(--border);
  font-family:'DM Mono',monospace;font-size:7.2pt;color:var(--text-muted);
}
.doc-footer .df-ref{font-weight:500;color:var(--text-mid);}

/* ─── EXPLANATION BOX ─── */
.exp-box{margin:14px 26px 0;border:1px solid #d0d8ea;border-left:4px solid var(--navy);background:#f6f8fc;padding:14px 18px;page-break-inside:avoid;break-inside:avoid;}
.exp-box-title{font-family:'DM Sans',sans-serif;font-weight:700;font-size:8pt;color:var(--navy);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid var(--border-lo);}
.exp-row{display:grid;grid-template-columns:148px 1fr;gap:0 12px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border-lo);}
.exp-row:last-of-type{border-bottom:none;}
.exp-key{font-family:'DM Mono',monospace;font-size:7.5pt;font-weight:600;color:var(--navy);text-transform:uppercase;letter-spacing:0.4px;padding-top:2px;}
.exp-val{font-size:8.5pt;color:var(--text-mid);line-height:1.55;}
.exp-val strong{color:var(--text);}
.exp-formula{margin-top:10px;padding:8px 14px;background:#e8eef8;border:1px solid #c4d0e4;border-radius:2px;font-family:'DM Mono',monospace;font-size:8pt;color:var(--navy);font-weight:600;letter-spacing:0.2px;}
.exp-formula-label{font-size:7pt;font-weight:400;color:var(--text-mid);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.8px;}
/* Slab calculation sub-rows */
tr.calc-row td{background:#f2f5fb !important;color:var(--text-muted);font-size:7.5pt;font-family:'DM Mono',monospace;font-style:italic;padding:2px 10px 4px;border-bottom:1px solid var(--border-lo);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
tr.calc-row td:first-child{padding-left:38px;}

/* ─── RESPONSIVE ─── */
@media(max-width:700px){
  .invoice{margin:0;border-radius:0;}
  .lh{flex-direction:column;gap:14px;padding:16px;}
  .lh-right{text-align:left;}
  .info-grid{grid-template-columns:repeat(2,1fr);margin:0 16px 4px;}
  .info-section-label{padding:12px 16px 6px;}
  .section-head,.section-sub{padding-left:16px;padding-right:16px;}
  thead th:first-child{padding-left:16px;}
  td:first-child,tr.sep td:first-child,tr.sub td:first-child,tr.tot td:first-child,tr.vrow td:first-child,tr.lrow td:first-child,tr.grand td:first-child{padding-left:16px;}
  td:last-child,tr.grand td:last-child{padding-right:16px;}
  .io-summary{grid-template-columns:1fr;grid-template-rows:auto 1px auto;margin:14px 16px 0;}
  .io-divider{height:1px;width:100%;}
  .grand-bar{flex-direction:column;align-items:flex-start;gap:10px;margin:14px 16px 0;padding:16px;}
  .gb-right{text-align:left;}
  .gb-amount{font-size:21pt;}
  .auth-row{grid-template-columns:1fr;gap:0;}
  .auth-col{padding:20px 16px 24px !important;border-right:none !important;}
  .disclaimer,.doc-footer,.cls-strip{margin-left:16px;margin-right:16px;}
  .cls-strip{padding-left:16px;padding-right:16px;}
  .split-warn{padding:8px 16px;}
}

/* ─── FONT SCALE (readability override) ─── */
html{font-size:12pt;}
.lh-logo{font-size:19pt;}
.lh-sub{font-size:9pt;}
.lh-doc-label{font-size:8pt;}
.lh-bill-name{font-size:14pt;}
.lh-meta-lbl{font-size:8pt;}
.lh-meta-val{font-size:9.5pt;}
.lh-badge{font-size:8pt;}
.cls-strip{font-size:8pt;}
.title-band h1{font-size:12pt;}
.title-band p{font-size:9.5pt;}
.split-warn{font-size:10.5pt;}
.info-section-label{font-size:8.5pt;}
.info-label{font-size:8.5pt;}
.info-value{font-size:11pt;}
.section-head>span:first-child{font-size:10.5pt;}
.sh-accent{font-size:9pt;}
.section-sub{font-size:9.5pt;}
table{font-size:10.5pt;}
thead th{font-size:9pt;}
td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){font-size:9.5pt;}
tr.sep td{font-size:9pt;}
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
.gb-amount{font-size:26pt;}
.gb-vat-note{font-size:9.5pt;}
.auth-role{font-size:8.5pt;}
.disclaimer{font-size:9.5pt;}
.doc-footer{font-size:8.5pt;}
.exp-box-title{font-size:9pt;}
.exp-key{font-size:8.5pt;}
.exp-val{font-size:9.5pt;}
.exp-formula{font-size:9pt;}
tr.calc-row td{font-size:8.5pt;}

/* ─── PAGE CONTROL ─── */
.no-break{page-break-inside:avoid;break-inside:avoid;}
@page{margin:10mm 12mm;size:A4 portrait;}
@media print{
  html,body{
    width:210mm;
    font-size:8pt;line-height:1.35;
    color:var(--text);background:#fff !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  .invoice{width:100%;max-width:100%;margin:0;box-shadow:none;border-radius:0;}
  .inv-band{display:none;}

  /* Classification strip */
  .cls-strip{background:#f5f7fb !important;padding:3px 0;border-bottom:0.5pt solid var(--border) !important;}
  .cls-strip .cls-l{font-size:6pt !important;color:var(--text-mid) !important;}
  .cls-strip .cls-r{font-size:5.5pt !important;color:var(--text-muted) !important;}

  /* Letterhead */
  .lh{
    display:flex;justify-content:space-between;align-items:flex-start;
    padding:10px 0 10px;border-bottom:2.5pt solid var(--navy) !important;
    background:#fff !important;
  }
  .lh-left{display:flex;align-items:flex-start;gap:10px;}
  .lh-emblem{width:38px !important;height:38px !important;flex-shrink:0;}
  .lh-logo{
    font-family:'DM Sans',sans-serif;font-weight:900;
    font-size:13pt;letter-spacing:2px;color:var(--navy) !important;
    line-height:1;text-transform:uppercase;
  }
  .lh-rule{width:30px !important;height:2pt !important;background:var(--gold) !important;margin:4px 0 5px !important;}
  .lh-sub{
    font-family:'DM Mono',monospace;font-size:7pt;
    letter-spacing:1px;text-transform:uppercase;color:var(--text-mid) !important;
  }
  .lh-right{text-align:right;}
  .lh-doc-label{
    display:inline-block;
    font-family:'DM Mono',monospace;font-size:6pt;
    letter-spacing:1.5px;text-transform:uppercase;
    color:var(--text-mid) !important;margin-bottom:3px !important;
    border:0.5pt solid var(--border) !important;padding:1px 6px;border-radius:1px;
  }
  .lh-bill-name{
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:10pt;letter-spacing:1px;color:var(--navy) !important;
    text-transform:uppercase;line-height:1.1;margin-bottom:6px !important;
  }
  .lh-meta{border-collapse:collapse;margin-left:auto;}
  .lh-meta-lbl{
    font-family:'DM Mono',monospace;font-size:6pt;
    color:var(--text-muted) !important;text-transform:uppercase;letter-spacing:0.5px;
    padding:1px 8px 1px 0;text-align:left;white-space:nowrap;
  }
  .lh-meta-val{
    font-family:'DM Mono',monospace;font-size:7.5pt;
    color:var(--text) !important;font-weight:600;text-align:right;padding:1px 0;
    white-space:nowrap;
  }
  .lh-badge{
    display:inline-block;margin-top:5px !important;padding:1px 6px;
    border:0.5pt solid var(--border);border-radius:1px;
    font-family:'DM Mono',monospace;font-size:5.5pt;
    letter-spacing:0.5px;text-transform:uppercase;color:var(--text-muted) !important;
  }

  /* Title band */
  .title-band{
    background:#fff !important;padding:6px 0;margin-top:6px;
    border-left:3pt solid var(--gold) !important;
    border-top:0.5pt solid var(--border-lo) !important;
    border-bottom:0.5pt solid var(--border-lo) !important;
  }
  .title-band h1{
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:9pt;letter-spacing:2px;color:var(--navy) !important;
    text-transform:uppercase;
  }
  .title-band p{
    font-size:7pt;color:var(--text-mid) !important;letter-spacing:0.3px;margin-top:2px !important;
  }

  /* Split warning */
  .split-warn{
    display:flex;align-items:baseline;gap:6px;
    background:#fffbeb !important;border-top:2pt solid var(--gold) !important;
    border-bottom:0.5pt solid #f0dfa0 !important;
    padding:4px 0;font-size:7.5pt;color:#5a3a00 !important;
  }
  .sw-icon{font-size:8pt !important;flex-shrink:0;}

  /* Section label */
  .info-section-label{
    font-family:'DM Mono',monospace;font-size:6pt;color:var(--text-muted) !important;
    text-transform:uppercase;letter-spacing:2px;
    padding:6px 0 3px;
  }

  /* Info grid */
  .info-grid{
    display:grid;grid-template-columns:repeat(4,1fr);
    border:0.5pt solid var(--border);border-radius:0;
    margin:0 0 6px;
  }
  .info-cell{
    padding:4px 7px;
    border-right:0.5pt solid var(--border-lo);border-bottom:0.5pt solid var(--border-lo);
    background:#fff !important;
  }
  .info-cell:nth-child(odd){background:var(--bg-cell) !important;}
  .info-label{
    font-family:'DM Mono',monospace;font-size:5.5pt;color:var(--text-muted) !important;
    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px !important;
  }
  .info-value{
    font-family:'DM Mono',monospace;font-size:8pt;color:var(--text) !important;
    font-weight:600;
  }

  /* Section headers */
  .section-head{
    background:#fff !important;margin-top:8px;padding:4px 0;
    border-left:3pt solid var(--gold) !important;
    border-bottom:1.5pt solid var(--navy) !important;
    display:flex;justify-content:space-between;align-items:center;
  }
  .section-head>span:first-child{
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:8pt;letter-spacing:1px;text-transform:uppercase;
    color:var(--navy) !important;
  }
  .sh-accent{
    font-family:'DM Mono',monospace;font-size:6.5pt;font-weight:500;
    letter-spacing:0.3px;white-space:nowrap;
    color:var(--text-mid) !important;border:0.5pt solid var(--border);padding:1px 6px;border-radius:1px;
  }
  /* Color-coded section headers in print */
  .section-head.inside-head{border-left-color:var(--blue) !important;border-bottom-color:var(--blue) !important;background:var(--blue-bg) !important;}
  .section-head.inside-head>span:first-child{color:var(--blue) !important;}
  .section-head.inside-head .sh-accent{border-color:var(--blue-bdr) !important;color:var(--blue) !important;}
  .inside-head+.section-sub{border-left-color:var(--blue) !important;background:#f2f7ff !important;}
  .section-head.outside-head{border-left-color:var(--indigo) !important;border-bottom-color:var(--indigo) !important;background:var(--indigo-bg) !important;}
  .section-head.outside-head>span:first-child{color:var(--indigo) !important;}
  .section-head.outside-head .sh-accent{border-color:var(--indigo-bdr) !important;color:var(--indigo) !important;}
  .outside-head+.section-sub{border-left-color:var(--indigo) !important;background:#f5f0ff !important;}
  .section-head.payable-head{border-left-color:var(--green) !important;border-bottom-color:var(--green) !important;background:var(--green-bg) !important;}
  .section-head.payable-head>span:first-child{color:var(--green) !important;}
  .section-head.payable-head .sh-accent{border-color:var(--green-bdr) !important;color:var(--green) !important;}
  .payable-head+.section-sub{border-left-color:var(--green) !important;background:var(--green-bg) !important;}
  .section-sub{
    background:var(--bg-cell) !important;border-left:3pt solid var(--gold) !important;
    padding:2px 0;font-size:7pt;color:var(--text-mid) !important;
    letter-spacing:0.2px;border-bottom:0.5pt solid var(--border-lo) !important;
  }

  /* Tables */
  table{width:100%;border-collapse:collapse;font-size:7.5pt;}
  thead th{
    background:var(--bg-strip) !important;color:var(--navy) !important;
    border-bottom:1.5pt solid var(--navy) !important;border-top:0.5pt solid var(--border) !important;
    padding:4px 6px;text-align:left;
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:6.5pt;letter-spacing:0.5px;text-transform:uppercase;
    white-space:nowrap;
  }
  thead th:first-child{padding-left:0;width:30%;}
  thead th:nth-child(2){width:18%;}
  thead th:nth-child(3),thead th:nth-child(4){width:11%;text-align:center;}
  thead th:nth-child(5){width:7%;text-align:center;}
  thead th:last-child{width:16%;text-align:right;padding-right:0;}
  td{
    padding:3px 6px;border-bottom:0.5pt solid var(--border-lo) !important;
    vertical-align:middle;color:var(--text-mid) !important;
  }
  td:first-child{padding-left:0;}
  td:last-child{
    text-align:right;font-weight:600;font-family:'DM Mono',monospace;
    color:var(--text) !important;padding-right:0;
  }
  td:nth-child(2){color:var(--text-mid) !important;white-space:nowrap;font-size:7.5pt;font-family:'DM Mono',monospace;}
  td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center;color:var(--text-muted) !important;font-size:7.5pt;font-family:'DM Mono',monospace;}
  tbody tr:nth-child(even) td{background:var(--bg-cell) !important;}
  tr.sep td{
    background:#dde5f2 !important;color:var(--navy-mid) !important;font-weight:700;
    font-size:6pt;letter-spacing:1px;text-transform:uppercase;
    padding:3px 6px !important;border-top:0.5pt solid #c0cadf !important;border-bottom:0.5pt solid #c0cadf !important;
  }
  tr.sub td{background:var(--bg-strip) !important;color:var(--text-mid) !important;}
  tr.sub td:last-child{color:var(--text) !important;font-weight:700;}
  tr.tot td{
    background:#dce4f4 !important;color:var(--navy) !important;font-weight:700;
    border-top:1.5pt solid var(--navy) !important;font-size:8pt;
    padding:3.5px 6px !important;
  }
  tr.vrow td{background:var(--bg-strip) !important;color:var(--text-muted) !important;font-size:7pt;}
  tr.vrow td,tr.lrow td{
    font-family:'DM Mono',monospace;font-style:italic;padding:3px 6px !important;
  }
  tr.lrow td{
    background:var(--bg-strip) !important;color:var(--text-muted) !important;font-size:7pt;
    border-bottom:1.5pt solid var(--border) !important;
  }
  tr.grand td{
    background:#e4eef8 !important;color:var(--navy) !important;font-weight:700;
    font-size:9pt;padding:5px 6px !important;
    border-top:1.5pt solid var(--navy) !important;
  }
  tr.grand td:last-child{color:var(--gold-lo) !important;font-size:11pt;letter-spacing:0.5px;}

  /* Inside / Outside summary */
  .io-summary{
    display:grid;grid-template-columns:1fr 0.5pt 1fr;
    margin:8px 0 0;
    border:0.5pt solid var(--border);border-radius:0;overflow:hidden;
  }
  .io-cell{padding:7px 10px;background:#fff !important;}
  .io-inside{background:var(--blue-bg) !important;border-top:2pt solid var(--blue) !important;}
  .io-outside{background:var(--indigo-bg) !important;border-top:2pt solid var(--indigo) !important;}
  .io-divider{background:var(--border) !important;}
  .io-tag{
    font-family:'DM Mono',monospace;font-size:5.5pt;
    letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px !important;font-weight:600;
  }
  .io-inside .io-tag{color:var(--blue) !important;}
  .io-outside .io-tag{color:var(--indigo) !important;}
  .io-label{font-size:6.5pt;color:var(--text-mid) !important;margin-bottom:3px !important;}
  .io-amount{
    font-family:'DM Sans',sans-serif;font-weight:900;
    font-size:12pt;line-height:1;margin-bottom:3px !important;
  }
  .io-inside .io-amount{color:var(--blue) !important;}
  .io-outside .io-amount{color:var(--indigo) !important;}
  .io-note{font-size:6pt;color:var(--text-muted) !important;}

  /* Grand total bar */
  .grand-bar{
    background:#fffaf0 !important;padding:8px 10px;
    margin:8px 0 0;
    border:0.5pt solid var(--border) !important;border-top:2pt solid var(--gold) !important;
    display:flex;justify-content:space-between;align-items:center;
    border-radius:0;
  }
  .gb-left .gb-label{font-size:8pt !important;color:var(--navy) !important;}
  .gb-left .gb-sub{font-size:6pt !important;color:var(--text-mid) !important;margin-top:2px !important;}
  .gb-right{text-align:right;}
  .gb-amount{font-size:16pt !important;color:var(--gold-lo) !important;letter-spacing:0.5px;}
  .gb-vat-note{font-size:6pt !important;color:var(--text-muted) !important;margin-top:2px !important;}

  /* Authorization */
  .auth-section{margin:10px 0 0;border-top:1.5pt solid var(--navy) !important;}
  .auth-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
  .auth-col{padding:8px 14px 12px;border-right:0.5pt solid var(--border-lo) !important;}
  .auth-col:first-child{padding-left:0 !important;}
  .auth-col:last-child{padding-right:0 !important;border-right:none !important;}
  .auth-role{
    font-family:'DM Mono',monospace;font-size:6pt;color:var(--text-mid) !important;
    text-transform:uppercase;letter-spacing:1.5px;text-align:center;
    padding-top:4px !important;
  }
  .auth-sig-space{min-height:14mm !important;}
  .auth-sig-line{border-bottom:1pt dashed var(--navy) !important;}

  /* Disclaimer */
  .disclaimer{
    margin:8px 0 0;padding:5px 8px;
    border:0.5pt solid var(--border);border-left:2pt solid var(--gold) !important;
    background:#fffef8 !important;
    font-family:'DM Mono',monospace;font-size:6.5pt;color:var(--text-mid) !important;
    line-height:1.45;
  }
  .disclaimer strong{color:var(--text) !important;}

  /* Document footer */
  .doc-footer{
    display:flex;justify-content:space-between;align-items:center;
    margin:6px 0 0;padding-top:4px;
    border-top:0.5pt solid var(--border-lo) !important;
    font-family:'DM Mono',monospace;font-size:6pt;color:var(--text-muted) !important;
  }
  .doc-footer .df-ref{font-weight:500;color:var(--text-mid) !important;}
  .exp-box{margin:5px 0 0;padding:7px 11px;border-left-width:3pt;}
  .exp-box-title{font-size:7pt;margin-bottom:6px;padding-bottom:4px;}
  .exp-row{grid-template-columns:100pt 1fr;gap:0 8px;padding:3px 0;}
  .exp-key{font-size:6.5pt;}
  .exp-val{font-size:7.5pt;}
  .exp-formula{padding:5px 9px;font-size:7pt;margin-top:6px;}
  .exp-formula-label{font-size:6pt;}
  tr.calc-row td{font-size:6.5pt;padding:1px 8px 3px;}
  tr.calc-row td:first-child{padding-left:26px;}
}
</style>
</head>
<body>
<div class="invoice">

  <!-- TOP ACCENT BAND -->
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
    <h1>${title}</h1>
    <p>${subtitle}</p>
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
    <div class="gb-left">
      <div class="gb-label">${grandLabel}</div>
      <div class="gb-sub">BDT &mdash; ${grandSubNote}</div>
    </div>
    <div class="gb-right">
      <div class="gb-amount">${fmt(grandTotal)}</div>
      <div class="gb-vat-note">VAT @ ${(vatRate * 100).toFixed(1)}% included</div>
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
    VAT at <strong>${(vatRate * 100).toFixed(1)}%</strong> is applied on all applicable base charges. Levy is computed separately and is not subject to VAT.
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
  const rowClassAttr = cls ? ` class="${cls}"` : '';
  return `<tr${rowClassAttr}><td>${desc}</td><td>${rate}</td><td>${from}</td><td>${to}</td><td>${days}</td><td>${amt}</td></tr>`;
}

function printTotRow(desc, amt, cls) {
  return `<tr class="${cls || 'tot'}"><td colspan="5">${desc}</td><td>${amt}</td></tr>`;
}

function secHead(label, badge) {
  const badgeHtml = badge ? `<span class="sh-accent">${badge}</span>` : '';
  const cls = /inside/i.test(label) ? ' inside-head' : /outside/i.test(label) ? ' outside-head' : /payable/i.test(label) ? ' payable-head' : '';
  return `<div class="section-head${cls}"><span>${label}</span>${badgeHtml}</div>`;
}

function printCalcRow(rate, weight, days, amt) {
  return `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(rate)}&nbsp;Tk/ton/day &times; ${fmtN(weight)}&nbsp;ton(s) &times; ${days}&nbsp;day(s) = Tk&nbsp;${fmt(amt)}</td></tr>`;
}
function printCalcRowHalf(fullRate, weight, days, amt) {
  return `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(fullRate)}&nbsp;&times;&nbsp;0.50&nbsp;Tk/ton/day &times; ${fmtN(weight)}&nbsp;ton(s) &times; ${days}&nbsp;day(s) = Tk&nbsp;${fmt(amt)}</td></tr>`;
}

function expRow(key, val) {
  return `<div class="exp-row"><span class="exp-key">${key}</span><span class="exp-val">${val}</span></div>`;
}

function buildCarExplanationHtml(b) {
  const rawFd = Number.parseInt(document.getElementById('freeDays')?.value, 10);
  const freeDays = Number.isNaN(rawFd) ? 4 : Math.max(0, rawFd);
  const freeInfo = freeDays === 0
    ? `<strong>No free time</strong> — wharfrent applies from CLD itself (<strong>${fd(b.cld)}</strong>)`
    : `First <strong>${freeDays} day(s)</strong> from CLD are free (no charge). Free period: <strong>${fd(b.cld)}</strong> to <strong>${fd(b.freeEnd)}</strong>`;
  const wharfInfo = b.hasWharfrent
    ? `Starts <strong>${fd(b.storStart)}</strong>. Vehicle billed for <strong>${b.totalDays} chargeable day(s)</strong>.`
    : `Vehicle delivered within free time — <strong>no wharfrent charge applies</strong>.`;
  const splitRow = b.isSplit
    ? expRow('Rate Period', `<strong>Split Billing applied</strong> — old rates used up to 22/07/2024; new (higher) rates from 23/07/2024 onwards. Both periods appear in the table below.`)
    : '';
  return `<div class="exp-box no-break">
<div class="exp-box-title">How This Car Bill Is Calculated</div>
${expRow('CLD', `Cargo Landing Date — your vehicle arrived at the port on <strong>${fd(b.cld)}</strong>`)}
${expRow('Free Time', freeInfo)}
${expRow('Wharfrent', wharfInfo)}
${expRow('Slab System', `Daily rate has <strong>3 tiers</strong>: <strong>Days&nbsp;1–7</strong> (lowest) &rarr; <strong>Days&nbsp;8–14</strong> (mid) &rarr; <strong>Day&nbsp;15+</strong> (highest). Rate increases the longer the vehicle stays.`)}
${expRow('Vehicle Weight', `<strong>${fmtN(b.weight)} ton(s)</strong> — multiplied against the daily rate to get the charge`)}
${expRow('Inside Rate', `Vehicles stored <strong>inside the covered shed</strong> — charged at the <strong>full daily rate</strong>`)}
${expRow('Outside Rate', `Vehicles stored <strong>outside (open yard)</strong> — charged at exactly <strong>half (&frac12;) of the inside rate</strong> for the same period`)}
${expRow('VAT', `Value Added Tax at <strong>${(b.vatRate * 100).toFixed(1)}%</strong> — applied on the total wharfrent + payable charges subtotal`)}
${expRow('Levy', `Fixed regulatory charge — <strong>VAT does not apply</strong> to this amount; added separately`)}
${splitRow}
<div class="exp-formula"><div class="exp-formula-label">Calculation Formula</div>Amount per slab = Rate (Tk/ton/day) &times; ${fmtN(b.weight)} ton(s) &times; Number of days in that slab</div>
</div>`;
}

function buildCargoExplanationHtml(b) {
  const rawFd = Number.parseInt(document.getElementById('c-freeDays')?.value, 10);
  const freeDays = Number.isNaN(rawFd) ? 4 : Math.max(0, rawFd);
  const freeInfo = freeDays === 0
    ? `<strong>No free time</strong> — wharfrent applies from CLD itself (<strong>${fd(b.cld)}</strong>)`
    : `First <strong>${freeDays} day(s)</strong> from CLD are free of charge. Free period: <strong>${fd(b.cld)}</strong> to <strong>${fd(b.freeEnd)}</strong>`;
  const wharfInfo = (b.hasWharfrent || b.isPartBilling)
    ? `Wharfrent starts <strong>${fd(b.storStart)}</strong>. Total chargeable days: <strong>${b.totalDays}</strong>.`
    : `Cargo delivered within free time — <strong>no wharfrent charge applies</strong>.`;
  const tierLabel = getCargoTierLabel(b.totalWeight);
  const pbRow = b.isPartBilling
    ? expRow('Part Billing', `Cargo delivered in <strong>${(b.pbPeriods||[]).filter(p=>!p.invalid).length} stage(s)</strong>. The day-count runs <strong>continuously from CLD</strong> — it does not reset between stages. Only the billable weight changes after each partial delivery.`)
    : '';
  const sdRow = (b.wharfSdInside > 0 || b.wharfSdOutside > 0)
    ? expRow('Self Drive Tons', `Inside SD: <strong>${fmtN(b.wharfSdInside||0)}t</strong>, Outside SD: <strong>${fmtN(b.wharfSdOutside||0)}t</strong> — billed at <strong>Car Billing slab rates</strong> (not GC rates), shown as separate slab rows.`)
    : '';
  return `<div class="exp-box no-break">
<div class="exp-box-title">How This General Cargo Bill Is Calculated</div>
${expRow('CLD', `Cargo Landing Date — goods arrived at the port on <strong>${fd(b.cld)}</strong>`)}
${expRow('Free Time', freeInfo)}
${expRow('Wharfrent', wharfInfo)}
${expRow('Total Weight', `<strong>${fmtN(b.totalWeight)} ton(s)</strong> split into Inside and Outside portions`)}
${expRow('Inside Weight', `<strong>${fmtN(b.insideW)} ton(s)</strong> stored inside the shed — charged at the <strong>full GC daily rate</strong>`)}
${expRow('Outside Weight', `<strong>${fmtN(b.outsideW)} ton(s)</strong> stored outside the shed — charged at <strong>half (&frac12;) of the inside rate</strong>`)}
${expRow('Landing Rate Tier', `Based on total weight <strong>${fmtN(b.totalWeight)}t</strong>: Tier = <strong>${tierLabel}</strong>. Heavier shipments use a higher tier rate.`)}
${expRow('Slab System', `Daily rate has <strong>3 tiers</strong>: <strong>Days&nbsp;1–7</strong> &rarr; <strong>Days&nbsp;8–14</strong> &rarr; <strong>Day&nbsp;15+</strong>. The rate increases the longer the cargo stays.`)}
${expRow('VAT', `<strong>${(b.vatRate * 100).toFixed(1)}%</strong> Value Added Tax — applied on the wharfrent + payable charges subtotal`)}
${expRow('Levy', `Fixed regulatory charge — <strong>VAT-exempt</strong>; added after VAT is calculated`)}
${pbRow}
${sdRow}
<div class="exp-formula"><div class="exp-formula-label">Calculation Formula</div>Inside Wharfrent = Rate (Tk/ton/day) &times; Inside tons &times; Days &nbsp;|&nbsp; Outside Wharfrent = (Rate &times; Outside tons &times; Days) &divide; 2</div>
</div>`;
}

function openPrintPreview(html, title, billRef, isCargo) {
  const dialog   = document.getElementById('ppvDialog');
  const frame    = document.getElementById('ppvFrame');
  const titleEl  = document.getElementById('ppvTitle');
  const refEl    = document.getElementById('ppvRef');
  const bar      = document.getElementById('ppvBar');
  const printBtn = document.getElementById('ppvPrintBtn');
  const closeBtn = document.getElementById('ppvCloseBtn');

  const accentColor = isCargo ? 'var(--sky)' : 'var(--gold)';
  const btnTextColor = '#fff';
  bar.style.borderTopColor = accentColor;
  bar.querySelector('.ppv-logo-mark').style.color = accentColor;
  printBtn.style.background = accentColor;
  printBtn.style.color = btnTextColor;

  titleEl.textContent = title;
  refEl.textContent = billRef;

  frame.style.height = '';
  frame.onload = () => {
    try {
      const h = frame.contentDocument.documentElement.scrollHeight;
      if (h > 200) frame.style.height = (h + 40) + 'px';
    } catch (e) {}
  };
  frame.srcdoc = html;

  printBtn.onclick = () => {
    const fw = frame.contentWindow;
    if (!fw) return;
    const fontsApi = frame.contentDocument && 'fonts' in frame.contentDocument
      ? frame.contentDocument.fonts : null;
    if (fontsApi) {
      fontsApi.ready.finally(() => setTimeout(() => fw.print(), 180));
    } else {
      setTimeout(() => fw.print(), 600);
    }
  };

  closeBtn.onclick = () => dialog.close();
  dialog.onclose = () => { frame.srcdoc = ''; frame.style.height = ''; };

  dialog.showModal();
}

function printBill(type) {
  // NOSONAR
  const b = type === 'car' ? lastCarBill : lastCargoBill;
  if (!b) {
    showToast('Generate the bill first before printing.', 'warning');
    return;
  }
  try {
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const refCode = type === 'cargo' ? 'GC' : type.toUpperCase();
  const billRef = `PB-${refCode}-${Date.now().toString().slice(-8)}`;

  let sectionsHtml = '';
  let grandTotal, grandLabel;
  let infoHtml, opts;

  if (type === 'car') {
    // ── INFO GRID ──
    const rateMode =
      b.rateMode === 'split' ? 'Split (Old + New)' :
      b.rateMode === 'old'   ? 'Old Rates (Pre-23/07/2024)' :
                               'New Rates (From 23/07/2024)';
    infoHtml = `<div class="info-grid">
      <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
      <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
      <div class="info-cell"><div class="info-label">Car Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : '—'}</div></div>
      <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
      <div class="info-cell"><div class="info-label">Vehicle Weight</div><div class="info-value">${b.weight} ton(s)</div></div>
      <div class="info-cell"><div class="info-label">Car Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + ' days' : 'Free Time'}</div></div>
      <div class="info-cell"><div class="info-label">Rate Mode</div><div class="info-value">${rateMode}</div></div>
      <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(1)}%</div></div>
    </div>`;

    // ── SECTIONS ──
    if (b.hasWharfrent) {
      ['inside', 'outside'].forEach(side => {
        // NOSONAR
        const isIn = side === 'inside';
        const storAmt = isIn ? b.insideStor : b.outsideHalf;
        const baseAmt = isIn ? b.iBase : b.oBase;
        const vatAmt = isIn ? b.iVat : b.oVat;
        const levyAmt = isIn ? b.iLevy : b.oLevy;
        const totAmt = isIn ? b.iTotal : b.oTotal;
        let rows = '';
        if (b.isSplit) {
          const oldS = b.slabs.filter(s => s.group === 'old');
          const newS = b.slabs.filter(s => s.group === 'new');
          if (oldS.length) {
            rows += `<tr class="sep"><td colspan="6">OLD RATE PERIOD — Up to 22/07/2024</td></tr>`;
            oldS.forEach(s => {
              const da = isIn ? s.amt : s.amt / 2;
              rows += printTr(s.label, `${fmtN(s.rate)}/t/d${isIn ? '' : ' × 0.50'}`, fd(s.from), fd(s.to), s.days, fmt(da));
              rows += isIn ? printCalcRow(s.rate, b.weight, s.days, da) : printCalcRowHalf(s.rate, b.weight, s.days, da);
            });
          }
          if (newS.length) {
            rows += `<tr class="sep"><td colspan="6">NEW RATE PERIOD — From 23/07/2024</td></tr>`;
            newS.forEach(s => {
              const da = isIn ? s.amt : s.amt / 2;
              rows += printTr(s.label, `${fmtN(s.rate)}/t/d${isIn ? '' : ' × 0.50'}`, fd(s.from), fd(s.to), s.days, fmt(da));
              rows += isIn ? printCalcRow(s.rate, b.weight, s.days, da) : printCalcRowHalf(s.rate, b.weight, s.days, da);
            });
          }
        } else {
          b.slabs.forEach(s => {
            const da = isIn ? s.amt : s.amt / 2;
            rows += printTr(s.label, `${fmtN(s.rate)}/t/d${isIn ? '' : ' × 0.50'}`, fd(s.from), fd(s.to), s.days, fmt(da));
            rows += isIn ? printCalcRow(s.rate, b.weight, s.days, da) : printCalcRowHalf(s.rate, b.weight, s.days, da);
          });
        }
        rows += printTotRow(
          `Car Wharfrent Sub-Total${isIn ? ' (Full Rate)' : ' (Half Rate = Inside ÷ 2)'} — ${b.totalDays} chargeable day(s)`,
          fmt(storAmt), 'sub'
        );
        if (b.payables.length > 0) {
          rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
          b.payables.forEach(p => {
            rows += printTr(p.label, `${p.rateStr ?? fmtN(p.rate)}/ton`, `${b.weight} ton(s)`, '—', '—', fmt(p.amt), 'sub');
            rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(b.weight)}&nbsp;ton(s) = Tk&nbsp;${fmt(p.amt)}</td></tr>`;
          });
        }
        rows += printTotRow('Total Bill (Base for VAT)', fmt(baseAmt));
        rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%  ·  ${fmt(baseAmt)} × ${(b.vatRate * 100).toFixed(1)}% = ${fmt(vatAmt)}`, fmt(vatAmt), 'vrow');
        rows += printTotRow('Levy Charge (VAT-exempt)', fmt(levyAmt), 'lrow');
        rows += printTotRow(`${isIn ? 'INSIDE' : 'OUTSIDE'} GRAND TOTAL`, fmt(totAmt), 'grand');
        const headLabel = isIn ? 'INSIDE WHARFRENT' : 'OUTSIDE WHARFRENT';
        const headBadge = isIn ? `${fmtN(b.weight)} ton(s) — Full Rate` : `${fmtN(b.weight)} ton(s) — ½ Rate`;
        const subNote = isIn ? 'Full rate — inside shed / warehouse' : '½ rate — outside shed / warehouse';
        sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      });
      grandTotal = b.iTotal + b.oTotal;
      grandLabel = 'CAR GRAND TOTAL';
    } else {
      let rows = '';
      b.payables.forEach(p => {
        rows += printTr(p.label, `${p.rateStr ?? fmtN(p.rate)}/ton`, `${b.weight} ton(s)`, '—', '—', fmt(p.amt), 'sub');
        rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(b.weight)}&nbsp;ton(s) = Tk&nbsp;${fmt(p.amt)}</td></tr>`;
      });
      rows += printTotRow('Total Payable (Base for VAT)', fmt(b.nBase));
      rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%  ·  ${fmt(b.nBase)} × ${(b.vatRate * 100).toFixed(1)}% = ${fmt(b.nVat)}`, fmt(b.nVat), 'vrow');
      rows += printTotRow('Levy Charge (VAT-exempt)', fmt(b.nLevy), 'lrow');
      rows += printTotRow('GRAND TOTAL', fmt(b.nTotal), 'grand');
      sectionsHtml += `${secHead('PAYABLE CHARGES', 'Within Free Time')}<div class="section-sub">No wharfrent — delivery within free storage period</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      grandTotal = b.nTotal;
      grandLabel = 'CAR GRAND TOTAL';
    }
    opts = {
      title: 'CAR BILL',
      subtitle: 'Port Authority — Car Wharfrent & Payable Charges',
      billRef,
      today,
      infoHtml,
      sectionsHtml,
      grandTotal,
      grandLabel,
      vatRate: b.vatRate,
      isSplit: b.isSplit,
      showSplit: b.hasWharfrent,
      insideLabel: 'Inside Wharfrent',
      outsideLabel: 'Outside Wharfrent (½ Rate)',
      iTotal: b.hasWharfrent ? b.iTotal : 0,
      oTotal: b.hasWharfrent ? b.oTotal : 0,
      totalLevy: b.levyAmt || 0,
    };
  } else {
    // ── CARGO INFO GRID ──
    if (b.isPartBilling) {
      const vp = (b.pbPeriods || []).filter(p => !p.invalid);
      const firstDel = vp.length > 0 ? fd(vp[0].deliveryDate) : '—';
      const lastDel  = vp.length > 0 ? fd(vp[vp.length - 1].deliveryDate) : '—';
      infoHtml = `<div class="info-grid">
        ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ''}
        ${b.cnfName  ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ''}
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
        <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(1)}%</div></div>
      </div>`;
    } else {
      infoHtml = `<div class="info-grid">
        ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ''}
        ${b.cnfName  ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ''}
        <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
        <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : '—'}</div></div>
        <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
        <div class="info-cell"><div class="info-label">Total Weight</div><div class="info-value">${fmtN(b.totalWeight)} ton(s)</div></div>
        <div class="info-cell"><div class="info-label">Inside / Outside</div><div class="info-value">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + ' days' : 'Free Time'}</div></div>
        <div class="info-cell"><div class="info-label">Landing Tier</div><div class="info-value">${getCargoTierLabel(b.totalWeight)}</div></div>
        <div class="info-cell"><div class="info-label">River Dues</div><div class="info-value">${nn('c-rRiver')} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">Landing Rate</div><div class="info-value">${b.dynamicLandingRate} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">Removal Rate</div><div class="info-value">${b.dynamicRemovalRate} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(1)}%</div></div>
      </div>`;
    }

    // ── CARGO SECTIONS ──
    const includeWharfrent = cargoIncludeWharfrent;
    if (b.isPartBilling && includeWharfrent) {
      ['inside', 'outside'].forEach(side => {
        sectionsHtml += buildPartBillingPrintSection(b, side);
      });
      const _rp = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
      const _pbIn  = (() => { const base = _rp(b.iBase - (cargoIncludePayables ? 0 : b.insidePaySub));  return _rp(base + _rp(base * b.vatRate) + (cargoIncludePayables ? b.iLevy : 0)); })();
      const _pbOut = (() => { const base = _rp(b.oBase - (cargoIncludePayables ? 0 : b.outsidePaySub)); return _rp(base + _rp(base * b.vatRate) + (cargoIncludePayables ? b.oLevy : 0)); })();
      grandTotal = _pbIn + _pbOut;
      grandLabel = 'GENERAL CARGO GRAND TOTAL — PART BILLING';
    } else if (b.hasWharfrent && includeWharfrent) {
      ['inside', 'outside'].forEach(side => {
        const isIn = side === 'inside';
        const normalSlabs  = isIn ? b.insideSlabs    : b.outsideSlabs;
        const sdSlabs      = isIn ? (b.insideSdSlabs  || []) : (b.outsideSdSlabs || []);
        const normalW      = isIn ? b.insideNormalW  : b.outsideNormalW;
        const sdW          = isIn ? b.wharfSdInside  : b.wharfSdOutside;
        const wharfAmt     = isIn ? b.insideWharfrent : b.outsideWharfrent;
        const weight       = isIn ? b.insideW : b.outsideW;
        const rp = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
        const rawBillPayables = isIn ? b.insidePayables : b.outsidePayables;
        const filteredPayables = cargoIncludePayables ? rawBillPayables : [];
        const paySubAdj = cargoIncludePayables ? 0 : (isIn ? b.insidePaySub : b.outsidePaySub);
        const baseAmt = rp((isIn ? b.iBase : b.oBase) - paySubAdj);
        const vatAmt  = rp(baseAmt * b.vatRate);
        const levyAmt = cargoIncludePayables ? (isIn ? b.iLevy : b.oLevy) : 0;
        const totAmt  = rp(baseAmt + vatAmt + levyAmt);
        const rateSuffix   = isIn ? '' : ' × 0.50';
        let rows = '';
        // Normal GC-rate slabs
        normalSlabs.forEach(s => {
          const da = isIn ? s.amt  : s.amt  / 2;
          rows += printTr(s.label, `${fmtN(s.rate)}/t/d${rateSuffix}`, fd(s.from), fd(s.to), s.days, fmt(da));
          rows += isIn ? printCalcRow(s.rate, normalW, s.days, da) : printCalcRowHalf(s.rate, normalW, s.days, da);
        });
        // Self-drive Car-rate slabs
        if (sdSlabs.length > 0) {
          rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
          sdSlabs.forEach(s => {
            const da = isIn ? s.amt  : s.amt  / 2;
            rows += printTr(s.label, `${fmtN(s.rate)}/t/d${rateSuffix}`, fd(s.from), fd(s.to), s.days, fmt(da));
            rows += isIn ? printCalcRow(s.rate, sdW, s.days, da) : printCalcRowHalf(s.rate, sdW, s.days, da);
          });
        }
        const wharfrentHalfNote = isIn ? '' : ' (½ Rate)';
        if (normalSlabs.length > 0 && sdSlabs.length > 0) {
          const normalAmt = isIn ? normalSlabs.reduce((a, s) => a + s.amt, 0) : normalSlabs.reduce((a, s) => a + s.amt, 0) / 2;
          const sdAmt     = isIn ? sdSlabs.reduce((a, s) => a + s.amt, 0)     : sdSlabs.reduce((a, s) => a + s.amt, 0)     / 2;
          rows += printTotRow(`GC Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(normalW)} normal ton(s) × ${b.totalDays} day(s)`, fmt(normalAmt), 'sub');
          rows += printTotRow(`Self Drive Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(sdW)} SD ton(s) × ${b.totalDays} day(s)`, fmt(sdAmt), 'sub');
        } else {
          const subLbl = sdSlabs.length > 0
            ? `Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(sdW)} ton(s) × ${b.totalDays} day(s)`
            : `Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(weight)} ton(s) × ${b.totalDays} day(s)`;
          rows += printTotRow(subLbl, fmt(wharfAmt), 'sub');
        }
        if (filteredPayables.length > 0) {
          rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
          filteredPayables.forEach(p => {
            rows += printTr(p.label, `${fmtN(p.rate)}/ton`, `${fmtN(p.tons)} ton(s)`, '—', '—', fmt(p.amt), 'sub');
            rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(p.tons)}&nbsp;ton(s) = Tk&nbsp;${fmt(p.amt)}</td></tr>`;
          });
        }
        rows += printTotRow('Total Bill (Base for VAT)', fmt(baseAmt));
        rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%  ·  ${fmt(baseAmt)} × ${(b.vatRate * 100).toFixed(1)}% = ${fmt(vatAmt)}`, fmt(vatAmt), 'vrow');
        rows += printTotRow('Levy Charge (VAT-exempt)', fmt(levyAmt), 'lrow');
        rows += printTotRow(`${isIn ? 'INSIDE' : 'OUTSIDE'} GRAND TOTAL`, fmt(totAmt), 'grand');
        const headLabel = isIn ? `INSIDE WHARFRENT` : `OUTSIDE WHARFRENT`;
        const sdWp = isIn ? (b.wharfSdInside || 0) : (b.wharfSdOutside || 0);
        const wWp  = isIn ? b.insideW : b.outsideW;
        const headBadge = sdWp > 0
          ? (isIn ? `${fmtN(wWp - sdWp)}t Normal + ${fmtN(sdWp)}t SD — Full Rate` : `${fmtN(wWp - sdWp)}t Normal + ${fmtN(sdWp)}t SD — ½ Rate`)
          : (isIn ? `${fmtN(b.insideW)} ton(s) — Full Rate` : `${fmtN(b.outsideW)} ton(s) — ½ Rate`);
        const subNote = isIn ? 'Full rate — inside shed / warehouse' : '½ rate — outside shed / warehouse';
        sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      });
      const adjIn  = (() => { const rp = v => Math.floor(v*100+0.5-1e-9)/100; const base = rp(b.iBase - (cargoIncludePayables ? 0 : b.insidePaySub));  const vat = rp(base * b.vatRate); const levy = cargoIncludePayables ? b.iLevy : 0; return rp(base + vat + levy); })();
      const adjOut = (() => { const rp = v => Math.floor(v*100+0.5-1e-9)/100; const base = rp(b.oBase - (cargoIncludePayables ? 0 : b.outsidePaySub)); const vat = rp(base * b.vatRate); const levy = cargoIncludePayables ? b.oLevy : 0; return rp(base + vat + levy); })();
      grandTotal = adjIn + adjOut;
      grandLabel = 'GENERAL CARGO GRAND TOTAL';
    } else {
      // Payable-only: either free time OR wharfrent toggled off
      let rows = '';
      const rawPayList = cargoIncludePayables
        ? (b.payables && b.payables.length > 0 ? b.payables : [...(b.insidePayables || []), ...(b.outsidePayables || [])])
        : [];
      // When wharfrent is excluded, merge inside+outside rows of the same charge into one total-tons row
      const payList = !includeWharfrent
        ? (() => {
            const map = new Map();
            rawPayList.forEach(p => {
              if (map.has(p.label)) {
                const e = map.get(p.label);
                e.tons = (e.tons || 0) + (p.tons || 0);
                e.amt  = (e.amt  || 0) + (p.amt  || 0);
              } else {
                map.set(p.label, { ...p, tons: p.tons || 0, amt: p.amt || 0 });
              }
            });
            return [...map.values()];
          })()
        : rawPayList;
      payList.forEach(p => {
        const tons = p.tons ?? b.totalWeight;
        rows += printTr(p.label, `${fmtN(p.rate)}/ton`, `${fmtN(tons)} ton(s)`, '—', '—', fmt(p.amt), 'sub');
        rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(tons)}&nbsp;ton(s) = Tk&nbsp;${fmt(p.amt)}</td></tr>`;
      });
      const adjNBase = cargoIncludePayables ? b.nBase : 0;
      const adjNVat  = cargoIncludePayables ? b.nVat  : 0;
      const adjNLevy = cargoIncludePayables ? b.nLevy : 0;
      const adjNTotal = adjNBase + adjNVat + adjNLevy;
      if (adjNBase > 0) rows += printTotRow('Total Payable (Base for VAT)', fmt(adjNBase));
      if (adjNVat  > 0) rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%  ·  ${fmt(adjNBase)} × ${(b.vatRate * 100).toFixed(1)}% = ${fmt(adjNVat)}`, fmt(adjNVat), 'vrow');
      if (adjNLevy > 0) rows += printTotRow('Levy Charge (VAT-exempt)', fmt(adjNLevy), 'lrow');
      rows += printTotRow('GRAND TOTAL', fmt(adjNTotal), 'grand');
      const payableBadge = `${fmtN(b.totalWeight)} ton(s)${!includeWharfrent ? ' — Wharfrent Excluded' : ' — Within Free Time'}`;
      const payableNote  = !includeWharfrent
        ? 'Wharfrent charges excluded — payable charges only'
        : 'No wharfrent — delivery within free storage period';
      sectionsHtml += `${secHead('PAYABLE CHARGES', payableBadge)}<div class="section-sub">${payableNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      grandTotal = adjNTotal;
      grandLabel = 'GENERAL CARGO GRAND TOTAL';
    }
    // Charge composition breakdown — only when wharfrent is included
    if (includeWharfrent && cargoIncludePayables) sectionsHtml += buildCargoBreakdownPrintHtml(b);
    const hasW = (b.hasWharfrent || b.isPartBilling) && includeWharfrent;
    opts = {
      title: !includeWharfrent ? 'GENERAL CARGO BILL — PAYABLE CHARGES' : (b.isPartBilling ? 'GENERAL CARGO BILL — PART BILLING' : 'GENERAL CARGO BILL'),
      subtitle: !includeWharfrent
        ? 'Port Authority — Payable Charges Only (Wharfrent Excluded)'
        : (b.isPartBilling
            ? `Port Authority — General Cargo Part Billing · ${(b.pbPeriods||[]).filter(p=>!p.invalid).length} delivery stages`
            : 'Port Authority — General Cargo Wharfrent & Payable Charges'),
      billRef,
      today,
      infoHtml,
      sectionsHtml,
      grandTotal,
      grandLabel,
      vatRate: b.vatRate,
      isSplit: false,
      showSplit: hasW,
      insideLabel: `Inside Wharfrent${b.isPartBilling ? ' — Part Billing' : ''}`,
      outsideLabel: `Outside Wharfrent (½ Rate)${b.isPartBilling ? ' — Part Billing' : ''}`,
      iTotal: hasW ? b.iTotal : 0,
      oTotal: hasW ? b.oTotal : 0,
      totalLevy: b.totalLevy || 0,
    };
  }

  const html = buildInvoiceHtml(opts);
  openPrintPreview(html, opts.title, billRef, type === 'cargo');
  } catch (e) {
    console.error('printBill error', e);
    showToast('Error building print preview. Please try again.', 'error');
  }
}

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
document.getElementById('year').textContent = new Date().getFullYear();
globalThis.scrollTo(0, 0);
try { history.scrollRestoration = 'manual'; } catch (_) {}

// Native <dialog> event wiring
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', e => {
  if (e.target === overlay) closeModal();
});
overlay.addEventListener('cancel', e => {
  e.preventDefault();
  closeModal();
});

// Tab keyboard navigation (arrow keys)
document.querySelector('.module-tabs').addEventListener('keydown', e => {
  const tabs = [...document.querySelectorAll('.tab-btn')];
  const idx = tabs.indexOf(document.activeElement);
  if (idx === -1) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    tabs[(idx + 1) % tabs.length].focus();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    tabs[(idx - 1 + tabs.length) % tabs.length].focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    document.activeElement.click();
  }
});

const formatDateForInput = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};
const today = new Date();
document.getElementById('cld').value = formatDateForInput(today);
document.getElementById('delivery').value = formatDateForInput(today);
document.getElementById('c-cld').value = formatDateForInput(today);
document.getElementById('c-delivery').value = formatDateForInput(today);

setTimeout(() => {
  globalThis.calendarPickers['cld'] = new CalendarPicker('cld');
  globalThis.calendarPickers['delivery'] = new CalendarPicker('delivery');
  globalThis.calendarPickers['c-cld'] = new CalendarPicker('c-cld');
  globalThis.calendarPickers['c-delivery'] = new CalendarPicker('c-delivery');
}, 100);

loadSavedRates();
carRefresh();
cargoRefresh();
isInitialLoad = false;

// Card stagger animations
document.querySelectorAll('.card').forEach((card, i) => {
  card.style.setProperty('--card-delay', `${0.7 + i * 0.1}s`);
});

// Hidden admin access: Ctrl+Shift+Click anywhere
document.addEventListener('mousedown', e => {
  if (e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    toggleAdmin();
  }
});


// Floating particles
(function () {
  const container = document.createElement('div');
  container.className = 'particle-container';
  document.body.appendChild(container);
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 8}s`;
    p.style.animationDuration = `${6 + Math.random() * 4}s`;
    const sz = 2 + Math.random() * 4;
    p.style.width = sz + 'px';
    p.style.height = sz + 'px';
    container.appendChild(p);
  }
})();
