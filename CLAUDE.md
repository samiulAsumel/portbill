# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step — open directly or serve locally:

```bash
# Direct open
xdg-open index.html

# Local HTTP server (avoids font CORS edge cases)
python3 -m http.server 8080
# then visit http://localhost:8080
```

No dependencies, no package manager, no transpiler.

## Architecture

Four files total — everything is self-contained vanilla JS/CSS:

- **`index.html`** — Markup only. Two module pages (`#page-car`, `#page-cargo`) plus two `<dialog>` elements: admin login (`#overlay`) and print preview (`#ppvDialog`). Module switching is tab-driven via `switchModule()`.
- **`main.js`** — All logic (~5300 lines). Sections are marked with `// ════` banners. Key sections:
  - **State / rate persistence** (top): `RATE_DEFAULTS`, `localStorage` key `pb_admin_rates`, `loadSavedRates()` / `saveRates()` / `resetRatesToDefaults()`
  - **Admin auth** (~L460): SHA-256 hash in `AP_HASH`; `doLogin()` uses `crypto.subtle`; locked after 5 attempts (sessionStorage)
  - **Car billing engine** (~L621): `carCompute()` → `calcSlabs()` → `buildCarBillTable()` → `carCalculate()` writes to DOM. `carRefresh()` is the live-preview debounce wrapper.
  - **Cargo billing engine** (~L1035): `cargoCompute()` is the main compute function. Part billing is driven by `computePartBillingWharfrent()`. Self-drive tons use `calcCarBillingSdSlabs()` (same slab table as Car module).
  - **Invoice / print** (~L2545): `buildInvoiceHtml(opts)` builds the full print document as an HTML string; `openPrintPreview()` injects it into the `<iframe>` inside `#ppvDialog`. Pass `isCargo: true` from the Cargo module to get sky-blue accent theming; omit or pass `false` for gold (Car).
- **`style.css`** — All styles (~3465 lines). Uses CSS custom properties for the color palette, including the `--accent` system (see below). `@media print` rules at the bottom. `.ro` class makes rate inputs read-only visually (dashed border, reduced opacity).
- **`favicon.svg`** — Also used as `apple-touch-icon`.

## Key Design Patterns

**Rounding**: All monetary values use round-half-**up** to 2dp via `r2 = v => Math.floor(v * 100 + 0.5 + 1e-9) / 100` (standard accounting rounding — a value exactly on a half-cent boundary, such as a VAT of `…475`, rounds up). The `+ 1e-9` nudges exact/near halves up despite floating-point noise; using `- 1e-9` instead implements round-half-down and shaves a cent off boundary VATs — do not reintroduce it.

**VAT/Levy presentation differs by module — they are intentionally NOT the same:**

- **General Cargo** — VAT and Levy are charged **ONCE on the COMBINED inside+outside base**, shown a single time at the foot of the bill. `cargoCompute` exposes per-portion sub-totals `iBase`/`oBase` (= wharfrent + payables, the VAT base) plus the combined `gBase = r2(iBase + oBase)`, `gVat = r2(gBase × vatRate)`, `gLevy = iLevy + oLevy`, `gTotal = r2(gBase + gVat + gLevy)`. The inside/outside sections show only their `*Base` sub-total; a single "BILL SUMMARY" block (`buildCombinedSummaryTable` on screen, `buildCombinedSummaryPrintSection` in print) renders `gBase → gVat → gLevy → gTotal`. This is a display choice (VAT shown once) **and** a correctness one: per-portion VAT that is summed double-rounds and drifts a cent when both portions hit a half-cent boundary (symptom: cargo grand total `…441.94`/`.96` instead of `.95`). The cargo print/part-billing builders recompute toggle-adjusted `gBase/gVat/gLevy/gTotal` when the payable/wharfrent toggles exclude charges.

- **Car** — Inside (full rate) and Outside (½ rate) are each a **COMPLETE bill**: `iBase + iVat + iLevy = iTotal` and `oBase + oVat + oLevy = oTotal`, with VAT/Levy shown **per section**. The Car Grand Total is `iTotal + oTotal`. `carCompute` returns `iVat`/`iTotal`/`oVat`/`oTotal` (no `g*` fields). Do not apply the cargo combined-VAT model to the car module.

**Split billing** (23/07/2024 rate cut): When CLD ≤ 22/07/2024 and delivery ≥ 23/07/2024, `calcSlabs()` splits the period and applies old/new rates independently. Self-drive tons in Cargo also go through the same split logic via `calcCarBillingSdSlabs()`.

