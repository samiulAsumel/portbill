# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step — open directly or serve locally:

```bash
# Direct open
xdg-open index.html

# Local HTTP server (required for service worker to register)
python3 -m http.server 8080
# then visit http://localhost:8080
```

No dependencies, no package manager, no transpiler.

## Architecture

Seven files total — everything is self-contained vanilla JS/CSS:

- **`index.html`** — Markup only. Three module pages (`#page-car`, `#page-cargo`, `#page-saved`) plus three `<dialog>` elements: admin login (`#overlay`), print preview (`#ppvDialog`), and reusable confirm (`#confirmDialog`). Module switching is tab-driven via `switchModule()`.
- **`main.js`** — All logic (~6150 lines). Sections are marked with `// ════` banners. Key sections:
  - **Debug logger** (top): `const DEBUG = false; const dbg = { warn, error }` — silent in production, one-flag toggle for diagnostics.
  - **State / rate persistence** (top): `RATE_DEFAULTS`, `localStorage` key `pb_admin_rates`, `loadSavedRates()` / `saveRates()` / `resetRatesToDefaults()`
  - **Admin auth** (~L470): SHA-256 hash in `AP_HASH`; `doLogin()` uses `crypto.subtle`; locked after 5 attempts (sessionStorage). On success, the entered password is stored in `_sessionWriteToken` (memory only, cleared on logout) for Worker PUT auth.
  - **confirmModal()**: Reusable in-app confirm dialog (Promise-based). Replaces all native `confirm()` / `window.confirm()` calls. Uses the `#confirmDialog` native `<dialog>` element with `showModal()` / `close()` — same pattern as `#overlay`.
  - **Worker write auth** (~L5600): `putHeaders()` returns `{ Content-Type, Authorization: Bearer <_sessionWriteToken> }`. `saveRotationsToWorker` and `saveConfigToWorker` bail immediately if `!isAdmin || !_sessionWriteToken` (rotation/config writes are admin-only). `saveBillsToWorker` has no admin gate — bill saving is open to all users; the bearer header is included when available but the Worker accepts writes with or without it.
  - **Car billing engine** (~L630): `carCompute()` → `calcSlabs()` → `buildCarBillTable()` → `carCalculate()` writes to DOM. `carRefresh()` is the live-preview debounce wrapper.
  - **Cargo billing engine** (~L2340): `cargoCompute()` is the main compute function. Part billing is driven by `computePartBillingWharfrent()`. Self-drive tons use `calcCarBillingSdSlabs()` (same slab table as Car module).
  - **Invoice / print** (~L3510): `buildInvoiceHtml(opts)` builds the full print document as an HTML string; `openPrintPreview()` injects it into the `<iframe>` inside `#ppvDialog`. Pass `isCargo: true` from the Cargo module to get sky-blue accent theming; omit or pass `false` for gold (Car).
  - **Cross-device sync** (~L5630): `loadBillsFromWorker()` is called at startup in `DOMContentLoaded`; cloud is source of truth — overwrites localStorage on success, falls back silently when offline. All four sync functions (`saveRotationsToWorker`, `saveBillsToWorker`, `saveConfigToWorker`, `loadConfigFromGitHub`) use the shared `PROXY_URL` constant — do not introduce local `WORKER` copies.
  - **Draft auto-save** (~L5766): `saveDraft(type)` / `clearDraft(type)` / `getDraft(type)` / `restoreFormDraft(type)`. Drafts stored in `localStorage` under `pb_draft_car` / `pb_draft_cargo` with a 24-hour TTL. `setInterval` every 10 000 ms saves both modules. Draft is restored on `DOMContentLoaded` (via `setTimeout(0)` to run after date defaults are set) only when `hasMeaningfulDraft()` returns true (BL number, C&F name, or B/E number is non-empty). Cleared in `carReset()`, `cargoReset()`, and `saveBill()`.
  - **Saved bills** (~L5896): `renderSavedBills()` calls `buildRows(bills, searchQ)` filtered by `matchesBillSearch()`. `editSavedBill(billNumber)` restores form state and re-runs calculation. `printSavedBill(billNumber)` calls `editSavedBill()` then `printBill(type)` after 80ms. `deleteSavedBill()` is async and awaits `confirmModal()`. Search state is held in module-level `_sbCarSearch` / `_sbCargoSearch` strings, updated by `sbSearch(type, q)`.
