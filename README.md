# Port Billing System

A dual-module, zero-dependency web application for calculating Port Authority **wharfrent** and **payable charges** for both vehicles and general cargo. The system handles slab-based billing, VAT computation, split-rate transitions, inside/outside port splits, and generates a print-ready invoice — all in a single static deployment.

---

## Modules

The application ships two completely independent billing engines, accessible via sticky tab navigation at the top of the page:

| Module | Scope | Weight limit | Split billing | Cargo-specific charges |
|---|---|---|---|---|
| **Car Billing** | Vehicles | Max 3 tons | Yes (rate cut 23/07/2024) | No |
| **General Cargo Billing** | Bulk / general cargo | Unlimited | No | Hoisting, tiered landing/removal |

---

## Car Billing Module

### Free Time & Storage Start

- **Free time**: CLD (Common Landing Day) + 3 days = **4 days total** (CLD itself counts as day 1).
- **Wharfrent start**: The day immediately after free time ends.
- Free time end date and wharfrent start date are computed automatically and displayed as read-only fields.

### Wharfrent Rate Structure

Slab-based: **Tk × tons × days** per slab.

| Slab | New rates (from 23/07/2024) | Old rates (up to 22/07/2024) |
|---|---|---|
| 1st 7 days | 70 Tk/ton/day | 40 Tk/ton/day |
| 8th–14th day | 185 Tk/ton/day | 115 Tk/ton/day |
| 15th day + | 295 Tk/ton/day | 185 Tk/ton/day |

### Split Billing

When **CLD ≤ 22/07/2024** and the delivery date falls after 23/07/2024, the engine automatically splits the storage period: old rates apply up to 22/07/2024 and new rates apply from 23/07/2024 onward. A prominent `⚡ SPLIT BILLING` badge is shown in the results.

### Inside vs. Outside Charges

The same input produces two separate totals:

- **Inside port**: full wharfrent + all payable charges + VAT + levy
- **Outside port**: ½ wharfrent + all payable charges + VAT + levy

### Payable Charges (Car)

| Charge | Default rate | VAT |
|---|---|---|
| River Dues | 33 Tk/ton | Yes (15%) |
| Landing Charge | 175 Tk/ton | Yes (15%) |
| Removal Charge | 350 Tk/ton | Yes (15%) |
| Weighment Charge | 2.5 Tk/ton | Yes (15%) |
| Levy Charge | 1.5 Tk/ton | **No VAT** |

Each payable charge has a checkbox — uncheck to exclude it from the bill. All rates and the VAT percentage are locked in user mode; admin can edit them.

### Constraints

- Weight range: 1–3 tons. A warning is shown for values outside this range; 4+ tons are not supported by this module.

---

## General Cargo Billing Module

### Free Time & Storage Start

Identical rule to car billing: CLD + 3 days = 4 days free, wharfrent starts the next day.

### Inside / Outside Weight Split

Cargo is split into two portions entered by the user:

- **Inside tons**: billed at the full wharfrent rate.
- **Outside tons**: billed at **½ the inside rate**.
- Inside + Outside **must equal** the total cargo weight. A live `Total Check` badge turns red if the portions don't match, blocking calculation.

### Wharfrent Rate Structure (Cargo)

A single rate schedule applies — there is no old/new split for general cargo:

| Slab | Rate |
|---|---|
| 1st 7 days | 10 Tk/ton/day |
| 8th–14th day | 20 Tk/ton/day |
| 15th day + | 25 Tk/ton/day |

### Payable Charges (Cargo)

| Charge | Rate logic | VAT |
|---|---|---|
| River Dues | 33 Tk/ton (flat) | Yes (15%) |
| Landing Charge | **Tiered**: ≤3t → 90 / >3t–≤20t → 180 / >20t → 250 Tk/ton | Yes (15%) |
| Removal Charge | **7× landing slab** (if landing checked) or **8× landing slab** (if not) | Yes (15%) |
| Weighment Charge | 2.5 Tk/ton | Yes (15%) |
| Hoisting Charge | **125% of landing slab rate** (auto-computed) | Yes (15%) |
| Levy Charge | 1.5 Tk/ton | **No VAT** |

- **Landing** is tier-based and auto-selected from total cargo weight on every refresh.
- **Removal** quantity is entered separately via a dedicated `Removal Cargo (ton)` field.
- **Hoisting** rate is always derived from the active landing slab — the input field reflects the formula value.
- Landing/Removal/Hoisting inputs are always read-only (formula-derived); admin cannot override them.
- A `Landing Tier` info strip updates live showing which tier is active.

### Payable Charge Basis

- **During free time** (days 1–4): payable charges use **total cargo weight**.
- **During wharfrent period**: payable charges use **inside and outside portions** separately.

---

## Shared Features

### Live Quick Preview

Both modules have a `● LIVE` preview panel on the right that updates on every keystroke. It shows running estimates for inside and outside totals before the full bill is generated.

### Custom Calendar Picker