**Admin mode**: The admin button (`#adminBtn`) is hidden via `style="display:none"` by default. Two ways to reveal it: (1) **Ctrl + Shift + Click** anywhere on the page (`mousedown` handler checks modifiers), or (2) DevTools console: `document.getElementById('adminBtn').style.display = 'inline-flex'`. Credentials: `admin` / `admin`. Admin unlocks rate inputs (removes `.ro` class) and reveals `#resetRatesBtn`. Locked after 5 failed attempts (sessionStorage counter).

**Module-aware accent system**: `style.css` defines `--accent`, `--accent-hi`, `--accent-lo`, `--accent-bg`, `--accent-bdr`, `--accent-ring`, `--accent-rgb` as CSS custom properties defaulting to gold (Car module values). `switchModule()` in `main.js` calls `document.body.classList.toggle("mode-cargo", mod === "cargo")`, which triggers the `body.mode-cargo` rule in CSS that overrides every `--accent-*` variable to sky blue. All UI elements (tabs, inputs, grand total box, section rows, date displays, print button) consume `var(--accent)` — no module-specific duplicate rules needed. The printed invoice resolves accent to literal hex values at generation time since the `<iframe>` has no access to parent CSS vars.

**Lock icon (`.lck`)**: All lock icons use `<span class="lck"></span>` — never emoji. The `.lck` CSS class renders a padlock via `mask: url(svg)` and `background: currentColor`, so it inherits color from context (including accent-aware parents). Emoji alternatives are banned; they render inconsistently across platforms.

**Grand total pulse**: After each bill calculation, `carCalculate()` and `cargoCalculate()` trigger a CSS pulse on the grand total box: `el.classList.remove("just-calculated"); void el.offsetWidth; el.classList.add("just-calculated")`. The reflow (`void offsetWidth`) restarts the animation even on consecutive calculations. The `gboxPulse` keyframe is suppressed by `prefers-reduced-motion`.

**Rate table inputs vs. spans**: Each editable rate has a hidden `<input>` and a visible `<span>`. `syncSpan(inputId, spanId)` keeps them in sync. In admin mode the span is hidden and the input is shown.

**Part billing stages** (Cargo only): Stored in the DOM as dynamically rendered rows under `#c-pbStagesContainer`. Stage objects: `{ date, insideAfter, outsideAfter, sdInsideAfter, sdOutsideAfter }`. `computePartBillingWharfrent()` iterates stages, keeping slab day-count running continuously from CLD — day count never resets between stages, only weight changes. When Self Drive is active, each stage shows SD balance inputs clamped by `pbMaxSdWeight(idx, side)`. Changes to SD balance inputs are handled by `pbSdBalanceChange(idx, side, rawVal)`.

**Self Drive** (Cargo): A standalone `.sd-card` above the Payable Charges section — **independent of the Hoisting checkbox**. `wharfSdInside` / `wharfSdOutside` are computed regardless of whether hoisting is checked. SD tons are billed at Car Billing slab rates via `calcCarBillingSdSlabs()`.

**Global state flags** (Cargo): `cargoIncludeWharfrent` (bool, default `true`) and `cargoIncludePayables` (bool, default `true`) control whether those sections appear in the printed invoice. Both are toggled by checkbox controls in the cargo results header and both are reset to `true` in `cargoReset()`.

**Placeholder pattern**: All user-facing quantity inputs use `placeholder="0"` — never `value="0"`. Part billing balance inputs follow the same rule. In `pbBalanceChange()` and `pbSdBalanceChange()`, `rawVal` is passed as a string (`this.value`). Assign `inp.value = isEmpty ? '' : clamped` — empty string (field cleared) shows placeholder, explicit "0" typed by the user shows 0.

**Toggle-switch checkboxes** (`.pc-toggle`): The native `<input type="checkbox">` inside every toggle is visually hidden (`opacity:0; width:0; height:0`). Do not try to interact with it via Playwright `click()` or `check()` — it will report as not visible. Instead set state programmatically: `el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }))`. To click via CSS, click the `.pc-toggle` label element, not the input.

**Free time = 0**: Supported in both modules. When `freeDays === 0`, wharfrent starts on CLD itself: `freeDays === 0 ? addD(cld, -1) : addD(cld, freeDays - 1)`. The free-time strip shows "No free time" instead of day pills.

**Toast notifications**: `showToast(msg, type)` where `type` is `'success'|'info'|'warning'|'error'`. Creates `#pb-toast` lazily on first call.

**DOM caching**: `domCache` object holds references to frequently updated elements, populated by `initDomCache()` on DOMContentLoaded.

## Rate IDs

Car module uses plain IDs (`nr1`, `nr2`, `nr3` for new rates; `or1`, `or2`, `or3` for old rates; `rRiver`, `rLanding`, etc.). Cargo module mirrors with `c-` prefix (`c-or1`, `c-rRiver`, etc.). `RATE_DEFAULTS` is the authoritative source of factory defaults.