- **`style.css`** — All styles (~4480 lines). Uses CSS custom properties for the color palette, including the `--accent` system (see below). `@media print` rules at the bottom. `.ro` class makes rate inputs read-only visually (dashed border, reduced opacity). Full responsive polish at breakpoints from 320 px to 4K; mobile improvements at `@media (max-width: 480px)`.
- **`worker.js`** — Cloudflare Worker proxy. `GET` endpoints are open. All `PUT` endpoints require `Authorization: Bearer <token>`; the token's SHA-256 is verified against the `WRITE_TOKEN_HASH` Cloudflare secret (set via `wrangler secret put WRITE_TOKEN_HASH`). If the secret is absent, PUT returns 503.
- **`manifest.json`** — PWA web app manifest: `name`, `short_name`, `display: standalone`, `theme_color: #020202`, `icons` pointing at `favicon.svg`.
- **`favicon.svg`** — Compass-rose emblem SVG (gold stroke `#c09230`). Also used as `apple-touch-icon` and PWA icon.
- **`sw.js`** — Service worker. Cache name: `portbill-v3` (increment on each deploy). Caches `./`, `index.html`, `main.js`, `style.css`, `favicon.svg`, `manifest.json`. Strategy: cache-first with background network update (stale-while-revalidate). Only intercepts same-origin GET requests. **When deploying a new version, bump the cache name to invalidate stale caches.**

## Key Design Patterns

**Rounding**: All monetary values use round-half-**down** to 2dp via `r2 = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0` (port convention — a value exactly on the 0.5-cent boundary rounds down, e.g. 60,394.725 → 60,394.72). `Math.ceil(x - 0.5)` is the canonical "round half down" formula. The `|| 0` guard prevents `-0` from surfacing in output fields. Do not revert to `Math.floor(v*100+0.5)/100` — that formula rounds half-up and was replaced in v3.6.1 to match Port Authority convention. `r2` is defined locally inside each billing function scope (`carCompute`, `buildInvoiceHtml`, `computePartBillingWharfrent`, etc.) and named `rp2` / `_rp` in some helper contexts — all use the same formula.

**VAT/Levy presentation differs by module — they are intentionally NOT the same:**

- **General Cargo** — VAT and Levy are charged **ONCE on the COMBINED inside+outside base**, shown a single time at the foot of the bill. `cargoCompute` exposes per-portion sub-totals `iBase`/`oBase` (= wharfrent + payables, the VAT base) plus the combined `gBase = r2(iBase + oBase)`, `gVat = r2(gBase × vatRate)`, `gLevy = iLevy + oLevy`, `gTotal = r2(gBase + gVat + gLevy)`. The inside/outside sections show only their `*Base` sub-total; a single "BILL SUMMARY" block (`buildCombinedSummaryTable` on screen, `buildCombinedSummaryPrintSection` in print) renders `gBase → gVat → gLevy → gTotal`. This is a display choice (VAT shown once) **and** a correctness one: per-portion VAT that is summed double-rounds and drifts a cent when both portions hit a half-cent boundary (symptom: cargo grand total `…441.94`/`.96` instead of `.95`). The cargo print/part-billing builders recompute toggle-adjusted `gBase/gVat/gLevy/gTotal` when the payable/wharfrent toggles exclude charges.

- **Car** — Inside (full rate) and Outside (½ rate) are each a **COMPLETE bill**: `iBase + iVat + iLevy = iTotal` and `oBase + oVat + oLevy = oTotal`, with VAT/Levy shown **per section**. The Car Grand Total is `iTotal + oTotal`. `carCompute` returns `iVat`/`iTotal`/`oVat`/`oTotal` (no `g*` fields). Do not apply the cargo combined-VAT model to the car module.

**Split billing** (23/07/2024 rate cut): When CLD ≤ 22/07/2024 and delivery ≥ 23/07/2024, `calcSlabs()` splits the period and applies old/new rates independently. Self-drive tons in Cargo also go through the same split logic via `calcCarBillingSdSlabs()`.

**Admin mode**: The admin button (`#adminBtn`) is **hidden by default** (`#adminBtn { display: none }`) and only shown with `.active` class after login (`#adminBtn.active { display: inline-flex }`). Access is via **Ctrl + Shift + Click** anywhere on the page, which calls `toggleAdmin()` and opens the login modal. Default credentials: `admin` / `admin`. Admin unlocks rate inputs (removes `.ro` class) and reveals `#resetRatesBtn` (which IS hidden by default via `style="display:none"`). Locked after 5 failed attempts (sessionStorage counter). On successful login `doLogin()` stores the entered password in `_sessionWriteToken` (module-scoped, memory only — never localStorage); `toggleAdmin()` clears it on logout. This token is sent as a `Bearer` header on all Cloudflare Worker PUT requests via `putHeaders()`.

**Confirm dialog**: `confirmModal(message)` is a Promise-returning helper that shows `#confirmDialog` (a native `<dialog>` using the same `showModal()` / `close()` pattern as `#overlay`). It resolves `true` on OK and `false` on Cancel. All destructive actions that previously used `window.confirm()` or `confirm()` must use `confirmModal()`. Both `resetRatesToDefaults()` and `deleteSavedBill()` are `async` functions that `await confirmModal(...)`.

