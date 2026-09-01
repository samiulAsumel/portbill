// car.js — Car (vehicle) wharfage billing engine, plus the Rotation
// Number registry UI (car-only integration). Depends on core.js
// (calcSlabs, calcVATmpa, ceilTon, RATE_DEFAULTS, PROXY_URL, state, utils).
// Worker I/O for rotations lives in platform.js; this file owns the UI.

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

// Core billing math (split-rate slabs, hoisting/removal, free-time); branching mirrors the
// MPA tariff rules and is covered by tests/vat.test.js indirectly via calcVATmpa —
// decomposing risks silently changing bill totals.
// eslint-disable-next-line sonarjs/cognitive-complexity
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
    ceilTon(document.getElementById("weight").value) || 2,
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
      rateStr: `${fmtN(nn("rLanding"))} × 2`,
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
  const r2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
  const paySub = payables.reduce((a, p) => a + p.amt, 0);
  // Car module: Inside (full rate) and Outside (½ rate) are each a COMPLETE
  // bill — base (wharfrent + payables) + its own VAT + its own Levy. VAT and
  // Levy are shown per section, and the Car Grand Total is their sum.
  const iBase = r2(insideStor + paySub);
  const iVat = calcVATmpa(iBase, vatRate * 100);
  const iLevy = levyAmt;
  const iTotal = r2(iBase + iVat + iLevy);
  const oBase = r2(outsideHalf + paySub);
  const oVat = calcVATmpa(oBase, vatRate * 100);
  const oLevy = levyAmt;
  const oTotal = r2(oBase + oVat + oLevy);
  const nBase = r2(paySub);
  const nVat = calcVATmpa(nBase, vatRate * 100);
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