Date inputs (`CLD`, `Delivery Date`) feature a built-in `📅` popup calendar:
- Smart viewport positioning: the popup flips above the input if there is not enough space below.
- Navigation with `‹ ›` month buttons.
- Selected date highlighted in gold.
- Dates default to today on load.
- Manual typed input is also supported (auto-formatted as `DD/MM/YYYY`).

### Rate Badges

A dynamic badge appears below the date inputs once CLD is entered:
- `● NEW RATES` — delivery is fully in the new-rate period.
- `● OLD RATES` — delivery is fully in the old-rate period.
- `⚡ SPLIT BILLING` — rate change boundary is crossed (car module only).
- `● CARGO RATES — Landing Tier: …` — shows the active landing tier (cargo module).

### Generate Bill / Reset

- **GENERATE BILL**: runs full validation, computes all values, and renders a detailed bill statement below the input section.
- **Reset**: clears all inputs, collapses the results section, and resets the preview to idle state.

### Print / Invoice

Each module has a **Print Bill** button that opens a browser print dialog with a fully formatted invoice:
- Port authority letterhead with date and document number.
- Itemized table for inside charges, outside charges, payable charges, VAT, and grand totals.
- A `NOT AN OFFICIAL DOCUMENT` watermark / disclaimer badge.
- Split billing warning banner (car module, when applicable).
- Print-specific CSS: black-on-white, table borders, hidden UI chrome.

---

## Admin Mode

### Access

The admin button is **hidden by default** in the UI (invisible to end users). To reveal it, open the browser developer console and run:

```js
document.getElementById('adminBtn').style.display = '';
```

Then click the **🔒 Admin** button in the header to open the login modal.

### Credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin` |

### What Admin Unlocks

In **user mode**, the following fields are read-only (🔒):
- Free time (days)
- All payable charge rates (River, Landing, Removal, Weighment, Levy)
- VAT rate
- Car wharfrent slab rates (both new and old)
- General cargo wharfrent slab rates

In **admin mode**:
- All locked fields become editable input boxes.
- Wharfrent slab spans are replaced by number inputs (`<input>` replaces the display `<span>`).
- The header badge changes from `USER` to `ADMIN`.
- The admin button turns gold.
- Clicking **Logout** returns all fields to read-only user mode.

> **Note**: Landing/Removal/Hoisting in the cargo module are always locked regardless of admin mode because they are formula-derived values.

---

## UI & Design

### Visual Theme

- **Background**: near-black `#020202`
- **Car module accent**: Gold (`var(--gold)`) — buttons, highlights, wharfrent values
- **Cargo module accent**: Cyan/teal (`var(--cargo-accent)`) — titles, badges, glows
- **Inside charges**: Blue (`var(--blue)`)
- **Outside charges**: Purple (`var(--purple)`)
- **Payable charges**: Green (`var(--green)`)
- **Old rates / warnings**: Red (`var(--red)`)

### Typography

| Role | Font |
|---|---|
| Page/section headers | Bebas Neue (Google Fonts) |
| Numeric data, rates, codes | DM Mono |
| Body text, labels | DM Sans |

### Layout

- **Two-column grid**: input forms on the left, live preview + billing rules on the right.
- Columns collapse to single-column on mobile.
- Results section appears below the input grid after bill generation.

### Animations & Motion

- **Card stagger**: each `.card` element gets a progressively increasing `animation-delay` on load (0.7s + i × 0.1s).
- **Scroll reveal**: `IntersectionObserver` adds `.revealed` class to `[data-reveal]` elements when they enter the viewport (threshold 0.12).
- **Floating particles**: 12 randomly-sized and randomly-timed background particles rise continuously.
- **Admin button hover**: 2px upward translate + cyan glow box-shadow.

### Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| < 360px | Compact single-column, reduced padding |
| 360px–767px | Single-column, adjusted spacing |
| 768px–1023px | Two-column grid activated |
| 1024px–1199px | Enhanced spacing |
| ≥ 1200px | Full layout, max-width container |

### Accessibility