**Module-aware accent system**: `style.css` defines `--accent`, `--accent-hi`, `--accent-lo`, `--accent-bg`, `--accent-bdr`, `--accent-ring`, `--accent-rgb` as CSS custom properties defaulting to gold (Car module values). `switchModule()` in `main.js` calls `document.body.classList.toggle("mode-cargo", mod === "cargo")`, which triggers the `body.mode-cargo` rule in CSS that overrides every `--accent-*` variable to sky blue. All UI elements (tabs, inputs, grand total box, section rows, date displays, print button, search bar) consume `var(--accent)` — no module-specific duplicate rules needed. The printed invoice resolves accent to literal hex values at generation time since the `<iframe>` has no access to parent CSS vars.

**Lock icon (`.lck`)**: All lock icons use `<span class="lck"></span>` — never emoji. The `.lck` CSS class renders a padlock via `mask: url(svg)` and `background: currentColor`, so it inherits color from context (including accent-aware parents). Emoji alternatives are banned; they render inconsistently across platforms.

**Date field wrapper (`.date-field-wrap` / `.cal`)**: All date inputs are wrapped in `<div class="date-field-wrap">` with a sibling `<span class="cal"></span>`. The `.cal` class renders a calendar SVG icon via `mask: url(svg)` and `background: var(--accent)`, positioned absolutely inside the wrapper (`right: 10px`, `pointer-events: none`). Date entry is always manual `DD/MM/YYYY` — the icon is decorative only. There is no JS calendar picker.

**Date field hint**: Every date field has a `<div class="field-hint hint-muted" id="{fieldId}-hint">DD/MM/YYYY</div>` sibling after the `.date-field-wrap`. `validateDateField(inputId, hintId, label)` calls `setFieldState()` to switch the hint between `hint-muted` (empty), `hint-error` (invalid), and `hint-ok` (valid). Called from `carRefreshNow()` and `cargoRefreshNow()`. Applies to: `cld`, `delivery`, `car-billEntryDate` (Car module) and `c-cld`, `c-delivery`, `c-billEntryDate` (Cargo module). B/E Date is optional — empty is valid (shows muted placeholder), but if non-empty it must be a valid DD/MM/YYYY date.

**Grand total pulse**: After each bill calculation, `carCalculate()` and `cargoCalculate()` trigger a CSS pulse on the grand total box: `el.classList.remove("just-calculated"); void el.offsetWidth; el.classList.add("just-calculated")`. The reflow (`void offsetWidth`) restarts the animation even on consecutive calculations. The `gboxPulse` keyframe is suppressed by `prefers-reduced-motion`.

**Rate table inputs vs. spans**: Each editable rate has a hidden `<input>` and a visible `<span>`. `syncSpan(inputId, spanId)` keeps them in sync. In admin mode the span is hidden and the input is shown.

**Part billing stages** (Cargo only): Stored in the DOM as dynamically rendered rows under `#c-pbStagesContainer`. Stage objects: `{ date, insideAfter, outsideAfter, sdInsideAfter, sdOutsideAfter }`. `computePartBillingWharfrent()` iterates stages, keeping slab day-count running continuously from CLD — day count never resets between stages, only weight changes. When Self Drive is active, each stage shows SD balance inputs clamped by `pbMaxSdWeight(idx, side)`. Changes to SD balance inputs are handled by `pbSdBalanceChange(idx, side, rawVal)`. Stages whose delivery falls **within free time** get `freeTimeDelivery: true` on the period object — they appear in bill tables and stage counts with a "Delivery within free time — no wharfrent charge" label rather than being silently skipped.

**Self Drive** (Cargo): A standalone `.sd-card` above the Payable Charges section — **independent of the Hoisting checkbox**. `wharfSdInside` / `wharfSdOutside` are computed regardless of whether hoisting is checked. SD tons are billed at Car Billing slab rates via `calcCarBillingSdSlabs()`.

**Global state flags** (Cargo): `cargoIncludeWharfrent` (bool, default `true`) and `cargoIncludePayables` (bool, default `true`) control whether those sections appear in the printed invoice. Both are toggled by checkbox controls in the cargo results header and both are reset to `true` in `cargoReset()`.

**Placeholder pattern**: All user-facing quantity inputs use `placeholder="0"` — never `value="0"`. Part billing balance inputs follow the same rule. In `pbBalanceChange()` and `pbSdBalanceChange()`, `rawVal` is passed as a string (`this.value`). Assign `inp.value = isEmpty ? '' : clamped` — empty string (field cleared) shows placeholder, explicit "0" typed by the user shows 0.

**Toggle-switch checkboxes** (`.pc-toggle`): The native `<input type="checkbox">` inside every toggle is visually hidden (`opacity:0; width:0; height:0`). Do not try to interact with it via Playwright `click()` or `check()` — it will report as not visible. Instead set state programmatically: `el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }))`. To click via CSS, click the `.pc-toggle` label element, not the input.

