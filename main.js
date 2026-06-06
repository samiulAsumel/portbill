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
  document.getElementById('adminTxt').textContent = isAdmin
    ? 'Logout'
    : '🔒 Admin';
  document.getElementById('modeBadge').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('modeBadge').textContent = isAdmin ? 'ADMIN' : 'USER';
  isAdmin
    ? document.getElementById('adminBtn').classList.add('active')
    : document.getElementById('adminBtn').classList.remove('active');

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
  const freeDays =
    Number.parseInt(document.getElementById('freeDays').value, 10) || 4;
  const freeEnd = addD(cld, freeDays - 1);
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
    const cld_ = pd(document.getElementById('cld').value);
    const fd_ =
      Number.parseInt(document.getElementById('freeDays').value, 10) || 4;
    const freeEnd = addD(cld_, fd_ - 1);
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
      ftDaysEl.innerHTML =
        '<span style="color:var(--m2)">Free: </span>' +
        dayLabels
          .map(
            d =>
              `<span style="background:rgba(212,175,55,0.13);border:1px solid rgba(212,175,55,0.20);color:var(--gold);border-radius:4px;padding:1px 7px;margin:0 2px;">${d}</span>`
          )
          .join('') +
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
        ? 'Car Wharfrent Sub Total'
        : 'Car Wharfrent (½) Sub Total';
    if (b.hasWharfrent) {
      if (b.isSplit) {
        const oldS = b.slabs.filter(s => s.group === 'old');
        const newS = b.slabs.filter(s => s.group === 'new');
        if (oldS.length) {
          rows += `<tr class="sep"><td colspan="6">◀ OLD RATES — Up to 22/07/2024</td></tr>`;
          oldS.forEach(s => {
            const da = side === 'inside' ? s.amt : s.amt / 2;
            rows += `<tr><td>${s.label}</td><td style="color:var(--red)">${fmtN(side === 'inside' ? s.rate : s.rate / 2)}/t/d</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
          });
        }
        if (newS.length) {
          rows += `<tr class="sep"><td colspan="6">▶ NEW RATES — From 23/07/2024</td></tr>`;
          newS.forEach(s => {
            const da = side === 'inside' ? s.amt : s.amt / 2;
            rows += `<tr><td>${s.label}</td><td style="color:var(--green)">${fmtN(side === 'inside' ? s.rate : s.rate / 2)}/t/d</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
          });
        }
      } else {
        b.slabs.forEach(s => {
          const da = side === 'inside' ? s.amt : s.amt / 2;
          rows += `<tr><td>${s.label}</td><td>${fmtN(side === 'inside' ? s.rate : s.rate / 2)}/t/d</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(da)}</td></tr>`;
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
    rows += `<tr class="tot"><td colspan="5">Total Car Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr><tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(vatAmt)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(levyAmt)}</td></tr><tr class="grand"><td colspan="5">Car Grand Total</td><td>${fmt(totalAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${p.rateStr ?? fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Car Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">Car Grand Total</td><td>${fmt(b.nTotal)}</td></tr>`;
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
      `<div class="sc cg"><div class="sl">Car Grand Total</div><div class="sv">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside Car Wharfrent Bill</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div><div class="sc cp"><div class="sl">Outside Car Wharfrent Bill</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div>`;
    document.getElementById('car-insideSec').innerHTML =
      `<div style="margin-bottom:20px;">${b.isSplit ? '<div class="warn">⚡ Split billing — old rates up to 22/07/2024, new rates from 23/07/2024</div>' : ''}<div class="slbl sl-in">▪ Car Wharfrent Charge — INSIDE</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, 'inside')}</div></div>`;
    document.getElementById('car-outsideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="slbl sl-out">▪ Car Wharfrent Charge — OUTSIDE (½ rate)</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, 'outside')}</div></div>`;
  } else {
    document.getElementById('car-insideSec').innerHTML =
      '<div class="no-stor-note">✓ Delivery within free time — no Car Wharfrent charge applies.</div>';
    document.getElementById('car-outsideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Only Car Payable Charges — INSIDE/OUTSIDE</div><div class="card" style="padding:0;overflow:hidden;">${buildCarBillTable(b, 'noWharfrent')}</div></div>`;
  }
  const grand = b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
  const carGrandSplitHtml = b.hasWharfrent
    ? `<div><div class="glbl">Inside Car Grand Total</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">Incl. VAT &amp; Levy</div></div><div><div class="glbl">Outside Car Grand Total</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">Incl. VAT &amp; Levy</div></div>`
    : `<div><div class="glbl">Car Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No Car Wharfrent — flat only</div></div><div></div>`;
  document.getElementById('car-grandSec').innerHTML =
    `<div class="gbox"><div class="ginn">${carGrandSplitHtml}<div class="gfin"><div class="glbl">CAR GRAND TOTAL</div><div class="gval">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;
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
  if (!valid && showAlert) {
    alert(`⚠ ${msg}`);
  }
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
  if (!valid && showAlert) {
    alert(`⚠ ${msg}`);
  }
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
  if (!valid && showAlert) alert(`⚠ ${insideMsg || outsideMsg}`);
  return valid;
}

// ════════════════════════════════════════
//  ── PART BILLING ──
// ════════════════════════════════════════
let partBillingStages = [{ date: '', insideAfter: 0, outsideAfter: 0 }];
let partBillingUpToDate = false;
let cargoIncludeWharfrent = true;

function onCargoWharfrentToggle() {
  cargoIncludeWharfrent = !!document.getElementById('c-chkPrintWharfrent')?.checked;
}

function onPartBillingChange() {
  const enabled = !!document.getElementById('c-partBilling')?.checked;
  const pbCard = document.getElementById('c-pbStagesCard');
  const deliveryFg = document.getElementById('c-deliveryFg');
  if (enabled) {
    if (partBillingStages.length === 0) {
      partBillingStages = [{ date: document.getElementById('c-delivery').value || '', insideAfter: 0, outsideAfter: 0 }];
    } else if (!partBillingStages[0].date) {
      partBillingStages[0].date = document.getElementById('c-delivery').value || '';
    }
    if (pbCard) pbCard.style.display = '';
    if (deliveryFg) deliveryFg.style.display = 'none';
    // Turn off all payable charges by default
    ['c-chkRiver','c-chkLanding','c-chkRemoval','c-chkWeighment','c-chkHoisting','c-chkLevy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    renderPartBillingStages();
  } else {
    if (pbCard) pbCard.style.display = 'none';
    if (deliveryFg) deliveryFg.style.display = '';
    // Restore all payable charges when Part Billing is turned off
    ['c-chkRiver','c-chkLanding','c-chkRemoval','c-chkWeighment','c-chkHoisting','c-chkLevy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = true;
    });
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
  container.innerHTML = partBillingStages.map((stage, idx) => {
    const isFirst = idx === 0;
    const periodLabel = isFirst ? '1st Delivery' : `${idx + 1}${['th','st','nd','rd'][Math.min(idx,3)]} Delivery`;
    const maxIn  = pbMaxWeight(idx, 'inside');
    const maxOut = pbMaxWeight(idx, 'outside');
    // Clamp stored values immediately in case a prior stage's balance was reduced
    if ((stage.insideAfter  || 0) > maxIn)  { partBillingStages[idx].insideAfter  = maxIn;  stage.insideAfter  = maxIn; }
    if ((stage.outsideAfter || 0) > maxOut) { partBillingStages[idx].outsideAfter = maxOut; stage.outsideAfter = maxOut; }
    return `<div class="pb-stage-row" id="pb-stage-${idx}">
      <div class="pb-stage-header">
        <span class="pb-stage-num">Stage ${idx + 1} — ${periodLabel}</span>
        ${!isFirst ? `<button type="button" class="pb-remove-btn" onclick="removePartBillingStage(${idx})">✕ Remove</button>` : ''}
      </div>
      <div class="r2">
        <div class="fg">
          <label class="lbl" for="pb-date-${idx}">Delivery Date</label>
          <input type="text" id="pb-date-${idx}" class="cargo-glow" placeholder="DD/MM/YYYY" maxlength="10"
            value="${stage.date}"
            oninput="formatDate(this); partBillingStages[${idx}].date=this.value; cargoRefresh();"
          />
        </div>
        <div class="fg">
          <div class="pb-stage-weight-label">Remaining Balance After This Delivery</div>
          <div class="r2" style="gap:8px;margin-top:0;">
            <div class="fg">
              <label class="lbl pb-bal-lbl" for="pb-inside-${idx}"><span style="color:var(--blue);">Inside (tons)</span>${maxIn > 0 ? `<span class="pb-max-note">max ${maxIn}</span>` : ''}</label>
              <input type="number" id="pb-inside-${idx}" class="cargo-glow pb-balance-input" value="${stage.insideAfter}"
                min="0" ${maxIn > 0 ? `max="${maxIn}"` : ''} step="1"
                oninput="pbBalanceChange(${idx},'inside',+this.value);"
              />
            </div>
            <div class="fg">
              <label class="lbl pb-bal-lbl" for="pb-outside-${idx}"><span style="color:var(--purple);">Outside (tons)</span>${maxOut > 0 ? `<span class="pb-max-note">max ${maxOut}</span>` : ''}</label>
              <input type="number" id="pb-outside-${idx}" class="cargo-glow pb-balance-input" value="${stage.outsideAfter}"
                min="0" ${maxOut > 0 ? `max="${maxOut}"` : ''} step="1"
                oninput="pbBalanceChange(${idx},'outside',+this.value);"
              />
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
  const init = Math.max(0, Math.round(parseFloat(document.getElementById(side === 'inside' ? 'c-inside' : 'c-outside')?.value) || 0));
  return idx === 0 ? init : Math.max(0, partBillingStages[idx - 1][side === 'inside' ? 'insideAfter' : 'outsideAfter'] || 0);
}

function pbBalanceChange(idx, side, rawVal) {
  const key = side === 'inside' ? 'insideAfter' : 'outsideAfter';
  const maxVal = pbMaxWeight(idx, side);
  const clamped = Math.min(maxVal, Math.max(0, Math.round(rawVal || 0)));
  partBillingStages[idx][key] = clamped;
  const inp = document.getElementById(`pb-${side}-${idx}`);
  if (inp && +inp.value !== clamped) inp.value = clamped;
  // Cascade clamp to all subsequent stages
  for (let i = idx + 1; i < partBillingStages.length; i++) {
    const prevVal = partBillingStages[i - 1][key] || 0;
    if ((partBillingStages[i][key] || 0) > prevVal) {
      partBillingStages[i][key] = prevVal;
      const next = document.getElementById(`pb-${side}-${i}`);
      if (next) { next.value = prevVal; next.max = prevVal; }
    }
  }
  cargoRefresh();
}

function addPartBillingStage() {
  partBillingStages.push({ date: '', insideAfter: 0, outsideAfter: 0 });
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

// Compute multi-period wharfrent for part billing mode
// Slab progression never resets — daysOffset accumulates from original CLD
function computePartBillingWharfrent(cld, freeEnd, storStart, initialInside, initialOutside, or1, or2, or3) { //NOSONAR
  const periods = [];
  let hasWharfrent = false;
  let totalDays = 0;
  for (let i = 0; i < partBillingStages.length; i++) {
    const stage = partBillingStages[i];
    const deliveryDate = pd(stage.date);
    const prevEnd   = i === 0 ? freeEnd : pd(partBillingStages[i - 1].date);
    const blockStart = i === 0 ? storStart : addD(prevEnd, 1);
    const insideW   = i === 0 ? initialInside  : Math.max(0, partBillingStages[i - 1].insideAfter  || 0);
    const outsideW  = i === 0 ? initialOutside : Math.max(0, partBillingStages[i - 1].outsideAfter || 0);
    // daysOffset = chargeable days elapsed before this period (from freeEnd up to prevEnd)
    const daysOffset  = i === 0 ? 0 : diffD(freeEnd, prevEnd);
    const periodDays  = diffD(prevEnd, deliveryDate);
    if (!stage.date || periodDays <= 0) {
      periods.push({ invalid: true, periodNum: i + 1, blockStart, deliveryDate, insideW, outsideW, periodDays, daysOffset });
      continue;
    }
    hasWharfrent = true;
    totalDays += periodDays;
    const insideSlabs  = calcSlabs(periodDays, or1, or2, or3, insideW,  blockStart, deliveryDate, daysOffset);
    const outsideSlabs = calcSlabs(periodDays, or1, or2, or3, outsideW, blockStart, deliveryDate, daysOffset);
    const insideWharfrent  = insideSlabs.reduce((a, s) => a + s.amt, 0);
    const outsideWharfrent = outsideSlabs.reduce((a, s) => a + s.amt, 0) / 2;
    periods.push({
      invalid: false,
      periodNum: i + 1,
      blockStart,
      deliveryDate,
      periodDays,
      daysOffset,
      insideW,
      outsideW,
      insideSlabs,
      outsideSlabs,
      insideWharfrent,
      outsideWharfrent,
      balanceInsideAfter:  Math.max(0, stage.insideAfter  || 0),
      balanceOutsideAfter: Math.max(0, stage.outsideAfter || 0),
    });
  }
  // Optional: current-date period (from last delivery +1 → today)
  if (partBillingUpToDate && partBillingStages.length > 0) {
    const lastStage = partBillingStages[partBillingStages.length - 1];
    const lastDelivery = pd(lastStage.date);
    const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
    const cwInside  = Math.max(0, lastStage.insideAfter  || 0);
    const cwOutside = Math.max(0, lastStage.outsideAfter || 0);
    if (lastDelivery && (cwInside + cwOutside) > 0) {
      const cwBlockStart  = addD(lastDelivery, 1);
      const cwDaysOffset  = diffD(freeEnd, lastDelivery);
      const cwPeriodDays  = diffD(lastDelivery, todayD);
      if (cwPeriodDays > 0) {
        hasWharfrent = true;
        totalDays += cwPeriodDays;
        const cwInsideSlabs  = calcSlabs(cwPeriodDays, or1, or2, or3, cwInside,  cwBlockStart, todayD, cwDaysOffset);
        const cwOutsideSlabs = calcSlabs(cwPeriodDays, or1, or2, or3, cwOutside, cwBlockStart, todayD, cwDaysOffset);
        periods.push({
          invalid: false,
          periodNum: partBillingStages.length + 1,
          blockStart: cwBlockStart,
          deliveryDate: todayD,
          periodDays: cwPeriodDays,
          daysOffset: cwDaysOffset,
          insideW: cwInside,
          outsideW: cwOutside,
          insideSlabs: cwInsideSlabs,
          outsideSlabs: cwOutsideSlabs,
          insideWharfrent:  cwInsideSlabs.reduce((a, s) => a + s.amt, 0),
          outsideWharfrent: cwOutsideSlabs.reduce((a, s) => a + s.amt, 0) / 2,
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
  const validPeriods = (b.pbPeriods || []).filter(p => !p.invalid);
  let rows = '';
  validPeriods.forEach((p, pi) => {
    const slabs   = side === 'inside' ? p.insideSlabs  : p.outsideSlabs;
    const w       = side === 'inside' ? p.insideW  : p.outsideW;
    const wAmt    = side === 'inside' ? p.insideWharfrent : p.outsideWharfrent;
    const isLast  = pi === validPeriods.length - 1;
    const balNote = p.isCurrentDate
      ? ' · Up to Today'
      : (!isLast
          ? (side === 'inside'
              ? ` · Balance after: Inside ${p.balanceInsideAfter}t`
              : ` · Balance after: Outside ${p.balanceOutsideAfter}t`)
          : ' · Final Delivery');
    rows += `<tr class="sep"><td colspan="6">Period ${p.periodNum}: ${fd(p.blockStart)} → ${fd(p.deliveryDate)} | ${fmtN(w)} ton(s) | ${p.periodDays} days${balNote}</td></tr>`;
    slabs.forEach(s => {
      const dispAmt  = side === 'inside' ? s.amt : s.amt / 2;
      const dispRate = side === 'inside' ? s.rate : s.rate / 2;
      rows += `<tr><td>${s.label}</td><td>${fmtN(dispRate)}/t/d${side === 'outside' ? '<span style="font-size:11px;color:var(--m2)"> (½)</span>' : ''}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
    });
  });
  const wharfTotal = side === 'inside' ? b.insideWharfrent : b.outsideWharfrent;
  const halfNote   = side === 'outside' ? ' (½ Rate Applied)' : '';
  rows += `<tr class="sub"><td colspan="3">General Cargo Wharfrent${halfNote} Sub Total — ${b.totalDays} days</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(wharfTotal)}</td></tr>`;
  const billPayables = side === 'inside' ? b.insidePayables : b.outsidePayables;
  if (billPayables.length > 0) {
    rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
    billPayables.forEach(p => {
      rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
    });
  }
  const baseAmt  = side === 'inside' ? b.iBase  : b.oBase;
  const vatAmt   = side === 'inside' ? b.iVat   : b.oVat;
  const levyAmt  = side === 'inside' ? b.iLevy  : b.oLevy;
  const totalAmt = side === 'inside' ? b.iTotal : b.oTotal;
  const billPayables2 = side === 'inside' ? b.insidePayables : b.outsidePayables;
  if (billPayables2.length > 0) rows += `<tr class="tot"><td colspan="5">Total General Cargo Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr>`;
  if (vatAmt > 0) rows += `<tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(vatAmt)}</td></tr>`;
  if (levyAmt > 0) rows += `<tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(levyAmt)}</td></tr>`;
  rows += `<tr class="grand"><td colspan="5">General Cargo Wharfrent Grand Total</td><td>${fmt(totalAmt)}</td></tr>`;
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Build part billing print section for inside or outside
function buildPartBillingPrintSection(b, side) { //NOSONAR
  const validPeriods = (b.pbPeriods || []).filter(p => !p.invalid);
  const isIn = side === 'inside';
  let rows = '';
  validPeriods.forEach((p, pi) => {
    const slabs  = isIn ? p.insideSlabs : p.outsideSlabs;
    const w      = isIn ? p.insideW : p.outsideW;
    const isLast = pi === validPeriods.length - 1;
    const balNote = p.isCurrentDate
      ? ' | Up to Today'
      : (!isLast
          ? (isIn
              ? ` | Balance after: Inside ${p.balanceInsideAfter}t`
              : ` | Balance after: Outside ${p.balanceOutsideAfter}t`)
          : ' | Final Delivery');
    rows += `<tr class="sep"><td colspan="6">Period ${p.periodNum}: ${fd(p.blockStart)} → ${fd(p.deliveryDate)} | ${fmtN(w)} ton(s) | ${p.periodDays} days${balNote}</td></tr>`;
    slabs.forEach(s => {
      const da = isIn ? s.amt : s.amt / 2;
      const dr = isIn ? s.rate : s.rate / 2;
      rows += printTr(s.label, `${fmtN(dr)}/t/d${isIn ? '' : ' (½)'}`, fd(s.from), fd(s.to), s.days, fmt(da));
    });
  });
  const wharfTotal   = isIn ? b.insideWharfrent  : b.outsideWharfrent;
  const baseAmt      = isIn ? b.iBase  : b.oBase;
  const vatAmt       = isIn ? b.iVat   : b.oVat;
  const levyAmt      = isIn ? b.iLevy  : b.oLevy;
  const totAmt       = isIn ? b.iTotal : b.oTotal;
  const billPayables = isIn ? b.insidePayables : b.outsidePayables;
  const halfNote     = isIn ? '' : ' (½ Rate)';
  rows += printTotRow(`General Cargo Wharfrent${halfNote} Sub Total — ${b.totalDays} days`, fmt(wharfTotal), 'sub');
  if (billPayables.length > 0) {
    rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
    billPayables.forEach(p => rows += printTr(p.label, `${fmtN(p.rate)}/ton`, `${fmtN(p.tons)} ton(s)`, '—', '—', fmt(p.amt), 'sub'));
    rows += printTotRow('Total Bill (Base for VAT)', fmt(baseAmt));
  }
  if (vatAmt > 0) rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%`, fmt(vatAmt), 'vrow');
  if (levyAmt > 0) rows += printTotRow('Levy Charge (No VAT)', fmt(levyAmt), 'lrow');
  rows += printTotRow(`${isIn ? 'INSIDE' : 'OUTSIDE'} GRAND TOTAL`, fmt(totAmt), 'grand');
  const wt       = isIn ? b.insideW : b.outsideW;
  const headBadge = isIn ? `${fmtN(wt)} ton initial — Full Rate` : `${fmtN(wt)} ton initial — ½ Rate`;
  const subNote   = `Part Billing — ${validPeriods.length} delivery stages | ${isIn ? 'full' : '½'} wharfrent rate applied`;
  return `${secHead(isIn ? 'INSIDE WHARFRENT' : 'OUTSIDE WHARFRENT', headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
}

function cargoCompute() {
  // NOSONAR
  const cld = pd(document.getElementById('c-cld').value);
  const freeDays =
    Number.parseInt(document.getElementById('c-freeDays').value, 10) || 4;
  const freeEnd = addD(cld, freeDays - 1);
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

  // ── Part Billing branch ──
  const isPartBilling = !!document.getElementById('c-partBilling')?.checked;
  let insideSlabs = [], outsideSlabs = [], totalDays = 0, hasWharfrent = false;
  let pbPeriods = null;

  if (isPartBilling) {
    const pbr = computePartBillingWharfrent(cld, freeEnd, storStart, insideW, outsideW, or1, or2, or3);
    pbPeriods   = pbr.periods;
    hasWharfrent = pbr.hasWharfrent;
    totalDays   = pbr.totalDays;
  } else {
    hasWharfrent = delivery > freeEnd;
    if (hasWharfrent) {
      totalDays   = diffD(freeEnd, delivery);
      insideSlabs  = calcSlabs(totalDays, or1, or2, or3, insideW,  storStart, delivery, 0);
      outsideSlabs = calcSlabs(totalDays, or1, or2, or3, outsideW, storStart, delivery, 0);
    }
  }

  // Inside wharfrent = full rate × insideW tons
  const insideWharfrent = isPartBilling
    ? (pbPeriods || []).filter(p => !p.invalid).reduce((a, p) => a + p.insideWharfrent,  0)
    : insideSlabs.reduce((a, s) => a + s.amt, 0);
  // Outside wharfrent = ½ × (full rate × outsideW tons)
  const outsideWharfrent = isPartBilling
    ? (pbPeriods || []).filter(p => !p.invalid).reduce((a, p) => a + p.outsideWharfrent, 0)
    : outsideSlabs.reduce((a, s) => a + s.amt, 0) / 2;

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
  };
}

function syncPbMaxLabels() {
  partBillingStages.forEach((stage, idx) => {
    const maxIn  = pbMaxWeight(idx, 'inside');
    const maxOut = pbMaxWeight(idx, 'outside');
    const inpIn  = document.getElementById(`pb-inside-${idx}`);
    const inpOut = document.getElementById(`pb-outside-${idx}`);
    const lblIn  = document.querySelector(`label[for="pb-inside-${idx}"]`);
    const lblOut = document.querySelector(`label[for="pb-outside-${idx}"]`);
    if (inpIn) { if (maxIn > 0) inpIn.max = maxIn; else inpIn.removeAttribute('max'); }
    if (inpOut){ if (maxOut > 0) inpOut.max = maxOut; else inpOut.removeAttribute('max'); }
    if (lblIn) {
      let note = lblIn.querySelector('.pb-max-note');
      if (maxIn > 0) { if (!note) { note = document.createElement('span'); note.className = 'pb-max-note'; lblIn.appendChild(note); } note.textContent = `max ${maxIn}`; }
      else if (note) note.remove();
    }
    if (lblOut) {
      let note = lblOut.querySelector('.pb-max-note');
      if (maxOut > 0) { if (!note) { note = document.createElement('span'); note.className = 'pb-max-note'; lblOut.appendChild(note); } note.textContent = `max ${maxOut}`; }
      else if (note) note.remove();
    }
  });
}

function cargoRefreshNow() {
  try {
    cargoValidateSplit();
    cargoValidateRemovalTon();
    cargoValidateWeighmentTon();
    cargoValidateSelfDriveTon();
    if (document.getElementById('c-partBilling')?.checked) syncPbMaxLabels();
    const cld_ = pd(document.getElementById('c-cld').value);
    const fd_ =
      Number.parseInt(document.getElementById('c-freeDays').value, 10) || 4;
    const freeEnd = addD(cld_, fd_ - 1);
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
      ftDaysEl.innerHTML =
        '<span style="color:var(--m2)">Free: </span>' +
        dayLabels
          .map(
            d =>
              `<span style="background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.2);color:var(--cargo-accent);border-radius:4px;padding:1px 7px;margin:0 2px;">${d}</span>`
          )
          .join('') +
        `<span style="color:var(--m2)"> → General Cargo Wharfrent starts </span><span style="color:var(--green);font-weight:600;">${storStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>`;
      strip.style.display = 'block';
    }
    ['c-or1', 'c-or2', 'c-or3'].forEach(id => {
      const inp = document.getElementById(id);
      const sp = document.getElementById(id.replace('c-', 'c-d'));
      if (inp && sp) sp.textContent = inp.value;
    });
    const b = cargoCompute();
    if (!b) return;
    // Toggle self-drive row visibility based on hoisting checkbox
    const hoistingOn = !!document.getElementById('c-chkHoisting')?.checked;
    const selfDriveRow = document.getElementById('c-selfDriveRow');
    if (selfDriveRow) selfDriveRow.style.display = hoistingOn ? '' : 'none';
    if (!hoistingOn) {
      ['c-chkSelfDriveInside', 'c-chkSelfDriveOutside'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
      });
    }
    // Sync ton field active/inactive state + inline error
    const syncTon = (chkId, inputId, errId) => {
      const on = document.getElementById(chkId)?.checked;
      const inp = document.getElementById(inputId);
      const err = document.getElementById(errId);
      if (!inp) return;
      if (on) {
        inp.classList.remove('ton-inactive');
        const v = Math.round(Number.parseFloat(inp.value) || 0);
        if (err) err.classList.toggle('show', v <= 0);
      } else {
        inp.classList.add('ton-inactive');
        if (err) err.classList.remove('show');
      }
    };
    syncTon('c-chkRemoval',          'c-removalTon',          'c-removalTon-err');
    syncTon('c-chkWeighment',        'c-weighmentTon',         'c-weighmentTon-err');
    syncTon('c-chkSelfDriveInside',  'c-selfDriveTonInside',   'c-selfDriveTonInside-err');
    syncTon('c-chkSelfDriveOutside', 'c-selfDriveTonOutside',  'c-selfDriveTonOutside-err');
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
        `<div class="pvr"><span class="pvr-lbl">Inside Wharfrent Total (${fmtN(inside)}t initial)</span><span class="pvr-val v-blue">${fmt(b.iTotal)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Wharfrent Total (${fmtN(outside)}t initial)</span><span class="pvr-val v-purple">${fmt(b.oTotal)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Grand Total</span><span class="pvr-val v-cyan">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else if (b.hasWharfrent) {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">General Cargo Wharfrent Days</span><span class="pvr-val v-cyan">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside General Cargo Wharfrent (${fmtN(inside)}t)</span><span class="pvr-val v-blue">${fmt(b.iTotal)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside General Cargo Wharfrent (${fmtN(outside)}t)</span><span class="pvr-val v-purple">${fmt(b.oTotal)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Wharfrent Grand Total</span><span class="pvr-val v-cyan">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">General Cargo Wharfrent</span><span class="pvr-val v-green">Within Free Time ✓</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">General Cargo Payable Charges</span><span class="pvr-val">${fmt(b.paySub)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Wharfrent Grand Total</span><span class="pvr-val v-cyan">${fmt(b.nTotal)}</span></div>`;
    }
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
    const slabs = side === 'inside' ? b.insideSlabs : b.outsideSlabs;
    const wharfAmt = side === 'inside' ? b.insideWharfrent : b.outsideWharfrent;
    const weight = side === 'inside' ? b.insideW : b.outsideW;
    const baseAmt = side === 'inside' ? b.iBase : b.oBase;
    const vatAmt = side === 'inside' ? b.iVat : b.oVat;
    const levyAmt = side === 'inside' ? b.iLevy : b.oLevy;
    const totalAmt = side === 'inside' ? b.iTotal : b.oTotal;
    const halfNote = side === 'outside' ? ' (½ Rate Applied)' : '';

    if (b.hasWharfrent) {
      slabs.forEach(s => {
        const dispAmt = side === 'inside' ? s.amt : s.amt / 2;
        const dispRate = side === 'inside' ? s.rate : s.rate / 2;
        rows += `<tr><td>${s.label}</td><td>${fmtN(dispRate)}/t/d${side === 'outside' ? '<span style="font-size:11px;color:var(--m2)"> (½)</span>' : ''}</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(dispAmt)}</td></tr>`;
      });
      rows += `<tr class="sub"><td colspan="3">General Cargo Wharfrent${halfNote} — ${fmtN(weight)} ton(s)</td><td></td><td><span class="dp dpg">${b.totalDays}</span></td><td>${fmt(wharfAmt)}</td></tr>`;
    }
    // Use appropriate payables based on bill type
    const billPayables =
      side === 'inside' ? b.insidePayables : b.outsidePayables;
    if (billPayables.length > 0) {
      rows += `<tr class="sep"><td colspan="6">Payable Charges</td></tr>`;
      billPayables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total General Cargo Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr><tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(vatAmt)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(levyAmt)}</td></tr><tr class="grand"><td colspan="5">General Cargo Wharfrent Grand Total</td><td>${fmt(totalAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${fmtN(p.tons ?? b.totalWeight)} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total General Cargo Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">General Cargo Wharfrent Grand Total</td><td>${fmt(b.nTotal)}</td></tr>`;
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
    alert(
      '⚠ Inside + Outside weight must equal Total Weight. Please correct the allocation before generating the bill.'
    );
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
      `<div class="ibar"><div><div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${fd(b.storStart)}</div></div><div class="ii"><div class="il">First Delivery</div><div class="iv">${firstDel}</div></div><div class="ii"><div class="il">Last Delivery</div><div class="iv">${lastDel}</div></div><div class="ii"><div class="il">Delivery Stages</div><div class="iv" style="color:var(--cargo-accent)">${vp.length} stages</div></div><div class="ii"><div class="il">Initial Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Total Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.totalDays} days</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
    document.getElementById('cargo-srow').innerHTML =
      `<div class="sc cg"><div class="sl">General Cargo Grand Total (Part Billing)</div><div class="sv" style="color:var(--cargo-accent)">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">${vp.length} stages · Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside Wharfrent Total (${fmtN(b.insideW)}t initial)</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Full rate · ${b.totalDays} days total</div></div><div class="sc cp"><div class="sl">Outside Wharfrent Total (${fmtN(b.outsideW)}t initial)</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">½ rate · ${b.totalDays} days total</div></div>`;
    document.getElementById('cargo-insideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="cargo-split-info">📦 Part Billing — ${vp.length} stage(s) | Initial Inside: <strong>${fmtN(b.insideW)} ton(s)</strong> — Full wharfrent rate | Slab progression continuous from CLD</div><div class="slbl sl-cin">▪ General Cargo Wharfrent — INSIDE — Part Billing (${vp.length} stages)</div><div class="card" style="padding:0;overflow:hidden;">${buildPartBillingBillTable(b, 'inside')}</div></div>`;
    document.getElementById('cargo-outsideSec').innerHTML =
      `<div style="margin-bottom:20px;"><div class="cargo-split-info" style="background:rgba(192,132,252,0.06);border-color:rgba(192,132,252,0.2);color:var(--purple);">📦 Part Billing — ${vp.length} stage(s) | Initial Outside: <strong>${fmtN(b.outsideW)} ton(s)</strong> — ½ wharfrent rate</div><div class="slbl sl-cout">▪ General Cargo Wharfrent — OUTSIDE — Part Billing (${vp.length} stages) — ½ Rate</div><div class="card" style="padding:0;overflow:hidden;">${buildPartBillingBillTable(b, 'outside')}</div></div>`;
  } else {
    document.getElementById('cargo-ibar').innerHTML =
      `<div class="ibar"><div><div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">General Cargo Wharfrent Starts</div><div class="iv">${b.hasWharfrent ? fd(b.storStart) : '—'}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Total Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">General Cargo Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.hasWharfrent ? b.totalDays + ' days' : 'In free time'}</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
    if (b.hasWharfrent) {
      document.getElementById('cargo-srow').innerHTML =
        `<div class="sc cg"><div class="sl">General Cargo Wharfrent Grand Total</div><div class="sv" style="color:var(--cargo-accent)">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside General Cargo Wharfrent Bill (${fmtN(b.insideW)}t)</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Full rate, incl. VAT</div></div><div class="sc cp"><div class="sl">Outside General Cargo Wharfrent Bill (${fmtN(b.outsideW)}t)</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">½ rate, incl. VAT</div></div>`;
      document.getElementById('cargo-insideSec').innerHTML =
        `<div style="margin-bottom:20px;"><div class="cargo-split-info">📦 Inside portion: <strong>${fmtN(b.insideW)} ton(s)</strong> — Full general cargo wharfrent rate applied</div><div class="slbl sl-cin">▪ General Cargo Wharfrent Charge — INSIDE (${fmtN(b.insideW)} ton)</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, 'inside')}</div></div>`;
      document.getElementById('cargo-outsideSec').innerHTML =
        `<div style="margin-bottom:20px;"><div class="cargo-split-info" style="background:rgba(192,132,252,0.06);border-color:rgba(192,132,252,0.2);color:var(--purple);">📦 Outside portion: <strong>${fmtN(b.outsideW)} ton(s)</strong> — ½ general cargo wharfrent rate applied</div><div class="slbl sl-cout">▪ General Cargo Wharfrent Charge — OUTSIDE (${fmtN(b.outsideW)} ton) — ½ Rate</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, 'outside')}</div></div>`;
    } else {
      document.getElementById('cargo-insideSec').innerHTML =
        '<div class="no-stor-note">✓ Delivery within free time — no General Cargo Wharfrent charge applies.</div>';
      document.getElementById('cargo-outsideSec').innerHTML =
        `<div style="margin-bottom:20px;"><div class="slbl sl-payable">▪ Only General Cargo Payable Charges — INSIDE/OUTSIDE</div><div class="card" style="padding:0;overflow:hidden;">${buildCargoBillTable(b, 'noWharfrent')}</div></div>`;
    }
  }

  // Charge Breakdown — Wharfrent vs Payable composition of the bill
  document.getElementById('cargo-breakdownSec').innerHTML =
    buildCargoBreakdownHtml(b);

  const grand = (b.hasWharfrent || b.isPartBilling) ? b.iTotal + b.oTotal : b.nTotal;
  const cargoGrandSplitHtml = (b.hasWharfrent || b.isPartBilling)
    ? `<div><div class="glbl">Inside General Cargo Wharfrent Grand Total (${fmtN(b.insideW)}t${b.isPartBilling ? ' initial' : ''})</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">Full rate + VAT + Levy${b.isPartBilling ? ' · Part Billing' : ''}</div></div><div><div class="glbl">Outside General Cargo Wharfrent Grand Total (${fmtN(b.outsideW)}t${b.isPartBilling ? ' initial' : ''})</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">½ rate + VAT + Levy${b.isPartBilling ? ' · Part Billing' : ''}</div></div>`
    : `<div><div class="glbl">General Cargo Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No General Cargo Wharfrent — flat only</div></div><div></div>`;
  document.getElementById('cargo-grandSec').innerHTML =
    `<div class="gbox cargo-grand"><div class="ginn">${cargoGrandSplitHtml}<div class="gfin"><div class="glbl">GENERAL CARGO GRAND TOTAL${b.isPartBilling ? ' (PART BILLING)' : ''}</div><div class="gval" style="color:var(--cargo-accent)">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;

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
  // Reset part billing state
  const pbChk = document.getElementById('c-partBilling');
  if (pbChk) pbChk.checked = false;
  partBillingStages = [{ date: '', insideAfter: 0, outsideAfter: 0 }];
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
    if (el) { el.value = 0; el.classList.add('ton-inactive'); el.setCustomValidity(''); }
  });
  // Reset removal and weighment ton inputs to 0 and clear state
  ['c-removalTon', 'c-weighmentTon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = 0; el.classList.add('ton-inactive'); el.setCustomValidity(''); }
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
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:10pt;}
body{font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;color:#1c2130;background:#e8eaf0;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

.invoice{max-width:900px;margin:0 auto;background:#fff;overflow:hidden;}
@media screen{.invoice{margin:24px auto 56px;border-radius:4px;box-shadow:0 2px 8px rgba(10,20,50,0.12),0 16px 48px rgba(10,20,50,0.14);}}
.inv-band{height:4px;background:linear-gradient(90deg,#0d1f42 0%,#c4943a 45%,#0d1f42 100%);-webkit-print-color-adjust:exact;print-color-adjust:exact;}

.cls-strip{display:flex;justify-content:space-between;align-items:center;background:#f0f3f9;padding:5px 28px;font-family:'DM Mono',monospace;font-size:7pt;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #d8dde8;}
.cls-strip .cls-l{color:#4a5570;}
.cls-strip .cls-r{color:#8a93a8;font-size:6.5pt;}

.lh{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 28px 18px;border-bottom:2.5px solid #0d1f42;background:#fff;}
.lh-left{display:flex;align-items:flex-start;gap:14px;}
.lh-emblem{flex-shrink:0;margin-top:1px;}
.lh-logo{font-family:'DM Sans',sans-serif;font-weight:900;font-size:18pt;letter-spacing:4px;color:#0d1f42;line-height:1;text-transform:uppercase;}
.lh-rule{width:40px;height:3px;background:linear-gradient(90deg,#c4943a,#e8c87a,#c4943a);margin:7px 0 8px;}
.lh-sub{font-size:8pt;color:#5a6481;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono',monospace;}
.lh-right{text-align:right;}
.lh-doc-label{display:inline-block;padding:3px 10px;background:transparent;color:#5a6481;border:1px solid #c8cedf;font-family:'DM Mono',monospace;font-size:7pt;letter-spacing:2px;text-transform:uppercase;border-radius:2px;margin-bottom:8px;}
.lh-bill-name{font-family:'DM Sans',sans-serif;font-weight:700;font-size:13pt;color:#0d1f42;letter-spacing:1.5px;
  text-transform:uppercase;line-height:1.15;margin-bottom:10px;
}
.lh-meta{border-collapse:collapse;margin-left:auto;}
.lh-meta-lbl{font-size:7.5pt;color:#8a93a8;text-transform:uppercase;letter-spacing:0.5px;padding:2.5px 14px 2.5px 0;text-align:left;font-family:'DM Mono',monospace;white-space:nowrap;}
.lh-meta-val{font-size:8.5pt;color:#1c2130;font-weight:700;font-family:'DM Mono',monospace;text-align:right;padding:2.5px 0;white-space:nowrap;}
.lh-badge{display:inline-block;margin-top:8px;padding:3px 9px;border:1px solid #c4943a;color:#c4943a;font-size:7pt;letter-spacing:1px;text-transform:uppercase;font-family:'DM Mono',monospace;border-radius:2px;}

.title-band{background:#fff;padding:12px 28px;border-left:5px solid #c4943a;border-top:1px solid #e8ebf2;border-bottom:1px solid #e8ebf2;margin-top:2px;}
.title-band h1{font-family:'DM Sans',sans-serif;font-weight:700;font-size:11pt;color:#0d1f42;letter-spacing:2.5px;text-transform:uppercase;}
.title-band p{font-size:8.5pt;color:#5a6481;letter-spacing:0.3px;margin-top:3px;}

/* ─── SPLIT WARNING ─── */
.split-warn{
  display:flex;align-items:baseline;gap:8px;
  background:#fffbea;border-top:3px solid #e9c84a;border-bottom:1px solid #f0dfa0;
  padding:9px 26px;font-size:8.8pt;color:#6b4c00;letter-spacing:0.2px;
}
.sw-icon{font-size:11pt;flex-shrink:0;}

/* ─── SECTION LABEL ─── */
.info-section-label{
  font-family:'DM Mono',monospace;font-size:7pt;color:#8a93a8;
  text-transform:uppercase;letter-spacing:2.5px;
  padding:14px 26px 6px;
}

/* ─── INFO GRID ─── */
.info-grid{
  display:grid;grid-template-columns:repeat(4,1fr);
  border-top:1px solid #d8dde8;border-left:1px solid #d8dde8;
  margin:0 26px 4px;
}
.info-cell{
  padding:11px 14px;
  border-right:1px solid #d8dde8;border-bottom:1px solid #d8dde8;
  background:#fff;
}
.info-cell:nth-child(odd){background:#f8f9fc;}
.info-label{
  font-size:7.2pt;color:#8a93a8;text-transform:uppercase;
  letter-spacing:0.7px;margin-bottom:5px;font-family:'DM Mono',monospace;
}
.info-value{
  font-size:9.2pt;color:#1c2130;font-weight:600;font-family:'DM Mono',monospace;
}

/* ─── SECTION HEADERS ─── */
.section-head{
  background:#fff;color:#1c2130;
  padding:9px 26px 8px;margin-top:22px;
  border-left:5px solid #c4943a;
  border-bottom:2px solid #0d1f42;
  display:flex;justify-content:space-between;align-items:center;
}
.section-head>span:first-child{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;
  color:#0d1f42;
}
.sh-accent{
  font-family:'DM Mono',monospace;font-size:7.8pt;font-weight:500;
  letter-spacing:0.5px;white-space:nowrap;
  color:#5a6481;border:1px solid #d8dde8;padding:2px 9px;border-radius:2px;
}
/* Inside = blue */
.section-head.inside-head{border-left-color:#2563c0;border-bottom-color:#2563c0;background:#f5f8ff;}
.section-head.inside-head>span:first-child{color:#1a4fb4;}
.section-head.inside-head .sh-accent{border-color:#a8c0ef;color:#2563c0;background:#edf3ff;}
.inside-head+.section-sub{border-left-color:#2563c0;background:#eef4ff;}
/* Outside = purple */
.section-head.outside-head{border-left-color:#7c3aed;border-bottom-color:#7c3aed;background:#f8f5ff;}
.section-head.outside-head>span:first-child{color:#5b2bab;}
.section-head.outside-head .sh-accent{border-color:#c4a8ef;color:#7c3aed;background:#f3eeff;}
.outside-head+.section-sub{border-left-color:#7c3aed;background:#f4f0ff;}
/* Payable = teal-green */
.section-head.payable-head{border-left-color:#0d7c5e;border-bottom-color:#0d7c5e;background:#f2faf7;}
.section-head.payable-head>span:first-child{color:#0a5e47;}
.section-head.payable-head .sh-accent{border-color:#8fd3be;color:#0d7c5e;background:#e8f8f3;}
.payable-head+.section-sub{border-left-color:#0d7c5e;background:#edfaf4;}
.section-sub{
  background:#f8f9fc;border-left:5px solid #c4943a;
  padding:6px 26px;font-size:8.2pt;color:#5a6481;
  letter-spacing:0.3px;border-bottom:1px solid #d8dde8;
}

/* ─── TABLES ─── */
table{width:100%;border-collapse:collapse;font-size:8.8pt;}
thead th{
  background:#edf0f7;
  border-bottom:2px solid #0d1f42;border-top:1px solid #d8dde8;
  padding:8px 10px;text-align:left;
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:7.8pt;letter-spacing:0.5px;text-transform:uppercase;
  color:#1c2a50;white-space:nowrap;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
thead th:first-child{width:29%;padding-left:26px;}
thead th:nth-child(2){width:18%;}
thead th:nth-child(3),thead th:nth-child(4){width:11%;text-align:center;}
thead th:nth-child(5){width:8%;text-align:center;}
thead th:last-child{width:17%;text-align:right;min-width:90px;padding-right:26px;}
td{padding:7px 10px;border-bottom:1px solid #edf0f7;vertical-align:middle;color:#2c3347;}
td:first-child{padding-left:26px;}
td:last-child{text-align:right;font-weight:600;font-family:'DM Mono',monospace;color:#1c2130;padding-right:26px;}
td:nth-child(2){color:#4a5570;white-space:nowrap;font-size:8.2pt;font-family:'DM Mono',monospace;}
td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center;color:#6b7691;font-size:8.2pt;font-family:'DM Mono',monospace;}
tbody tr:nth-child(even) td{background:#fafbfd;}
tr.sep td{
  background:#e4e8f2;color:#1c2a50;font-weight:700;
  font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;
  padding:6px 10px;border-top:1px solid #c8cedf;border-bottom:1px solid #c8cedf;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
tr.sep td:first-child{padding-left:26px;}
tr.sub td{background:#f5f7fc;color:#2c3347;}
tr.sub td:last-child{color:#1c2130;font-weight:700;}
tr.sub td:first-child{padding-left:26px;}
tr.tot td{
  background:#e8ebf4;font-weight:700;color:#0d1f42;
  border-top:2px solid #0d1f42;border-bottom:1px solid #c8cedf;
  font-size:9pt;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
tr.tot td:first-child{padding-left:26px;}
tr.vrow td{
  background:#f8f9fc;color:#5a6481;
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
}
tr.vrow td:first-child{padding-left:26px;}
tr.lrow td{
  background:#f8f9fc;color:#5a6481;
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
  border-bottom:2px solid #d8dde8;
}
tr.lrow td:first-child{padding-left:26px;}
tr.grand td{
  background:#edf0f7;color:#0d1f42;font-weight:700;
  font-size:10pt;padding:11px 10px;border:none;
  border-top:2px solid #0d1f42;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
tr.grand td:first-child{padding-left:26px;}
tr.grand td:last-child{color:#c4943a;font-size:11.5pt;letter-spacing:1px;padding-right:26px;}

/* ─── INSIDE / OUTSIDE SUMMARY ─── */
.io-summary{
  display:grid;grid-template-columns:1fr 1px 1fr;
  margin:20px 26px 0;
  border:1px solid #d8dde8;border-radius:3px;overflow:hidden;
}
.io-cell{padding:18px 22px;background:#fff;}
.io-inside{background:#eef4ff;border-top:4px solid #2563c0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.io-outside{background:#f3eeff;border-top:4px solid #7c3aed;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.io-divider{background:#d8dde8;}
.io-tag{
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;font-weight:600;
}
.io-inside .io-tag{color:#2563c0;}
.io-outside .io-tag{color:#7c3aed;}
.io-label{font-size:8.2pt;color:#5a6481;margin-bottom:8px;line-height:1.4;}
.io-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:16pt;line-height:1;margin-bottom:5px;
}
.io-inside .io-amount{color:#1a4fb4;}
.io-outside .io-amount{color:#5b2bab;}
.io-note{font-size:7.8pt;color:#8a93a8;}

/* ─── GRAND TOTAL BAR ─── */
.grand-bar{
  background:#f8f9fc;padding:20px 26px;
  margin:20px 26px 0;
  border:1px solid #d8dde8;border-top:4px solid #c4943a;
  display:flex;justify-content:space-between;align-items:center;
  border-radius:3px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.gb-left .gb-label{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:2px;text-transform:uppercase;color:#0d1f42;
}
.gb-left .gb-sub{
  font-family:'DM Mono',monospace;font-size:7.8pt;
  color:#5a6481;letter-spacing:1px;text-transform:uppercase;margin-top:5px;
}
.gb-right{text-align:right;}
.gb-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:21pt;color:#c4943a;letter-spacing:1px;line-height:1;
}
.gb-vat-note{
  font-family:'DM Mono',monospace;font-size:7.8pt;
  color:#8a93a8;letter-spacing:1px;text-transform:uppercase;margin-top:4px;
}

/* ─── AUTHORIZATION ─── */
.auth-section{margin:24px 0 0;border-top:2px solid #1c2130;}
.auth-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.auth-col{padding:28px 36px 32px;border-right:1px solid #d8dde8;}
.auth-col:first-child{padding-left:26px;}
.auth-col:last-child{border-right:none;padding-right:26px;}
.auth-role{
  font-family:'DM Mono',monospace;font-size:6.8pt;color:#5a6481;
  text-transform:uppercase;letter-spacing:1.8px;text-align:center;
  padding-top:8px;
}
.auth-sig-space{min-height:1in;}
.auth-sig-line{border-bottom:1.5px dashed #1c2130;}

/* ─── DISCLAIMER ─── */
.disclaimer{
  margin:16px 26px 0;padding:11px 15px;
  border:1px solid #d8dde8;border-left:3px solid #e9c84a;
  background:#fffef8;
  font-size:7.8pt;color:#6b7691;line-height:1.8;font-family:'DM Mono',monospace;
}
.disclaimer strong{color:#4a5370;}

/* ─── DOCUMENT FOOTER ─── */
.doc-footer{
  display:flex;justify-content:space-between;align-items:center;
  margin:13px 26px 22px;padding-top:9px;
  border-top:1px solid #d8dde8;
  font-family:'DM Mono',monospace;font-size:7.2pt;color:#9aa3b8;
}
.doc-footer .df-ref{font-weight:500;color:#5a6481;}

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

/* ─── PAGE CONTROL ─── */
.no-break{page-break-inside:avoid;break-inside:avoid;}
@page{margin:10mm 12mm;size:A4 portrait;}
@media print{
  html,body{
    width:210mm;
    font-size:8pt;line-height:1.35;
    color:#1a1a2e;background:#fff !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  .invoice{width:100%;max-width:100%;margin:0;box-shadow:none;border-radius:0;}
  .inv-band{display:none;}

  /* Classification strip */
  .cls-strip{background:#f5f6fa !important;padding:3px 0;border-bottom:0.5pt solid #d0d0d0 !important;}
  .cls-strip .cls-l{font-size:6pt !important;color:#6b7280 !important;}
  .cls-strip .cls-r{font-size:5.5pt !important;color:#9ca3af !important;}

  /* Letterhead */
  .lh{
    display:flex;justify-content:space-between;align-items:flex-start;
    padding:10px 0 10px;border-bottom:2.5pt solid #1a1a2e !important;
    background:#fff !important;
  }
  .lh-left{display:flex;align-items:flex-start;gap:10px;}
  .lh-emblem{width:38px !important;height:38px !important;flex-shrink:0;}
  .lh-logo{
    font-family:'DM Sans',sans-serif;font-weight:900;
    font-size:13pt;letter-spacing:2px;color:#1a1a2e !important;
    line-height:1;text-transform:uppercase;
  }
  .lh-rule{width:30px !important;height:2pt !important;background:#c4943a !important;margin:4px 0 5px !important;}
  .lh-sub{
    font-family:'DM Mono',monospace;font-size:7pt;
    letter-spacing:1px;text-transform:uppercase;color:#6b7280 !important;
  }
  .lh-right{text-align:right;}
  .lh-doc-label{
    display:inline-block;
    font-family:'DM Mono',monospace;font-size:6pt;
    letter-spacing:1.5px;text-transform:uppercase;
    color:#6b7280 !important;margin-bottom:3px !important;
    border:0.5pt solid #d0d0d0 !important;padding:1px 6px;border-radius:1px;
  }
  .lh-bill-name{
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:10pt;letter-spacing:1px;color:#1a1a2e !important;
    text-transform:uppercase;line-height:1.1;margin-bottom:6px !important;
  }
  .lh-meta{border-collapse:collapse;margin-left:auto;}
  .lh-meta-lbl{
    font-family:'DM Mono',monospace;font-size:6pt;
    color:#9ca3af !important;text-transform:uppercase;letter-spacing:0.5px;
    padding:1px 8px 1px 0;text-align:left;white-space:nowrap;
  }
  .lh-meta-val{
    font-family:'DM Mono',monospace;font-size:7.5pt;
    color:#1a1a2e !important;font-weight:600;text-align:right;padding:1px 0;
    white-space:nowrap;
  }
  .lh-badge{
    display:inline-block;margin-top:5px !important;padding:1px 6px;
    border:0.5pt solid #d0d0d0;border-radius:1px;
    font-family:'DM Mono',monospace;font-size:5.5pt;
    letter-spacing:0.5px;text-transform:uppercase;color:#9ca3af !important;
  }

  /* Title band */
  .title-band{
    background:#fff !important;padding:6px 0;margin-top:6px;
    border-left:3pt solid #c4943a !important;
    border-top:0.5pt solid #e5e7eb !important;
    border-bottom:0.5pt solid #e5e7eb !important;
  }
  .title-band h1{
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:9pt;letter-spacing:2px;color:#1a1a2e !important;
    text-transform:uppercase;
  }
  .title-band p{
    font-size:7pt;color:#6b7280 !important;letter-spacing:0.3px;margin-top:2px !important;
  }

  /* Split warning */
  .split-warn{
    display:flex;align-items:baseline;gap:6px;
    background:#fffbeb !important;border-top:2pt solid #d4a800 !important;
    border-bottom:0.5pt solid #f0dfa0 !important;
    padding:4px 0;font-size:7.5pt;color:#78350f !important;
  }
  .sw-icon{font-size:8pt !important;flex-shrink:0;}

  /* Section label */
  .info-section-label{
    font-family:'DM Mono',monospace;font-size:6pt;color:#9ca3af !important;
    text-transform:uppercase;letter-spacing:2px;
    padding:6px 0 3px;
  }

  /* Info grid */
  .info-grid{
    display:grid;grid-template-columns:repeat(4,1fr);
    border:0.5pt solid #d0d0d0;border-radius:0;
    margin:0 0 6px;
  }
  .info-cell{
    padding:4px 7px;
    border-right:0.5pt solid #e5e7eb;border-bottom:0.5pt solid #e5e7eb;
    background:#fff !important;
  }
  .info-cell:nth-child(odd){background:#f9fafb !important;}
  .info-label{
    font-family:'DM Mono',monospace;font-size:5.5pt;color:#9ca3af !important;
    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px !important;
  }
  .info-value{
    font-family:'DM Mono',monospace;font-size:8pt;color:#1a1a2e !important;
    font-weight:600;
  }

  /* Section headers */
  .section-head{
    background:#fff !important;margin-top:8px;padding:4px 0;
    border-left:3pt solid #c4943a !important;
    border-bottom:1.5pt solid #1a1a2e !important;
    display:flex;justify-content:space-between;align-items:center;
  }
  .section-head>span:first-child{
    font-family:'DM Sans',sans-serif;font-weight:700;
    font-size:8pt;letter-spacing:1px;text-transform:uppercase;
    color:#1a1a2e !important;
  }
  .sh-accent{
    font-family:'DM Mono',monospace;font-size:6.5pt;font-weight:500;
    letter-spacing:0.3px;white-space:nowrap;
    color:#6b7280 !important;border:0.5pt solid #d0d0d0;padding:1px 6px;border-radius:1px;
  }
  /* Color-coded headers in print */
  .section-head.inside-head{border-left-color:#1d4ed8 !important;border-bottom-color:#1d4ed8 !important;background:#f5f8ff !important;}
  .section-head.inside-head>span:first-child{color:#1d4ed8 !important;}
  .section-head.inside-head .sh-accent{border-color:#93b4f0 !important;color:#1d4ed8 !important;}
  .inside-head+.section-sub{border-left-color:#1d4ed8 !important;background:#eef4ff !important;}
  .section-head.outside-head{border-left-color:#7c3aed !important;border-bottom-color:#7c3aed !important;background:#f8f5ff !important;}
  .section-head.outside-head>span:first-child{color:#6d28d9 !important;}
  .section-head.outside-head .sh-accent{border-color:#c4a8ef !important;color:#7c3aed !important;}
  .outside-head+.section-sub{border-left-color:#7c3aed !important;background:#f5f0ff !important;}
  .section-head.payable-head{border-left-color:#059669 !important;border-bottom-color:#059669 !important;background:#f0fdf8 !important;}
  .section-head.payable-head>span:first-child{color:#047857 !important;}
  .section-head.payable-head .sh-accent{border-color:#6ee7c0 !important;color:#059669 !important;}
  .payable-head+.section-sub{border-left-color:#059669 !important;background:#ecfdf5 !important;}
  .section-sub{
    background:#f9fafb !important;border-left:3pt solid #c4943a !important;
    padding:2px 0;font-size:7pt;color:#6b7280 !important;
    letter-spacing:0.2px;border-bottom:0.5pt solid #e5e7eb !important;
  }

  /* Tables */
  table{width:100%;border-collapse:collapse;font-size:7.5pt;}
  thead th{
    background:#edf0f7 !important;color:#1a1a2e !important;
    border-bottom:1.5pt solid #1a1a2e !important;border-top:0.5pt solid #d8dde8 !important;
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
    padding:3px 6px;border-bottom:0.5pt solid #f0f0f0 !important;
    vertical-align:middle;color:#1f2937 !important;
  }
  td:first-child{padding-left:0;}
  td:last-child{
    text-align:right;font-weight:600;font-family:'DM Mono',monospace;
    color:#1a1a2e !important;padding-right:0;
  }
  td:nth-child(2){color:#4b5563 !important;white-space:nowrap;font-size:7.5pt;font-family:'DM Mono',monospace;}
  td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center;color:#6b7280 !important;font-size:7.5pt;font-family:'DM Mono',monospace;}
  tbody tr:nth-child(even) td{background:#fafbfc !important;}
  tr.sep td{
    background:#e4e8f2 !important;color:#1c2a50 !important;font-weight:700;
    font-size:6pt;letter-spacing:1px;text-transform:uppercase;
    padding:3px 6px !important;border-top:0.5pt solid #c8cedf !important;border-bottom:0.5pt solid #c8cedf !important;
  }
  tr.sub td{background:#f9fafb !important;color:#1f2937 !important;}
  tr.sub td:last-child{color:#1a1a2e !important;font-weight:700;}
  tr.tot td{
    background:#e8ebf5 !important;color:#0d1f42 !important;font-weight:700;
    border-top:1.5pt solid #0d1f42 !important;font-size:8pt;
    padding:3.5px 6px !important;
  }
  tr.vrow td{background:#f9fafb !important;color:#6b7280 !important;font-size:7pt;}
  tr.vrow td,tr.lrow td{
    font-family:'DM Mono',monospace;font-style:italic;padding:3px 6px !important;
  }
  tr.lrow td{
    background:#f9fafb !important;color:#6b7280 !important;font-size:7pt;
    border-bottom:1.5pt solid #d1d5db !important;
  }
  tr.grand td{
    background:#edf0f7 !important;color:#0d1f42 !important;font-weight:700;
    font-size:9pt;padding:5px 6px !important;
    border-top:1.5pt solid #0d1f42 !important;
  }
  tr.grand td:last-child{color:#b8860b !important;font-size:11pt;letter-spacing:0.5px;}

  /* Inside / Outside summary */
  .io-summary{
    display:grid;grid-template-columns:1fr 0.5pt 1fr;
    margin:8px 0 0;
    border:0.5pt solid #d0d0d0;border-radius:0;overflow:hidden;
  }
  .io-cell{padding:7px 10px;background:#fff !important;}
  .io-inside{background:#eef4ff !important;border-top:2pt solid #1d4ed8 !important;}
  .io-outside{background:#f5f0ff !important;border-top:2pt solid #7c3aed !important;}
  .io-divider{background:#d0d0d0 !important;}
  .io-tag{
    font-family:'DM Mono',monospace;font-size:5.5pt;
    letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px !important;font-weight:600;
  }
  .io-inside .io-tag{color:#1d4ed8 !important;}
  .io-outside .io-tag{color:#7c3aed !important;}
  .io-label{font-size:6.5pt;color:#6b7280 !important;margin-bottom:3px !important;}
  .io-amount{
    font-family:'DM Sans',sans-serif;font-weight:900;
    font-size:12pt;line-height:1;margin-bottom:3px !important;
  }
  .io-inside .io-amount{color:#1d4ed8 !important;}
  .io-outside .io-amount{color:#7c3aed !important;}
  .io-note{font-size:6pt;color:#9ca3af !important;}

  /* Grand total bar */
  .grand-bar{
    background:#f8f9fc !important;padding:8px 10px;
    margin:8px 0 0;
    border:0.5pt solid #d8dde8 !important;border-top:2pt solid #c4943a !important;
    display:flex;justify-content:space-between;align-items:center;
    border-radius:0;
  }
  .gb-left .gb-label{font-size:8pt !important;color:#0d1f42 !important;}
  .gb-left .gb-sub{font-size:6pt !important;color:#6b7280 !important;margin-top:2px !important;}
  .gb-right{text-align:right;}
  .gb-amount{font-size:16pt !important;color:#b8860b !important;letter-spacing:0.5px;}
  .gb-vat-note{font-size:6pt !important;color:#9ca3af !important;margin-top:2px !important;}

  /* Authorization */
  .auth-section{margin:10px 0 0;border-top:1.5pt solid #1a1a2e !important;}
  .auth-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
  .auth-col{padding:8px 14px 12px;border-right:0.5pt solid #e5e7eb !important;}
  .auth-col:first-child{padding-left:0 !important;}
  .auth-col:last-child{padding-right:0 !important;border-right:none !important;}
  .auth-role{
    font-family:'DM Mono',monospace;font-size:6pt;color:#6b7280 !important;
    text-transform:uppercase;letter-spacing:1.5px;text-align:center;
    padding-top:4px !important;
  }
  .auth-sig-space{min-height:14mm !important;}
  .auth-sig-line{border-bottom:1pt dashed #1a1a2e !important;}

  /* Disclaimer */
  .disclaimer{
    margin:8px 0 0;padding:5px 8px;
    border:0.5pt solid #d0d0d0;border-left:2pt solid #d4a800 !important;
    background:#fffbeb !important;
    font-family:'DM Mono',monospace;font-size:6.5pt;color:#4b5563 !important;
    line-height:1.45;
  }
  .disclaimer strong{color:#1a1a2e !important;}

  /* Document footer */
  .doc-footer{
    display:flex;justify-content:space-between;align-items:center;
    margin:6px 0 0;padding-top:4px;
    border-top:0.5pt solid #e5e7eb !important;
    font-family:'DM Mono',monospace;font-size:6pt;color:#9ca3af !important;
  }
  .doc-footer .df-ref{font-weight:500;color:#6b7280 !important;}
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
        <div class="lh-sub">Wharfrent &amp; Payable Charge Computation</div>
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
    alert('Please generate the bill first before printing.');
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
            rows += `<tr class="sep"><td colspan="6">OLD RATES — Up to 22/07/2024</td></tr>`;
            oldS.forEach(s => {
              const da = isIn ? s.amt : s.amt / 2;
              rows += printTr(
                s.label,
                `${fmtN(isIn ? s.rate : s.rate / 2)}/t/d`,
                fd(s.from),
                fd(s.to),
                s.days,
                fmt(da)
              );
            });
          }
          if (newS.length) {
            rows += `<tr class="sep"><td colspan="6">NEW RATES — From 23/07/2024</td></tr>`;
            newS.forEach(s => {
              const da = isIn ? s.amt : s.amt / 2;
              rows += printTr(
                s.label,
                `${fmtN(isIn ? s.rate : s.rate / 2)}/t/d`,
                fd(s.from),
                fd(s.to),
                s.days,
                fmt(da)
              );
            });
          }
        } else {
          b.slabs.forEach(s => {
            const da = isIn ? s.amt : s.amt / 2;
            rows += printTr(
              s.label,
              `${fmtN(isIn ? s.rate : s.rate / 2)}/t/d`,
              fd(s.from),
              fd(s.to),
              s.days,
              fmt(da)
            );
          });
        }
        rows += printTotRow(
          `${isIn ? 'Car Wharfrent' : 'Car Wharfrent (½ Rate)'} Sub Total — ${b.totalDays} days`,
          fmt(storAmt),
          'sub'
        );
        if (b.payables.length > 0) {
          rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
          b.payables.forEach(p => {
            rows += printTr(
              p.label,
              `${p.rateStr ?? fmtN(p.rate)}/ton`,
              `${b.weight} ton(s)`,
              '—',
              '—',
              fmt(p.amt),
              'sub'
            );
          });
        }
        rows += printTotRow('Total Bill (Base for VAT)', fmt(baseAmt));
        rows += printTotRow(
          `VAT @ ${(b.vatRate * 100).toFixed(1)}%`,
          fmt(vatAmt),
          'vrow'
        );
        rows += printTotRow('Levy Charge (No VAT)', fmt(levyAmt), 'lrow');
        rows += printTotRow(
          `${isIn ? 'INSIDE' : 'OUTSIDE'} GRAND TOTAL`,
          fmt(totAmt),
          'grand'
        );
        const headLabel = isIn ? 'INSIDE WHARFRENT' : 'OUTSIDE WHARFRENT';
        const headBadge = isIn ? 'Full Rate' : '½ Rate Applied';
        const subNote = isIn
          ? 'Full rate — inside shed / warehouse'
          : '½ rate — outside shed / warehouse';
        sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      });
      grandTotal = b.iTotal + b.oTotal;
      grandLabel = 'CAR GRAND TOTAL (INSIDE + OUTSIDE)';
    } else {
      let rows = '';
      b.payables.forEach(p => {
        rows += printTr(
          p.label,
          `${p.rateStr ?? fmtN(p.rate)}/ton`,
          `${b.weight} ton(s)`,
          '—',
          '—',
          fmt(p.amt),
          'sub'
        );
      });
      rows += printTotRow('Total Payable (Base for VAT)', fmt(b.nBase));
      rows += printTotRow(
        `VAT @ ${(b.vatRate * 100).toFixed(1)}%`,
        fmt(b.nVat),
        'vrow'
      );
      rows += printTotRow('Levy Charge (No VAT)', fmt(b.nLevy), 'lrow');
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
      insideLabel: 'Inside Car Wharfrent Bill',
      outsideLabel: 'Outside Car Wharfrent Bill (½ Rate)',
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
        <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
        <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
        <div class="info-cell"><div class="info-label">General Cargo Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : '—'}</div></div>
        <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
        <div class="info-cell"><div class="info-label">Total Weight</div><div class="info-value">${fmtN(b.totalWeight)} ton(s)</div></div>
        <div class="info-cell"><div class="info-label">Inside / Outside</div><div class="info-value">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div>
        <div class="info-cell"><div class="info-label">General Cargo Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + ' days' : 'Free Time'}</div></div>
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
      grandTotal = b.iTotal + b.oTotal;
      grandLabel = 'GENERAL CARGO WHARFRENT GRAND TOTAL — PART BILLING (INSIDE + OUTSIDE)';
    } else if (b.hasWharfrent && includeWharfrent) {
      ['inside', 'outside'].forEach(side => {
        const isIn = side === 'inside';
        const slabs = isIn ? b.insideSlabs : b.outsideSlabs;
        const wharfAmt = isIn ? b.insideWharfrent : b.outsideWharfrent;
        const weight = isIn ? b.insideW : b.outsideW;
        const baseAmt = isIn ? b.iBase : b.oBase;
        const vatAmt = isIn ? b.iVat : b.oVat;
        const levyAmt = isIn ? b.iLevy : b.oLevy;
        const totAmt = isIn ? b.iTotal : b.oTotal;
        const billPayables = isIn ? b.insidePayables : b.outsidePayables;
        let rows = '';
        slabs.forEach(s => {
          const da = isIn ? s.amt : s.amt / 2;
          const dr = isIn ? s.rate : s.rate / 2;
          const rateSuffix = isIn ? '' : ' (½)';
          rows += printTr(
            s.label,
            `${fmtN(dr)}/t/d${rateSuffix}`,
            fd(s.from),
            fd(s.to),
            s.days,
            fmt(da)
          );
        });
        const wharfrentHalfNote = isIn ? '' : ' (½ Rate)';
        rows += printTotRow(
          `General Cargo Wharfrent${wharfrentHalfNote} — ${fmtN(weight)} ton(s) × ${b.totalDays} days`,
          fmt(wharfAmt),
          'sub'
        );
        if (billPayables.length > 0) {
          rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
          billPayables.forEach(p => {
            rows += printTr(
              p.label,
              `${fmtN(p.rate)}/ton`,
              `${fmtN(p.tons)} ton(s)`,
              '—',
              '—',
              fmt(p.amt),
              'sub'
            );
          });
        }
        rows += printTotRow('Total Bill (Base for VAT)', fmt(baseAmt));
        rows += printTotRow(
          `VAT @ ${(b.vatRate * 100).toFixed(1)}%`,
          fmt(vatAmt),
          'vrow'
        );
        rows += printTotRow('Levy Charge (No VAT)', fmt(levyAmt), 'lrow');
        rows += printTotRow(
          `${isIn ? 'INSIDE' : 'OUTSIDE'} GRAND TOTAL (${fmtN(weight)}t)`,
          fmt(totAmt),
          'grand'
        );
        const headLabel = isIn ? `INSIDE WHARFRENT` : `OUTSIDE WHARFRENT`;
        const headBadge = isIn
          ? `${fmtN(b.insideW)} ton(s) — Full Rate`
          : `${fmtN(b.outsideW)} ton(s) — ½ Rate`;
        const subNote = isIn
          ? 'Full rate applied — inside shed / warehouse'
          : '½ rate applied — outside shed / warehouse';
        sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      });
      grandTotal = b.iTotal + b.oTotal;
      grandLabel = 'GENERAL CARGO WHARFRENT GRAND TOTAL (INSIDE + OUTSIDE)';
    } else {
      // Payable-only: either free time OR wharfrent toggled off
      let rows = '';
      const rawPayList = b.payables && b.payables.length > 0 ? b.payables
        : [...(b.insidePayables || []), ...(b.outsidePayables || [])];
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
        rows += printTr(p.label, `${fmtN(p.rate)}/ton`, `${fmtN(p.tons ?? b.totalWeight)} ton(s)`, '—', '—', fmt(p.amt), 'sub');
      });
      if (b.nBase > 0) rows += printTotRow('Total Payable (Base for VAT)', fmt(b.nBase));
      if (b.nVat  > 0) rows += printTotRow(`VAT @ ${(b.vatRate * 100).toFixed(1)}%`, fmt(b.nVat), 'vrow');
      if (b.nLevy > 0) rows += printTotRow('Levy Charge (No VAT)', fmt(b.nLevy), 'lrow');
      rows += printTotRow('GRAND TOTAL', fmt(b.nTotal), 'grand');
      const payableBadge = `${fmtN(b.totalWeight)} ton(s)${!includeWharfrent ? ' — Wharfrent Excluded' : ' — Within Free Time'}`;
      const payableNote  = !includeWharfrent
        ? 'Wharfrent charges excluded — payable charges only'
        : 'No wharfrent — delivery within free storage period';
      sectionsHtml += `${secHead('PAYABLE CHARGES', payableBadge)}<div class="section-sub">${payableNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      grandTotal = b.nTotal;
      grandLabel = 'GENERAL CARGO GRAND TOTAL';
    }
    // Charge composition breakdown — only when wharfrent is included
    if (includeWharfrent) sectionsHtml += buildCargoBreakdownPrintHtml(b);
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
      insideLabel: `Inside General Cargo Wharfrent — ${fmtN(b.insideW)} ton(s) initial${b.isPartBilling ? ' (Part Billing)' : ''}`,
      outsideLabel: `Outside General Cargo Wharfrent — ${fmtN(b.outsideW)} ton(s) initial (½ Rate)${b.isPartBilling ? ' (Part Billing)' : ''}`,
      iTotal: hasW ? b.iTotal : 0,
      oTotal: hasW ? b.oTotal : 0,
      totalLevy: b.totalLevy || 0,
    };
  }

  const html = buildInvoiceHtml(opts);
  openPrintPreview(html, opts.title, billRef, type === 'cargo');
  } catch (e) {
    console.error('printBill error', e);
    alert('An error occurred while building the print preview. Please try again.');
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

carRefresh();
cargoRefresh();
isInitialLoad = false;

// Card stagger animations
document.querySelectorAll('.card').forEach((card, i) => {
  card.style.setProperty('--card-delay', `${0.7 + i * 0.1}s`);
});

// Hidden admin access: Ctrl+Shift+A
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    toggleAdmin();
  }
});

// IntersectionObserver for [data-reveal] elements
if ('IntersectionObserver' in globalThis) {
  const revealObs = new IntersectionObserver(
    entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('revealed');
          revealObs.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll('[data-reveal]').forEach(el => {
    revealObs.observe(el);
  });
}

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
