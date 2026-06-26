# Port Billing System — v3.6

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

| Charge           | Default rate                       | VAT            | Notes                                        |
| ---------------- | ---------------------------------- | -------------- | -------------------------------------------- |
| River Dues       | 33 Tk / ton                        | 15%            | Applied to full vehicle weight               |
| Landing Charge   | 175 Tk / ton                       | 15%            | Applied to full vehicle weight               |
| Removal Charge   | 350 Tk / ton                       | 15%            | Applied to full vehicle weight               |
| Weighment Charge | 2.5 Tk / ton                       | 15%            | Applied to full vehicle weight               |
| Hoisting Charge  | `rLanding × 1.25 × 0.50` Tk / ton | 15%            | Displayed as `(rLanding × 1.25) × 0.50/ton` |
| Levy Charge      | 1.5 Tk / ton                       | **VAT-exempt** | Added after VAT calculation                  |

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

## Features

### Live Quick Preview

A `● LIVE` panel updates on every keystroke, showing running inside/outside estimates before the full bill is generated.

### Auto-Format Date Input

All date fields auto-insert slashes as you type — enter `26062024` and the field formats itself to `26/06/2024`. Backspace removes the trailing slash automatically. Dates are always entered manually (`DD/MM/YYYY`); there is no calendar picker.

### Inline Date Validation

Date fields show a `DD/MM/YYYY` hint below the input. The hint turns **red** for invalid dates and **green** for valid ones — updated on every keystroke. This applies to CLD, Delivery, and the optional **Bill of Entry Date** field in both modules.

The validator (`isValidDateStr`) uses a **calendar rollover guard**: after constructing the `Date` object it re-checks that `getFullYear`, `getMonth`, and `getDate` match the parsed parts. This prevents impossible dates such as `31/02/2024` from silently rolling over to March 2 and producing wrong billing periods.

**Cross-field date-order checks** run once both fields hold a well-formed date:

- **Delivery vs. CLD** (both modules): the delivery date may not fall before the CLD. On conflict the delivery field is flagged red with *"Delivery date is before CLD"*.
- **Part-billing stage dates** (Cargo): each stage's delivery is checked against the running timeline — the offending stage shows the earliest allowed date inline.

Printing is blocked while any date-order conflict exists.

### Bill of Entry Date

Both modules have an optional **Bill of Entry Date** field alongside the Bill of Entry Number. The date validates the same way as CLD/delivery (green / red / muted hint) and is included in the printed invoice header when filled.

### Print Preview & Invoice

Clicking **Print Bill** opens a full-screen print preview dialog. Click **Print** to send to the browser's print dialog.

**Invoice color palette (module-aware):**

| Element                        | Car invoice         | Cargo invoice      |
| ------------------------------ | ------------------- | ------------------ |
| Letterhead / primary borders   | Deep navy `#0b1d3c` | Same               |
| Accent rule, title, grand bar  | Warm gold `#c09230` | Sky blue `#0ea5e9` |
| Inside Port section            | Royal blue `#1050a8`| Same               |
| Outside Port section           | Indigo `#5020b0`    | Same               |
| Payable Charges section        | Forest green `#0a5c3c`| Same             |

**Invoice contents:**

- Port authority letterhead with document reference number and generation timestamp
- "How This Bill Is Calculated" explanation box — plain-language panel covering CLD, free time, slab system, weight split, VAT, and levy
- Itemised wharfrent slab table with calculation sub-rows
- Payable charges table with calc sub-rows
- **Car:** each Inside / Outside section closes with its own `Sub-Total → VAT → Levy → SECTION TOTAL`, then the Car Grand Total sums the two
- **General Cargo:** single closing **Bill Summary** block: `Total Base → VAT → Levy → GRAND TOTAL`
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

Every **10 seconds**, the current form state is automatically saved to `localStorage` as a draft for both modules. On next page load, if the draft contains meaningful user input (BL number, C&F agent, or Bill of Entry number is non-empty), the form is silently restored and a toast notification confirms the restore.

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

> **Deployment note:** when pushing a new version, increment the cache name in `sw.js` (`portbill-v1` → `portbill-v2`) so installed users receive updated files immediately.

---

## Admin Mode

The admin button (`#adminBtn`) is **always visible** in the header. Click it — or hold **Ctrl + Shift** and click anywhere on the page — to open the login modal.

**Default credentials:** `admin` / `admin`

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

The password is **SHA-256 hashed** in `main.js` (`AP_HASH`) — never stored in plain text. Login is locked after **5 failed attempts** (counter in `sessionStorage`; resets on page refresh).

To change the password: log in, open the Admin Password panel via the mode badge, enter the new password, and click **UPDATE**. The new hash is stored in `localStorage` and synced to the Cloudflare Worker (`/config`). Remember to also update `WRITE_TOKEN_HASH` in your Cloudflare Worker secrets to match the new password.

