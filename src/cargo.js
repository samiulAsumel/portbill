// cargo.js — General Cargo wharfage billing engine, part-billing
// stages, and self-drive tonnage. Depends on core.js.

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
  const total = ceilTon(document.getElementById("c-weight").value);
  const inside = ceilTon(document.getElementById("c-inside").value);
  const outside = ceilTon(document.getElementById("c-outside").value);
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
  const weighmentTon = ceilTon(document.getElementById("c-weighmentTon").value);
  const weighmentInput = document.getElementById("c-weighmentTon");
  const totalWeight = ceilTon(document.getElementById("c-weight").value);

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
  const removalTon = ceilTon(document.getElementById("c-removalTon").value);
  const removalInput = document.getElementById("c-removalTon");
  const totalWeight = ceilTon(document.getElementById("c-weight").value);
  const outsideTons = ceilTon(document.getElementById("c-outside").value);

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
  const insideTon = ceilTon(insideEl?.value);
  const outsideTon = ceilTon(outsideEl?.value);
  const insideW = ceilTon(document.getElementById("c-inside").value);
  const outsideW = ceilTon(document.getElementById("c-outside").value);

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
// eslint-disable-next-line sonarjs/cognitive-complexity
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
  const freeDaysOffset = fdDays === 0 ? -1 : fdDays - 1;
  const freeEnd = cldOk ? addD(cld, freeDaysOffset) : null;

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
  // Renders one part-billing stage row (balance inputs, SD sub-fields); branches map
  // 1:1 to the fields documented in CLAUDE.md's "Part billing stages" section.
  container.innerHTML = partBillingStages
    // eslint-disable-next-line sonarjs/cognitive-complexity
    .map((stage, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === total - 1;
      const _n = idx + 1,
        _v = _n % 10,
        _h = _n % 100;
      const ORDINAL_SUFFIX_BY_LAST_DIGIT = { 1: "st", 2: "nd", 3: "rd" };
      const _suf = (_h >= 11 && _h <= 13) ? "th" : (ORDINAL_SUFFIX_BY_LAST_DIGIT[_v] ?? "th");
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

      let insideMaxNote = "";
      if (maxIn > 0) {
        const insideMaxText = maxSdIn > 0
          ? `max&nbsp;${maxIn}t&nbsp;Normal&nbsp;+&nbsp;${maxSdIn}t&nbsp;SD`
          : `max&nbsp;${maxIn}t`;
        insideMaxNote = `<span class="pbs-max-note">${insideMaxText}</span>`;
      }
      let outsideMaxNote = "";
      if (maxOut > 0) {
        const outsideMaxText = maxSdOut > 0
          ? `max&nbsp;${maxOut}t&nbsp;Normal&nbsp;+&nbsp;${maxSdOut}t&nbsp;SD`
          : `max&nbsp;${maxOut}t`;
        outsideMaxNote = `<span class="pbs-max-note">${outsideMaxText}</span>`;
      }

      let sdInsideBlockHtml = "";
      if (showSdIn) {
        const sdInsideMaxNote = maxSdIn > 0 ? `<span class="pbs-max-note">max&nbsp;${maxSdIn}t</span>` : "";
        const sdInsideValueAttr = stage.sdInsideAfter ? `value="${stage.sdInsideAfter}"` : "";
        const sdInsideMaxAttr = maxSdIn > 0 ? `max="${maxSdIn}"` : "";
        sdInsideBlockHtml = `<div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-sd-inside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--gold-hi)"></span><span style="color:var(--gold-hi)">SD</span> Inside
                  ${sdInsideMaxNote}
                </label>
                <input type="number" id="pb-sd-inside-${idx}" class="cargo-glow pb-balance-input"
                  ${sdInsideValueAttr} placeholder="0" min="0" ${sdInsideMaxAttr} step="1"
                  oninput="pbSdBalanceChange(${idx},'inside',this.value);" />
              </div>`;
      }

      let sdOutsideBlockHtml = "";
      if (showSdOut) {
        const sdOutsideGridStyle = !showSdIn ? ' style="grid-column:2"' : "";
        const sdOutsideMaxNote = maxSdOut > 0 ? `<span class="pbs-max-note">max&nbsp;${maxSdOut}t</span>` : "";
        const sdOutsideValueAttr = stage.sdOutsideAfter ? `value="${stage.sdOutsideAfter}"` : "";
        const sdOutsideMaxAttr = maxSdOut > 0 ? `max="${maxSdOut}"` : "";
        sdOutsideBlockHtml = `<div class="fg"${sdOutsideGridStyle}>
                <label class="lbl pbs-bal-lbl" for="pb-sd-outside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--gold-hi)"></span><span style="color:var(--gold-hi)">SD</span> Outside
                  ${sdOutsideMaxNote}
                </label>
                <input type="number" id="pb-sd-outside-${idx}" class="cargo-glow pb-balance-input"
                  ${sdOutsideValueAttr} placeholder="0" min="0" ${sdOutsideMaxAttr} step="1"
                  oninput="pbSdBalanceChange(${idx},'outside',this.value);" />
              </div>`;
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
                  ${insideMaxNote}
                </label>
                <input type="number" id="pb-inside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.insideAfter ? `value="${stage.insideAfter}"` : ""} placeholder="0" min="0" ${maxIn > 0 ? `max="${maxIn}"` : ""} step="1"
                  oninput="pbBalanceChange(${idx},'inside',this.value);" />
              </div>
              <div class="fg">
                <label class="lbl pbs-bal-lbl" for="pb-outside-${idx}">
                  <span class="pbs-bal-dot" style="background:var(--purple)"></span>Outside
                  ${outsideMaxNote}
                </label>
                <input type="number" id="pb-outside-${idx}" class="cargo-glow pb-balance-input"
                  ${stage.outsideAfter ? `value="${stage.outsideAfter}"` : ""} placeholder="0" min="0" ${maxOut > 0 ? `max="${maxOut}"` : ""} step="1"
                  oninput="pbBalanceChange(${idx},'outside',this.value);" />
              </div>
              ${sdInsideBlockHtml}
              ${sdOutsideBlockHtml}
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
    const total = ceilTon(
      document.getElementById(side === "inside" ? "c-inside" : "c-outside")
        ?.value,
    );
    const sdChkId =
      side === "inside" ? "c-chkSelfDriveInside" : "c-chkSelfDriveOutside";
    const sdKey =
      side === "inside" ? "c-selfDriveTonInside" : "c-selfDriveTonOutside";
    const sdOn = !!document.getElementById(sdChkId)?.checked;
    const sd = sdOn
      ? Math.min(total, ceilTon(document.getElementById(sdKey)?.value))
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
    const total = ceilTon(
      document.getElementById(side === "inside" ? "c-inside" : "c-outside")
        ?.value,
    );
    const sdOn = !!document.getElementById(sdChkId)?.checked;
    return sdOn
      ? Math.min(total, ceilTon(document.getElementById(sdKey)?.value))
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
  const clamped = Math.min(maxVal, isEmpty ? 0 : ceilTon(rawVal));
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
  const clamped = Math.min(maxVal, isEmpty ? 0 : ceilTon(rawVal));
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
// eslint-disable-next-line sonarjs/cognitive-complexity
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
  // Renders each part-billing period's slab/balance row; mirrors computePartBillingWharfrent's
  // period model documented in CLAUDE.md — see that function's own suppression note.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  allPeriods.forEach((p, pi) => {
    const isLast = pi === allPeriods.length - 1;
    if (p.freeTimeDelivery) {
      const balSd_ft = isIn ? (p.balanceSdInsideAfter || 0) : (p.balanceSdOutsideAfter || 0);
      const balNorm_ft = isIn ? (p.balanceInsideAfter || 0) : (p.balanceOutsideAfter || 0);
      const balAfterStr_ft = balSd_ft > 0 ? `${balNorm_ft}t Normal + ${balSd_ft}t SD` : `${balNorm_ft}t`;
      const sideLabel_ft = isIn ? "Inside" : "Outside";
      const balNote_ft = isLast ? " · Final Delivery" : ` · Balance: ${sideLabel_ft} ${balAfterStr_ft}`;
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
    const sideLabel_s = isIn ? "Inside" : "Outside";
    let balNote = " · Final Delivery";
    if (p.isCurrentDate) balNote = " · Up to Today";
    else if (!isLast) balNote = ` · Balance: ${sideLabel_s} ${balAfterStr_s}`;
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
// eslint-disable-next-line sonarjs/cognitive-complexity
function buildPartBillingPrintSection(b, side) {
  //NOSONAR
  const allPeriods = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
  const isIn = side === "inside";
  let rows = "";
  // Print-invoice counterpart of buildPartBillingBillTable's per-period renderer — see that
  // forEach's suppression note.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  allPeriods.forEach((p, pi) => {
    const isLast = pi === allPeriods.length - 1;
    if (p.freeTimeDelivery) {
      const balSd_ft = isIn ? (p.balanceSdInsideAfter || 0) : (p.balanceSdOutsideAfter || 0);
      const balNorm_ft = isIn ? (p.balanceInsideAfter || 0) : (p.balanceOutsideAfter || 0);
      const balAfterStr_ft = balSd_ft > 0 ? `${balNorm_ft}t Normal + ${balSd_ft}t SD` : `${balNorm_ft}t`;
      const sideLabel_ft = isIn ? "Inside" : "Outside";
      const balNote_ft = isLast
        ? " | Final Delivery — no cargo remains"
        : ` | Remaining balance after this delivery: ${sideLabel_ft} ${balAfterStr_ft}`;
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
    const sideLabel_p = isIn ? "Inside" : "Outside";
    let balNote = " | Final Delivery — no cargo remains";
    if (p.isCurrentDate) balNote = " | Up to Today";
    else if (!isLast) balNote = ` | Remaining balance after this delivery: ${sideLabel_p} ${balAfterStr_p}`;
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
  const rp2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
  const wharfTotal = isIn ? b.insideWharfrent : b.outsideWharfrent;
  const sidePayables = isIn ? b.insidePayables : b.outsidePayables;
  const filteredPay = cargoIncludePayables ? sidePayables : [];
  // This section shows only the per-portion sub-total (wharfrent + payables).
  // VAT and Levy are charged ONCE on the combined base in the BILL SUMMARY that
  // follows both sections (see buildCombinedSummaryPrintSection).
  const sidePaySub = isIn ? b.insidePaySub : b.outsidePaySub;
  const baseAmt = rp2(
    (isIn ? b.iBase : b.oBase) - (cargoIncludePayables ? 0 : sidePaySub),
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
  const headRateLabel = isIn ? "Full Rate" : "½ Rate";
  const headBadge =
    sdWt > 0
      ? `${fmtN(wt - sdWt)}t Normal + ${fmtN(sdWt)}t SD — ${headRateLabel}`
      : `${fmtN(wt)} ton initial — ${headRateLabel}`;
  const subNote = `Part Billing — ${allPeriods.length} stage${allPeriods.length !== 1 ? "s" : ""} · ${isIn ? "Full" : "½"} rate · Day-count continuous from CLD`;
  return `${secHead(isIn ? "INSIDE WHARFRENT" : "OUTSIDE WHARFRENT", headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
}

// Core Cargo billing math (inside/outside slabs, self-drive, part billing, combined
// VAT/Levy per CLAUDE.md); branching mirrors MPA tariff rules — decomposing risks
// silently changing bill totals. See car.js's carCompute for the same rationale.
// eslint-disable-next-line sonarjs/cognitive-complexity
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
  const totalWeight = ceilTon(document.getElementById("c-weight").value);
  const insideW = ceilTon(document.getElementById("c-inside").value);
  const outsideW = ceilTon(document.getElementById("c-outside").value);
  const vatRate = Math.min(1, Math.max(0, gn("c-vatRate") / 100));
  // Dynamic payable rates based on weight tier — not from input fields
  const tierRate = getCargoLandingTierRate(totalWeight);
  const landingChecked = gb("c-chkLanding");
  const dynamicLandingRate = tierRate;
  const dynamicRemovalRate = tierRate * (landingChecked ? 7 : 8);
  const dynamicHoistingRate = tierRate * 1.25;
  const removalTon = Math.min(
    totalWeight,
    ceilTon(document.getElementById("c-removalTon").value),
  );
  const weighmentTon = Math.min(
    totalWeight,
    ceilTon(document.getElementById("c-weighmentTon").value),
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
        ceilTon(document.getElementById("c-selfDriveTonInside")?.value),
        insideW,
      )
    : 0;
  const wharfSdOutside = gb("c-chkSelfDriveOutside")
    ? Math.min(
        ceilTon(document.getElementById("c-selfDriveTonOutside")?.value),
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
          ceilTon(document.getElementById("c-selfDriveTonInside")?.value),
          insideW,
        )
      : 0;
    const outsideSelfDriveTon = gb("c-chkSelfDriveOutside")
      ? Math.min(
          ceilTon(document.getElementById("c-selfDriveTonOutside")?.value),
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

  const r2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
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
  const gVat = calcVATmpa(gBase, vatRate * 100);
  const gLevy = iLevy + oLevy;
  const gTotal = r2(gBase + gVat + gLevy);
  // No wharfrent (payable-only): combined base already, single VAT.
  const nBase = r2(paySub);
  const nVat = calcVATmpa(nBase, vatRate * 100);
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
  partBillingStages.forEach((_stage, idx) => {
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

// Live-preview renderer mirrors cargoCalculate's branching (part billing/wharfrent/free-time);
// splitting it risks the preview and the final bill silently drifting apart.
// eslint-disable-next-line sonarjs/cognitive-complexity
function cargoRefreshNow() {
  try {
    validateDateField("c-cld", "c-cld-hint", "CLD");
    validateDateField("c-delivery", "c-delivery-hint", "delivery date");
    validateDateOrder("c-cld", "c-delivery", "c-delivery-hint");
    validateDateField("c-billEntryDate", "c-billEntryDate-hint", "B/E Date");
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
              .join(" ") +
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
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const syncTon = (chkId, inputId, errId, maxVal = 0) => {
      const on = document.getElementById(chkId)?.checked;
      const inp = document.getElementById(inputId);
      const err = document.getElementById(errId);
      if (!inp) return;
      if (maxVal > 0) inp.max = maxVal;
      else inp.removeAttribute("max");
      if (on) {
        inp.classList.remove("ton-inactive");
        const v = ceilTon(inp.value);
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
    if (b.isPartBilling) {
      const vp = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
      pv.innerHTML =
        `<div class="pvr"><span class="pvr-lbl">Part Billing Stages</span><span class="pvr-val v-cyan">${vp.length} stage${vp.length !== 1 ? "s" : ""}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Total Wharfrent Days</span><span class="pvr-val v-cyan">${b.totalDays} days</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Inside Sub-Total (before VAT)</span><span class="pvr-val v-blue">${fmt(b.iBase)}</span></div>` +
        `<div class="pvr"><span class="pvr-lbl">Outside Sub-Total (before VAT)</span><span class="pvr-val v-purple">${fmt(b.oBase)}</span></div>` +
        `<div class="pvr pvr-grand pvr-grand-cargo"><span class="pvr-lbl">General Cargo Grand Total (incl. VAT &amp; Levy)</span><span class="pvr-val v-cyan">${fmt(b.gTotal)}</span></div>`;
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
  } catch (e) {
    dbg.warn("cargoRefreshNow failed:", e);
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
  const r2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
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
  const wVat = calcVATmpa(wharfrentBase, b.vatRate * 100);
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

// Renders the on-screen Cargo bill (info bar, summary, part-billing/normal sections,
// grand total); branches mirror cargoCompute's combined-VAT-base model documented in
// CLAUDE.md — decomposing risks the screen bill and print bill silently drifting apart.
// eslint-disable-next-line sonarjs/cognitive-complexity
function cargoCalculate() {
  if (reportInputErrors(collectCargoErrors())) return;
  let b;
  try {
    b = cargoCompute();
  } catch (e) {
    dbg.warn("cargoCompute failed:", e);
    showToast("Billing calculation failed — please check inputs and try again.", "error");
    return;
  }
  if (!b) return;
  lastCargoBill = b;
  try {
    document.getElementById("cargo-results").style.display = "block";

    const billNoHtml = b.billNumber
      ? `<div class="ii bill-no-ii"><div class="il">Bill Number</div><div class="iv bill-no-val">${b.billNumber}</div></div>`
      : "";
    const cnfHtml = b.cnfName
      ? `<div class="ii"><div class="il">C&F Agent</div><div class="iv">${b.cnfName}</div></div>`
      : "";
    const blHtml = b.blNumber
      ? `<div class="ii"><div class="il">BL Number</div><div class="iv" style="color:var(--sky)">${b.blNumber}</div></div>`
      : "";
    const beNoHtml = b.billEntryNumber
      ? `<div class="ii"><div class="il">Bill of Entry</div><div class="iv">${b.billEntryNumber}</div></div>`
      : "";
    const beDateHtml = b.billEntryDate
      ? `<div class="ii"><div class="il">B/E Date</div><div class="iv">${b.billEntryDate}</div></div>`
      : "";

    if (b.isPartBilling) {
      const vp = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
      const firstDel = vp.length > 0 ? fd(vp[0].deliveryDate) : "—";
      const lastDel = vp.length > 0 ? fd(vp[vp.length - 1].deliveryDate) : "—";
      document.getElementById("cargo-ibar").innerHTML =
        `<div class="ibar"><div>${billNoHtml}${cnfHtml}${blHtml}${beNoHtml}${beDateHtml}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${fd(b.storStart)}</div></div><div class="ii"><div class="il">First Delivery</div><div class="iv">${firstDel}</div></div><div class="ii"><div class="il">Last Delivery</div><div class="iv">${lastDel}</div></div><div class="ii"><div class="il">Delivery Stages</div><div class="iv" style="color:var(--cargo-accent)">${vp.length} stages</div></div><div class="ii"><div class="il">Initial Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Total Wharfrent Days</div><div class="iv" style="color:var(--gold)">${b.totalDays} days</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
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
      const wharfrentStarts = b.hasWharfrent ? fd(b.storStart) : "—";
      const wharfrentDaysText = b.hasWharfrent ? b.totalDays + " days" : "In free time";
      document.getElementById("cargo-ibar").innerHTML =
        `<div class="ibar"><div>${billNoHtml}${cnfHtml}${blHtml}${beNoHtml}${beDateHtml}<div class="ii"><div class="il">CLD</div><div class="iv">${fd(b.cld)}</div></div><div class="ii"><div class="il">Free Time Ends</div><div class="iv">${fd(b.freeEnd)}</div></div><div class="ii"><div class="il">Wharfrent Starts</div><div class="iv">${wharfrentStarts}</div></div><div class="ii"><div class="il">Delivery</div><div class="iv">${fd(b.delivery)}</div></div><div class="ii"><div class="il">Total Weight</div><div class="iv">${fmtN(b.totalWeight)} ton(s)</div></div><div class="ii"><div class="il">Inside / Outside</div><div class="iv" style="color:var(--cargo-accent)">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div><div class="ii"><div class="il">Wharfrent Days</div><div class="iv" style="color:var(--gold)">${wharfrentDaysText}</div></div><div class="ii"><div class="il">Landing Tier</div><div class="iv" style="color:var(--cargo-accent)">${getCargoTierLabel(b.totalWeight)}</div></div></div></div>`;
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
    const pbSuffix = b.isPartBilling ? " — Part Billing" : "";
    const cargoGrandSplitHtml =
      b.hasWharfrent || b.isPartBilling
        ? `<div><div class="glbl">Inside Sub-Total${pbSuffix}</div><div class="gval" style="color:var(--blue)">${fmt(b.iBase)}</div><div class="gsub">Full rate · before VAT</div></div><div><div class="glbl">Outside Sub-Total${pbSuffix}</div><div class="gval" style="color:var(--purple)">${fmt(b.oBase)}</div><div class="gsub">½ rate · before VAT</div></div>`
        : `<div><div class="glbl">Payable Charges</div><div class="gval" style="color:var(--green)">${fmt(b.nBase)}</div><div class="gsub">No wharfrent — payable charges only</div></div><div></div>`;
    document.getElementById("cargo-grandSec").innerHTML =
      `<div class="gbox cargo-grand"><div class="ginn">${cargoGrandSplitHtml}<div class="gfin"><div class="glbl">GENERAL CARGO GRAND TOTAL</div><div class="gval" style="color:var(--cargo-accent)">${fmt(grand)}</div><div class="gsub">Tk — All inclusive</div></div></div></div>`;
    const cargoEmpty = document.getElementById("cargo-empty");
    if (cargoEmpty) cargoEmpty.style.display = "none";
    const cargoGbox = document.querySelector("#cargo-grandSec .gbox");
    // eslint-disable-next-line sonarjs/void-use -- void forces the offsetWidth read (reflow) that restarts the gboxPulse CSS animation
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
  } catch (e) {
    dbg.warn("cargoCalculate render failed:", e);
    showToast("Display error — bill may not render correctly.", "warning");
  }
}

function cargoReset() {
  document.getElementById("cargo-results").style.display = "none";
  document.getElementById("cargo-preview").innerHTML = SP_CARGO_IDLE;
  ["c-cnfName", "c-blNumber", "c-billEntryDate"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
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
  // Reset date and weight fields to defaults
  const _today = new Date();
  const _todayStr = formatDateForInput(_today);
  const _cCldEl = document.getElementById("c-cld");
  if (_cCldEl) { _cCldEl.value = _todayStr; }
  const _cDelEl = document.getElementById("c-delivery");
  if (_cDelEl) { _cDelEl.value = _todayStr; }
  const _cCldHint = document.getElementById("c-cld-hint");
  if (_cCldHint) { _cCldHint.textContent = _todayStr; _cCldHint.className = "field-hint hint-ok"; }
  const _cDelHint = document.getElementById("c-delivery-hint");
  if (_cDelHint) { _cDelHint.textContent = _todayStr; _cDelHint.className = "field-hint hint-ok"; }
  const _cBeHint = document.getElementById("c-billEntryDate-hint");
  if (_cBeHint) { _cBeHint.textContent = "DD/MM/YYYY"; _cBeHint.className = "field-hint hint-muted"; }
  ["c-weight", "c-inside", "c-outside"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  clearDraft('cargo');
  cargoRefresh();
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

