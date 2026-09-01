// reexport.js — Re-Export / transhipment MPA tariff billing engine
// (Bill of Entries with nested CLD lots). Depends on core.js.


let reexportBEs = [
  { beNumber: "C-", beDate: "", clds: [{ date: "", ton: 0 }], removalTon: 0 },
];

function reOrdinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  switch (n % 10) {
    case 1: return n + "st";
    case 2: return n + "nd";
    case 3: return n + "rd";
    default: return n + "th";
  }
}

// ── Dynamic Bill of Entry / CLD rendering (mirrors renderPartBillingStages) ──
const RE_ICO_HASH =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
const RE_ICO_CAL =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const RE_ICO_TON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

function renderBillOfEntries() {
  const container = document.getElementById("reexport-beContainer");
  if (!container) return;
  const isOverside = document.getElementById("reexport-type")?.value === "overside";
  const total = reexportBEs.length;
  container.innerHTML = reexportBEs
    .map((be, bi) => {
      const isLast = bi === total - 1;

      const delBeBtn =
        bi > 0
          ? `<button type="button" class="pbs-del-btn" onclick="removeBillOfEntry(${bi})" title="Remove Bill of Entry">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`
          : "";

      // Overside: no wharf rent / no removal, so no CLD-lot tracking needed —
      // just Bill of Entry Number, Bill of Entry Date, and a single Ton figure per Bill of Entry.
      if (isOverside) {
        const ton = be.clds[0]?.ton;
        return `<div class="pbs-row${isLast ? " pbs-row-last" : ""}" id="re-be-row-${bi}">
          <div class="pbs-connector">
            <div class="pbs-dot"><span>${bi + 1}</span></div>
            ${!isLast ? '<div class="pbs-line"></div>' : ""}
          </div>
          <div class="pbs-body">
            <div class="pbs-head">
              <div>
                <div class="pbs-title">${reOrdinal(bi + 1)} Bill of Entry</div>
                <div class="pbs-sub">Bill of Entry ${bi + 1} of ${total}</div>
              </div>
              ${delBeBtn}
            </div>
            <div class="pbs-fields pbs-fields-3col">
              <div class="fg">
                <label class="lbl" for="re-be-num-${bi}">${RE_ICO_HASH} Bill of Entry Number</label>
                <input type="text" id="re-be-num-${bi}" class="cyan-glow" placeholder="C-"
                  value="${escHtml(be.beNumber)}"
                  oninput="reexportBEs[${bi}].beNumber=this.value; reexportRefresh();" autocomplete="off" />
              </div>
              <div class="fg">
                <label class="lbl" for="re-be-date-${bi}">${RE_ICO_CAL} Bill of Entry Date <span class="lbl-sub">(optional)</span></label>
                <div class="date-field-wrap">
                  <input type="text" id="re-be-date-${bi}" class="cyan-glow" placeholder="DD/MM/YYYY" maxlength="10"
                    value="${escHtml(be.beDate)}"
                    oninput="formatDate(this); reexportBEs[${bi}].beDate=this.value; reexportRefresh();" autocomplete="off" />
                  <span class="cal" aria-hidden="true"></span>
                </div>
              </div>
              <div class="fg">
                <label class="lbl" for="re-be-ton-${bi}">${RE_ICO_TON} Ton</label>
                <div class="in-unit-wrap">
                  <input type="number" id="re-be-ton-${bi}" class="cyan-glow" placeholder="0" min="0" step="1"
                    value="${ton ? ton : ""}"
                    oninput="reexportBEs[${bi}].clds[0].ton=ceilTon(this.value); reexportRefresh();" />
                  <span class="in-unit">ton</span>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      }

      // Port Side: full CLD-lot tracking (wharf rent depends on each lot's landing date).
      const cldRows = be.clds
        .map((cld, ci) => {
          const delBtn =
            be.clds.length > 1
              ? `<button type="button" class="re-cld-del-btn" onclick="removeCld(${bi},${ci})" aria-label="Remove CLD row" title="Remove CLD row">&#10005;</button>`
              : "";
          return `<div class="re-cld-row" id="re-cld-row-${bi}-${ci}">
            <div class="r2">
              <div class="fg">
                <label class="lbl" for="re-cld-date-${bi}-${ci}">${RE_ICO_CAL} CLD Date</label>
                <div class="date-field-wrap">
                  <input type="text" id="re-cld-date-${bi}-${ci}" class="cyan-glow" placeholder="DD/MM/YYYY" maxlength="10"
                    value="${escHtml(cld.date)}"
                    oninput="formatDate(this); reexportBEs[${bi}].clds[${ci}].date=this.value; reexportRefresh();" autocomplete="off" />
                  <span class="cal" aria-hidden="true"></span>
                </div>
                <div class="field-hint hint-muted" id="re-cld-date-${bi}-${ci}-hint">DD/MM/YYYY</div>
              </div>
              <div class="fg">
                <label class="lbl" for="re-cld-ton-${bi}-${ci}">${RE_ICO_TON} Ton</label>
                <div class="in-unit-wrap">
                  <input type="number" id="re-cld-ton-${bi}-${ci}" class="cyan-glow" placeholder="0" min="0" step="1"
                    value="${cld.ton ? cld.ton : ""}"
                    oninput="reexportBEs[${bi}].clds[${ci}].ton=ceilTon(this.value); reexportRefresh();" />
                  <span class="in-unit">ton</span>
                </div>
              </div>
            </div>
            ${delBtn}
          </div>`;
        })
        .join("");

      const removalField = `<div class="fg">
            <label class="lbl" for="re-be-removal-${bi}">${RE_ICO_TON} Removal Ton <span class="lbl-sub">(optional)</span></label>
            <div class="in-unit-wrap">
              <input type="number" id="re-be-removal-${bi}" class="cyan-glow" placeholder="0" min="0" step="1"
                value="${be.removalTon ? be.removalTon : ""}"
                oninput="reexportBEs[${bi}].removalTon=ceilTon(this.value); reexportRefresh();" />
              <span class="in-unit">ton</span>
            </div>
          </div>`;

      return `<div class="pbs-row${isLast ? " pbs-row-last" : ""}" id="re-be-row-${bi}">
        <div class="pbs-connector">
          <div class="pbs-dot"><span>${bi + 1}</span></div>
          ${!isLast ? '<div class="pbs-line"></div>' : ""}
        </div>
        <div class="pbs-body">
          <div class="pbs-head">
            <div>
              <div class="pbs-title">${reOrdinal(bi + 1)} Bill of Entry</div>
              <div class="pbs-sub">Bill of Entry ${bi + 1} of ${total}</div>
            </div>
            ${delBeBtn}
          </div>
          <div class="pbs-fields">
            <div class="fg">
              <label class="lbl" for="re-be-num-${bi}">${RE_ICO_HASH} Bill of Entry Number</label>
              <input type="text" id="re-be-num-${bi}" class="cyan-glow" placeholder="C-"
                value="${escHtml(be.beNumber)}"
                oninput="reexportBEs[${bi}].beNumber=this.value; reexportRefresh();" autocomplete="off" />
            </div>
            <div class="fg">
              <label class="lbl" for="re-be-date-${bi}">${RE_ICO_CAL} Bill of Entry Date</label>
              <div class="date-field-wrap">
                <input type="text" id="re-be-date-${bi}" class="cyan-glow" placeholder="DD/MM/YYYY" maxlength="10"
                  value="${escHtml(be.beDate)}"
                  oninput="formatDate(this); reexportBEs[${bi}].beDate=this.value; reexportRefresh();" autocomplete="off" />
                <span class="cal" aria-hidden="true"></span>
              </div>
            </div>
          </div>
          <div class="re-cld-list">${cldRows}</div>
          <div class="re-cld-actions">
            <button type="button" class="pbs-add-btn re-add-cld-btn" onclick="addCld(${bi})">+ Add CLD</button>
            ${removalField}
          </div>
        </div>
      </div>`;
    })
    .join("");
  const badge = document.getElementById("reexport-beCount");
  if (badge) badge.textContent = `${total} Bill${total !== 1 ? "s" : ""} of Entry`;
}