- Module tabs use full ARIA tab pattern: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`.
- Arrow keys (`←`/`→`) navigate between tabs; `Enter`/`Space` activates the focused tab.
- Admin modal uses native `<dialog>` element with `showModal()` / `close()` — no custom focus trap needed.
- Clicking the modal backdrop closes it.
- Charge checkboxes in the cargo table have `.sr-only` `<label>` elements for screen readers.
- `<header>`, `<main>`, `<footer>` landmarks present on every page.

---

## Technical Architecture

### Stack

- **Pure vanilla HTML5 / CSS3 / JavaScript (ES2022+)** — zero runtime dependencies, no build step.
- Runs as a static file directly in the browser — no server, no bundler, no npm.

### File Structure

```text
portbill/
├── index.html      # Markup: header, module tabs, admin dialog, both module pages, footer
├── style.css       # All styles: design tokens (--vars), components, print, responsive
├── main.js         # All logic: CalendarPicker, billing engines, admin, animations, init
└── favicon.svg     # SVG favicon (works as apple-touch-icon too)
```

### Key Components in `main.js`

| Component / function | Purpose |
|---|---|
| `CalendarPicker` (class) | Custom popup date picker for all date inputs |
| `initDomCache()` | Caches frequently-accessed DOM nodes at startup for performance |
| `switchModule(mod)` | Swaps visible module page and updates ARIA tab state |
| `calcSlabs(…)` | Shared slab-based wharfrent calculator used by both modules |
| `carCompute()` | Full car billing computation: free time, split billing, inside/outside |
| `carRefresh()` / `carRefreshNow()` | Debounced live preview updater for car module |
| `carCalculate()` | Validates inputs, runs `carCompute()`, renders bill statement |
| `cargoCompute()` | Full cargo billing computation: tier logic, portion split, hoisting |
| `cargoRefresh()` / `cargoRefreshNow()` | Debounced live preview updater for cargo module |
| `cargoCalculate()` | Validates inputs, runs `cargoCompute()`, renders bill statement |
| `getCargoLandingTierRate(w)` | Returns landing Tk/ton based on total weight tier |
| `cargoValidateSplit()` / `cargoValidatePortion()` | Validates inside+outside = total |
| `buildCarBillTable(b, side)` | Renders the itemized HTML table for a car bill section |
| `buildCargoBillTable(b, side)` | Renders the itemized HTML table for a cargo bill section |
| `buildInvoiceHtml(opts)` | Generates complete print-ready invoice HTML (both modules) |
| `printBill(type)` | Opens a print window with the invoice HTML |
| `toggleAdmin()` / `doLogin()` / `applyAdmin()` | Admin auth flow and field lock/unlock |

### Calculation Engine Details

**Free time**: `CLD + (freeDays - 1)` → end of free period. Wharfrent starts `freeEnd + 1`.

**Slab accumulation** (`calcSlabs`):
1. Days in slab 1 (days 1–7): `min(billDays, 7)`
2. Days in slab 2 (days 8–14): `max(0, min(billDays - 7, 7))`
3. Days in slab 3 (days 15+): `max(0, billDays - 14)`
4. Each slab: `days × rate × tons`

**Split billing** (car): the cut date is `2024-07-22` (old) / `2024-07-23` (new). If both periods have billable days, the engine runs `calcSlabs` twice — once with old rates, once with new rates — then sums them.

**Outside wharfrent**: always `½ × inside wharfrent` (both modules).

**Cargo tiered landing**: `getCargoLandingTierRate(totalWeight)` returns 90 / 180 / 250 based on ≤3 / ≤20 / >20 ton thresholds.

**Cargo removal**: `removalTons × (landingChecked ? 7 : 8) × landingSlabRate`.

**Cargo hoisting**: `hoistingTons × 1.25 × landingSlabRate`.

**VAT**: applied to all payable charges except Levy. `subtotal × (vatRate / 100)`.

---

## Usage

### Basic Workflow (Both Modules)

1. Select the module tab: **Car Billing** or **General Cargo Billing**.
2. Enter the **CLD** (Common Landing Day) — defaults to today.
3. Enter the **Delivery Date**.
4. Enter the **weight** (tons). For cargo, also fill in **Inside** and **Outside** portions.
5. Toggle payable charges on/off as needed.
6. Watch the **Quick Preview** update live.
7. Click **GENERATE BILL** for the full itemized statement.
8. Click **Print Bill** to open the print dialog.

### Admin Workflow

1. Reveal the admin button via dev console: `document.getElementById('adminBtn').style.display = ''`
2. Click **🔒 Admin** → enter `admin` / `admin` → press Enter or click **LOGIN**.
3. Edit any unlocked rate fields.
4. Click **Logout** to return to user mode.

---

## Deployment

No server, build tool, or dependency install required.

1. Download all four files (`index.html`, `style.css`, `main.js`, `favicon.svg`) into the same directory.
2. Open `index.html` in any modern browser.

**Browser requirements**: ES2022+ (`?.`, `??`, `structuredClone`, `replaceAll`), CSS Grid, CSS Custom Properties, `<dialog>`, `IntersectionObserver`. All modern versions of Chrome, Firefox, Safari, and Edge are supported.

---

## Limitations & Disclaimers

- **Car module weight cap**: vehicles ≥ 4 tons are not supported — use General Cargo Billing instead.
- **Currency**: Bangladeshi Taka (Tk) only.
- **Not official**: all bills carry the disclaimer "This bill cannot be used as an official reference." Final billing authority rests with the Port Authority.
- **Client-side only**: no data persistence, no server validation, no audit log.
- **Admin security**: the admin credentials are stored in plain text in `main.js` (`AU = 'admin'`, `AP = 'admin'`). This is a prototype-grade access control; do not treat it as production authentication.

---

## Project Status

| Field | Value |
|---|---|
| Repository | [https://github.com/samiulAsumel/portbill](https://github.com/samiulAsumel/portbill) |
| Version | 2.0.0 |
| Last updated | April 2026 |
| Author | samiulAsumel |
| License | All Rights Reserved |
| Status | Production Ready |

---

*This bill cannot be used as an official reference — informational purposes only.*
