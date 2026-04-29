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
let loginAttempts = 0;
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
      <button onclick="event.stopPropagation(); calendarPickers['${this.inputId}'].previousMonth()" style="background:var(--gold);border:none;border-radius:3px;padding:4px 7px;cursor:pointer;font-size:13px;">&lsaquo;</button>
      <span style="color:var(--m1);font-weight:600;font-size:14px;">${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
      <button onclick="event.stopPropagation(); calendarPickers['${this.inputId}'].nextMonth()" style="background:var(--gold);border:none;border-radius:3px;padding:4px 7px;cursor:pointer;font-size:13px;">&rsaquo;</button>
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
  const sp = document.getElementById(spanId);
  if (sp) sp.textContent = document.getElementById(inputId).value;
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
    errEl.textContent = 'Too many failed attempts. Refresh the page to try again.';
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
      isAdmin = true;
      closeModal();
      applyAdmin();
    } else {
      loginAttempts++;
      const remaining = 5 - loginAttempts;
      errEl.textContent = remaining > 0
        ? `Invalid username or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many failed attempts. Refresh the page to try again.';
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
  document.getElementById('modeBadge').style.display = isAdmin ? '' : 'none';
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
  const w = Number.parseFloat(document.getElementById('weight').value);
  const warn = document.getElementById('weightWarn');
  w >= 4 ? warn.classList.add('show') : warn.classList.remove('show');
  carRefresh();
}

function carCompute() {
  const cld = pd(document.getElementById('cld').value);
  const freeDays =
    Number.parseInt(document.getElementById('freeDays').value, 10) || 4;
  const freeEnd = addD(cld, freeDays - 1);
  const storStart = addD(freeEnd, 1);
  const delivery = pd(document.getElementById('delivery').value);
  const weight = Math.min(
    3,
    Math.max(
      1,
      Math.round(
        Number.parseFloat(document.getElementById('weight').value) || 2
      )
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
        `<div class="pvr pvr-grand"><span class="pvr-lbl">Car Wharfrent Grand Total</span><span class="pvr-val v-gold">${fmt(b.iTotal + b.oTotal)}</span></div>`;
    } else {
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Car Wharfrent</span><span class="pvr-val v-green">Within Free Time ✓</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Car Payable Charges</span><span class="pvr-val">${fmt(b.paySub)}</span></div>` +
        `<div class="pvr pvr-grand"><span class="pvr-lbl">Car Wharfrent Grand Total</span><span class="pvr-val v-gold">${fmt(b.nTotal)}</span></div>`;
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
        rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Car Bill (Base for VAT)</td><td>${fmt(baseAmt)}</td></tr><tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(vatAmt)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(levyAmt)}</td></tr><tr class="grand"><td colspan="5">Car Wharfrent Grand Total</td><td>${fmt(totalAmt)}</td></tr>`;
  } else {
    if (b.payables.length > 0) {
      b.payables.forEach(p => {
        rows += `<tr class="sub"><td>${p.label}</td><td>${fmtN(p.rate)}/ton</td><td colspan="2">${b.weight} ton(s)</td><td></td><td>${fmt(p.amt)}</td></tr>`;
      });
    }
    rows += `<tr class="tot"><td colspan="5">Total Car Payable (Base for VAT)</td><td>${fmt(b.nBase)}</td></tr><tr class="vrow"><td colspan="5">VAT (${(b.vatRate * 100).toFixed(1)}%)</td><td>${fmt(b.nVat)}</td></tr><tr class="lrow"><td colspan="5">Levy Charge (no VAT)</td><td>${fmt(b.nLevy)}</td></tr><tr class="grand"><td colspan="5">Car Wharfrent Grand Total</td><td>${fmt(b.nTotal)}</td></tr>`;
  }
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function carCalculate() {
  //NOSONAR
  const rawW = Number.parseFloat(document.getElementById('weight').value) || 2;
  if (rawW >= 4) {
    alert(
      '⚠ This module only handles vehicles up to 3 tons. Weight of 4+ tons cannot be billed here.'
    );
    return;
  }
  const b = carCompute();
  if (!b) return;
  lastCarBill = b;
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
      `<div class="sc cg"><div class="sl">Car Wharfrent Grand Total</div><div class="sv">${fmtN(b.iTotal + b.oTotal)}</div><div class="ss">Inside + Outside</div></div><div class="sc cb"><div class="sl">Inside Car Wharfrent Bill</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div><div class="sc cp"><div class="sl">Outside Car Wharfrent Bill</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div>`;
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
    ? `<div><div class="glbl">Inside Car Wharfrent Grand Total</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">Incl. VAT &amp; Levy</div></div><div><div class="glbl">Outside Car Wharfrent Grand Total</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">Incl. VAT &amp; Levy</div></div>`
    : `<div><div class="glbl">Car Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No Car Wharfrent — flat only</div></div><div></div>`;
  document.getElementById('car-grandSec').innerHTML =
    `<div class="gbox"><div class="ginn">${carGrandSplitHtml}<div class="gfin"><div class="glbl">CAR WHARFRENT GRAND TOTAL</div><div class="gval">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;
  if (!isInitialLoad) {
    setTimeout(
      () =>
        document
          .getElementById('results')
          .scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80
    );
  }
}

