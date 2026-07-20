# Port Billing System — v3.12.0

A zero-dependency, browser-native billing calculator for **Port Authority wharfrent and payable charges** — handling vehicles, general cargo, and re-export (transhipment/re-shipment) bills with slab-based rating, VAT computation, split-rate transitions, inside/outside port splits, and a print-ready invoice.

**Live:** [samiulAsumel.github.io/portbill](https://samiulAsumel.github.io/portbill)

---

## Modules

| Module                    | Scope                                                     | Weight range                 | Split billing                          |
| ------------------------- | ---------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| **Car Billing**           | Vehicles (passenger cars, SUVs, etc.)                     | Any weight (default 2 t)     | Yes — rate cut 23 Jul 2024             |
| **General Cargo Billing** | Bulk / general cargo                                      | Unlimited                     | Self-drive tons — rate cut 23 Jul 2024 |
| **Re-Export Bill**        | Transhipment / re-shipment cargo (Port Side or Overside) | Unlimited, per Bill of Entry | No — single continuous tariff          |

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

| Charge           | Default rate                       | VAT            | Notes                                        |
| ---------------- | ---------------------------------- | -------------- | -------------------------------------------- |
| River Dues       | 33 Tk / ton                        | 15%            | Applied to full vehicle weight               |
| Landing Charge   | 175 Tk / ton                       | 15%            | Applied to full vehicle weight               |
| Removal Charge   | `rLanding × 2` Tk / ton           | 15%            | Formula-derived (MPA Tariff §8.3, manual removal) — always 2× Landing, read-only |
| Weighment Charge | 2.5 Tk / ton                       | 15%            | Applied to full vehicle weight               |
| Hoisting Charge  | `rLanding × 1.25 × 0.50` Tk / ton | 15%            | Displayed as `(rLanding × 1.25) × 0.50/ton` |
| Levy Charge      | 1.5 Tk / ton                       | **VAT-exempt** | Added after VAT calculation                  |

Each charge has a checkbox — uncheck to exclude it from the bill. All rates are **locked in user mode** and can only be edited by Admin, except Removal and Hoisting, which are **formula-derived and read-only even for Admin** since they track Landing Charge automatically. Hoisting Charge rate is computed from Landing Charge as `rLanding × 1.25 × 0.50`, and Removal Charge as `rLanding × 2` — both displayed on the bill line item with the formula explicit (e.g. `175.00 × 2`). Saved/draft bills snapshot the rate at save time, so historical bills keep their original figure even if Landing Charge is changed later.

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

| Charge                       | Rate formula                                           | VAT            | Ton basis                                                            |
| ---------------------------- | ------------------------------------------------------ | -------------- | -------------------------------------------------------------------- |
| River Dues                   | 33 Tk / ton (flat)                                     | 15%            | Total weight                                                         |
| Landing Charge               | `tierRate` Tk / ton                                    | 15%            | Total weight                                                         |
| Removal Charge               | `tierRate × 7` (if Landing checked) or `tierRate × 8` | 15%            | Separate **removal ton** input (outside portion only)                |
| Weighment Charge             | 2.5 Tk / ton                                           | 15%            | Separate **weighment ton** input                                     |
| Hoisting Charge (Normal)     | `tierRate × 1.25` Tk / ton                             | 15%            | Inside normal tons                                                   |
| Hoisting Charge (Self Drive) | `tierRate × 1.25 × 0.50` Tk / ton                     | 15%            | Displayed as `(tierRate × 1.25) × 0.50/ton`; SD inside/outside tons |
| Levy Charge                  | 1.5 Tk / ton                                           | **VAT-exempt** | Total weight                                                         |

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

## Re-Export Bill

Bills transhipment / re-shipment cargo under the Port Authority's separate transhipment tariff — a distinct rate table and free-time rule from Car/Cargo, with support for multiple **Bills of Entry (BE)** per document and multiple landing lots per BE.

### Re-Export Type: Port Side vs. Overside

| Type          | Meaning                                                    | Wharf Rent | CLD required | Removal | Hoisting default |
| ------------- | ----------------------------------------------------------- | ---------- | ------------- | ------- | ----------------- |
| **Port Side** | Cargo lands and is stored at the port before re-export     | Yes        | Yes           | Yes (optional ton) | On                 |
| **Overside**  | Direct ship-to-ship transfer — no port storage at all      | No         | No (optional) | No      | Off                |

Selecting **Overside** collapses each Bill of Entry to a flat BE Number / BE Date / Ton row (no nested landing lots, no wharf rent, no removal) since there's nothing stored at the port to charge rent on.

### Bill of Entries (Port Side)

Each Re-Export document can hold **multiple Bills of Entry**, and each BE can hold **multiple CLD (landing) lots** — a cargo lot arriving and being billed separately within the same BE. The Landing Rate tier for a BE is picked from the **sum of all its CLD tonnage**; wharf rent is calculated **per CLD lot** (each lot has its own free-time window and chargeable-days count) and summed into the BE's total.

### Free Time & Wharf Rent Tiers

| Parameter        | Default                                     |
| ----------------- | -------------------------------------------- |
| Free Time         | **20 days** from CLD (admin-configurable)   |
| Days 1–20 (after free time) | 5 Tk / ton / day                  |
| Days 21+           | 15 Tk / ton / day                          |

Wharf rent starts the day after free time ends and is **0** if the Re-Export Date falls within the free-time window. Each CLD lot shows its own "Free Time Ends" / "Wharf Rent Starts" dates and a per-tier day/rate/amount breakdown on the bill — the same level of detail as the General Cargo bill statement.

### Landing Rate Tiers

Same boundaries as General Cargo, applied per-BE to the summed CLD tonnage:

| Total BE tonnage        | Landing rate |
| ------------------------ | ------------- |
| ≤ 3 tons                | 90 Tk / ton  |
| > 3 tons and ≤ 20 tons  | 180 Tk / ton |
| > 20 tons                | 250 Tk / ton |

### Payable Charges

| Charge                            | Rate formula                                  | VAT            | Applies to          |
| ----------------------------------- | ----------------------------------------------- | -------------- | -------------------- |
| River Dues                        | 33 Tk / ton                                    | 15%            | Port Side only       |
| Hoisting Charge                   | `Landing Rate × 1.25`                         | 15%            | Both types (default off for Overside) |
| Re-Shipment (Same Wharf)          | `Landing Rate × 150%`                         | 15%            | Both types            |
| Re-Shipment (Different Wharf)     | `Landing Rate × 200%`                         | 15%            | Both types            |
| Removal Charge                    | `Landing Rate × 7`                            | 15%            | Port Side, optional Removal Ton input |
| Levy Charge                       | 1.5 Tk / ton                                   | **VAT-exempt** | Both types            |

The **Wharf Type** toggle (Same / Different) picks which Re-Shipment multiplier applies — 150% when re-exporting from the same wharf it landed on, 200% from a different wharf. Removal Charge's `× 7` multiplier is a documented port-practice figure distinct from the MPA tariff's general `× 8` manual-removal rate (see Car/Cargo Removal Charge above) — a deliberate Re-Export-specific deviation, not a bug.

### Bill Calculation Formula

Re-Export follows the same **combined-base, single-VAT** model as General Cargo, generalized across N Bills of Entry:

```
Per BE:  vatBase = Wharf Rent (Σ CLD lots) + River Dues + Hoisting + Re-Shipment + Removal   (Levy excluded)

vatBaseTotal = Σ (per-BE vatBase)
VAT          = vatBaseTotal × vatRate        (computed once, calcVATmpa)
levyTotal    = Σ (per-BE Levy)
Grand Total  = vatBaseTotal + VAT + levyTotal
```

Each BE's result section on screen/print shows only its `vatBase` sub-total; a single closing **Bill Summary** block renders `vatBaseTotal → VAT → Levy → Grand Total` — identical reasoning to Cargo's single-VAT model (per-portion rounding can drift a cent at half-cent boundaries).

### Billing Rules

1. **Port Side**: Re-export date must be strictly after every CLD it bills — an earlier or equal date is a validation error.
2. **Port Side**: if the Re-export date falls within the 20-day free period, Wharf Rent = 0 for that lot.
3. **Port Side**: Removal Ton = 0 (or left blank) skips the Removal row entirely.
4. **Overside**: no CLD requirement, no Wharf Rent, no Removal — Hoisting defaults **off** (still toggleable on).
5. Unchecking Hoisting skips its row for either type.
6. **Port Side**: multiple CLD dates per BE each get their own Wharf Rent calculation; the Landing Rate slab uses the **sum** of all CLD tons in that BE.

---

## Features

### Live Quick Preview

A `● LIVE` panel updates on every keystroke, showing running inside/outside estimates before the full bill is generated.

### Auto-Format Date Input

All date fields auto-insert slashes as you type — enter `26062024` and the field formats itself to `26/06/2024`. Backspace removes the trailing slash automatically. Dates are always entered manually (`DD/MM/YYYY`); there is no calendar picker.

### Inline Date Validation

Date fields show a `DD/MM/YYYY` hint below the input. The hint turns **red** for invalid dates and **green** for valid ones — updated on every keystroke. This applies to CLD, Delivery, and the optional **Bill of Entry Date** field across all three modules (per-BE for Re-Export).

The validator (`isValidDateStr`) uses a **calendar rollover guard**: after constructing the `Date` object it re-checks that `getFullYear`, `getMonth`, and `getDate` match the parsed parts. This prevents impossible dates such as `31/02/2024` from silently rolling over to March 2 and producing wrong billing periods.

**Cross-field date-order checks** run once both fields hold a well-formed date:

- **Delivery vs. CLD** (Car/Cargo) / **Re-export Date vs. CLD** (Re-Export): the delivery (or re-export) date may not fall before — or for Re-Export Port Side, on or before — the CLD it bills. On conflict the field is flagged red with an inline error message.
- **Part-billing stage dates** (Cargo): each stage's delivery is checked against the running timeline — the offending stage shows the earliest allowed date inline.

Printing is blocked while any date-order conflict exists.

### Bill of Entry Date

Car and Cargo have an optional **Bill of Entry Date** field alongside the Bill of Entry Number; Re-Export has the same field per-BE (**BE Date**). The date validates the same way as CLD/delivery (green / red / muted hint) and is included in the printed invoice when filled.

### Print Preview & Invoice

Clicking **Print Bill** opens a full-screen print preview dialog. Click **Print** to send to the browser's print dialog.

**Invoice color palette (module-aware):**

| Element                        | Car invoice         | Cargo invoice      | Re-Export invoice  |
| ------------------------------ | ------------------- | ------------------ | ------------------- |
| Letterhead / primary borders   | Deep navy `#0b1d3c` | Same               | Same                |
| Accent rule, title, grand bar  | Warm gold `#c09230` | Sky blue `#0ea5e9` | Teal `#10b981`      |
| Inside Port section            | Royal blue `#1050a8`| Same               | —                    |
| Outside Port section           | Indigo `#5020b0`    | Same               | —                    |
| Payable Charges section        | Forest green `#0a5c3c`| Same             | Same                |

**Invoice contents:**

- Port authority letterhead with document reference number and generation timestamp
- "How This Bill Is Calculated" explanation box — plain-language panel covering CLD, free time, slab system, weight split, VAT, and levy
- Itemised wharfrent slab table with calculation sub-rows
- Payable charges table with calc sub-rows
- **Car:** each Inside / Outside section closes with its own `Sub-Total → VAT → Levy → SECTION TOTAL`, then the Car Grand Total sums the two
- **General Cargo / Re-Export:** single closing **Bill Summary** block: `Total Base → VAT → Levy → GRAND TOTAL` (Re-Export: per-BE sub-totals combined into one `vatBaseTotal`)
- Three-column authorisation signature block
- `NOT AN OFFICIAL DOCUMENT` footer disclaimer

### Saved Bills

All calculated bills can be saved locally (and synced to GitHub via Cloudflare Worker) and viewed in the **Saved Bills** module tab.

| Action  | Behaviour |
| ------- | --------- |
| **Save**   | Persists bill number, dates, totals, full input snapshot, and part-billing stages |
| **Edit**   | Restores entire form state and re-runs the calculation — next Save overwrites the same bill number |
| **Print**  | Restores and immediately opens the print preview without staying in edit mode |
| **Delete** | Requires confirmation via in-app confirm dialog; resequences bill numbers in the date group |
| **Search** | Live filter by bill number, CLD, delivery date, C&F agent name, BL number, or total amount |

Bill numbers are date-prefixed and auto-sequenced per day (e.g. `CA-20240626-001`).

### Draft Auto-Save

Every **10 seconds**, the current form state is automatically saved to `localStorage` as a draft for all three modules (Re-Export's draft also snapshots its nested Bills of Entry / CLD lot state). On next page load, if the draft contains meaningful user input (BL number, C&F agent, or Bill of Entry number is non-empty), the form is silently restored and a toast notification confirms the restore.

Drafts are cleared when the user explicitly resets the form or saves a bill.

### Rotation Registry (Admin)

Admin-only panel for registering vessel rotations (Rotation Year + Number + CLD). Used to look up the correct CLD by rotation reference. Synced to GitHub via the Cloudflare Worker.

### Part Billing (Cargo)

General Cargo supports multi-stage part delivery. Each stage has a delivery date and a remaining inside/outside balance after that delivery. **The day count runs continuously from CLD — it never resets between stages**; only the billable weight changes.

Stages whose delivery falls **within free time** appear in the bill table as `Stage N: [date] — Delivery within free time — no wharfrent charge` rather than being silently skipped.

### Wharfrent / Payables Toggles (Cargo)

The cargo results header has **Wharfrent** and **Payables** toggles. Switching either off excludes that section from the printed invoice and recalculates grand totals. Both reset to `true` on form reset.

### Toast Notifications

Validation errors and events surface as non-blocking **toast banners** at the bottom of the screen. Colour-coded: green (success), blue (info), gold (warning), red (error). Toasts dismiss after ~2.8 s.

### Pre-Calculate Input Guards

Before any bill is generated or printed, all failing inputs are gathered into a single toast and the first offending field is focused. Guards require:

- **Vehicle weight > 0** (Car)
- **Total weight > 0** (Cargo)
- **Inside + Outside = Total** (Cargo)
- Valid **CLD**, **delivery**, and optional **Bill of Entry Date** (DD/MM/YYYY, calendar-rollover-safe)
- Valid **removal / weighment / self-drive** tonnage bounds where those charges are enabled

### Responsive Design

Single-column on mobile, two-column grid at ≥ 768 px. Optimised for screens from 360 px to 4 K. On mobile (≤ 480 px): header and tabs compact, rotation selects stack vertically, tables gain horizontal scroll, search bars go full-width.

### Progressive Web App (PWA)

The app ships a `manifest.json` and a service worker (`sw.js`). It can be installed to the home screen on Android and iOS, and works **fully offline** after the first load using a cache-first strategy. The service worker is updated on each reload via background network fetch.

> **Deployment note:** when pushing a new version, increment the cache name in `sw.js` (e.g. `portbill-v15` → `portbill-v16`) so installed users receive updated files immediately. The current cache is `portbill-v16`.

### Offline Sync & Resilience

Cloud writes (rotations, saved bills, admin rate config) are proxied through the Cloudflare Worker, so a lost connection could previously mean a silently-failed save. The app now tracks and recovers from that:

- **Sync status badge** — a pill in the header (hidden when everything is in sync) shows **Offline** (amber) while `navigator.onLine` is false, or **Syncing N…** (accent-colored) while N resources have local changes not yet pushed to the cloud.
- **Pending-write tracking** — if a rotation, saved-bill, or config write fails (offline, network error, Worker down), the change is flagged locally instead of being dropped.
- **Auto-flush on reconnect** — as soon as the browser fires its `online` event, every flagged resource is re-pushed in full (whole-state last-write-wins — no delta log to replay) and a toast confirms how many changes synced.
- **Startup ordering protects unsaved work** — on page load, any pending offline changes are flushed to the cloud *before* the app pulls the cloud's copy of saved bills, so a bill saved while offline is never clobbered by a stale cloud read on the next load.
- **Rotation cache fallback** — the vessel rotation registry is cached to `localStorage` on every successful cloud fetch; if a later fetch fails (offline, cold start with no signal), the cached copy is used instead of leaving the dropdown/table empty.

---

## Admin Mode

The admin button (`#adminBtn`) is **hidden by default** (`display: none`). Access admin mode by holding **Ctrl + Shift** and clicking anywhere on the page — this calls `toggleAdmin()` and opens the login modal. The button becomes visible only after a successful login (`.active` class adds `display: inline-flex`).

**Default credentials:** `admin` / `admin`

Admin mode removes the `.ro` class from all rate inputs, enabling editing of:

| Field                 | Car module    | Cargo module                   | Re-Export module                |
| --------------------- | ------------- | ------------------------------ | -------------------------------- |
| Free-time days        | ✓             | ✓                              | ✓ (`reexport-freeDays`)          |
| VAT rate              | ✓             | ✓                              | ✓ (`reexport-vatRate`)           |
| Wharfrent slabs (new) | nr1, nr2, nr3 | — (uses Car rates for SD tons) | — (wharf rent uses `re-wharfLow`/`re-wharfHigh` instead) |
| Wharfrent slabs (old) | or1, or2, or3 | c-or1, c-or2, c-or3            | —                                 |
| River Dues            | rRiver        | c-rRiver                       | re-rRiver                        |
| Landing Charge        | rLanding      | read-only (formula-derived)    | re-land1, re-land2, re-land3 (slab tiers) |
| Removal Charge        | read-only (formula-derived) | read-only (formula-derived) | re-removalMult (multiplier, default 7×) |
| Weighment Charge      | rWeighment    | c-rWeighment                   | —                                 |
| Hoisting Charge       | rHoisting (read-only, formula-derived) | read-only (formula-derived) | re-hoistPct (multiplier, default 1.25×) |
| Levy Charge           | rLevy         | c-rLevy                        | re-rLevy                         |
| Wharf Rent tiers      | —             | —                               | re-wharfLow (Days 1–20), re-wharfHigh (Days 21+) |
| Re-Shipment           | —             | —                               | re-reshipSame (150%), re-reshipDiff (200%) |

The password is **SHA-256 hashed** in `src/core.js` (`AP_HASH`) — never stored in plain text. Login is locked after **5 failed attempts** (counter in `sessionStorage`; resets on page refresh).

To change the password: log in, open the Admin Password panel via the mode badge, enter the new password, and click **UPDATE**. The new hash is stored in `localStorage` and synced to the Cloudflare Worker (`/config`). Remember to also update `WRITE_TOKEN_HASH` in your Cloudflare Worker secrets to match the new password.

### Rate Persistence

Edited rates are automatically saved to **`localStorage`** (`pb_admin_rates`) and restored on every page load. An **↺ Reset Rates** button (visible only in Admin mode) wipes saved rates and restores all factory defaults from `RATE_DEFAULTS`.

---

## Rounding

All monetary values **except VAT** use **round-half-down** to 2 decimal places (port convention: a value exactly on the 0.5-cent boundary rounds down):

```js
const r2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
```

`Math.ceil(x - 0.5)` is the standard "round half down" formula. The `|| 0` guard prevents `-0` from appearing in output fields. This convention was established in v3.6.1 to match Port Authority billing practice (e.g. 60,394.725 → 60,394.72).

**VAT — banker's rounding (v3.7.1)** — VAT amounts are computed by a dedicated shared function, `calcVATmpa()`, for **exact parity with the Port Authority's C# billing engine**, whose VAT line is:

```csharp
Row.TotalVATBDT = Math.Round((Row.TotalBillBDT ?? 0) * Tariff.VATPercent / 100m, 2);
```

C# `Math.Round` defaults to **half-to-even (banker's) rounding**, so `calcVATmpa()` replicates that: the bill is converted to integer poysha (no float64 drift), multiplied exactly, and rounded half-to-even in a single final step (e.g. 15.70 × 15% = 2.355 → **2.36**; 117.50 × 15% = 17.625 → **17.62**). This eliminated the occasional 1-poysha VAT differences against printed Port Authority bills. A 12-case parity suite lives in `tests/vat.test.js` (`node tests/vat.test.js`).

**Single-rounding of VAT** — In General Cargo, VAT is rounded **once** on the combined Inside + Outside base; Re-Export applies the same rule across N Bills of Entry, rounding once on the combined `vatBaseTotal`. Rounding per portion/BE and summing double-rounds: when multiple pieces sit on a half-cent boundary the grand total drifts a cent. The Car module bills each section independently, so its per-section VAT is correct by construction.

**Tonnage — whole numbers, rounded up (v3.11.0)** — Every weight/tonnage value (Car vehicle weight, Cargo total/inside/outside/removal/weighment/self-drive tons, Re-Export BE/CLD/removal tons) is a **whole number**, via a shared `ceilTon()` helper in `src/core.js`:

```js
function ceilTon(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : 0;
}
```

Fractional tonnage is always rounded **up** to the next integer (e.g. 4.2 t → 5 t), never down or to nearest. Before v3.11.0, Car/Cargo weights rounded to nearest and Re-Export tonnage wasn't rounded at all — this was the one deliberate behavior change in that release.

---

## Deployment

No build step, no server, no dependencies.

```bash
# Option 1 — open directly
xdg-open index.html          # Linux
open index.html              # macOS

# Option 2 — local HTTP server (recommended — required for service worker)
python3 -m http.server 8080
# then visit http://localhost:8080
```

**Deploy to any static host** (GitHub Pages, Netlify, Vercel, S3, nginx) by uploading all files:

```
index.html
style.css
src/core.js
src/admin.js
src/car.js
src/cargo.js
src/reexport.js
src/platform.js
favicon.svg
manifest.json
sw.js
```

### Browser Requirements

ES2022+, CSS Grid, CSS Custom Properties, native `<dialog>`, `IntersectionObserver`, `crypto.subtle` (admin SHA-256), `serviceWorker` (PWA / offline). All modern versions of Chrome, Firefox, Safari, and Edge are supported.

### Cloudflare Worker Setup (cross-device sync)

`worker.js` is a Cloudflare Worker that proxies read/write access to a private GitHub repository (`portbill-data`). `GET` requests are always open. `PUT` requests work in two modes:

- **Without `WRITE_TOKEN_HASH`** (default): writes are open. Suitable for personal use.
- **With `WRITE_TOKEN_HASH`** (recommended): `PUT` requests must carry `Authorization: Bearer <password>`; the SHA-256 of the token is compared to the stored hash. Set this after first deploy.

**One-time setup:**

```bash
# 1. Compute the SHA-256 of your admin password
echo -n "<password>" | sha256sum

# 2. Store the hash as a Cloudflare secret
wrangler secret put WRITE_TOKEN_HASH

# 3. Deploy the Worker
wrangler deploy worker.js
```

The Worker URL is `https://portbill-proxy.sa-sumel91.workers.dev`. All `GET` endpoints (`/config`, `/rotations`, `/saved-bills`) remain unauthenticated.

`wrangler.toml` in the repo root pins `name`, `main`, and the D1 `[[d1_databases]]` binding, so `wrangler deploy` (after a one-time `wrangler login`) redeploys the Worker with the correct bindings every time — no dashboard clicks required. Secrets (`GH_TOKEN`, `WRITE_TOKEN_HASH`) are set once via `wrangler secret put` and persist across redeploys.

---

## Usage Analytics (Admin)

An admin-only **Analytics** module counts how many devices open the app per day, week, and month. It is deliberately privacy-first:

- Each browser stores one random UUID (`localStorage.pb_device_id`) — **no names, no IPs, no cookies, no personal data**.
- One "open" = one browser session (`sessionStorage` guard, so reloads don't inflate counts).
- One device ≠ one person: the same user on phone and PC counts twice.
- Counting fails silently offline — the app never blocks on it.

The client sends `POST /track` on startup; the admin panel reads `GET /stats` (guarded by the same `WRITE_TOKEN_HASH` bearer check as writes). Both routes are served by the Worker from a **Cloudflare D1** database — atomic SQL upserts, exact `COUNT(DISTINCT device)` per bucket. Day boundaries are Asia/Dhaka (UTC+6).

**Status: live in production.** The `portbill-stats` D1 database is created, the `visits` table + `idx_visits_day` index exist, and `wrangler.toml` (checked into the repo) pins the `DB` binding to it — `wrangler deploy` picks up the binding automatically, no manual dashboard step needed.

**Reproducing this setup from scratch** (new fork, new Cloudflare account, etc.):

```bash
# 1. Create the database
wrangler d1 create portbill-stats

# 2. Create the visits table + index
wrangler d1 execute portbill-stats --remote --command \
  "CREATE TABLE IF NOT EXISTS visits (
     day TEXT NOT NULL, device TEXT NOT NULL,
     opens INTEGER NOT NULL DEFAULT 1,
     PRIMARY KEY (day, device));
   CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);"

# 3. Copy the database_id from step 1's output into wrangler.toml's
#    [[d1_databases]] block (binding = "DB")

# 4. Deploy the Worker
wrangler login   # one-time Cloudflare OAuth
wrangler deploy
```

Until the binding exists both routes return 503 and the app is unaffected — pings fail silently and the Analytics panel shows a "not configured" notice.

---

## File Structure

```
portbill/
├── index.html     — Markup: header, module tabs, admin dialog, print-preview dialog,
│                    Car page (#page-car), Cargo page (#page-cargo), Re-Export page
│                    (#page-reexport), Rotation page (#page-rotation), Saved Bills page
│                    (#page-saved), Analytics page (#page-stats)
├── style.css      — All styles (~4870 lines): design tokens, accent variable system
│                    (gold/sky/teal), component styles, date-field-wrap / .cal icon,
│                    in-unit-wrap / .in-unit tonnage-suffix, segmented pill controls
│                    (.seg/.seg-btn), toast, inline validation, rotation card, saved
│                    bills, search bar, responsive polish 320px → 4K, print rules
├── src/            — All logic (~7030 lines total), split into six classic <script defer>
│                    files sharing one global scope (no bundler; core.js loads first,
│                    platform.js loads last):
│   ├── core.js     — Shared kernel: calcVATmpa(), ceilTon(), RATE_DEFAULTS + rate
│   │                 persistence, toast, field validation, admin session state +
│   │                 SHA-256 crypto (AP_HASH), shared cross-module state, escHtml/
│   │                 date/number utils, calcSlabs(), pre-calculate error collectors,
│   │                 offline-sync pending-write tracker (getPending()/markPending()/
│   │                 clearPending())
│   ├── admin.js    — switchModule(), admin auth (doLogin(), changeAdminPassword()),
│   │                 cloud rate-config restore, flushSync() on successful login
│   ├── car.js      — Car billing: carCompute() → calcSlabs() → buildCarBillTable()
│   │                 → carCalculate(); plus the Rotation Number registry UI with a
│   │                 localStorage cache fallback (loadRotations()) for offline/failed
│   │                 fetches
│   ├── cargo.js    — Cargo billing: cargoCompute() → calcCarBillingSdSlabs() →
│   │                 buildCargoBillTable(); Part Billing (computePartBillingWharfrent())
│   ├── reexport.js — Re-Export billing: reexportCompute() → calcReexportWharfRent()
│   │                 → renderBillOfEntries() → reexportCalculate()
│   └── platform.js — Cross-cutting services + app bootstrap (loads last): invoice/
│                     print (buildInvoiceHtml(), openPrintPreview(), printBill()),
│                     cloud sync (saveBillsToWorker(), loadBillsFromWorker()), offline
│                     sync resilience (updateSyncBadge(), flushSync(), online/offline
│                     listeners), draft auto-save (saveDraft(), clearDraft(),
│                     restoreFormDraft()), usage analytics (getDeviceId(), trackVisit(),
│                     loadStats()), saved bills (renderSavedBills(), editSavedBill(),
│                     printSavedBill()), rotation worker I/O, and the INIT block
├── worker.js      — Cloudflare Worker proxy: open GET endpoints (/config, /rotations,
│                    /saved-bills); authenticated PUT via Bearer token whose SHA-256
│                    matches WRITE_TOKEN_HASH Cloudflare secret; D1-backed usage
│                    analytics (POST /track open, GET /stats bearer-guarded)
├── manifest.json  — PWA web app manifest (name, icons, display: standalone, theme_color)
├── sw.js          — Service worker (cache: portbill-v16): cache-first with background
│                    network update; caches index.html, the six src/*.js files,
│                    style.css, favicon.svg, manifest.json
├── favicon.svg    — Compass-rose emblem SVG (gold stroke #c09230); also apple-touch-icon
├── wrangler.toml  — Worker deploy config: pins `name`, `main`, and the D1 `[[d1_databases]]`
│                    binding (`DB` → `portbill-stats`) so `wrangler deploy` is reproducible
└── tests/
    └── vat.test.js — VAT MPA-parity suite (12 cases, banker's-rounding midpoints,
                      null safety); run with `node tests/vat.test.js`
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

### Module-Aware Accent System

`style.css` defines `--accent` (and `--accent-hi/lo/bg/bdr/ring/rgb`) defaulting to gold (Car module). `switchModule()` adds `body.mode-cargo` (sky blue) or `body.mode-reexport` (teal) which override every `--accent-*` variable. All UI elements derive their color from `var(--accent)` without duplicate rules. The printed invoice inlines literal hex values per module (`"car"`/`"cargo"`/`"reexport"`) since the `<iframe>` has no access to parent CSS variables.

### Lock Icon (`.lck`)

All lock icons use `<span class="lck"></span>` — never emoji. The `.lck` CSS class renders a padlock SVG via `mask: url(svg)` and inherits `currentColor`. Emoji alternatives are banned; they render inconsistently across platforms.

### HTML Escaping (XSS Guard)

User-supplied free text is escaped with `escHtml()` before being interpolated into any HTML string. Coverage: BL Number, C&F Agent Name, bill entry fields, part-billing stage dates, rotation registry rows, Re-Export BE Number / BE Date / CLD dates. Any new user-facing text field must go through `escHtml()` before `innerHTML` interpolation.

### Grand Total Pulse Animation

After each calculation, a CSS pulse fires on the grand total box:

```js
el.classList.remove("just-calculated");
void el.offsetWidth;   // force reflow to restart animation
el.classList.add("just-calculated");
```

`prefers-reduced-motion` disables the animation.

---

## Disclaimer

All generated bills carry the notice:

> *"This document is generated for informational and estimation purposes only and does not constitute an official invoice or legally binding charge statement. Final billing is subject to official verification by the Port Authority."*

---

## Changelog

### v3.12.0 — Current Release

| # | Area | Change |
|---|------|--------|
| 1 | Offline sync | New pending-write tracking for cloud writes (rotations, saved bills, admin config): a failed `PUT` (offline, network error) flags the resource locally instead of silently dropping the change, and a header sync badge (`#syncBadge`) shows **Offline** or **Syncing N…** accordingly |
| 2 | Offline sync | `flushSync()` re-pushes every pending resource in full as soon as the browser's `online` event fires (whole-state last-write-wins — no delta/op-log), and also runs on page load *before* the cloud saved-bills pull, so a bill saved while offline can never be overwritten by a stale cloud read on next load |
| 3 | Rotation registry | `loadRotations()` now caches every successful fetch to `localStorage` (`pb_rotations_cache`) and falls back to that cache on fetch failure, so a network error no longer blanks the rotation dropdown/table |
| 4 | PWA | Service worker cache bumped `portbill-v14` → `portbill-v16` to ship the above changes to installed/offline users |

### v3.11.0

| # | Area | Change |
|---|------|--------|
| 1 | Architecture | Split the single ~7,150-line `main.js` into six single-responsibility classic-script files under `src/` (`core.js`, `admin.js`, `car.js`, `cargo.js`, `reexport.js`, `platform.js`) sharing one global scope, no bundler, no build step — pure refactor, verified with an identical function/const inventory and full browser regression pass, zero behavior change |
| 2 | Billing rule | **Whole-number tonnage**: all weight/tonnage values (Car weight; Cargo total/inside/outside/removal/weighment/self-drive tons; Re-Export BE/CLD/removal tons) are now rounded **up** to the nearest whole number via a shared `ceilTon()` helper. Before this release, Car/Cargo weights rounded to nearest and Re-Export tonnage wasn't rounded at all — this is the one deliberate behavior change in this release; see **Rounding** below |
| 3 | CI | Fixed the UTF-8 encoding-check workflow, which had gone blind to all JS after the `main.js` split (still hardcoded the old filename); now globs every file under `src/` |

### v3.10.2

| # | Area | Change |
|---|------|--------|
| 1 | Responsive | Fixed a CSS Grid intrinsic-sizing bug where the two-column `.layout` grid's `1fr` track could be forced wider than the viewport by a single wide descendant, causing horizontal scroll on phones (measured overflow at every width from 300px–767px before the fix, worst around 375–428px). Root-caused via systematic width sweeps (260px–1920px) across all three modules; fixed with `min-width: 0` on the grid items — the standard fix for this well-known Grid/Flexbox gotcha |
| 2 | Responsive | Payable-charge rows (`.pc-row`, shared by Car/Cargo) now wrap onto a second line instead of being forced onto one unbreakable row — rate input, unit, and VAT badge drop below the label and right-align at narrow widths; fixed-width chrome (rate input, badge padding) shrinks further under 480px so labels don't wrap on every word |
| 3 | Responsive | Quick Preview rows (`.pvr`) now wrap instead of overflowing when a status value (e.g. "Within Free Time ✓") is too long to sit beside its label on very narrow screens |
| 4 | Responsive | Free-time date chips (Car + Cargo) were joined with no whitespace between `<span>` tags, leaving the browser no line-break opportunity — the whole chip strip became one unbreakable run that could force the page wider on mobile. Chips now join with a space |
| 5 | Rotation No. | Shortened dropdown placeholders "Rotation Year" / "Rotation Number" → "Year" / "Number" (redundant next to the "Rotation No." card title) — frees up label width on the smallest supported phones (~320px) |

### v3.10.1

| # | Area | Change |
|---|------|--------|
| 1 | Car | Removal Charge is now **formula-derived**: `rLanding × 2` (MPA Tariff §8.3, manual removal) instead of a static `350`, following the same read-only pattern already used for Hoisting Charge. Bill line item shows the formula (`175.00 × 2`), and rate is snapshotted at save time so historical bills keep their original figure even if Landing Charge changes later |
| 2 | Re-Export UI | Bill of Entries input fields polished: tonnage inputs get an inline `ton` unit suffix, field labels carry small inline icons, CLD delete buttons align with input height, and the "+ Add CLD" / Removal Ton row is visually separated by a divider with a width-capped Removal Ton field |

### v3.10.0

| # | Area | Change |
|---|------|--------|
| 1 | Re-Export | **Terminology correction**: renamed "River Side" → **Overside** (direct ship-to-ship transfer, no port storage) and the former "Overside" → **Port Side** (cargo lands and is stored before re-export) — matching real MPA/shipping usage. Overside no longer requires a CLD, drops the Vessel Name / Port of Re-Export / top-level Reference-Bill-Date fields (superseded by per-BE fields), simplifies Bill of Entries to a flat BE Number/Date/Ton row, and defaults Hoisting **off** |
| 2 | Re-Export | Segmented pill controls (`.seg`/`.seg-btn`) replace `<select>` dropdowns for Re-Export Type and Wharf Type — reusable binary-choice component |
| 3 | Re-Export | RE-EXPORT BILL STATEMENT now matches the General Cargo bill statement's depth: per-tier (not lumped) wharf-rent day/rate breakdown, explicit "Free Time Ends" / "Wharf Rent Starts" per CLD lot, and River Dues / Landing Rate / Total Wharf Rent Days info-grid fields |
| 4 | Rates | Verified all live rates against the Port Authority's master tariff comparison document — no discrepancies found; Re-Export's `× 7` Removal multiplier is a confirmed, deliberate port-practice deviation from the tariff's general `× 8` |

### v3.9.0

| # | Area | Change |
|---|------|--------|
| 1 | Re-Export | New **Re-Export Bill** module (3rd public tab): transhipment/re-shipment billing under a separate 20-day-free-time, 5/15-Tk-tiered wharf-rent tariff, distinct from the Car/Cargo slab system |
| 2 | Re-Export | Multiple **Bills of Entry** per document, each with multiple CLD landing lots; Landing Rate slab picked from each BE's summed CLD tonnage (90/180/250 Tk, same tiers as Cargo) |
| 3 | Re-Export | Payable charges: River Dues, Hoisting (125%), Re-Shipment (150% same wharf / 200% different wharf), Removal (7×), Levy — combined-base single-VAT model generalized across N BEs (same reasoning as Cargo's combined-VAT model) |
| 4 | Print | Teal accent theme (`--teal: #10b981`) for the Re-Export module and its printed invoice, alongside gold (Car) and sky blue (Cargo) |

### v3.8.1

| # | Area | Change |
|---|------|--------|
| 1 | Analytics | Analytics module is now **live in production**: `portbill-stats` D1 database and `visits` table (+ `idx_visits_day` index) provisioned, `wrangler.toml` added to pin the `DB` binding, and the Worker redeployed. `/track` and `/stats` verified against the live endpoint |
| 2 | Deploy | Added `wrangler.toml` and `.gitignore` (excludes local `.wrangler/` cache) so `wrangler deploy` is a single reproducible command instead of manual dashboard bindings |

### v3.8.0

| # | Area | Change |
|---|------|--------|
| 1 | Analytics | New admin-only **Analytics** module: daily/weekly/monthly unique users and opens, with stat cards and a 30-day SVG bar chart. Anonymous device UUIDs, one count per browser session, Asia/Dhaka day boundaries |
| 2 | Worker | `POST /track` (open, validated upsert) and `GET /stats` (bearer-guarded, exact `COUNT(DISTINCT device)` buckets) backed by Cloudflare D1; both return 503 and degrade silently until the `DB` binding is configured |

### v3.7.1 — Previous Release

| # | Area | Change |
|---|------|--------|
| 1 | VAT | **MPA exact parity**: new shared `calcVATmpa()` — integer poysha-scale math + half-to-even (banker's) rounding, mirroring the Port Authority C# engine `Math.Round((TotalBillBDT ?? 0) * VATPercent / 100m, 2)`. Replaced the half-down `r2` at all 8 VAT sites (Car per-section, Cargo combined-base, breakdown attribution, print builders). Fixes occasional 1-poysha VAT mismatches against printed MPA bills. All non-VAT rounding keeps the half-down port convention |
| 2 | Tests | Added `tests/vat.test.js` — 12-case parity suite (midpoint, null/undefined safety, real bill totals) that extracts `calcVATmpa` from `src/core.js` at runtime so the shipped code is what's tested |

### v3.7.0

| # | Area | Change |
|---|------|--------|
| 1 | Responsive | Full-spectrum responsive polish 320 px → 4K: header, tabs, rate tables, result cards, saved bills, rotation registry, dialogs, and print preview all adapt cleanly across every breakpoint |
| 2 | UI / UX | Resolved 6 UI/UX bugs found in deep scan: inconsistent focus rings, misaligned toggle labels, broken hover states on mobile, stale date-hint colours after reset, print-button overlap on narrow viewports, and cargo section-header z-index conflict |
| 3 | Display | Fixed `-0.00` display artefact on zero-weight fields; corrected incomplete form reset (some rate spans were not restored); fixed mislabelled "Levy" / "VAT" column headers in part-billing stage rows |
| 4 | Encoding | Corrected 428 mojibake characters in `index.html` (UTF-8 corruption of Bangla/special text introduced by a prior editor) |
| 5 | CI | Added GitHub Action (`check-encoding.yml`) to detect mojibake on every push, preventing future encoding regressions |
| 6 | Admin | Admin button is now correctly **hidden by default** — entry is exclusively via Ctrl + Shift + Click; README corrected to match implementation |

### v3.6

| # | Area | Change |
|---|------|--------|
| 1 | PWA | `manifest.json` + `sw.js` service worker; app installable and fully offline-capable |
| 2 | Draft auto-save | Form state saved every 10 s; restored on reload when BL/C&F/B-E has content; cleared on Reset and Save |
| 3 | Saved bills search | Live search bar filters by bill number, CLD, delivery, C&F agent, BL number, total |
| 4 | Print from saved bills | Print button in every saved bill row; restores form then opens print dialog without staying in edit mode |
| 5 | B/E Date inline hint | Bill of Entry Date fields now show green / red / grey hints like CLD and Delivery |
| 6 | Mobile improvements | ≤480px: header/tabs tighter, rotation selects stack vertically, tables horizontal-scroll, search full-width |
| 7 | Rotation reset | Fixed "— No. —" stale placeholder — now correctly resets to "Rotation Number" |

### v3.6.1 — Patch

| # | Area | Fix |
|---|------|-----|
| 1 | Rounding | Changed `r2()` from `Math.floor(v*100+0.5+1e-9)/100` to `Math.ceil(v*100-0.5)/100` — values exactly at the 0.5 boundary (third decimal = 5) now round **down** per port convention (e.g. 60,394.725 → 60,394.72). Applied to all 6 `r2` definitions across Car and General Cargo modules. |
| 2 | Rotation dropdown | `populateNumberDropdown()` now sorts filtered rotations by CLD date descending (newest first), matching the Rotation Registry display order — regardless of insertion order in the data store. |
| 3 | Rotation dropdown (hotfix) | Fixed `ReferenceError: parseDMY is not defined` — `parseDMY` is a local function inside `renderRotationTable()` and out of scope for `populateNumberDropdown()`. Replaced with an inline `dmyMs()` helper so the number select works after year selection. |

### v3.5.1 — Bug Fixes

| # | Area | Fix |
|---|------|-----|
| 1 | Date validation | `isValidDateStr` calendar rollover guard — `31/02` fails instead of silently rolling to March 2 |
| 2 | Print invoice | Fixed cargo accent color typo: `#0ea5c9` → `#0ea5e9` |
| 3 | Worker sync | `saveConfigToWorker` / `loadConfigFromGitHub` use shared `PROXY_URL` — single source of truth |
| 4 | Rotation registry | `r.num` and `r.cld` wrapped in `escHtml()` before `innerHTML` insertion |

### v3.5 — Previous Release

- Cross-device sync via Cloudflare Worker proxy to GitHub
- Part Billing (multi-stage cargo delivery)
- Self Drive wharfrent at Car Billing slab rates
- Saved Bills module with edit / delete / resequence
- Rotation Registry (admin-only CLD lookup)
- Admin password change with cloud sync
- Wharfrent / Payables print toggles (Cargo)

---

## License

© 2026 samiulAsumel. All rights reserved.