// Live-preview renderer mirrors carCalculate's branching (wharfrent vs free-time); splitting
// it risks the preview and the final bill silently drifting apart.
// eslint-disable-next-line sonarjs/cognitive-complexity
function carRefreshNow() {
  try {
    validateDateField("cld", "cld-hint", "CLD");
    validateDateField("delivery", "delivery-hint", "delivery date");
    validateDateOrder("cld", "delivery", "delivery-hint");
    validateDateField("car-billEntryDate", "car-billEntryDate-hint", "B/E Date");
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
              .join(" ") +
            `<span style="color:var(--m2)"> → Car Wharfrent starts </span><span style="color:var(--green);font-weight:600;">${storStartDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>`;
      strip.style.display = "block";
    }
    ["nr1", "nr2", "nr3", "or1", "or2", "or3"].forEach((id) => {
      const sp = document.getElementById("d" + id);
      if (sp) sp.textContent = document.getElementById(id).value;
    });
    const w = Math.max(
      1,
      ceilTon(document.getElementById("weight").value) || 2,
    );
    const rLanding = nn("rLanding");
    const rHoistingEl = document.getElementById("rHoisting");
    if (w > 3) {
      rHoistingEl.value = (rLanding * 1.25 * 0.5).toFixed(3);
    } else {
      rHoistingEl.value = 0;
    }
    // Removal Charge — MPA Tariff §8.3 (manual removal): always 2× Landing Charge
    const rRemovalEl = document.getElementById("rRemoval");
    if (rRemovalEl) rRemovalEl.value = (rLanding * 2).toFixed(2);
    const b = carCompute();
    if (!b) return;
    const RATE_BADGE_HTML = {
      split: '<div class="rbadge rb-split">⚡ SPLIT BILLING — Old + New rates</div>',
      old: '<div class="rbadge rb-old">● OLD RATES (Up to 22/07/2024)</div>',
      new: '<div class="rbadge rb-new">● NEW RATES (From 23/07/2024)</div>',
    };
    const rateBadgeHtml = RATE_BADGE_HTML[b.rateMode] ?? RATE_BADGE_HTML.new;
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
  } catch (e) {
    dbg.warn("carRefreshNow failed:", e);
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

// Renders the split-billing (old/new rate) bill table for inside/outside/self-drive; each
// branch maps 1:1 to a billing rule and must stay readable next to the numbers it renders,
// not hidden behind extra indirection.
// eslint-disable-next-line sonarjs/cognitive-complexity
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
  } catch (e) {
    dbg.warn("carCompute failed:", e);
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
    const RATE_MODE_COLOR = { split: "var(--gold)", old: "var(--red)", new: "var(--green)" };
    const RATE_MODE_TEXT = { split: "Split", old: "Old Rates", new: "New Rates" };
    const rateModeColor = RATE_MODE_COLOR[b.rateMode] ?? RATE_MODE_COLOR.new;
    const rateModeText = RATE_MODE_TEXT[b.rateMode] ?? RATE_MODE_TEXT.new;
    const billNoHtml = b.billNumber
      ? `<div class="ii bill-no-ii"><div class="il">Bill Number</div><div class="iv bill-no-val">${b.billNumber}</div></div>`
      : "";
    const cnfHtml = b.cnfName
      ? `<div class="ii"><div class="il">C&amp;F Agent</div><div class="iv">${b.cnfName}</div></div>`
      : "";
    const blHtml = b.blNumber
      ? `<div class="ii"><div class="il">BL Number</div><div class="iv">${b.blNumber}</div></div>`
      : "";
    const beNoHtml = b.billEntryNumber
      ? `<div class="ii"><div class="il">Bill of Entry</div><div class="iv">${b.billEntryNumber}</div></div>`
      : "";
    const beDateHtml = b.billEntryDate
      ? `<div class="ii"><div class="il">B/E Date</div><div class="iv">${b.billEntryDate}</div></div>`
      : "";
    document.getElementById("car-ibar").innerHTML =
      `<div class="ibar"><div>${billNoHtml}${cnfHtml}${blHtml}${beNoHtml}${beDateHtml}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Car Wharfrent Starts</div><div class="iv">${wharfrentStarts}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Weight</div><div class="iv">${b.weight} ton(s)</div></div><div class="ii"><div class="il">Car Wharfrent Days</div><div class="iv" style="color:var(--gold)">${wharfrentDaysText}</div></div><div class="ii"><div class="il">Rate Mode</div><div class="iv" style="color:${rateModeColor}">${rateModeText}</div></div></div></div>`;
    const grand = b.hasWharfrent ? b.iTotal + b.oTotal : b.nTotal;
    const carSrowEl = document.getElementById("car-srow");
    carSrowEl.style.gridTemplateColumns = b.hasWharfrent ? "" : "repeat(2, 1fr)";
    carSrowEl.innerHTML = b.hasWharfrent
      ? `<div class="sc cg"><div class="sl">Car Grand Total</div><div class="sv">${fmtN(grand)}</div><div class="ss">Inside + Outside · incl. VAT &amp; Levy</div></div><div class="sc cb"><div class="sl">Inside Total (Full Rate)</div><div class="sv">${fmtN(b.iTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div><div class="sc cp"><div class="sl">Outside Total (½ Rate)</div><div class="sv">${fmtN(b.oTotal)}</div><div class="ss">Incl. VAT &amp; Levy</div></div>`
      : `<div class="sc cg"><div class="sl">Car Grand Total</div><div class="sv">${fmtN(grand)}</div><div class="ss">Delivery within free time</div></div><div class="sc cb"><div class="sl">Payable Charges Only</div><div class="sv">${fmtN(b.nBase)}</div><div class="ss">Base before VAT &amp; Levy</div></div>`;
    if (b.hasWharfrent) {
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
    const carEmpty = document.getElementById("car-empty");
    if (carEmpty) carEmpty.style.display = "none";
    const carGrandCg = carSrowEl.querySelector(".cg");
    // eslint-disable-next-line sonarjs/void-use -- void forces the offsetWidth read (reflow) that restarts the gboxPulse CSS animation
    if (carGrandCg) { carGrandCg.classList.remove("just-calculated"); void carGrandCg.offsetWidth; carGrandCg.classList.add("just-calculated"); }
    if (!isInitialLoad) {
      setTimeout(
        () =>
          document
            .getElementById("results")
            .scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    }
  } catch (e) {
    dbg.warn("carCalculate render failed:", e);
    showToast("Display error — bill may not render correctly.", "warning");
  }
}

function carReset() {
  document.getElementById("results").style.display = "none";
  document.getElementById("car-preview").innerHTML = SP_CAR_IDLE;
  ["car-cnfName", "car-blNumber", "car-billEntryDate"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  const carBoE = document.getElementById("car-billEntry");
  if (carBoE) carBoE.value = "C-";
  lastCarBill = null;
  editingBillNumber.car = null;
  document.getElementById("weight").value = 2;
  const _carCheckDefaults = {
    chkRiver: true, chkLanding: true, chkRemoval: true,
    chkWeighment: true, chkLevy: true, chkHoisting: false,
  };
  Object.entries(_carCheckDefaults).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (el) el.checked = def;
  });
  document.getElementById("weightWarn").classList.remove("show");
    // Reset date fields to today's date
  const _carToday = new Date();
  const _carTodayStr = formatDateForInput(_carToday);
  const _cldEl = document.getElementById("cld");
  if (_cldEl) { _cldEl.value = _carTodayStr; }
  const _delEl = document.getElementById("delivery");
  if (_delEl) { _delEl.value = _carTodayStr; }
  const _cldHintEl = document.getElementById("cld-hint");
  if (_cldHintEl) { _cldHintEl.textContent = _carTodayStr; _cldHintEl.className = "field-hint hint-ok"; }
  const _delHintEl = document.getElementById("delivery-hint");
  if (_delHintEl) { _delHintEl.textContent = _carTodayStr; _delHintEl.className = "field-hint hint-ok"; }
  const _carBeHint = document.getElementById("car-billEntryDate-hint");
  if (_carBeHint) { _carBeHint.textContent = "DD/MM/YYYY"; _carBeHint.className = "field-hint hint-muted"; }
  clearDraft('car');
  carRefresh();
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}