function carReset() {
  document.getElementById('results').style.display = 'none';
  document.getElementById('car-preview').innerHTML = SP_CAR_IDLE;
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
  const hasWharfrent = delivery > freeEnd;
  let insideSlabs = [],
    outsideSlabs = [],
    totalDays = 0;

  if (hasWharfrent) {
    totalDays = diffD(freeEnd, delivery);
    insideSlabs = calcSlabs(
      totalDays,
      or1,
      or2,
      or3,
      insideW,
      storStart,
      delivery,
      0
    );
    outsideSlabs = calcSlabs(
      totalDays,
      or1,
      or2,
      or3,
      outsideW,
      storStart,
      delivery,
      0
    );
  }

  // Inside wharfrent = full rate × insideW tons
  const insideWharfrent = insideSlabs.reduce((a, s) => a + s.amt, 0);
  // Outside wharfrent = ½ × (full rate × outsideW tons)
  const outsideWharfrent = outsideSlabs.reduce((a, s) => a + s.amt, 0) / 2;

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
    if (hasWharfrent) {
      // Split by portion when wharfrent applies - only for tons > 0
      if (insideW > 0) {
        payables.push({
          label: 'Hoisting Charge',
          rate: dynamicHoistingRate,
          tons: insideW,
          amt: dynamicHoistingRate * insideW,
          portion: 'inside',
        });
      }
      if (outsideW > 0) {
        payables.push({
          label: 'Hoisting Charge',
          rate: dynamicHoistingRate,
          tons: outsideW,
          amt: dynamicHoistingRate * outsideW,
          portion: 'outside',
        });
      }
    } else {
      // Use total tons when in free time
      payables.push({
        label: 'Hoisting Charge',
        rate: dynamicHoistingRate,
        tons: totalWeight,
        amt: dynamicHoistingRate * totalWeight,
        portion: 'total',
      });
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
  };
}

