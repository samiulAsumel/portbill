# Port Billing System

A zero-dependency, browser-native billing calculator for **Port Authority wharfrent and payable charges** — handling vehicles and general cargo with slab-based rating, VAT computation, split-rate transitions, inside/outside port splits, and a print-ready invoice.

**Live:** [github.com/samiulAsumel/portbill](https://github.com/samiulAsumel/portbill)

---

## Modules

| Module | Scope | Weight range | Split billing |
|---|---|---|---|
| **Car Billing** | Vehicles (passenger cars, SUVs, etc.) | 1 – 3 tons | Yes — rate cut 23 Jul 2024 |
| **General Cargo Billing** | Bulk / general cargo | Unlimited | No |

---

## Car Billing

### Free Time
CLD (Common Landing Day) counts as Day 1. Four days are free by default (`CLD + 3`). Wharfrent starts the next day after free time ends.

### Wharfrent Rates

| Slab | New rates (from 23/07/2024) | Old rates (up to 22/07/2024) |
|---|---|---|
| Days 1 – 7 | 70 Tk / ton / day | 40 Tk / ton / day |
| Days 8 – 14 | 185 Tk / ton / day | 115 Tk / ton / day |
| Day 15 + | 295 Tk / ton / day | 185 Tk / ton / day |

When CLD falls on or before 22/07/2024 and delivery falls on or after 23/07/2024, the engine applies **split billing** — old rates up to 22 Jul, new rates from 23 Jul — and shows a `⚡ SPLIT BILLING` badge.

### Inside vs. Outside
Every bill produces two totals:

- **Inside port** — full wharfrent rate
- **Outside port** — ½ wharfrent rate

Both totals include payable charges, VAT, and levy.

### Payable Charges

| Charge | Default rate | VAT |
|---|---|---|
| River Dues | 33 Tk / ton | 15% |
| Landing Charge | 175 Tk / ton | 15% |
| Removal Charge | 350 Tk / ton | 15% |
| Weighment Charge | 2.5 Tk / ton | 15% |
| Levy Charge | 1.5 Tk / ton | **None** |

Each charge has a checkbox; uncheck to exclude it from the bill. All rates are locked in user mode — Admin can edit them.

---

## General Cargo Billing

### Free Time
Same rule: CLD + 3 days free, wharfrent starts on Day 5.

### Wharfrent Rates

| Slab | Rate |
|---|---|
| Days 1 – 7 | 10 Tk / ton / day |
| Days 8 – 14 | 20 Tk / ton / day |
| Day 15 + | 25 Tk / ton / day |

### Inside / Outside Weight Split
The user enters **Inside tons** (full rate) and **Outside tons** (½ rate) separately. They must equal the total cargo weight — a live `Total Check` badge turns red if they don't, blocking bill generation.

### Payable Charges

| Charge | Rate | VAT |
|---|---|---|
| River Dues | 33 Tk / ton (flat) | 15% |
| Landing Charge | **Tiered:** ≤ 3t → 90 / ≤ 20t → 180 / > 20t → 250 Tk/ton | 15% |
| Removal Charge | Removal tons × (7× landing rate if landing checked, else 8×) | 15% |
| Hoisting Charge | Hoisting tons × 1.25 × landing rate | 15% |
| Weighment Charge | 2.5 Tk / ton | 15% |
| Levy Charge | 1.5 Tk / ton | **None** |

Landing, Removal, and Hoisting rates are always formula-derived and are read-only even in Admin mode.

---

## Features

### Live Quick Preview
A `● LIVE` panel updates on every keystroke, showing running inside/outside estimates before the full bill is generated.

### Print Preview & Invoice
Clicking **Print Bill** opens a full-screen print preview dialog. From there, click **Print** to send to the browser print dialog. The invoice includes:

- Port authority letterhead with document reference and timestamp
- Itemised charge tables (wharfrent slabs, payable charges, VAT, levy, grand totals)
- Inside / Outside split summary
- Three-column authorisation signature block
- `NOT AN OFFICIAL DOCUMENT` disclaimer

### Custom Calendar Picker
Date inputs use a built-in popup calendar with smart viewport positioning (flips above when space is limited below), month navigation, and gold-highlighted selection. Manual `DD/MM/YYYY` typed input is also supported.

### Responsive Design
Single-column on mobile, two-column grid at ≥ 768 px. Tested from 360 px up to 2560 px / 4 K.

---

## Admin Mode

The admin button is hidden from end users by default. To reveal it:

```js
// Open browser DevTools → Console, then run:
document.getElementById('adminBtn').style.display = '';
```

**Credentials:** `admin` / `admin`

Admin mode unlocks all rate fields (wharfrent slabs, payable charge rates, free-time days, VAT rate) for editing. The password is SHA-256 hashed in `main.js` — never stored in plain text. Login is locked after 5 failed attempts; a page refresh resets the counter.

To set a custom password, replace `AP_HASH` in `main.js` with `SHA-256(yourNewPassword)`.

---

## Rounding

All monetary values use **round-half-down** to 2 decimal places:

```js
const r2 = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
```

The `1e-9` tolerance absorbs floating-point multiplication errors at billing scale (e.g. `107785.5 × 0.15` → `16167.825000000006`).

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

### Browser requirements
ES2022+, CSS Grid, CSS Custom Properties, native `<dialog>`, `IntersectionObserver`, `crypto.subtle` (for admin login). All modern versions of Chrome, Firefox, Safari, and Edge are supported.

---

## File Structure

```
portbill/
├── index.html    — Markup: header, tabs, admin dialog, print-preview dialog, both module pages
├── style.css     — All styles: design tokens, components, print, responsive (360 px → 4 K)
├── main.js       — All logic: CalendarPicker, billing engines, admin auth, print preview, animations
└── favicon.svg   — SVG favicon (also used as apple-touch-icon)
```

---

## Disclaimer

All generated bills carry the notice:
> *"This document is generated for informational and estimation purposes only and does not constitute an official invoice or legally binding charge statement. Final billing is subject to official verification by the Port Authority."*

---

## License

© 2026 samiulAsumel. All rights reserved.