function addBillOfEntry() {
  reexportBEs.push({ beNumber: "C-", beDate: "", clds: [{ date: "", ton: 0 }], removalTon: 0 });
  renderBillOfEntries();
  reexportRefresh();
}
function removeBillOfEntry(bi) {
  if (reexportBEs.length <= 1) return;
  reexportBEs.splice(bi, 1);
  renderBillOfEntries();
  reexportRefresh();
}
function addCld(bi) {
  const be = reexportBEs[bi];
  if (!be) return;
  be.clds.push({ date: "", ton: 0 });
  renderBillOfEntries();
  reexportRefresh();
}
function removeCld(bi, ci) {
  const be = reexportBEs[bi];
  if (!be || be.clds.length <= 1) return;
  be.clds.splice(ci, 1);
  renderBillOfEntries();
  reexportRefresh();
}
function onReexportTypeChange() {
  renderBillOfEntries();
  reexportRefresh();
}

// ── Re-Export Type / Wharf Type segmented controls ──
// The visible UI is a pair of toggle buttons; the actual state lives in the
// existing hidden inputs (#reexport-type / #reexport-wharfType) so every
// other read site (reexportCompute, billInputSnapshot, draft/save restore)
// keeps working unchanged.
function syncReexportSegUI() {
  const typeVal = document.getElementById("reexport-type")?.value;
  const wharfVal = document.getElementById("reexport-wharfType")?.value;
  document.querySelectorAll("#reexportTypeSeg .seg-btn").forEach((b) => {
    const active = b.dataset.value === typeVal;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("#reexportWharfSeg .seg-btn").forEach((b) => {
    const active = b.dataset.value === wharfVal;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  // Highlight whichever Re-Shipment rate row the current Wharf Type applies to
  document.getElementById("re-reship-same-row")?.classList.toggle("active", wharfVal === "same");
  document.getElementById("re-reship-diff-row")?.classList.toggle("active", wharfVal === "diff");
}
// Overside has no port storage, so Free Time doesn't apply there — pure
// visibility sync, safe to call on every render/restore without touching
// any other field's value.
function syncReexportFreeTimeVisibility(isOverside) {
  const freeTimeFg = document.getElementById("reexport-freeTimeFg");
  if (freeTimeFg) {
    freeTimeFg.style.display = isOverside ? "none" : "";
    freeTimeFg.closest(".r2")?.classList.toggle("single-col", isOverside);
  }
}
// Full type-switch defaults: Hoisting defaults off for Overside (ship's own
// gear is the common assumption there) — only call this on an actual user
// type change or reset, never on draft/saved-bill restore (that would
// clobber the restored Hoisting value with the type's default).
function applyReexportTypeDefaults(isOverside) {
  const hoistEl = document.getElementById("reexport-chkHoisting");
  if (hoistEl) hoistEl.checked = !isOverside;
  syncReexportFreeTimeVisibility(isOverside);
}
function setReexportType(val) {
  const el = document.getElementById("reexport-type");
  if (el) el.value = val;
  applyReexportTypeDefaults(val === "overside");
  syncReexportSegUI();
  onReexportTypeChange();
}
function setReexportWharfType(val) {
  const el = document.getElementById("reexport-wharfType");
  if (el) el.value = val;
  syncReexportSegUI();
  reexportRefresh();
}

// ── Rate helpers (MPA Tariff — Rules 1 & 2) ──
function getReexportLandingRate(totalTon) {
  const kg = totalTon * 1000;
  if (kg <= 3000) return nn("re-land1");
  if (kg <= 20000) return nn("re-land2");
  return nn("re-land3");
}

// Mirrors getCargoTierLabel — human-readable slab label for a BE's total tonnage.
function getReexportLandingTierLabel(totalTon) {
  const kg = totalTon * 1000;
  if (kg <= 3000) return `≤3,000 Kg — ${fmtN(nn("re-land1"))} Tk/ton`;
  if (kg <= 20000) return `3,001–20,000 Kg — ${fmtN(nn("re-land2"))} Tk/ton`;
  return `>20,000 Kg — ${fmtN(nn("re-land3"))} Tk/ton`;
}

// Free time = freeDays incl. CLD (day 1 = CLD). Wharf rent tiers at day 20.
// Returns a per-tier slab array (mirrors calcSlabs' {label,rate,days,from,to,amt}
// shape) so the bill statement can show each rate tier on its own row, the same
// depth of detail Car/Cargo already give their slab-wise wharfrent charges.
function calcReexportWharfRent(cldDate, reexportDate, tons, freeDays, wharfLow, wharfHigh) {
  const freeEnd = freeDays === 0 ? addD(cldDate, -1) : addD(cldDate, freeDays - 1);
  if (reexportDate <= freeEnd) {
    return { amount: 0, chargeableDays: 0, slabs: [], freeEnd };
  }
  const chargeStart = addD(freeEnd, 1);
  const chargeableDays = diffD(chargeStart, reexportDate) + 1;
  const days5 = Math.min(chargeableDays, 20);
  const days15 = Math.max(chargeableDays - 20, 0);
  const slabs = [];
  let cur = new Date(chargeStart);
  if (days5 > 0) {
    slabs.push({ label: "Days 1–20", rate: wharfLow, days: days5, from: new Date(cur), to: addD(cur, days5 - 1), amt: wharfLow * days5 * tons });
    cur = addD(cur, days5);
  }
  if (days15 > 0) {
    slabs.push({ label: "Days 21+", rate: wharfHigh, days: days15, from: new Date(cur), to: new Date(reexportDate), amt: wharfHigh * days15 * tons });
  }
  const amount = slabs.reduce((a, s) => a + s.amt, 0);
  return { amount, chargeableDays, slabs, freeEnd };
}

// ── Compute engine (Rules 1–8 · Full BE Calculation · Grand Total) ──
function reexportCompute() {
  const { cnfName, blNumber } = readMeta("reexport");
  const meta = { cnfName, blNumber };
  const reexportDate = pd(document.getElementById("reexport-reexportDate").value);
  const _fdRaw = Number.parseInt(document.getElementById("reexport-freeDays").value, 10);
  const freeDays = Number.isNaN(_fdRaw) ? 20 : Math.max(0, _fdRaw);
  const isOverside = document.getElementById("reexport-type").value === "overside";
  const wharfType = document.getElementById("reexport-wharfType").value; // "same" | "diff"
  const reshipPct = wharfType === "diff" ? nn("re-reshipDiff") : nn("re-reshipSame");
  const vatRate = Math.min(1, Math.max(0, gn("reexport-vatRate") / 100));
  const hoistOn = gb("reexport-chkHoisting");
  const levyOn = gb("reexport-chkLevy");
  const hoistPct = nn("re-hoistPct");
  const rRiver = nn("re-rRiver");
  const rLevy = nn("re-rLevy");
  const wharfLow = nn("re-wharfLow");
  const wharfHigh = nn("re-wharfHigh");
  const removalMult = nn("re-removalMult");
  const r2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;

  const beResults = reexportBEs
    .map((be, idx) => {
      const clds = be.clds
        .filter((c) => Number(c.ton) > 0 && (isOverside || (c.date || "").trim()))
        .map((c) => ({ date: pd(c.date), dateStr: c.date, ton: ceilTon(c.ton) }));
      const totalTon = clds.reduce((a, c) => a + c.ton, 0);
      const landingRate = getReexportLandingRate(totalTon);
      const wharfRows = isOverside
        ? []
        : clds.map((c) => ({
            ...calcReexportWharfRent(c.date, reexportDate, c.ton, freeDays, wharfLow, wharfHigh),
            date: c.date,
            ton: c.ton,
          }));
      const wharfTotal = wharfRows.reduce((a, w) => a + w.amount, 0);
      const riverDues = rRiver * totalTon;
      const hoisting = hoistOn ? landingRate * hoistPct * totalTon : 0;
      const reshipment = landingRate * reshipPct * totalTon;
      const removalTon = !isOverside ? ceilTon(be.removalTon) : 0;
      const removal = removalTon > 0 ? landingRate * removalMult * removalTon : 0;
      const levy = levyOn ? rLevy * totalTon : 0;
      const vatBase = r2(wharfTotal + riverDues + hoisting + reshipment + removal);
      return {
        idx,
        beNumber: escHtml(be.beNumber),
        beDate: escHtml(be.beDate),
        clds,
        totalTon,
        landingRate,
        wharfRows,
        wharfTotal,
        riverDues,
        hoisting,
        reshipment,
        removalTon,
        removal,
        levy,
        vatBase,
      };
    })
    .filter((be) => be.totalTon > 0);

  const vatBaseTotal = r2(beResults.reduce((a, be) => a + be.vatBase, 0));
  const levyTotal = beResults.reduce((a, be) => a + be.levy, 0);
  const vatAmount = calcVATmpa(vatBaseTotal, vatRate * 100);
  const grandTotal = r2(vatBaseTotal + vatAmount + levyTotal);

  return {
    ...meta,
    billNumber: "",
    reexportDate,
    freeDays,
    isOverside,
    wharfType,
    reshipPct,
    hoistOn,
    levyOn,
    vatRate,
    beResults,
    vatBaseTotal,
    levyTotal,
    vatAmount,
    grandTotal,
  };
}

// ── Live preview ──
function reexportRefreshNow() {
  try {
    validateDateField("reexport-reexportDate", "reexport-reexportDate-hint", "Re-Export Date");
    const b = reexportCompute();
    const pv = document.getElementById("reexport-preview");
    if (!pv) return;
    if (!b || b.beResults.length === 0) {
      pv.innerHTML = SP_REEXPORT_IDLE;
      if (isAdmin && !isInitialLoad) saveRates();
      return;
    }
    pv.innerHTML =
      `<div class="pvr"><span class="pvr-lbl">Sub Total (Base for VAT)</span><span class="pvr-val v-blue">${fmt(b.vatBaseTotal)}</span></div>` +
      `<div class="pvr"><span class="pvr-lbl">VAT @ ${(b.vatRate * 100).toFixed(2)}%</span><span class="pvr-val v-purple">${fmt(b.vatAmount)}</span></div>` +
      (b.levyTotal > 0
        ? `<div class="pvr"><span class="pvr-lbl">Levy Charge (No VAT)</span><span class="pvr-val">${fmt(b.levyTotal)}</span></div>`
        : "") +
      `<div class="pvr pvr-grand"><span class="pvr-lbl">Total Amount Payable</span><span class="pvr-val v-teal">${fmt(b.grandTotal)}</span></div>`;
    if (isAdmin && !isInitialLoad) saveRates();
  } catch (e) {
    dbg.warn("reexportRefreshNow failed:", e);
    const pv = document.getElementById("reexport-preview");
    if (pv) pv.innerHTML = SP_REEXPORT_IDLE;
  }
}
let reexportRefreshQueued = false;
function reexportRefresh() {
  if (reexportRefreshQueued) return;
  reexportRefreshQueued = true;
  requestAnimationFrame(() => {
    reexportRefreshQueued = false;
    reexportRefreshNow();
  });
}

// ── Screen result tables ──
function buildReexportBETable(be, b) {
  let rows = "";
  if (!b.isOverside && be.wharfRows.length > 0) {
    be.wharfRows.forEach((w) => {
      if (w.slabs.length === 0) {
        rows += `<tr class="sep"><td colspan="6">CLD ${fd(w.date)} — Free Time Ends ${fd(w.freeEnd)} — delivery within free time, no wharf rent charge</td></tr>`;
        return;
      }
      rows += `<tr class="sep"><td colspan="6">CLD ${fd(w.date)} — Free Time Ends ${fd(w.freeEnd)} · Wharf Rent Starts ${fd(addD(w.freeEnd, 1))}</td></tr>`;
      w.slabs.forEach((s) => {
        rows += `<tr><td>${s.label}</td><td>${fmtN(s.rate)}/t/d</td><td>${fd(s.from)}</td><td>${fd(s.to)}</td><td><span class="dp">${s.days}</span></td><td>${fmt(s.amt)}</td></tr>`;
      });
    });
    const totalWharfDays = be.wharfRows.reduce((a, w) => a + w.chargeableDays, 0);
    rows += `<tr class="sub"><td colspan="4">Transhipment Wharf Rent Sub-Total</td><td><span class="dp dpg">${totalWharfDays}</span></td><td>${fmt(be.wharfTotal)}</td></tr>`;
  }
  rows += `<tr><td>River Dues (Re-export)</td><td>${fmtN(nn("re-rRiver"))}/ton</td><td colspan="2">${fmtN(be.totalTon)} ton(s)</td><td></td><td>${fmt(be.riverDues)}</td></tr>`;
  if (b.hoistOn) {
    rows += `<tr><td>Hoisting Charge</td><td>${fmtN(nn("re-hoistPct") * 100)}% × ${fmtN(be.landingRate)}</td><td colspan="2">${fmtN(be.totalTon)} ton(s)</td><td></td><td>${fmt(be.hoisting)}</td></tr>`;
  }
  const reshipLabel = b.wharfType === "diff" ? "Different Wharf" : "Same Wharf";
  rows += `<tr><td>Transhipment / Re-Shipment (${reshipLabel})</td><td>${fmtN(b.reshipPct * 100)}% × ${fmtN(be.landingRate)}</td><td colspan="2">${fmtN(be.totalTon)} ton(s)</td><td></td><td>${fmt(be.reshipment)}</td></tr>`;
  if (!b.isOverside && be.removal > 0) {
    rows += `<tr><td>Removal Charge</td><td>${fmtN(nn("re-removalMult"))}× × ${fmtN(be.landingRate)}</td><td colspan="2">${fmtN(be.removalTon)} ton(s)</td><td></td><td>${fmt(be.removal)}</td></tr>`;
  }
  rows += `<tr class="tot"><td colspan="5">Bill of Entry Sub-Total (Base for VAT)</td><td>${fmt(be.vatBase)}</td></tr>`;
  return `<div class="btw"><table class="bt"><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ── Pre-calculate input validation (Edge Cases ①–⑩) ──
function collectReexportErrors() {
  const errors = [];
  const redV = (document.getElementById("reexport-reexportDate")?.value || "").trim();
  if (!redV) errors.push({ id: "reexport-reexportDate", msg: "Re-Export Date is required (DD/MM/YYYY)." });
  else if (!isValidDateStr(redV))
    errors.push({ id: "reexport-reexportDate", msg: "Re-Export Date is not a valid date (DD/MM/YYYY)." });

  const isOverside = document.getElementById("reexport-type")?.value === "overside";
  const reexportValid = isValidDateStr(redV);
  const reexportD = reexportValid ? pd(redV) : null;
  let anyTon = false;

  reexportBEs.forEach((be, bi) => {
    be.clds.forEach((cld, ci) => {
      const ton = ceilTon(cld.ton);
      const dateV = (cld.date || "").trim();
      if (ton <= 0 && !dateV) return; // fully blank row — ignore

      if (isOverside) {
        // Overside: date is optional (unused for wharf rent), only tonnage matters.
        if (dateV && !isValidDateStr(dateV)) {
          errors.push({ id: `re-be-date-${bi}`, msg: `Bill of Entry ${bi + 1}: invalid date (DD/MM/YYYY).` });
          return;
        }
        if (ton <= 0) {
          errors.push({ id: `re-be-ton-${bi}`, msg: `Bill of Entry ${bi + 1}: tonnage must be greater than 0.` });
          return;
        }
        anyTon = true;
        return;
      }

      if (!dateV) {
        errors.push({ id: `re-cld-date-${bi}-${ci}`, msg: `Bill of Entry ${bi + 1}, CLD ${ci + 1}: date is required.` });
        return;
      }
      if (!isValidDateStr(dateV)) {
        errors.push({ id: `re-cld-date-${bi}-${ci}`, msg: `Bill of Entry ${bi + 1}, CLD ${ci + 1}: invalid date (DD/MM/YYYY).` });
        return;
      }
      if (ton <= 0) {
        errors.push({ id: `re-cld-ton-${bi}-${ci}`, msg: `Bill of Entry ${bi + 1}, CLD ${ci + 1}: tonnage must be greater than 0.` });
        return;
      }
      anyTon = true;
      if (reexportValid && reexportD <= pd(dateV)) {
        errors.push({
          id: "reexport-reexportDate",
          msg: `Re-Export Date must be after CLD (Bill of Entry ${bi + 1}, CLD ${ci + 1}: ${dateV}).`,
        });
      }
    });
  });

  if (!anyTon)
    errors.push({
      id: "reexport-beContainer",
      msg: isOverside
        ? "Add at least one Bill of Entry with a valid tonnage."
        : "Add at least one Bill of Entry with a valid CLD date and tonnage.",
    });

  return errors;
}

// ── Generate ──
// Renders the on-screen Re-Export bill (info bar, summary row, per-BE sections, grand
// total); branches mirror reexportCompute's combined-VAT-base model documented in
// CLAUDE.md — decomposing risks the screen bill and print bill silently drifting apart.
// eslint-disable-next-line sonarjs/cognitive-complexity
function reexportCalculate() {
  if (reportInputErrors(collectReexportErrors())) return;
  let b;
  try {
    b = reexportCompute();
  } catch (e) {
    dbg.warn("reexportCompute failed:", e);
    showToast("Billing calculation failed — please check inputs and try again.", "error");
    return;
  }
  if (!b || b.beResults.length === 0) {
    showToast("Add at least one Bill of Entry with valid tonnage.", "warning");
    return;
  }
  lastReexportBill = b;
  try {
    document.getElementById("reexport-results").style.display = "block";
    const typeText = b.isOverside ? "Overside" : "Port Side";
    const typeColor = b.isOverside ? "var(--sky)" : "var(--gold)";
    const wharfText = b.wharfType === "diff" ? "Different (200%)" : "Same (150%)";
    const totalWharfDays = b.beResults.reduce((a, be) => a + be.wharfRows.reduce((a2, w) => a2 + w.chargeableDays, 0), 0);
    const billNoHtml = b.billNumber
      ? `<div class="ii bill-no-ii"><div class="il">Bill Number</div><div class="iv bill-no-val">${b.billNumber}</div></div>`
      : "";
    const cnfHtml = b.cnfName
      ? `<div class="ii"><div class="il">C&amp;F Agent</div><div class="iv">${b.cnfName}</div></div>`
      : "";
    const blHtml = b.blNumber
      ? `<div class="ii"><div class="il">BL Number</div><div class="iv">${b.blNumber}</div></div>`
      : "";
    document.getElementById("reexport-ibar").innerHTML =
      `<div class="ibar"><div>${billNoHtml}${cnfHtml}${blHtml}<div class="ii"><div class="il">Re-Export Date</div><div class="iv">${fd(b.reexportDate)}</div></div><div class="ii"><div class="il">Re-Export Type</div><div class="iv" style="color:${typeColor}">${typeText}</div></div><div class="ii"><div class="il">Wharf Type</div><div class="iv">${wharfText}</div></div><div class="ii"><div class="il">Bill of Entries</div><div class="iv" style="color:var(--accent)">${b.beResults.length}</div></div><div class="ii"><div class="il">River Dues</div><div class="iv">${fmtN(nn("re-rRiver"))} Tk/ton</div></div><div class="ii"><div class="il">Total Wharf Rent Days</div><div class="iv" style="color:var(--gold)">${b.isOverside ? "—" : totalWharfDays + " days"}</div></div></div></div>`;
    document.getElementById("reexport-beSec").innerHTML = b.beResults
      .map((be) => {
        const beLabel = be.beNumber || `#${be.idx + 1}`;
        const beDateSuffix = be.beDate ? ` — ${be.beDate}` : "";
        return `<div style="margin-bottom:20px;"><div class="slbl sl-in">▪ Bill of Entry ${beLabel}${beDateSuffix} <span style="color:var(--m2);font-weight:400;">(${fmtN(be.totalTon)} ton(s))</span></div><div class="cargo-split-info">Landing Rate: <strong>${fmtN(be.landingRate)} Tk/ton</strong> — Tier: ${getReexportLandingTierLabel(be.totalTon)}</div><div class="card" style="padding:0;overflow:hidden;">${buildReexportBETable(be, b)}</div></div>`;
      })
      .join("");
    const reexportSrowEl = document.getElementById("reexport-srow");
    reexportSrowEl.innerHTML =
      `<div class="sc cg"><div class="sl">Total Amount Payable</div><div class="sv" style="color:var(--accent)">${fmtN(b.grandTotal)}</div><div class="ss">Incl. VAT${b.levyTotal > 0 ? " &amp; Levy" : ""}</div></div><div class="sc cb"><div class="sl">Sub Total (Base for VAT)</div><div class="sv">${fmtN(b.vatBaseTotal)}</div><div class="ss">${b.beResults.length} Bill${b.beResults.length !== 1 ? "s" : ""} of Entry combined</div></div><div class="sc cp"><div class="sl">VAT${b.levyTotal > 0 ? " + Levy" : ""}</div><div class="sv">${fmtN(b.vatAmount + b.levyTotal)}</div><div class="ss">${b.levyTotal > 0 ? "VAT + Levy (No VAT on Levy)" : "VAT only"}</div></div>`;
    const reexportEmpty = document.getElementById("reexport-empty");
    if (reexportEmpty) reexportEmpty.style.display = "none";
    const reexportGrandCg = reexportSrowEl.querySelector(".cg");
    // eslint-disable-next-line sonarjs/void-use -- void forces the offsetWidth read (reflow) that restarts the gboxPulse CSS animation
    if (reexportGrandCg) { reexportGrandCg.classList.remove("just-calculated"); void reexportGrandCg.offsetWidth; reexportGrandCg.classList.add("just-calculated"); }
    if (!isInitialLoad) {
      setTimeout(
        () => document.getElementById("reexport-results").scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    }
  } catch (e) {
    dbg.warn("reexportCalculate render failed:", e);
    showToast("Display error — bill may not render correctly.", "warning");
  }
}

// ── Reset ──
function reexportReset() {
  document.getElementById("reexport-results").style.display = "none";
  const pv = document.getElementById("reexport-preview");
  if (pv) pv.innerHTML = SP_REEXPORT_IDLE;
  ["reexport-cnfName", "reexport-blNumber"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const typeEl = document.getElementById("reexport-type");
  if (typeEl) typeEl.value = "portside";
  const wharfEl = document.getElementById("reexport-wharfType");
  if (wharfEl) wharfEl.value = "diff";
  syncReexportSegUI();
  applyReexportTypeDefaults(false);
  const levyEl = document.getElementById("reexport-chkLevy");
  if (levyEl) levyEl.checked = false;
  reexportBEs = [{ beNumber: "C-", beDate: "", clds: [{ date: "", ton: 0 }], removalTon: 0 }];
  renderBillOfEntries();
  lastReexportBill = null;
  editingBillNumber.reexport = null;
  const _reToday = new Date();
  const _reTodayStr = formatDateForInput(_reToday);
  const _redEl = document.getElementById("reexport-reexportDate");
  if (_redEl) _redEl.value = _reTodayStr;
  const _redHintEl = document.getElementById("reexport-reexportDate-hint");
  if (_redHintEl) { _redHintEl.textContent = _reTodayStr; _redHintEl.className = "field-hint hint-ok"; }
  clearDraft('reexport');
  reexportRefresh();
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