function cargoRefreshNow() {
  try {
    cargoValidateSplit();
    cargoValidateRemovalTon();
    cargoValidateWeighmentTon();
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
      const sp = document.getElementById(id.replace('c-', 'c-d'));
      if (sp) sp.textContent = document.getElementById(id).value;
    });
    const b = cargoCompute();
    if (!b) return;
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
    document.getElementById('cargo-rbadge').innerHTML =
      `<div class="rbadge rb-new">● CARGO RATES — Landing Tier: ${getCargoTierLabel(b.totalWeight)}</div>`;
    const pv = document.getElementById('cargo-preview');
    const inside = Math.round(
      Number.parseFloat(document.getElementById('c-inside').value) || 0
    );
    const outside = Math.round(
      Number.parseFloat(document.getElementById('c-outside').value) || 0
    );
    if (b.hasWharfrent) {
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
  const b = cargoCompute();
  if (!b) return;
  lastCargoBill = b;
  document.getElementById('cargo-results').style.display = 'block';

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

  const grand = b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
  const cargoGrandSplitHtml = b.hasWharfrent
    ? `<div><div class="glbl">Inside General Cargo Wharfrent Grand Total (${fmtN(b.insideW)}t)</div><div class="gval" style="color:var(--blue)">${fmt(b.iTotal)}</div><div class="gsub">Full rate + VAT + Levy</div></div><div><div class="glbl">Outside General Cargo Wharfrent Grand Total (${fmtN(b.outsideW)}t)</div><div class="gval" style="color:var(--purple)">${fmt(b.oTotal)}</div><div class="gsub">½ rate + VAT + Levy</div></div>`
    : `<div><div class="glbl">General Cargo Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No General Cargo Wharfrent — flat only</div></div><div></div>`;
  document.getElementById('cargo-grandSec').innerHTML =
    `<div class="gbox cargo-grand"><div class="ginn">${cargoGrandSplitHtml}<div class="gfin"><div class="glbl">GENERAL CARGO GRAND TOTAL</div><div class="gval" style="color:var(--cargo-accent)">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;

  if (!isInitialLoad) {
    setTimeout(
      () =>
        document
          .getElementById('cargo-results')
          .scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80
    );
  }
}

function cargoReset() {
  document.getElementById('cargo-results').style.display = 'none';
  document.getElementById('cargo-preview').innerHTML = SP_CARGO_IDLE;
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

  const splitSummaryHtml = opts.showSplit
    ? `<div class="io-summary no-break">
        <div class="io-cell io-inside">
          <div class="io-tag">Inside &mdash; Full Rate</div>
          <div class="io-label">${opts.insideLabel}</div>
          <div class="io-amount">${fmt(opts.iTotal)}</div>
          <div class="io-note">Full wharfrent rate &mdash; incl. VAT &amp; Levy</div>
        </div>
        <div class="io-divider"></div>
        <div class="io-cell io-outside">
          <div class="io-tag">Outside &mdash; Half Rate</div>
          <div class="io-label">${opts.outsideLabel}</div>
          <div class="io-amount">${fmt(opts.oTotal)}</div>
          <div class="io-note">Half wharfrent rate &mdash; incl. VAT &amp; Levy</div>
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
/* ─── RESET ─── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:10pt;}
body{
  font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;
  color:#1c2130;background:#e8eaf0;line-height:1.6;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ─── DOCUMENT CARD ─── */
.invoice{
  max-width:880px;margin:0 auto;
  background:#fff;overflow:hidden;
}
@media screen{
  .invoice{
    margin:26px auto 48px;
    border-radius:3px;
    box-shadow:0 1px 4px rgba(10,20,50,0.10),0 6px 28px rgba(10,20,50,0.10);
  }
}

/* ─── CLASSIFICATION STRIP ─── */
.cls-strip{
  display:flex;justify-content:space-between;align-items:center;
  background:#fff;padding:5px 26px;
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;
  border-bottom:1px solid #d8dde8;
}
.cls-strip .cls-l{color:#5a6481;}
.cls-strip .cls-r{color:#9aa3b8;font-size:6.5pt;}

/* ─── LETTERHEAD ─── */
.lh{
  display:flex;justify-content:space-between;align-items:flex-start;
  padding:22px 26px 18px;
  border-bottom:2.5px solid #0d1f42;
  background:#fff;
}
.lh-left{display:flex;align-items:flex-start;gap:13px;}
.lh-emblem{flex-shrink:0;margin-top:1px;}
.lh-logo{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:17pt;letter-spacing:4px;color:#0d1f42;
  line-height:1;text-transform:uppercase;
}
.lh-rule{width:38px;height:2.5px;background:linear-gradient(90deg,#c4943a,#e8c87a);margin:6px 0 7px;}
.lh-sub{font-size:7.8pt;color:#5a6481;letter-spacing:1.5px;text-transform:uppercase;font-family:'DM Mono',monospace;}
.lh-right{text-align:right;}
.lh-doc-label{
  display:inline-block;padding:3px 9px;
  background:transparent;color:#5a6481;
  border:1px solid #d8dde8;
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;border-radius:2px;
  margin-bottom:7px;
}
.lh-bill-name{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:13pt;color:#0d1f42;letter-spacing:1.5px;
  text-transform:uppercase;line-height:1.15;margin-bottom:10px;
}
.lh-meta{border-collapse:collapse;margin-left:auto;}
.lh-meta-lbl{
  font-size:7.2pt;color:#8a93a8;text-transform:uppercase;
  letter-spacing:0.5px;padding:2px 12px 2px 0;
  text-align:left;font-family:'DM Mono',monospace;white-space:nowrap;
}
.lh-meta-val{
  font-size:8.2pt;color:#1c2130;font-weight:600;
  font-family:'DM Mono',monospace;text-align:right;padding:2px 0;
  white-space:nowrap;
}
.lh-badge{
  display:inline-block;margin-top:7px;padding:2px 8px;
  border:1px solid #d0d4e0;font-size:6.8pt;color:#9aa3b8;
  letter-spacing:1px;text-transform:uppercase;font-family:'DM Mono',monospace;
}

/* ─── TITLE BAND ─── */
.title-band{
  background:#fff;padding:12px 26px;
  border-left:4px solid #c4943a;
  border-top:1px solid #d8dde8;
  border-bottom:1px solid #d8dde8;
}
.title-band h1{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:10.5pt;color:#1c2130;letter-spacing:2px;text-transform:uppercase;
}
.title-band p{font-size:8.2pt;color:#5a6481;letter-spacing:0.3px;margin-top:2px;}

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
  border-left:4px solid #c4943a;
  border-bottom:2px solid #1c2130;
  display:flex;justify-content:space-between;align-items:center;
}
.section-head>span:first-child{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;
  color:#1c2130;
}
.sh-accent{
  font-family:'DM Mono',monospace;font-size:7.8pt;font-weight:500;
  letter-spacing:0.5px;white-space:nowrap;
  color:#5a6481;border:1px solid #d8dde8;padding:2px 9px;border-radius:2px;
}
.section-sub{
  background:#f8f9fc;border-left:4px solid #c4943a;
  padding:6px 26px;font-size:8.2pt;color:#5a6481;
  letter-spacing:0.3px;border-bottom:1px solid #d8dde8;
}

/* ─── TABLES ─── */
table{width:100%;border-collapse:collapse;font-size:8.8pt;}
thead th{
  background:#f0f3f9;
  border-bottom:2px solid #0d1f42;border-top:1px solid #d8dde8;
  padding:8px 10px;text-align:left;
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:7.8pt;letter-spacing:0.5px;text-transform:uppercase;
  color:#3a4460;white-space:nowrap;
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
  background:#e4e8f2;font-weight:700;color:#0d1f42;
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
  background:#f0f3f9;color:#0d1f42;font-weight:700;
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
  border:1px solid #d8dde8;border-radius:2px;overflow:hidden;
}
.io-cell{padding:18px 22px;background:#fff;}
.io-inside{background:#f0f5ff;}
.io-outside{background:#f4f0ff;}
.io-divider{background:#d8dde8;}
.io-tag{
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;font-weight:500;
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
  border-radius:2px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.gb-left .gb-label{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:2px;text-transform:uppercase;color:#1c2130;
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
.auth-sig-line{border-bottom:1px solid #1c2130;}

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
  .gb-amount{font-size:17pt;}
  .auth-row{grid-template-columns:1fr;gap:0;}
  .auth-col{padding:20px 16px 24px !important;border-right:none !important;}
  .disclaimer,.doc-footer,.cls-strip{margin-left:16px;margin-right:16px;}
  .cls-strip{padding-left:16px;padding-right:16px;}
  .split-warn{padding:8px 16px;}
}

/* ─── PAGE CONTROL ─── */
.no-break{page-break-inside:avoid;break-inside:avoid;}
@page{margin:11mm 13mm;size:A4 portrait;}
@media print{
  html,body{
    width:210mm;
    font-size:9pt;line-height:1.35;
    color:#000 !important;background:#fff !important;
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
  .invoice{width:100%;max-width:100%;margin:0;box-shadow:none;border-radius:0;}

  .cls-strip{
    background:#fff !important;padding:4px 18px;
    border-bottom:1px solid #ccc !important;font-size:6.5pt;
  }
  .cls-strip .cls-l{color:#555 !important;}
  .cls-strip .cls-r{color:#999 !important;}

  .lh{padding:13px 18px 11px;border-bottom:2px solid #1c2130 !important;}
  .lh-logo{font-size:13pt;letter-spacing:2px;color:#000 !important;}
  .lh-rule{height:1.5px;margin:3px 0 5px;background:#aaa !important;}
  .lh-sub{color:#555 !important;}
  .lh-doc-label{background:transparent !important;color:#555 !important;border-color:#ccc !important;padding:2px 6px;font-size:6.5pt;}
  .lh-bill-name{font-size:10.5pt;letter-spacing:0.8px;color:#000 !important;}
  .lh-meta-lbl{color:#666 !important;}
  .lh-meta-val{color:#000 !important;font-size:7.8pt;}
  .lh-badge{border-color:#ccc !important;color:#888 !important;}

  .title-band{
    background:#fff !important;padding:8px 18px;
    border-left:4px solid #c4943a !important;
    border-top:1px solid #ccc !important;border-bottom:1px solid #ccc !important;
  }
  .title-band h1{font-size:9.2pt;letter-spacing:0.8px;color:#000 !important;}
  .title-band p{font-size:7.8pt;color:#555 !important;}

  .split-warn{padding:6px 18px;background:#fffbea !important;border-top:2px solid #d4a800 !important;font-size:8pt;}

  .info-section-label{padding:9px 18px 5px;font-size:7pt;color:#777 !important;}
  .info-grid{margin:0 18px 4px;border-color:#ccc !important;}
  .info-cell{padding:7px 10px;background:#fff !important;border-color:#ccc !important;}
  .info-cell:nth-child(odd){background:#f9f9f9 !important;}
  .info-label{font-size:6.8pt;color:#777 !important;}
  .info-value{font-size:8.8pt;color:#000 !important;}

  .section-head{
    background:#fff !important;margin-top:11px;padding:7px 18px 6px;
    border-left:4px solid #c4943a !important;border-bottom:2px solid #000 !important;
  }
  .section-head>span:first-child{font-size:8.2pt;color:#000 !important;}
  .sh-accent{color:#444 !important;font-size:7.5pt;border-color:#ccc !important;}
  .section-sub{padding:5px 18px;font-size:7.8pt;color:#333 !important;background:#f9f9f9 !important;border-left:4px solid #c4943a !important;border-bottom:1px solid #ddd !important;-webkit-print-color-adjust:exact !important;}

  table{font-size:7.8pt;}
  thead th{
    padding:5px 8px;font-size:7.2pt;
    background:#f0f0f0 !important;color:#000 !important;
    border-bottom:1.5px solid #1c2130 !important;border-top:1px solid #ddd !important;
    -webkit-print-color-adjust:exact !important;
  }
  thead th:first-child{padding-left:18px;}
  thead th:last-child{padding-right:18px;}
  td{padding:5px 8px;border-bottom:1px solid #e8e8e8 !important;color:#000 !important;}
  td:first-child,tr.sep td:first-child,tr.sub td:first-child,tr.tot td:first-child,tr.vrow td:first-child,tr.lrow td:first-child,tr.grand td:first-child{padding-left:18px;}
  td:last-child,tr.grand td:last-child{padding-right:18px;}
  td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){color:#222 !important;}
  tbody tr:nth-child(even) td{background:#fafafa !important;}
  tr.sep td{background:#e6e6e6 !important;color:#000 !important;border-top:1px solid #ccc !important;border-bottom:1px solid #ccc !important;font-size:7pt;-webkit-print-color-adjust:exact !important;}
  tr.sub td{background:#f5f5f5 !important;color:#000 !important;}
  tr.tot td{background:#e6e6e6 !important;color:#000 !important;border-top:1.5px solid #1c2130 !important;font-size:8.5pt;-webkit-print-color-adjust:exact !important;}
  tr.vrow td,tr.lrow td{background:#f8f8f8 !important;color:#333 !important;font-size:7.5pt;}
  tr.lrow td{border-bottom:1.5px solid #ccc !important;}
  tr.grand td{background:#f0f0f0 !important;color:#000 !important;font-size:9pt;padding:8px;border-top:1.5px solid #000 !important;-webkit-print-color-adjust:exact !important;}
  tr.grand td:last-child{color:#c4943a !important;font-size:10.5pt;}

  .io-summary{margin:11px 18px 0;border-color:#ccc !important;}
  .io-cell{padding:11px 14px;}
  .io-inside{background:#eff4ff !important;-webkit-print-color-adjust:exact !important;}
  .io-outside{background:#f3efff !important;-webkit-print-color-adjust:exact !important;}
  .io-divider{background:#ccc !important;}
  .io-tag{font-size:6.5pt;color:#444 !important;}
  .io-inside .io-tag{color:#1a3a8a !important;}
  .io-outside .io-tag{color:#4a1a8a !important;}
  .io-label{font-size:7.5pt;color:#444 !important;}
  .io-amount{font-size:12.5pt;}
  .io-inside .io-amount{color:#1a3a8a !important;}
  .io-outside .io-amount{color:#4a1a8a !important;}
  .io-note{font-size:7pt;color:#777 !important;}

  .grand-bar{
    margin:11px 18px 0;padding:13px 18px;
    background:#f5f5f5 !important;border-top:3px solid #c4943a !important;
    border:1px solid #ccc !important;border-top:3px solid #c4943a !important;
    border-radius:0;-webkit-print-color-adjust:exact !important;
  }
  .gb-label{font-size:8.5pt;color:#000 !important;}
  .gb-sub{font-size:7.2pt;color:#555 !important;}
  .gb-amount{font-size:17pt;color:#c4943a !important;}
  .gb-vat-note{font-size:7.2pt;color:#666 !important;}

  .auth-section{margin:14px 0 0;border-top:1.5px solid #000 !important;}
  .auth-row{gap:0;}
  .auth-col{padding:18px 26px 22px;}
  .auth-col:first-child{padding-left:18px !important;}
  .auth-col:last-child{padding-right:18px !important;border-right:none !important;}
  .auth-role{font-size:6.5pt;color:#555 !important;padding-top:6px;}
  .auth-sig-space{min-height:1in;}
  .auth-sig-line{border-bottom-color:#000 !important;}

  .disclaimer{
    margin:13px 18px 0;padding:8px 12px;
    border-color:#ccc !important;border-left:2px solid #b0a000 !important;
    background:#fff !important;font-size:7.5pt;line-height:1.5;
  }
  .disclaimer strong{color:#333 !important;}

  .doc-footer{
    margin:10px 18px 14px;padding-top:6px;
    border-top:1px solid #ccc !important;
    font-size:6.8pt;color:#888 !important;
  }
  .doc-footer .df-ref{color:#555 !important;}
}
</style>
</head>
<body>
<div class="invoice">

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
      <div class="gb-sub">Bangladeshi Taka &mdash; Base + VAT + Levy all inclusive</div>
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
  return `<div class="section-head"><span>${label}</span>${badgeHtml}</div>`;
}

function printBill(type) {
  // NOSONAR
  const b = type === 'car' ? lastCarBill : lastCargoBill;
  if (!b) {
    alert('Please generate the bill first before printing.');
    return;
  }

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
              `${fmtN(p.rate)}/ton`,
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
      grandLabel = 'CAR WHARFRENT GRAND TOTAL (INSIDE + OUTSIDE)';
    } else {
      let rows = '';
      b.payables.forEach(p => {
        rows += printTr(
          p.label,
          `${fmtN(p.rate)}/ton`,
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
      grandLabel = 'CAR WHARFRENT GRAND TOTAL';
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
    };
  } else {
    // ── CARGO INFO GRID ──
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

    // ── CARGO SECTIONS ──
    if (b.hasWharfrent) {
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
      let rows = '';
      b.payables.forEach(p => {
        rows += printTr(
          p.label,
          `${fmtN(p.rate)}/ton`,
          `${fmtN(p.tons ?? b.totalWeight)} ton(s)`,
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
      const payableBadge = `${fmtN(b.totalWeight)} ton(s) — Within Free Time`;
      sectionsHtml += `${secHead('PAYABLE CHARGES', payableBadge)}<div class="section-sub">No wharfrent — delivery within free storage period</div><div class="no-break">${buildPrintTable(rows)}</div>`;
      grandTotal = b.nTotal;
      grandLabel = 'GENERAL CARGO WHARFRENT GRAND TOTAL';
    }
    opts = {
      title: 'GENERAL CARGO BILL',
      subtitle: 'Port Authority — General Cargo Wharfrent & Payable Charges',
      billRef,
      today,
      infoHtml,
      sectionsHtml,
      grandTotal,
      grandLabel,
      vatRate: b.vatRate,
      isSplit: false,
      showSplit: b.hasWharfrent,
      insideLabel: `Inside General Cargo Wharfrent — ${fmtN(b.insideW)} ton(s)`,
      outsideLabel: `Outside General Cargo Wharfrent — ${fmtN(b.outsideW)} ton(s) (½ Rate)`,
      iTotal: b.hasWharfrent ? b.iTotal : 0,
      oTotal: b.hasWharfrent ? b.oTotal : 0,
    };
  }

  const html = buildInvoiceHtml(opts);
  const win = window.open('', '_blank', 'width=870,height=1150,scrollbars=yes');
  if (win === null) {
    alert('Pop-up blocked. Please allow pop-ups for this page and try again.');
    return;
  }
  const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
  const importedRoot = win.document.importNode(parsedDoc.documentElement, true);
  win.document.replaceChild(importedRoot, win.document.documentElement);
  win.focus();
  const applySinglePageFit = () => {
    const invoice = win.document.querySelector('.invoice');
    if (!invoice) return;
    invoice.style.zoom = '1';
    invoice.style.transform = 'none';
    invoice.style.width = '100%';
    invoice.style.transformOrigin = 'top center';
    // A4 printable area matching @page{margin:11mm 13mm;size:A4 portrait}
    const printableHeightPx = (297 - 11 - 11) / 25.4 * 96; // 275mm → ~1039px
    const printableWidthPx  = (210 - 13 - 13) / 25.4 * 96; // 184mm →  ~695px
    const contentHeight = Math.max(invoice.scrollHeight, invoice.offsetHeight);
    const contentWidth = Math.max(invoice.scrollWidth, invoice.offsetWidth);
    const hScale = printableHeightPx / Math.max(1, contentHeight);
    const wScale = printableWidthPx / Math.max(1, contentWidth);
    const scale = Math.min(1, hScale, wScale);
    if (scale < 1) {
      invoice.style.zoom = String(scale);
    }
  };
  const printWhenReady = () => {
    const fontsApi =
      win.document && 'fonts' in win.document ? win.document.fonts : null;
    const ready = fontsApi ? fontsApi.ready : null;
    if (ready !== null) {
      ready.finally(() => {
        applySinglePageFit();
        setTimeout(() => win.print(), 220);
      });
      return;
    }
    setTimeout(() => {
      applySinglePageFit();
      win.print();
    }, 900);
  };
  if (win.document.readyState === 'complete') {
    printWhenReady();
  } else {
    win.addEventListener('load', printWhenReady, { once: true });
  }
}

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
document.getElementById('year').textContent = new Date().getFullYear();
globalThis.scrollTo(0, 0);
history.scrollRestoration = 'manual';

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