### Rate Persistence

Edited rates are automatically saved to **`localStorage`** (`pb_admin_rates`) and restored on every page load. An **↺ Reset Rates** button (visible only in Admin mode) wipes saved rates and restores all factory defaults from `RATE_DEFAULTS`.

---

## Rounding

All monetary values use **round-half-up** to 2 decimal places (standard accounting rounding):

```js
const r2 = (v) => Math.floor(v * 100 + 0.5 + 1e-9) / 100;
```

The `+ 1e-9` tolerance nudges exact/near-half values up despite floating-point noise. Using `- 1e-9` instead would round halves **down** and undercharge the bill by a cent.

**Single-rounding of VAT** — In General Cargo, VAT is rounded **once** on the combined Inside + Outside base. Rounding per portion and summing double-rounds: when both portions sit on a half-cent boundary the grand total drifts a cent. The Car module bills each section independently, so its per-section VAT is correct by construction.

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
main.js
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

---

## File Structure

```
portbill/
├── index.html     — Markup: header, module tabs, admin dialog, print-preview dialog,
│                    Car page (#page-car), Cargo page (#page-cargo), Saved Bills page (#page-saved)
├── style.css      — All styles (~4200 lines): design tokens, accent variable system,
│                    component styles, date-field-wrap / .cal icon, toast, inline
│                    validation, rotation card, saved bills, search bar, mobile
│                    improvements (≤480px), print rules
├── main.js        — All logic (~6100 lines):
│                    · RATE_DEFAULTS + localStorage persistence (top)
│                    · Admin auth / SHA-256 (~L470)
│                    · Car billing engine: carCompute() → calcSlabs() → buildCarBillTable()
│                      → carCalculate() (~L630)
│                    · Pre-calculate guards: collectCarErrors(), collectCargoErrors() (~L1262)
│                    · Cargo billing engine: cargoCompute() → calcCarBillingSdSlabs()
│                      → buildCargoBillTable() (~L2340)
│                    · Part billing: renderPartBillingStages(), computePartBillingWharfrent() (~L1452)
│                    · Invoice / print: buildInvoiceHtml(), openPrintPreview(), printBill() (~L3510)
│                    · Rotation registry: loadRotations(), renderRotationTable() (~L5380)
│                    · Cross-device sync: saveBillsToWorker(), loadBillsFromWorker() (~L5630)
│                    · Draft auto-save: saveDraft(), clearDraft(), restoreFormDraft() (~L5766)
│                    · Saved bills: renderSavedBills(), editSavedBill(), printSavedBill() (~L5896)
├── manifest.json  — PWA web app manifest (name, icons, display: standalone, theme_color)
├── sw.js          — Service worker: cache-first with background network update;
│                    caches index.html, main.js, style.css, favicon.svg, manifest.json
└── favicon.svg    — Compass-rose emblem SVG (gold stroke #c09230); also apple-touch-icon
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

`style.css` defines `--accent` (and `--accent-hi/lo/bg/bdr/ring/rgb`) defaulting to gold (Car module). `switchModule()` adds `body.mode-cargo` which overrides every `--accent-*` variable to sky blue. All UI elements derive their color from `var(--accent)` without duplicate rules. The printed invoice inlines literal hex values since the `<iframe>` has no access to parent CSS variables.

### Lock Icon (`.lck`)

All lock icons use `<span class="lck"></span>` — never emoji. The `.lck` CSS class renders a padlock SVG via `mask: url(svg)` and inherits `currentColor`. Emoji alternatives are banned; they render inconsistently across platforms.

### HTML Escaping (XSS Guard)

User-supplied free text is escaped with `escHtml()` before being interpolated into any HTML string. Coverage: BL Number, C&F Agent Name, bill entry fields, part-billing stage dates, rotation registry rows. Any new user-facing text field must go through `escHtml()` before `innerHTML` interpolation.

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

### v3.6 — Current Release

| # | Area | Change |
|---|------|--------|
| 1 | PWA | `manifest.json` + `sw.js` service worker; app installable and fully offline-capable |
| 2 | Draft auto-save | Form state saved every 10 s; restored on reload when BL/C&F/B-E has content; cleared on Reset and Save |
| 3 | Saved bills search | Live search bar filters by bill number, CLD, delivery, C&F agent, BL number, total |
| 4 | Print from saved bills | Print button in every saved bill row; restores form then opens print dialog without staying in edit mode |
| 5 | B/E Date inline hint | Bill of Entry Date fields now show green / red / grey hints like CLD and Delivery |
| 6 | Mobile improvements | ≤480px: header/tabs tighter, rotation selects stack vertically, tables horizontal-scroll, search full-width |
| 7 | Rotation reset | Fixed "— No. —" stale placeholder — now correctly resets to "Rotation Number" |

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