**Free time = 0**: Supported in both modules. When `freeDays === 0`, wharfrent starts on CLD itself: `freeDays === 0 ? addD(cld, -1) : addD(cld, freeDays - 1)`. The free-time strip shows "No free time" instead of day pills.

**Date validation (`isValidDateStr`)**: After constructing `new Date(y, m-1, d)`, the validator re-checks `getFullYear/getMonth/getDate` against the parsed parts. This **calendar rollover guard** means `31/02/2024` fails (JavaScript would silently roll it to March 2) rather than producing wrong billing periods. Do not remove or weaken these post-construction checks.

**Pre-calculate input validation**: `collectCarErrors()` / `collectCargoErrors()` return an array of `{ id, msg }` for every failing input; `reportInputErrors()` surfaces them in one toast (`white-space: pre-line`, so `\n`-joined messages line-break) and focuses the first offending field. `carCalculate()`, `cargoCalculate()`, and `printBill()` all gate on these — they abort before any compute/render when errors exist. Guards are validation-only and never alter a calculation. Current guards: CLD + delivery date format (including rollover), delivery-not-before-CLD, optional B/E Date format when non-empty, **vehicle weight > 0** (Car), **total weight > 0** (Cargo, blocks the all-zero bill that `0 inside + 0 outside == 0 total` would otherwise pass), inside+outside == total, and removal/weighment/self-drive tonnage bounds. The `carCompute()`/`cargoCompute()` `Number.parseFloat(...) || default` fallbacks are deliberately permissive for the live preview path (`carRefreshNow`/`cargoRefreshNow`, wrapped in try/catch) — the error gate is what protects the actual bill.

**Toast notifications**: `showToast(msg, type)` where `type` is `'success'|'info'|'warning'|'error'`. Creates `#pb-toast` lazily on first call.

**XSS guard**: `escHtml()` must be used for all user-supplied or remotely-loaded text injected into `innerHTML`. Current coverage: BL Number, C&F Agent Name, bill entry number, bill entry date, part-billing stage dates, rotation registry rows (`r.num`, `r.cld` in `renderRotationTable`). `r.id` is `Date.now().toString()` (numeric string, safe in onclick). `r.year` is the result of `parseInt` (number, safe). Any new field sourced from user input or GitHub storage must go through `escHtml()` before innerHTML interpolation.

**DOM caching**: `domCache` object holds references to frequently updated elements, populated by `initDomCache()` on DOMContentLoaded.

**Saved bills search**: `_sbCarSearch` / `_sbCargoSearch` (module-level strings) hold the current search query for each panel. `sbSearch(type, q)` updates the relevant variable and calls `renderSavedBills()`. `matchesBillSearch(b, q)` checks bill number, CLD, delivery, C&F name, BL number, and total formatted amount. `buildRows(bills, searchQ)` filters internally — the full `bills` array is passed (for the "no saved bills" empty state) and filtered to `visible` for the "no match" state. Column count is 8; the empty-state `colspan` must stay at `8`.

**Print from saved bills**: `printSavedBill(billNumber)` calls `editSavedBill(billNumber)` (which restores the form and switches module) then `setTimeout(() => printBill(type), 80)`. The 80 ms delay allows the module switch and DOM update to settle before `printBill` reads the rendered result. Do not collapse this to synchronous — `printBill` reads the live DOM.

**Draft auto-save**: `DRAFT_KEYS = { car: 'pb_draft_car', cargo: 'pb_draft_cargo' }`, TTL 24 hours. `saveDraft(type)` snapshots via `billInputSnapshot(type)` and stores `{ ts, inputs }`. `restoreFormDraft(type)` only restores when `hasMeaningfulDraft(inputs, type)` is true — checks for non-empty `blNumber`, `cnfName`, or non-default `billEntry` (`!== 'C-'`). Restore runs inside `setTimeout(0)` in `DOMContentLoaded` so it fires after the date-defaults initialisation. `clearDraft(type)` is called from `carReset()`, `cargoReset()` (the originals), and `saveBill()`. The `carReset` patch (bottom of file) also calls `clearDraft('car')`.

**Service worker versioning**: The cache name is `portbill-v3` in `sw.js`. Every production deploy that changes any cached asset must increment this string (e.g. `portbill-v4`). The `activate` handler deletes all caches whose names don't match the current version.

## Rate IDs

Car module uses plain IDs (`nr1`, `nr2`, `nr3` for new rates; `or1`, `or2`, `or3` for old rates; `rRiver`, `rLanding`, etc.). Cargo module mirrors with `c-` prefix (`c-or1`, `c-rRiver`, etc.). `RATE_DEFAULTS` is the authoritative source of factory defaults.