// Rotation state
let _rotations = [];
let _selectedRotation = null;
let _collapsedYears = new Set();
let _rotSearch = "";
let _rotSearchTimer = null;

// Load rotations from Cloudflare Worker on startup.
// Cloud is source of truth; falls back to the last cached copy when offline
// or on fetch failure, so the rotation dropdown/table isn't wiped blank.
async function loadRotations() {
  try {
    const r = await fetch(PROXY_URL + "/rotations");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    _rotations = Array.isArray(data) ? data : [];
    localStorage.setItem(ROTATIONS_KEY, JSON.stringify(_rotations));
  } catch (e) {
    dbg.warn("loadRotations failed, using cached rotations:", e.message);
    _rotations = readJsonStorage(ROTATIONS_KEY, []);
  }
  populateYearDropdown();
  if (isAdmin) renderRotationTable();
}

// Populate year dropdown from loaded rotations
function populateYearDropdown() {
  const yearSel = document.getElementById("rotYear");
  if (!yearSel) return;
  const years = [...new Set(_rotations.map(r => r.year))].sort((a, b) => b - a);
  yearSel.innerHTML = '<option value="">Year</option>';
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
  filtered = filtered.slice().sort(function(a, b) { function dmyMs(s) { if (!s) { return 0; } var p = s.split("/"); return new Date(+p[2], +p[1]-1, +p[0]).getTime(); } return dmyMs(b.cld) - dmyMs(a.cld); });
  numSel.innerHTML = '<option value="">Number</option>';
  numSel.disabled = filtered.length === 0;
  filtered.forEach(function(r) {
    var opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.num;
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
    let badge = document.getElementById("rotBadge");
    if (badge) badge.textContent = "";
    let cldEl = document.getElementById("cld");
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

// Shared by addRotation/deleteRotation — sets the rotation-registry status line if present.
function setRotStatus(el, msg, cls) {
  if (!el) return;
  el.textContent = msg;
  el.className = cls ? `rot-reg-status ${cls}` : "rot-reg-status";
}

// Pure validation for addRotation — returns an error message string, or "" if valid.
function validateNewRotation(year, num, cld) {
  if (!year || !num || !cld) return "Please fill all fields";
  if (!/^\d{4}$/.test(year)) return "Year must be 4 digits (e.g. 2026)";
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(cld)) return "CLD must be DD/MM/YYYY";
  var isDup = _rotations.some(function(r) { return String(r.year) === year && String(r.num) === num; });
  if (isDup) return "Rotation " + year + "/" + num + " already exists";
  return "";
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

  var validationError = validateNewRotation(year, num, cld);
  if (validationError) {
    setRotStatus(statusEl, validationError, "err");
    return;
  }

  var newRot = { id: Date.now().toString(), year: parseInt(year, 10), num: num, cld: cld };
  var updated = _rotations.concat([newRot]);

  // Local state is the source of truth for the UI — commit it unconditionally
  // so the rotation survives offline. The Worker push below is best-effort;
  // saveRotationsToWorker() marks it pending and flushSync() retries later.
  _rotations = updated;
  localStorage.setItem(ROTATIONS_KEY, JSON.stringify(_rotations));
  if (yearEl) yearEl.value = "";
  if (numEl) numEl.value = "";
  if (cldEl) cldEl.value = "";
  renderRotationTable();
  populateYearDropdown();

  setRotStatus(statusEl, "Saving...");
  var ok = await saveRotationsToWorker(updated);
  setRotStatus(
    statusEl,
    ok ? "Rotation " + year + "/" + num + " added" : "Rotation " + year + "/" + num + " added — will sync when online",
    ok ? "ok" : "warn",
  );
}

// Delete a rotation (admin only)
async function deleteRotation(id) {
  if (!isAdmin) return;
  var rot = _rotations.find(function(r) { return String(r.id) === String(id); });
  var label = rot ? rot.year + "/" + rot.num : "this rotation";
  var confirmed = await confirmModal("Delete rotation " + label + "? This cannot be undone.");
  if (!confirmed) return;
  var statusEl = document.getElementById("rotRegStatus");
  var updated = _rotations.filter(function(r) { return String(r.id) !== String(id); });

  // Local state is the source of truth for the UI — commit it unconditionally
  // so the deletion survives offline. The Worker push below is best-effort;
  // saveRotationsToWorker() marks it pending and flushSync() retries later.
  _rotations = updated;
  localStorage.setItem(ROTATIONS_KEY, JSON.stringify(_rotations));
  if (_selectedRotation && String(_selectedRotation.id) === String(id)) {
    _selectedRotation = null;
    var badge = document.getElementById("rotBadge");
    if (badge) badge.textContent = "";
    var cldField = document.getElementById("cld");
    if (cldField) { cldField.value = ""; carRefresh(); }
  }
  renderRotationTable();
  populateYearDropdown();

  setRotStatus(statusEl, "Deleting...");
  var ok = await saveRotationsToWorker(updated);
  setRotStatus(
    statusEl,
    ok ? "Rotation deleted" : "Rotation deleted — will sync when online",
    ok ? "ok" : "warn",
  );
}

function parseDMY(s) {
  if (!s) return 0;
  var p = s.split("/");
  return new Date(+p[2], +p[1] - 1, +p[0]).getTime();
}

// Renders the "N rotations · N years · Latest CLD dd/mm/yyyy" strip above the add form.
function renderRotationSummary() {
  var el = document.getElementById("rotRegSummary");
  if (!el) return;
  if (_rotations.length === 0) { el.innerHTML = ""; return; }
  var years = new Set(_rotations.map(function(r) { return String(r.year); }));
  var latest = _rotations.slice().sort(function(a, b) { return parseDMY(b.cld) - parseDMY(a.cld); })[0];
  var parts = [
    '<span class="rot-reg-summary-item"><strong>' + _rotations.length + '</strong> rotation' + (_rotations.length === 1 ? '' : 's') + '</span>',
    '<span class="rot-reg-summary-sep">&middot;</span>',
    '<span class="rot-reg-summary-item"><strong>' + years.size + '</strong> year' + (years.size === 1 ? '' : 's') + '</span>',
  ];
  if (latest && latest.cld) {
    parts.push('<span class="rot-reg-summary-sep">&middot;</span>');
    parts.push('<span class="rot-reg-summary-item">Latest CLD <strong>' + escHtml(latest.cld) + '</strong></span>');
  }
  el.innerHTML = parts.join('');
}

// Debounced live-search over rotation no./year/CLD (wired to #rotRegSearch oninput).
function rotSearch(q) {
  clearTimeout(_rotSearchTimer);
  _rotSearchTimer = setTimeout(function() {
    _rotSearch = q.trim().toLowerCase();
    renderRotationTable();
  }, 120);
}

// Clears the rotation search box (the ✕ button next to it) and re-renders immediately.
function rotClearSearch() {
  var input = document.getElementById("rotRegSearch");
  if (input) { input.value = ""; input.focus(); }
  clearTimeout(_rotSearchTimer);
  _rotSearch = "";
  renderRotationTable();
}

function matchesRotation(r, q) {
  if (!q) return true;
  var haystack = (String(r.year) + "/" + String(r.num) + " " + String(r.cld || "")).toLowerCase();
  return haystack.indexOf(q) !== -1;
}

// Expand-all / Collapse-all toolbar buttons.
function setAllYearGroups(collapsed) {
  if (collapsed) {
    _rotations.forEach(function(r) { _collapsedYears.add(String(r.year)); });
  } else {
    _collapsedYears.clear();
  }
  renderRotationTable();
}

function rotEmptyRow(title, sub) {
  return '<tr><td colspan="3"><div class="bill-empty-state">' +
    '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>' +
    '<div class="bes-title">' + escHtml(title) + '</div>' +
    '<div class="bes-sub">' + escHtml(sub) + '</div>' +
    '</div></td></tr>';
}

// Render the rotation registry table grouped by year (newest year first)
function renderRotationTable() {
  renderRotationSummary();
  var tbody = document.getElementById("rotRegTbody");
  if (!tbody) return;
  if (_rotations.length === 0) {
    tbody.innerHTML = rotEmptyRow("No rotations added yet", "Add a rotation number and CLD above to get started.");
    return;
  }
  var q = _rotSearch;
  var filtered = q ? _rotations.filter(function(r) { return matchesRotation(r, q); }) : _rotations;
  if (q && filtered.length === 0) {
    tbody.innerHTML = rotEmptyRow("No rotations match your search", "Try a different rotation number, year, or CLD date.");
    return;
  }
  // Group by year
  var byYear = {};
  filtered.forEach(function(r) {
    var y = String(r.year);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(r);
  });
  // Years descending, within each year sort by CLD descending
  var years = Object.keys(byYear).sort(function(a, b) { return +b - +a; });
  var html = '';
  years.forEach(function(year) {
    // While searching, matching groups are always shown expanded regardless of saved collapse state.
    var collapsed = !q && _collapsedYears.has(year);
    var group = byYear[year].slice().sort(function(a, b) { return parseDMY(b.cld) - parseDMY(a.cld); });
    html += '<tr class="rot-year-group' + (collapsed ? ' collapsed' : '') + '" data-year-hdr="' + escHtml(year) + '" onclick="toggleYearGroup(\'' + escHtml(year) + '\')">' +
      '<td colspan="3"><span class="rot-year-chevron"></span>' + escHtml(year) + '<span class="rot-year-count">' + group.length + '</span></td></tr>';
    group.forEach(function(r) {
      html += '<tr' + (collapsed ? ' style="display:none"' : '') + ' data-year-row="' + escHtml(year) + '">' +
        '<td><span class="rot-num-chip">' + escHtml(year) + '/' + escHtml(String(r.num)) + '</span></td>' +
        '<td><span class="rot-cld-cell"><span class="rot-cld-ico" aria-hidden="true"></span>' + escHtml(String(r.cld || '')) + '</span></td>' +
        '<td><button class="rot-del-btn" onclick="event.stopPropagation();deleteRotation(\'' + r.id + '\')" aria-label="Delete rotation">✕</button></td></tr>';
    });
  });
  tbody.innerHTML = html;
}

// Toggle expand/collapse for a year group in the rotation registry
function toggleYearGroup(year) {
  if (_collapsedYears.has(year)) {
    _collapsedYears.delete(year);
  } else {
    _collapsedYears.add(year);
  }
  var collapsed = _collapsedYears.has(year);
  var tbody = document.getElementById("rotRegTbody");
  if (!tbody) return;
  tbody.querySelectorAll('[data-year-row="' + year + '"]').forEach(function(row) {
    row.style.display = collapsed ? 'none' : '';
  });
  var hdr = tbody.querySelector('[data-year-hdr="' + year + '"]');
  if (hdr) hdr.classList.toggle('collapsed', collapsed);
}

