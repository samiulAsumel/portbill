# Port Billing System — v3.3

A zero-dependency, browser-native billing calculator for **Port Authority wharfrent and payable charges** — handling vehicles and general cargo with slab-based rating, VAT computation, split-rate transitions, inside/outside port splits, and a print-ready invoice.

**Live:** [samiulAsumel.github.io/portbill](https://samiulAsumel.github.io/portbill)

---

## Modules

| Module                    | Scope                                 | Weight range             | Split billing                          |
| ------------------------- | ------------------------------------- | ------------------------ | -------------------------------------- |
| **Car Billing**           | Vehicles (passenger cars, SUVs, etc.) | Any weight (default 2 t) | Yes — rate cut 23 Jul 2024             |
| **General Cargo Billing** | Bulk / general cargo                  | Unlimited                | Self-drive tons — rate cut 23 Jul 2024 |

---

## Car Billing

### Free Time

CLD (Common Landing Date) is Day 1. By default the first **4 days** are free (`CLD + 3`); wharfrent starts on Day 5. Free-time days are admin-configurable down to **0** (wharfrent starts on CLD itself — the free-time strip shows "No free time" instead of day pills).

The vehicle weight input defaults to **2 tons**.

### Wharfrent Slab Rates

| Slab        | New rates (from 23/07/2024) | Old rates (up to 22/07/2024) |
| ----------- | --------------------------- | ---------------------------- |
| Days 1 – 7  | 70 Tk / ton / day           | 40 Tk / ton / day            |
| Days 8 – 14 | 185 Tk / ton / day          | 115 Tk / ton / day           |
| Day 15 +    | 295 Tk / ton / day          | 185 Tk / ton / day           |

Rate escalates progressively — the longest-stored vehicles always reach the highest slab.

### Split Billing (Rate Cut 23/07/2024)

When **CLD ≤ 22/07/2024** and **delivery ≥ 23/07/2024**, the engine automatically applies **split billing**: old rates are charged up to 22 Jul 2024 and new (higher) rates from 23 Jul 2024 onwards. The bill table labels these as **◀ Old Rate Period** and **▶ New Rate Period**, and a `⚡ Split Billing` badge appears on the result card.

### Inside vs. Outside

Every car bill produces **two independent, self-contained totals** — Inside and Outside are each a complete bill:

| Port Area                             | Wharfrent Rate   |
| ------------------------------------- | ---------------- |
| **Inside** (covered shed / warehouse) | Full rate        |
| **Outside** (open yard)               | Full rate × 0.50 |

Each section carries its **own** sub-total, VAT, and Levy (`base + VAT + Levy = section total`), shown per section. The **Car Grand Total = Inside Total + Outside Total**.

### Payable Charges

| Charge           | Default rate                      | VAT            | Notes                                       |
| ---------------- | --------------------------------- | -------------- | ------------------------------------------- |
| River Dues       | 33 Tk / ton                       | 15%            | Applied to full vehicle weight              |
| Landing Charge   | 175 Tk / ton                      | 15%            | Applied to full vehicle weight              |
| Removal Charge   | 350 Tk / ton                      | 15%            | Applied to full vehicle weight              |
| Weighment Charge | 2.5 Tk / ton                      | 15%            | Applied to full vehicle weight              |
| Hoisting Charge  | `rLanding × 1.25 × 0.50` Tk / ton | 15%            | Displayed as `(rLanding × 1.25) × 0.50/ton` |
| Levy Charge      | 1.5 Tk / ton                      | **VAT-exempt** | Added after VAT calculation                 |

Each charge has a checkbox — uncheck to exclude it from the bill. All rates are **locked in user mode** and can only be edited by Admin. Hoisting Charge rate is computed from Landing Charge as `rLanding × 1.25 × 0.50` and displayed with the `× 0.50` multiplier explicit.

### Bill Calculation Formula

VAT and Levy are computed **per section** in the Car module (each section is a complete bill):

```
Inside Amount  = Rate (Tk/ton/day) × Weight (ton) × Days in slab
Outside Amount = Rate (Tk/ton/day) × Weight (ton) × Days in slab × 0.50

Section Base   = Wharfrent + Payables subtotal      (Inside or Outside)
Section VAT    = Section Base × vatRate
Section Total  = Section Base + Section VAT + Levy
Car Grand Total = Inside Total + Outside Total
```

---

## General Cargo Billing

### Free Time

Same rule as Car: **4 free days** by default (`CLD + 3`), wharfrent starts on Day 5. Admin-configurable to 0.

### Wharfrent Slab Rates

| Slab        | Rate              |
| ----------- | ----------------- |
| Days 1 – 7  | 10 Tk / ton / day |
| Days 8 – 14 | 20 Tk / ton / day |
| Day 15 +    | 25 Tk / ton / day |

General Cargo rates do **not** have an old/new rate split — only self-drive tons (billed at Car rates) carry the 23/07/2024 split.

### Inside / Outside Weight Split

The user enters the total cargo weight, then splits it into **Inside tons** (full rate) and **Outside tons** (× 0.50 rate). Inside + Outside must equal the total — a live **Total Check** badge turns red if they don't, blocking bill generation. Tonnage inputs clamp any negative value to 0 on input.

Unlike the Car module, the General Cargo bill shows the Inside and Outside sections as **sub-totals only** (base for VAT). **VAT and Levy are charged once, on the combined Inside + Outside base**, and shown a single time in a closing **Bill Summary** block:

```
Inside Sub-Total   = Inside wharfrent + Inside payables
Outside Sub-Total  = Outside wharfrent (½ rate) + Outside payables

Total Base   = Inside Sub-Total + Outside Sub-Total
VAT          = Total Base × vatRate          (computed once)
Levy         = 1.5 Tk/ton × total weight     (VAT-exempt)
Grand Total  = Total Base + VAT + Levy
```

Computing VAT once on the combined base (rather than per portion and summing) is deliberate: per-portion rounding can drift the grand total by a cent when both portions land on a half-cent boundary.

### Landing Rate Tiers

Landing Charge and all formula-derived charges (Removal, Hoisting) scale with the total weight tier:

| Total weight           | Landing rate (`tierRate`) |
| ---------------------- | ------------------------- |
| ≤ 3 tons               | 90 Tk / ton               |
| > 3 tons and ≤ 20 tons | 180 Tk / ton              |
| > 20 tons              | 250 Tk / ton              |

### Payable Charges

| Charge                       | Rate formula                                          | VAT            | Ton basis                                                           |
| ---------------------------- | ----------------------------------------------------- | -------------- | ------------------------------------------------------------------- |
| River Dues                   | 33 Tk / ton (flat)                                    | 15%            | Total weight                                                        |
| Landing Charge               | `tierRate` Tk / ton                                   | 15%            | Total weight                                                        |
| Removal Charge               | `tierRate × 7` (if Landing checked) or `tierRate × 8` | 15%            | Separate **removal ton** input (outside portion only)               |
| Weighment Charge             | 2.5 Tk / ton                                          | 15%            | Separate **weighment ton** input                                    |
| Hoisting Charge (Normal)     | `tierRate × 1.25` Tk / ton                            | 15%            | Inside normal tons                                                  |
| Hoisting Charge (Self Drive) | `tierRate × 1.25 × 0.50` Tk / ton                     | 15%            | Displayed as `(tierRate × 1.25) × 0.50/ton`; SD inside/outside tons |
| Levy Charge                  | 1.5 Tk / ton                                          | **VAT-exempt** | Total weight                                                        |

Landing, Removal, and Hoisting rates are **always formula-derived and read-only**, even in Admin mode. Removal Charge applies only to the outside portion (or total weight when delivery is within free time). Weighment Charge uses a dedicated weighment-ton input.

### Self-Drive Wharfrent

A dedicated **Self Drive** card (independent of the Hoisting checkbox) lets the user enter separate inside and outside self-drive tonnages. Self-drive tons are billed at **Car Billing wharfrent slab rates** — including the 23/07/2024 old/new rate split — while normal cargo tons continue at General Cargo rates.

| Ton type                | Wharfrent rate                                        |
| ----------------------- | ----------------------------------------------------- |
| Normal inside tons      | GC rates — 10 / 20 / 25 Tk/t/d (full rate)            |
| Normal outside tons     | GC rates × 0.50                                       |
| Self-drive inside tons  | Car Billing rates — 70 / 185 / 295 Tk/t/d (full rate) |
| Self-drive outside tons | Car Billing rates × 0.50                              |

The bill table shows General Cargo and Self-Drive wharfrent as **separate sub-sections**. Self-drive ton inputs validate that each value does not exceed the corresponding inside/outside tonnage.

When Hoisting is checked and Self Drive is active, SD tons are charged at **half the normal hoisting rate** (`tierRate × 1.25 × 0.50`), displayed as `dynamicHoistingRate × 0.50/ton`.

---

## Features

### Live Quick Preview

A `● LIVE` panel updates on every keystroke, showing running inside/outside estimates before the full bill is generated.

### Print Preview & Invoice

Clicking **Print Bill** opens a full-screen print preview dialog with a clean light-mode toolbar (white bar, gold top accent, soft gray canvas). Click **Print** to send to the browser's print dialog.

**Invoice color palette:**

| Element                                  | Color                  |
| ---------------------------------------- | ---------------------- |
| Letterhead / primary borders             | Deep navy `#0c2046`    |
| Gold rule, title accent, grand total bar | Warm gold `#c4943a`    |
| Inside Port section & summary            | Royal blue `#1450a8`   |
| Outside Port section & summary           | Indigo `#5528b0`       |
| Payable Charges section                  | Forest green `#0c6e48` |
| Grand total amount                       | Gold `#a87828`         |

**Invoice contents:**

- Port authority letterhead with document reference number and generation timestamp
- **"How This Bill Is Calculated" explanation box** — a plain-language panel explaining CLD, free time, slab system, weight split, VAT, and levy in the context of the specific bill. Separate variants for Car and General Cargo.
- Itemised wharfrent slab table with **calculation sub-rows** under each slab:
  - Inside: `↳ Rate Tk/ton/day × N ton(s) × N day(s) = Tk Amount`
  - Outside: `↳ Rate × 0.50 Tk/ton/day × N ton(s) × N day(s) = Tk Amount`
- Payable charges table with calc sub-rows: `↳ Rate/ton × N ton(s) = Tk Amount`. Hoisting (Self Drive) displays as `(fullRate) × 0.50/ton`
- **Car:** each Inside / Outside section closes with its own `Sub-Total → VAT → Levy → SECTION TOTAL`, then the Car Grand Total sums the two.
- **General Cargo:** Inside / Outside sections show a **Sub-Total only**; a single closing **Bill Summary** block renders `Total Base → VAT → Levy → GRAND TOTAL` (VAT charged once on the combined base).
- **VAT row** includes the full expression inline: `VAT @ 15.0%  ·  Base × 15.0% = VATAmount`
- Levy row labelled **VAT-exempt** — added separately after VAT
- Color-coded Inside / Outside section headers; when self-drive tons are present the badge shows `Nt Normal + Nt SD`
- Three-column authorisation signature block
- `NOT AN OFFICIAL DOCUMENT` footer disclaimer

### BL Number & C&F Agent Name (Cargo)

Two optional header fields — **BL Number** (Bill of Lading) and **C&F Agent Name** (Clearing & Forwarding agent) — flow through to the invoice header for document reference.

### Part Billing (Cargo)

General Cargo supports multi-stage part delivery. Each stage has a delivery date and a remaining inside/outside balance after that delivery. The **day count runs continuously from CLD — it never resets between stages**; only the billable weight changes.

- UI: **timeline layout** with numbered stage dots, stage-count badge, and a _Bill up to today_ toggle
- Charge-checkbox states are saved and restored when toggling part billing on/off
- When Self Drive is active, each stage shows SD Inside / SD Outside balance inputs, clamped to the stage's remaining tonnage; the max-tonnage hint shows `Nt Normal + Nt SD` when SD weight is present
- Balance inputs follow the **placeholder pattern** — cleared field shows placeholder `0`, typed `0` stays as `0`

**In the printed invoice:**

- Each stage is labelled **Stage N:** with date range, weight, days, and day-range
- Last stage: _Final Delivery — no cargo remains_
- Intermediate stages: _Remaining balance after this delivery: Inside/Outside Nt_
- Footer note confirms: _Day-count continuous from CLD_

### Wharfrent Toggle (Cargo)

The cargo results header has a **Wharfrent** toggle. Switching it off excludes wharfrent from the printed invoice — useful for a payables-only bill. Resets to `true` on cargo form reset.

### Payables Toggle (Cargo)

A **Payables** toggle alongside the Wharfrent toggle. Switching it off removes all payable charges (and recalculates grand totals) from the printed invoice — useful for a wharfrent-only bill. Resets to `true` on cargo form reset.

### Toast Notifications

Validation errors and admin events surface as non-blocking **toast banners** at the bottom of the screen. Colour-coded: green (success), blue (info), gold (warning), red (error). Toasts dismiss automatically after ~2.8 s.

### Inline Date Validation

Date fields show a `DD/MM/YYYY` hint below the input. The hint turns red with an error message for invalid dates and green for valid ones. Validated on every keystroke.

### Empty-State Placeholders

When no bill has been generated yet, both result areas show a centred empty-state graphic prompting the user to fill in the required fields.

### Custom Calendar Picker

All date inputs use a built-in popup calendar with:

- Smart viewport positioning (flips above when space is limited below)
- Month / year navigation
- Gold-highlighted date selection
- Manual `DD/MM/YYYY` typed input also supported

### Responsive Design

Single-column on mobile, two-column grid at ≥ 768 px. Tested from 360 px up to 2560 px / 4 K.

---

## Admin Mode

The admin button (`#adminBtn`) is **hidden by default** (`display:none`). To reveal it:

```js
// Browser DevTools → Console:
document.getElementById("adminBtn").style.display = "inline-flex";
```

Or hold **Ctrl + Shift** and click anywhere on the page.

**Credentials:** `admin` / `admin`

Admin mode removes the `.ro` class from all rate inputs, enabling editing of:

| Field                 | Car module    | Cargo module                   |
| --------------------- | ------------- | ------------------------------ |
| Free-time days        | ✓             | ✓                              |
| VAT rate              | ✓             | ✓                              |
| Wharfrent slabs (new) | nr1, nr2, nr3 | — (uses Car rates for SD tons) |
| Wharfrent slabs (old) | or1, or2, or3 | c-or1, c-or2, c-or3            |
| River Dues            | rRiver        | c-rRiver                       |
| Landing Charge        | rLanding      | read-only (formula-derived)    |
| Removal Charge        | rRemoval      | read-only (formula-derived)    |
| Weighment Charge      | rWeighment    | c-rWeighment                   |
| Hoisting Charge       | rHoisting     | read-only (formula-derived)    |
| Levy Charge           | rLevy         | c-rLevy                        |

Cargo Landing / Removal / Hoisting are always formula-derived and remain locked even in Admin mode.

The password is **SHA-256 hashed** in `main.js` (`AP_HASH`) — never stored in plain text. Login is locked after **5 failed attempts** (counter in `sessionStorage`; resets on page refresh).

To set a custom password, replace `AP_HASH` in `main.js` with `SHA-256(yourNewPassword)`.

### Rate Persistence

Edited rates are automatically saved to **`localStorage`** under the key `pb_admin_rates` and restored on every page load. An **↺ Reset Rates** button (visible only in Admin mode) wipes saved rates and restores all factory defaults from the `RATE_DEFAULTS` object.

Saved values are validated on load: any rate that is not a finite number (corrupted or tampered `localStorage`) is silently replaced with its `RATE_DEFAULTS` factory value.

---

## Rounding

All monetary values use **round-half-up** to 2 decimal places (standard accounting rounding):

```js
const r2 = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
```

A value landing exactly on a half-cent boundary rounds up — e.g. a VAT of `98533 × 0.15 = 14779.95` (or `50256.5 × 0.15 = 7538.475 → 7538.48`). The `+ 1e-9` tolerance nudges exact/near-half values up despite floating-point noise (e.g. `50256.5 × 0.15` is stored as `7538.4749999999995`). Using `- 1e-9` instead would round halves **down** and undercharge the bill by a cent.

**Single-rounding of VAT** — In General Cargo, VAT is rounded **once** on the combined Inside + Outside base. Rounding VAT independently per portion and summing double-rounds: when both portions sit on a half-cent boundary the grand total drifts a cent (e.g. `…441.94` / `.96` instead of `.95`). The Car module bills each section independently, so its per-section VAT is correct by construction.

---

## Outside Port Rate

Wherever a wharfrent slab or charge is billed at the outside (half) rate, the displayed rate is **always the full base rate with an explicit `× 0.50` multiplier**, never a pre-halved value:

- Rate column: `70/t/d × 0.50`
- Calc sub-row: `↳ 70 × 0.50 Tk/ton/day × 2 ton(s) × 5 day(s) = Tk 350.00`
- Hoisting SD payable: `(dynamicHoistingRate) × 0.50/ton`

This applies consistently across on-screen bill tables, part billing tables, and the printed invoice.

---

## Deployment

No build step, no server, no dependencies.

```bash
# Option 1 — open directly
xdg-open index.html          # Linux
open index.html              # macOS

# Option 2 — local HTTP server (avoids font CORS edge cases)
python3 -m http.server 8080
# then visit http://localhost:8080
```

**Deploy to any static host** (GitHub Pages, Netlify, Vercel, S3, nginx) by uploading the four files as-is:

```
index.html
style.css
main.js
favicon.svg
```

### Browser Requirements

ES2022+, CSS Grid, CSS Custom Properties, native `<dialog>`, `IntersectionObserver`, `crypto.subtle` (for admin login SHA-256). All modern versions of Chrome, Firefox, Safari, and Edge are supported.

---

## File Structure

```
portbill/
├── index.html   — Markup: header, module tabs, admin dialog, print-preview dialog,
│                  Car page (#page-car) and Cargo page (#page-cargo)
├── style.css    — All styles (~3100 lines): design tokens, component styles, toast,
│                  inline validation, explanation box, calc-rows, print rules,
│                  responsive layout (360 px → 4 K)
├── main.js      — All logic (~3930 lines):
│                  · RATE_DEFAULTS + localStorage persistence (top)
│                  · CalendarPicker class (~L215)
│                  · Admin auth / SHA-256 (~L460)
│                  · Car billing engine: carCompute() → calcSlabs() → buildCarBillTable()
│                    → carCalculate() (~L621)
│                  · Cargo billing engine: cargoCompute() → calcCarBillingSdSlabs()
│                    → buildCargoBillTable() (~L1035)
│                  · Part billing: renderPartBillingStages(), pbBalanceChange(),
│                    pbSdBalanceChange(), buildPartBillingBillTable() (~L1171)
│                  · Invoice / print: buildCarExplanationHtml(), buildCargoExplanationHtml(),
│                    printCalcRow(), printCalcRowHalf(), buildInvoiceHtml(),
│                    openPrintPreview(), printBill() (~L2566)
└── favicon.svg  — SVG favicon (also used as apple-touch-icon)
```

---

## Key Design Patterns

### Placeholder Pattern

All user-facing quantity inputs use `placeholder="0"` — never `value="0"`. Empty field shows the placeholder; typing `0` shows 0. Part billing balance inputs follow the same rule.

### Toggle-Switch Checkboxes

`.pc-toggle` inputs are visually hidden. To set state programmatically (e.g. in tests):

```js
el.checked = true;
el.dispatchEvent(new Event("change", { bubbles: true }));
```

### DOM Caching

`domCache` holds references to frequently updated elements, populated by `initDomCache()` on `DOMContentLoaded`.

### Rate Table Inputs vs. Spans

Each editable rate has a hidden `<input>` and a visible `<span>`. `syncSpan(inputId, spanId)` keeps them in sync. In admin mode the span is hidden and the input is shown.

### HTML Escaping (XSS Guard)

User-supplied free text is escaped with the `escHtml()` utility before being interpolated into any HTML string:

```js
const escHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
```

This covers the **BL Number** and **C&F Agent Name** fields (which flow into the printed invoice) and part-billing **stage dates** (re-rendered via `innerHTML`). Any new user-facing text field that ends up in an HTML template string must go through `escHtml()`.

---

## Disclaimer

All generated bills carry the notice:

> _"This document is generated for informational and estimation purposes only and does not constitute an official invoice or legally binding charge statement. Final billing is subject to official verification by the Port Authority."_

---

## License

© 2026 samiulAsumel. All rights reserved.
