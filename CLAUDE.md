# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step, no dependencies, no server required.

```bash
# Open directly in browser (any of these work)
xdg-open index.html
firefox index.html
```

For a local HTTP server (avoids any CORS edge cases with fonts):

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

There is no package.json, no npm, no bundler. Do not create one unless explicitly asked.

## Architecture

Pure vanilla HTML5/CSS3/ES2022+ — three files, no framework, no runtime dependencies.

```
index.html   — Markup only; both module pages live here as sibling <div id="page-car"> / <div id="page-cargo">
style.css    — All CSS: design tokens (--vars), component styles, print stylesheet, responsive breakpoints
main.js      — All logic: state, CalendarPicker class, billing engines, admin auth, animations, DOM init
favicon.svg  — SVG favicon
```

### main.js structure (top to bottom)

1. **State** — `isAdmin`, `currentModule`, `lastCarBill`, `lastCargoBill`, idle HTML constants, admin credential hash
2. **DOM cache** — `domCache` object populated by `initDomCache()` at startup; use it instead of repeated `getElementById` calls
3. **CalendarPicker class** — custom popup date picker; instantiated for `#cld`, `#delivery`, `#c-cld`, `#c-delivery`
4. **Shared utilities** — `pd()` (parse DD/MM/YYYY → Date), `fmt()` (Taka currency), `gn()` / `gb()` / `nn()` (DOM getters), `calcSlabs()` (shared slab engine), `CUT` / `CUT_OLD` (split-billing cut date constants)
5. **Car billing engine** — `carCompute()` → `carCalculate()` → `buildCarBillTable()` → `printBill('car')`
6. **Cargo billing engine** — `cargoCompute()` → `cargoCalculate()` → `buildCargoBillTable()` → `printBill('cargo')`
7. **Admin** — `toggleAdmin()`, `doLogin()`, `applyAdmin()`, `applyUser()`
8. **Init** — `initDomCache()`, particle animation, `IntersectionObserver` for scroll reveals, card stagger delays, today-default for date inputs

### Billing calculation flow

Both modules follow the same pattern:

```
user input → *Refresh() [debounced, 120ms] → *Compute() → live preview
                                             ↓
GENERATE BILL → *Calculate() → *Compute() → buildBillTable() → inject HTML into results div
                                                              → lastCarBill / lastCargoBill stored for print
```

`calcSlabs(totalDays, r1, r2, r3, weight, blockStart, endDate, daysOffset)` — shared slab accumulator used by both engines. For car split-billing it is called twice (once with old rates, once with new), then summed.

### Rounding rule

All monetary values are rounded to 2 decimal places using **round-half-down** (exactly 5 truncates, not rounds up):

```js
const r2 = v => Math.floor(v * 100 + 0.5 - 1e-9) / 100;
```

`1e-9` (not `Number.EPSILON`) is intentional — floating-point multiplication errors (e.g. `107785.5 × 0.15`) produce values like `16167.825000000006`, and `Number.EPSILON` (~2.22e-16) is too small to absorb that error. `1e-9` is the correct tolerance for billing-scale values.

### Admin authentication

The admin password is **SHA-256 hashed** in `main.js` (`AP_HASH`), not stored in plain text. The README states `admin/admin` as the credentials — the hash of `"admin"` is hardcoded. To change the password, compute `SHA-256(newPassword)` and replace `AP_HASH`.

Admin mode swaps `.ro` readonly inputs to editable ones, shows hidden `<input>` rate fields (replacing `<span>` displays via `syncSpan()`), and changes the header badge from `USER` to `ADMIN`. Logout reverses all of this.

### Key constants and IDs

| Constant / ID | Value / Purpose |
|---|---|
| `CUT` | `2024-07-23` — new car rate start date |
| `CUT_OLD` | `2024-07-22` — last day of old car rates |
| `#cld` / `#c-cld` | Car / Cargo CLD date inputs |
| `#delivery` / `#c-delivery` | Car / Cargo delivery date inputs |
| `#weight` / `#c-weight` | Car / Cargo total weight inputs |
| `#c-inside` / `#c-outside` | Cargo inside/outside ton split |
| `#vatRate` / `#c-vatRate` | VAT rate (default 15%, admin-only edit) |
| `lastCarBill` / `lastCargoBill` | Stored bill objects used by `printBill()` |

### CSS design tokens (style.css)

All colors are CSS custom properties on `:root`. Key ones:

- `--gold` — car module accent
- `--cargo-accent` — cargo module accent (cyan)
- `--blue` / `--purple` / `--green` / `--red` — inside/outside/payable/warning
- `--bg`, `--surface`, `--s2` — background layers (near-black theme)

Print styles are in a `@media print` block at the bottom of `style.css`.
