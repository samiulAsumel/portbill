// platform.js — Cross-cutting platform services: invoice/print,
// cloud sync (Cloudflare Worker), usage analytics, draft auto-save,
// saved-bills manager, and app bootstrap (INIT — runs last).
// Depends on core.js + admin.js + car.js + cargo.js + reexport.js
// (all already loaded by the time this file's top-level INIT code runs).



function buildInvoiceHtml(opts) {
  const {
    title,
    subtitle,
    billRef,
    today,
    infoHtml,
    sectionsHtml,
    grandTotal,
    grandLabel,
    vatRate,
    isSplit,
    isCargo,
  } = opts;

  // accent: "car" | "cargo" | "reexport" — defaults from the legacy isCargo
  // boolean so existing Car/Cargo callers render byte-identical output.
  const accent = opts.accent || (isCargo ? "cargo" : "car");
  const ACCENT_PALETTES = {
    car:      { color: "#c09230", hi: "#d4a840", lo: "#9a7020", bg: "#fdf8ee", bdr: "#e8d080" },
    cargo:    { color: "#0ea5e9", hi: "#22c1e0", lo: "#0a7f9a", bg: "#edfafd", bdr: "#82d4e4" },
    reexport: { color: "#10b981", hi: "#34d399", lo: "#059669", bg: "#ecfdf5", bdr: "#7fd9b9" },
  };
  const palette = ACCENT_PALETTES[accent] || ACCENT_PALETTES.car;
  const accentColor  = palette.color;
  const accentHi     = palette.hi;
  const accentLo     = palette.lo;
  const accentBg     = palette.bg;
  const accentBdr    = palette.bdr;

  const hasLevy = (opts.totalLevy || 0) > 0;
  const grandSubNote = hasLevy ? "Incl. VAT &amp; Levy" : "Incl. VAT";

  const splitSummaryHtml = opts.showSplit
    ? `<div class="io-summary no-break">
        <div class="io-cell io-inside">
          <div class="io-tag">Inside &mdash; Full Rate</div>
          <div class="io-label">${opts.insideLabel}</div>
          <div class="io-amount">${fmt(opts.iSub)}</div>
          <div class="io-note">${opts.ioNote}</div>
        </div>
        <div class="io-divider"></div>
        <div class="io-cell io-outside">
          <div class="io-tag">Outside &mdash; Half Rate</div>
          <div class="io-label">${opts.outsideLabel}</div>
          <div class="io-amount">${fmt(opts.oSub)}</div>
          <div class="io-note">${opts.ioNote}</div>
        </div>
      </div>`
    : "";

  const splitWarnHtml = isSplit
    ? `<div class="split-warn"><span class="sw-icon">&#9889;</span><strong>SPLIT BILLING APPLIED</strong> &mdash; Old rates applied up to 22/07/2024 &bull; New rates applied from 23/07/2024 onwards</div>`
    : "";

  const issueTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const emblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="${accentColor}" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="29.5" stroke-width="2.5"/><circle cx="32" cy="12" r="3.8" stroke-width="2.2"/><line x1="32" y1="15.8" x2="32" y2="50.5" stroke-width="2.8"/><line x1="20" y1="21.5" x2="44" y2="21.5" stroke-width="2.8"/><circle cx="20" cy="21.5" r="2.5" fill="${accentColor}" stroke="none"/><circle cx="44" cy="21.5" r="2.5" fill="${accentColor}" stroke="none"/><path d="M32,50.5 Q22,49 17,41" stroke-width="2.6"/><polygon points="13.5,38 17.5,45 24,42" fill="${accentColor}" stroke="none"/><path d="M32,50.5 Q42,49 47,41" stroke-width="2.6"/><polygon points="50.5,38 46.5,45 40,42" fill="${accentColor}" stroke="none"/><path d="M22,56 Q27,53 32,56 Q37,59 42,56" stroke-width="2"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${billRef}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,900;1,9..40,400&display=swap" rel="stylesheet">
<style>
/* ══ DESIGN TOKENS ══ */
:root{
  --navy:       #0b1d3c;
  --navy-2:     #16305c;
  --navy-3:     #1e4282;
  --accent:     ${accentColor};
  --accent-hi:  ${accentHi};
  --accent-lo:  ${accentLo};
  --accent-bg:  ${accentBg};
  --accent-bdr: ${accentBdr};
  --blue:       #1050a8;
  --blue-bg:    #eaf2ff;
  --blue-bdr:   #96bae8;
  --indigo:     #5020b0;
  --indigo-bg:  #f0eaff;
  --indigo-bdr: #b8a0e8;
  --green:      #0a5c3c;
  --green-bg:   #eaf8f0;
  --green-bdr:  #7ccaa4;
  --border:     #ccd3e2;
  --border-lo:  #e2e6f2;
  --bg:         #f2f4fb;
  --bg-cell:    #f8f9fd;
  --text:       #0e1c34;
  --text-mid:   #384f6c;
  --text-muted: #6a7e98;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:10pt;}
body{
  font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;
  color:var(--text);background:#fff;
  line-height:1.55;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
body *{font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}

/* ══ DOCUMENT SHELL ══ */
.invoice{max-width:900px;margin:0 auto;background:#fff;overflow:hidden;}
@media screen{
  .invoice{
    margin:28px auto 64px;border-radius:6px;
    box-shadow:
      0 1px 4px rgba(8,16,40,0.08),
      0 8px 28px rgba(8,16,40,0.12),
      0 32px 80px rgba(8,16,40,0.16);
  }
}

/* ══ ACCENT BAND ══ */
.inv-band{
  height:0;
  border-top:5px solid var(--accent);
}

/* ══ CLASSIFICATION STRIP ══ */
.cls-strip{
  display:flex;justify-content:space-between;align-items:center;
  background:#fff;
  border-bottom:1px solid var(--border);
  padding:5px 30px;
}
.cls-strip .cls-l{
  font-family:'DM Mono',monospace;font-size:6.8pt;
  letter-spacing:2px;text-transform:uppercase;
  color:var(--text-mid);
}
.cls-strip .cls-r{
  font-family:'DM Mono',monospace;font-size:6.2pt;
  letter-spacing:1.5px;text-transform:uppercase;
  color:var(--text-muted);
}

/* ══ LETTERHEAD ══ */
.lh{
  display:flex;justify-content:space-between;align-items:flex-start;
  padding:22px 30px 20px;
  background:#fff;
  border-bottom:3px solid var(--accent);
}
.lh-left{display:flex;align-items:flex-start;gap:16px;}
.lh-emblem{flex-shrink:0;margin-top:2px;}
.lh-logo{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:19pt;letter-spacing:5px;
  color:var(--navy);text-transform:uppercase;line-height:1;
}
.lh-rule{
  width:44px;height:3px;margin:7px 0 8px;
  background:var(--accent);
}
.lh-sub{
  font-family:'DM Mono',monospace;font-size:7.5pt;
  letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);
}
.lh-right{text-align:right;}
.lh-doc-label{
  display:inline-block;margin-bottom:8px;
  padding:3px 12px;
  background:#fff;color:var(--accent);
  border:1px solid var(--accent);
  font-family:'DM Mono',monospace;font-size:6.8pt;
  letter-spacing:2.5px;text-transform:uppercase;border-radius:2px;
}
.lh-bill-name{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:13pt;color:var(--navy);
  letter-spacing:1.5px;text-transform:uppercase;
  line-height:1.15;margin-bottom:11px;
}
.lh-meta{border-collapse:collapse;margin-left:auto;}
.lh-meta-lbl{
  font-family:'DM Mono',monospace;font-size:7pt;color:var(--text-muted);
  text-transform:uppercase;letter-spacing:0.5px;
  padding:2.5px 14px 2.5px 0;text-align:left;white-space:nowrap;
}
.lh-meta-val{
  font-family:'DM Mono',monospace;font-size:8.5pt;
  color:var(--text);font-weight:700;
  text-align:right;padding:2.5px 0;white-space:nowrap;
}
.lh-badge{
  display:inline-block;margin-top:9px;
  padding:3px 10px;
  border:1px solid var(--border);
  background:#fff;color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:6.5pt;
  letter-spacing:1px;text-transform:uppercase;border-radius:2px;
}

/* ══ TITLE BAND ══ */
.title-band{
  display:flex;justify-content:space-between;align-items:center;
  padding:12px 30px;
  border-left:5px solid var(--accent);
  border-top:1px solid var(--border-lo);
  border-bottom:1px solid var(--border-lo);
  background:#fff;margin-top:1px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.title-band h1{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:11pt;color:var(--navy);
  letter-spacing:2.5px;text-transform:uppercase;
}
.title-band p{font-size:8.5pt;color:var(--text-mid);letter-spacing:0.3px;margin-top:3px;}

/* ══ SPLIT WARNING ══ */
.split-warn{
  display:flex;align-items:center;gap:10px;
  background:#fff;
  border-top:3px solid var(--accent);border-bottom:1px solid var(--border);
  padding:10px 30px;font-size:8.8pt;color:var(--text-mid);letter-spacing:0.2px;
}
.sw-icon{font-size:12pt;flex-shrink:0;}

/* ══ CONSIGNMENT LABEL ══ */
.info-section-label{
  font-family:'DM Mono',monospace;font-size:7pt;
  color:var(--text-muted);text-transform:uppercase;
  letter-spacing:2.5px;padding:16px 30px 6px;
}

/* ══ INFO GRID ══ */
.info-grid{
  display:grid;grid-template-columns:repeat(4,1fr);
  margin:0 30px 6px;
  border:1px solid var(--border);
  border-radius:3px;overflow:hidden;
}
.info-cell{
  padding:11px 14px;
  border-right:1px solid var(--border);
  border-bottom:1px solid var(--border);
  background:#fff;
  border-left:3px solid transparent;
}
.info-cell:nth-child(4n+1){border-left-color:var(--accent);}
.info-label{
  font-family:'DM Mono',monospace;
  font-size:6.8pt;color:var(--text-muted);
  text-transform:uppercase;letter-spacing:0.7px;margin-bottom:4px;
}
.info-value{
  font-family:'DM Mono',monospace;
  font-size:9pt;color:var(--text);font-weight:600;
}

/* ══ SECTION HEADERS ══ */
.section-head{
  display:flex;justify-content:space-between;align-items:center;
  padding:9px 30px 8px;margin-top:22px;
  border-left:5px solid var(--accent);
  border-bottom:2px solid var(--navy);
  background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.section-head>span:first-child{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;color:var(--navy);
}
.sh-accent{
  font-family:'DM Mono',monospace;font-size:7.8pt;font-weight:500;
  letter-spacing:0.5px;white-space:nowrap;
  color:var(--text-mid);border:1px solid var(--border);
  padding:2px 9px;border-radius:2px;background:#fff;
}
.section-head.inside-head{
  border-left-color:var(--blue);border-bottom-color:var(--blue);
}
.section-head.inside-head>span:first-child{color:var(--blue);}
.section-head.inside-head .sh-accent{border-color:var(--blue-bdr);color:var(--blue);}
.inside-head+.section-sub{border-left-color:var(--blue);}

.section-head.outside-head{
  border-left-color:var(--indigo);border-bottom-color:var(--indigo);
}
.section-head.outside-head>span:first-child{color:var(--indigo);}
.section-head.outside-head .sh-accent{border-color:var(--indigo-bdr);color:var(--indigo);}
.outside-head+.section-sub{border-left-color:var(--indigo);}

.section-head.payable-head{
  border-left-color:var(--green);border-bottom-color:var(--green);
}
.section-head.payable-head>span:first-child{color:var(--green);}
.section-head.payable-head .sh-accent{border-color:var(--green-bdr);color:var(--green);}
.payable-head+.section-sub{border-left-color:var(--green);}

.section-sub{
  background:#fff;border-left:5px solid var(--accent);
  padding:6px 30px;font-size:8.2pt;color:var(--text-mid);
  letter-spacing:0.3px;border-bottom:1px solid var(--border);
}

/* ══ CHARGE TABLES ══ */
table{width:100%;border-collapse:collapse;font-size:8.8pt;}
thead th{
  background:#fff;
  border-bottom:2px solid var(--navy);border-top:1px solid var(--border);
  padding:8px 10px;text-align:left;
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:7.5pt;letter-spacing:0.5px;text-transform:uppercase;
  color:var(--navy);white-space:nowrap;
}
thead th:first-child{width:30%;padding-left:30px;}
thead th:nth-child(2){width:17%;}
thead th:nth-child(3),thead th:nth-child(4){width:11%;text-align:center;}
thead th:nth-child(5){width:8%;text-align:center;}
thead th:last-child{width:16%;text-align:right;min-width:90px;padding-right:30px;}
td{padding:7px 10px;border-bottom:1px solid var(--border-lo);vertical-align:middle;color:var(--text-mid);}
td:first-child{padding-left:30px;}
td:last-child{text-align:right;font-weight:600;font-family:'DM Mono',monospace;color:var(--text);padding-right:30px;}
td:nth-child(2){color:var(--text-mid);white-space:nowrap;font-size:8.2pt;font-family:'DM Mono',monospace;}
td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:center;color:var(--text-muted);font-size:8.2pt;font-family:'DM Mono',monospace;}
tr.sep td{
  background:#fff;color:var(--navy-2);font-weight:700;
  font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;
  padding:5.5px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);
}
tr.sep td:first-child{padding-left:30px;}
tr.sub td{background:#fff;color:var(--text-mid);}
tr.sub td:last-child{color:var(--text);font-weight:700;}
tr.sub td:first-child{padding-left:30px;}
tr.tot td{
  background:#fff;font-weight:700;color:var(--navy);
  border-top:2px solid var(--navy);border-bottom:1px solid var(--border);
  font-size:9pt;
}
tr.tot td:first-child{padding-left:30px;}
tr.vrow td{
  background:#fff;color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
}
tr.vrow td:first-child{padding-left:30px;}
tr.lrow td{
  background:#fff;color:var(--text-muted);
  font-family:'DM Mono',monospace;font-size:8.2pt;font-style:italic;
  border-bottom:2px solid var(--border);
}
tr.lrow td:first-child{padding-left:30px;}

/* Grand total row — accent border + text, white background */
tr.grand td{
  background:#fff;color:var(--accent);
  font-weight:700;font-size:10pt;padding:12px 10px;
  border-top:3px solid var(--accent);border-bottom:2px solid var(--accent);
}
tr.grand td:first-child{padding-left:30px;}
tr.grand td:last-child{color:var(--accent);font-size:12pt;letter-spacing:1px;padding-right:30px;}

/* Slab calculation sub-rows */
tr.calc-row td{
  background:#fff;color:var(--text-muted);
  font-size:7.5pt;font-family:'DM Mono',monospace;font-style:italic;
  padding:2px 10px 4px;border-bottom:1px solid var(--border-lo);
}
tr.calc-row td:first-child{padding-left:44px;}

/* ══ INSIDE / OUTSIDE SPLIT ══ */
.io-summary{
  display:grid;grid-template-columns:1fr 1px 1fr;
  margin:22px 30px 0;
  border:1px solid var(--border);border-radius:4px;overflow:hidden;
}
.io-cell{padding:20px 24px;background:#fff;}
.io-inside{background:#fff;border-top:4px solid var(--blue);}
.io-outside{background:#fff;border-top:4px solid var(--indigo);}
.io-divider{background:var(--border);}
.io-tag{
  font-family:'DM Mono',monospace;font-size:6.8pt;
  letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;font-weight:600;
}
.io-inside .io-tag{color:var(--blue);}
.io-outside .io-tag{color:var(--indigo);}
.io-label{font-size:8pt;color:var(--text-mid);margin-bottom:9px;line-height:1.4;}
.io-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:16pt;line-height:1;margin-bottom:5px;
}
.io-inside .io-amount{color:var(--blue);}
.io-outside .io-amount{color:var(--indigo);}
.io-note{font-size:7.5pt;color:var(--text-muted);}

/* ══ GRAND TOTAL BAR ══ */
.grand-bar{
  margin:22px 30px 0;
  border:1px solid var(--border);
  border-top:4px solid var(--accent);
  border-radius:4px;overflow:hidden;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.gb-inner{display:flex;justify-content:space-between;align-items:stretch;}
.gb-left{
  padding:22px 28px;flex:1;
  border-right:1px solid var(--border-lo);
}
.gb-left .gb-label{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:9pt;letter-spacing:2px;text-transform:uppercase;
  color:var(--navy);margin-bottom:6px;
}
.gb-left .gb-sub{
  font-family:'DM Mono',monospace;font-size:8pt;
  color:var(--text-mid);letter-spacing:1px;text-transform:uppercase;
}
.gb-right{
  padding:24px 32px;
  background:#fff;
  border-left:1px solid var(--border);
  display:flex;flex-direction:column;justify-content:center;align-items:flex-end;
  min-width:230px;
}
.gb-currency-label{
  font-family:'DM Mono',monospace;font-size:7pt;
  letter-spacing:2px;text-transform:uppercase;color:var(--accent-lo);margin-bottom:4px;
}
.gb-amount{
  font-family:'DM Sans',sans-serif;font-weight:900;
  font-size:24pt;color:var(--accent-lo);
  letter-spacing:0.5px;line-height:1;
}
.gb-vat-note{
  font-family:'DM Mono',monospace;font-size:7pt;
  color:var(--text-muted);letter-spacing:0.5px;
  text-transform:uppercase;margin-top:6px;
}

/* ══ AUTHORIZATION ══ */
.auth-section{margin:26px 0 0;border-top:2px solid var(--accent);}
.auth-row{display:grid;grid-template-columns:1fr 1fr 1fr;}
.auth-col{
  padding:24px 36px 28px;
  border-right:1px solid var(--border-lo);
  text-align:center;
}
.auth-col:first-child{padding-left:30px;}
.auth-col:last-child{border-right:none;padding-right:30px;}
.auth-sig-space{min-height:0.9in;}
.auth-sig-line{border-bottom:1.5px solid var(--border);margin-bottom:7px;}
.auth-role{
  font-family:'DM Mono',monospace;font-size:7pt;
  color:var(--text-mid);text-transform:uppercase;letter-spacing:1.8px;
}

/* ══ DISCLAIMER ══ */
.disclaimer{
  margin:18px 30px 0;padding:12px 16px;
  border:1px solid var(--border);border-left:4px solid var(--accent);
  background:#fff;
  font-size:7.8pt;color:var(--text-mid);line-height:1.75;
  font-family:'DM Mono',monospace;border-radius:0 3px 3px 0;
}
.disclaimer strong{color:var(--text);}

/* ══ DOCUMENT FOOTER ══ */
.doc-footer{
  display:flex;justify-content:space-between;align-items:center;
  margin:12px 30px 26px;padding-top:10px;
  border-top:1px solid var(--border-lo);
  font-family:'DM Mono',monospace;font-size:7pt;color:var(--text-muted);
}
.doc-footer .df-ref{font-weight:500;color:var(--text-mid);}

/* ══ EXPLANATION BOX ══ */
.exp-box{
  margin:16px 30px 0;
  border:1px solid var(--border);border-left:4px solid var(--accent);
  background:#fff;padding:15px 20px;
  page-break-inside:avoid;break-inside:avoid;border-radius:0 3px 3px 0;
}
.exp-box-title{
  font-family:'DM Sans',sans-serif;font-weight:700;
  font-size:8pt;color:var(--navy);letter-spacing:1.5px;text-transform:uppercase;
  margin-bottom:11px;padding-bottom:8px;border-bottom:1px solid var(--border);
}
.exp-row{
  display:grid;grid-template-columns:148px 1fr;
  gap:0 12px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border-lo);
}
.exp-row:last-of-type{border-bottom:none;}
.exp-key{
  font-family:'DM Mono',monospace;font-size:7.5pt;font-weight:600;
  color:var(--navy);text-transform:uppercase;letter-spacing:0.4px;padding-top:2px;
}
.exp-val{font-size:8.5pt;color:var(--text-mid);line-height:1.55;}
.exp-val strong{color:var(--text);}
.exp-formula{
  margin-top:11px;padding:9px 14px;
  background:#fff;border:1px solid var(--border);border-radius:3px;
  font-family:'DM Mono',monospace;font-size:8pt;color:var(--navy);
  font-weight:600;letter-spacing:0.2px;
}
.exp-formula-label{font-size:7pt;font-weight:400;color:var(--text-mid);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.8px;}

/* ══ RESPONSIVE ══ */
@media(max-width:700px){
  .invoice{margin:0;border-radius:0;}
  .lh{flex-direction:column;gap:14px;padding:16px;}
  .lh-right{text-align:left;}
  .info-grid{grid-template-columns:repeat(2,1fr);margin:0 16px 4px;}
  .info-section-label,.cls-strip,.exp-box,.disclaimer,.doc-footer{margin-left:16px;margin-right:16px;}
  .info-grid,.io-summary,.grand-bar{margin-left:16px;margin-right:16px;}
  .section-head,.section-sub,.title-band{padding-left:16px;padding-right:16px;}
  thead th:first-child{padding-left:16px;}
  td:first-child,tr.sep td:first-child,tr.sub td:first-child,tr.tot td:first-child,
  tr.vrow td:first-child,tr.lrow td:first-child,tr.grand td:first-child{padding-left:16px;}
  td:last-child,tr.grand td:last-child{padding-right:16px;}
  .io-summary{grid-template-columns:1fr;grid-template-rows:auto 1px auto;}
  .io-divider{height:1px;width:100%;}
  .gb-inner{flex-direction:column;}
  .gb-right{align-items:flex-start;min-width:auto;}
  .auth-row{grid-template-columns:1fr;gap:0;}
  .auth-col{padding:20px 16px 24px !important;border-right:none !important;text-align:left;}
  .split-warn{padding:8px 16px;}
}

/* ══ FONT SCALE ══ */
html{font-size:11.5pt;}
.lh-logo{font-size:20pt;}
.lh-sub{font-size:8.5pt;}
.lh-doc-label{font-size:7.5pt;}
.lh-bill-name{font-size:14pt;}
.lh-meta-lbl{font-size:8pt;}
.lh-meta-val{font-size:9.5pt;}
.lh-badge{font-size:7.5pt;}
.cls-strip .cls-l{font-size:7.5pt;}
.cls-strip .cls-r{font-size:7pt;}
.title-band h1{font-size:12pt;}
.title-band p{font-size:9.5pt;}
.split-warn{font-size:9.5pt;}
.info-section-label{font-size:8.5pt;}
.info-label{font-size:8pt;}
.info-value{font-size:10.5pt;}
.section-head>span:first-child{font-size:10.5pt;}
.sh-accent{font-size:9pt;}
.section-sub{font-size:9.5pt;}
table{font-size:10.5pt;}
thead th{font-size:8.5pt;}
td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){font-size:9.5pt;}
tr.sep td{font-size:8.5pt;}
tr.vrow td,tr.lrow td{font-size:9.5pt;}
tr.tot td{font-size:10.5pt;}
tr.grand td{font-size:11pt;}
tr.grand td:last-child{font-size:13pt;}
.io-tag{font-size:8.5pt;}
.io-label{font-size:10pt;}
.io-amount{font-size:20pt;}
.io-note{font-size:9.5pt;}
.gb-left .gb-label{font-size:11pt;}
.gb-left .gb-sub{font-size:9.5pt;}
.gb-amount{font-size:28pt;}
.gb-currency-label{font-size:8.5pt;}
.gb-vat-note{font-size:9pt;}
.auth-role{font-size:8.5pt;}
.disclaimer{font-size:9.5pt;}
.doc-footer{font-size:8.5pt;}
.exp-box-title{font-size:9pt;}
.exp-key{font-size:8.5pt;}
.exp-val{font-size:9.5pt;}
.exp-formula{font-size:9pt;}
tr.calc-row td{font-size:8.5pt;}

/* ══ PAGE CONTROL ══ */
.no-break{page-break-inside:avoid;break-inside:avoid;}
@page{margin:10mm 12mm;size:A4 portrait;}

/* ══ PRINT STYLES ══ */
@media print{
  *,*::before,*::after{animation:none !important;transition:none !important;box-shadow:none !important;}
  html,body{width:210mm;font-size:7.5pt;line-height:1.3;color:var(--text);}
  .invoice{width:100%;max-width:100%;margin:0;border-radius:0;}

  /* Diagonal watermark */
  body::after{
    content:"UNOFFICIAL ESTIMATE";
    position:fixed;top:50%;left:50%;
    transform:translate(-50%,-50%) rotate(-38deg);
    font-family:'DM Sans',sans-serif;font-weight:900;
    font-size:46pt;color:rgba(0,0,0,0.025);
    white-space:nowrap;pointer-events:none;z-index:9999;letter-spacing:10px;
  }

  /* Layout tightening for A4 */
  .inv-band{border-top-width:3pt !important;}
  .cls-strip{padding:2px 0 !important;}
  .cls-strip .cls-l{font-size:5.8pt !important;}
  .cls-strip .cls-r{font-size:5.2pt !important;}
  .lh{padding:8px 0 !important;}
  .lh-emblem svg{width:40px !important;height:40px !important;}
  .lh-logo{font-size:12pt !important;letter-spacing:3px !important;}
  .lh-rule{width:28px !important;height:2pt !important;margin:3px 0 4px !important;}
  .lh-sub{font-size:6.5pt !important;letter-spacing:1px !important;}
  .lh-doc-label{font-size:5.5pt !important;padding:2px 7px !important;margin-bottom:4px !important;}
  .lh-bill-name{font-size:9.5pt !important;letter-spacing:1px !important;margin-bottom:6px !important;}
  .lh-meta-lbl{font-size:5.8pt !important;padding-right:8px !important;}
  .lh-meta-val{font-size:7pt !important;}
  .lh-badge{font-size:5.5pt !important;padding:1px 6px !important;margin-top:4px !important;}
  .title-band{padding:5px 0 !important;margin-top:4px !important;border-left-width:3pt !important;}
  .title-band h1{font-size:8.5pt !important;letter-spacing:1.5px !important;}
  .title-band p{font-size:6.5pt !important;margin-top:1px !important;}
  .split-warn{padding:4px 0 !important;font-size:7pt !important;}
  .info-section-label{font-size:6pt !important;padding:5px 0 3px !important;letter-spacing:2px !important;}
  .info-grid{margin:0 0 4px !important;border-radius:0 !important;border-width:0.5pt !important;}
  .info-cell{padding:4px 8px !important;border-left-width:2pt !important;}
  .info-label{font-size:5.5pt !important;margin-bottom:2px !important;}
  .info-value{font-size:7.5pt !important;}
  .section-head{padding:4px 0 !important;margin-top:7px !important;border-left-width:3pt !important;border-bottom-width:1.5pt !important;}
  .section-head>span:first-child{font-size:7.5pt !important;letter-spacing:1px !important;}
  .sh-accent{font-size:6pt !important;padding:1px 6px !important;}
  .section-sub{padding:2px 0 !important;font-size:6.5pt !important;border-left-width:3pt !important;}

  table{font-size:7pt !important;}
  thead th{border-bottom-width:1.5pt !important;border-top-width:0.5pt !important;padding:4px 6px !important;font-size:6pt !important;}
  thead th:first-child{padding-left:0 !important;width:30%;}
  thead th:nth-child(2){width:18%;}
  thead th:nth-child(3),thead th:nth-child(4){width:11%;}
  thead th:nth-child(5){width:7%;}
  thead th:last-child{padding-right:0 !important;}
  td{padding:2.5px 6px !important;border-bottom-width:0.4pt !important;}
  td:first-child{padding-left:0 !important;}
  td:last-child{padding-right:0 !important;}
  td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5){font-size:7pt !important;}
  tr.sep td{font-size:5.8pt !important;padding:2.5px 6px !important;}
  tr.sep td:first-child{padding-left:0 !important;}
  tr.sub td:first-child{padding-left:0 !important;}
  tr.tot td{border-top-width:1.5pt !important;font-size:7.5pt !important;padding:3px 6px !important;}
  tr.tot td:first-child{padding-left:0 !important;}
  tr.vrow td,tr.lrow td{font-size:6.5pt !important;padding:2px 6px !important;}
  tr.vrow td:first-child,tr.lrow td:first-child{padding-left:0 !important;}
  tr.grand td{border-top-width:2pt !important;border-bottom-width:1.5pt !important;font-size:8.5pt !important;padding:4.5px 6px !important;}
  tr.grand td:first-child{padding-left:0 !important;}
  tr.grand td:last-child{font-size:10pt !important;padding-right:0 !important;}
  tr.calc-row td{font-size:6pt !important;padding:1px 6px 2.5px !important;}
  tr.calc-row td:first-child{padding-left:18px !important;}

  .io-summary{margin:6px 0 0 !important;border-radius:0 !important;border-width:0.5pt !important;}
  .io-cell{padding:6px 10px !important;}
  .io-inside{border-top-width:2pt !important;}
  .io-outside{border-top-width:2pt !important;}
  .io-tag{font-size:5.5pt !important;margin-bottom:2px !important;}
  .io-label{font-size:6.5pt !important;margin-bottom:3px !important;}
  .io-amount{font-size:11pt !important;margin-bottom:2px !important;}
  .io-note{font-size:5.8pt !important;}
  .grand-bar{margin:8px 0 0 !important;border-radius:0 !important;border-top-width:2.5pt !important;border-width:0.5pt !important;}
  .gb-left{padding:7px 10px !important;}
  .gb-left .gb-label{font-size:7.5pt !important;margin-bottom:3px !important;}
  .gb-left .gb-sub{font-size:6pt !important;}
  .gb-right{padding:7px 12px !important;min-width:130px !important;}
  .gb-currency-label{font-size:6pt !important;margin-bottom:2px !important;}
  .gb-amount{font-size:16pt !important;}
  .gb-vat-note{font-size:6pt !important;margin-top:3px !important;}
  .auth-section{margin:9px 0 0 !important;border-top-width:1.5pt !important;}
  .auth-col{padding:8px 14px 11px !important;}
  .auth-col:first-child{padding-left:0 !important;}
  .auth-col:last-child{padding-right:0 !important;border-right:none !important;}
  .auth-sig-space{min-height:13mm !important;}
  .auth-sig-line{border-bottom-width:1pt !important;margin-bottom:5px !important;}
  .auth-role{font-size:6pt !important;letter-spacing:1px !important;}
  .disclaimer{margin:7px 0 0 !important;padding:5px 9px !important;border-left-width:2.5pt !important;font-size:6.2pt !important;border-radius:0 !important;}
  .doc-footer{margin:5px 0 0 !important;padding-top:4px !important;font-size:5.8pt !important;}
  .exp-box{margin:5px 0 0 !important;padding:7px 12px !important;border-left-width:3pt !important;border-radius:0 !important;}
  .exp-box-title{font-size:7pt !important;margin-bottom:5px !important;padding-bottom:4px !important;}
  .exp-row{grid-template-columns:95pt 1fr !important;gap:0 8px !important;padding:2.5px 0 !important;}
  .exp-key{font-size:6pt !important;}
  .exp-val{font-size:7pt !important;}
  .exp-formula{padding:5px 10px !important;font-size:6.5pt !important;margin-top:6px !important;}
  .exp-formula-label{font-size:5.8pt !important;}
}
</style>
</head>
<body>
<div class="invoice">

  <!-- ACCENT BAND -->
  <div class="inv-band"></div>

  <!-- CLASSIFICATION STRIP -->
  <div class="cls-strip">
    <span class="cls-l">Port Authority &mdash; Billing &amp; Charge Computation System</span>
    <span class="cls-r">Unofficial Computation &mdash; Not an Official Invoice</span>
  </div>

  <!-- LETTERHEAD -->
  <div class="lh">
    <div class="lh-left">
      <div class="lh-emblem">${emblemSvg}</div>
      <div>
        <div class="lh-logo">Port Authority</div>
        <div class="lh-rule"></div>
        <div class="lh-sub">Wharfrent &amp; Payable Charge Computation System</div>
      </div>
    </div>
    <div class="lh-right">
      <div class="lh-doc-label">Billing Document</div>
      <div class="lh-bill-name">${title}</div>
      <table class="lh-meta">
        <tr><td class="lh-meta-lbl">Document Ref</td><td class="lh-meta-val">${billRef}</td></tr>
        <tr><td class="lh-meta-lbl">Issue Date</td><td class="lh-meta-val">${today}</td></tr>
        <tr><td class="lh-meta-lbl">Issue Time</td><td class="lh-meta-val">${issueTime}</td></tr>
      </table>
      <div style="text-align:right"><div class="lh-badge">Unofficial &mdash; For Estimation Only</div></div>
    </div>
  </div>

  <!-- TITLE BAND -->
  <div class="title-band">
    <div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
  </div>

  ${splitWarnHtml}

  <!-- CONSIGNMENT DETAILS -->
  <div class="info-section-label">Consignment Details</div>
  ${infoHtml}

  <!-- CHARGE SECTIONS -->
  <div>${sectionsHtml}</div>

  <!-- INSIDE / OUTSIDE SPLIT SUMMARY -->
  ${splitSummaryHtml}

  <!-- GRAND TOTAL -->
  <div class="grand-bar no-break">
    <div class="gb-inner">
      <div class="gb-left">
        <div class="gb-label">${grandLabel}</div>
        <div class="gb-sub">BDT &mdash; ${grandSubNote}</div>
      </div>
      <div class="gb-right">
        <div class="gb-currency-label">Bangladeshi Taka</div>
        <div class="gb-amount">${fmt(grandTotal)}</div>
        <div class="gb-vat-note">VAT @ ${(vatRate * 100).toFixed(2)}% included</div>
      </div>
    </div>
  </div>

  <!-- AUTHORIZATION -->
  <div class="auth-section no-break">
    <div class="auth-row">
      <div class="auth-col">
        <div class="auth-sig-space"></div>
        <div class="auth-sig-line"></div>
        <div class="auth-role">Prepared By</div>
      </div>
      <div class="auth-col">
        <div class="auth-sig-space"></div>
        <div class="auth-sig-line"></div>
        <div class="auth-role">Verified By</div>
      </div>
      <div class="auth-col">
        <div class="auth-sig-space"></div>
        <div class="auth-sig-line"></div>
        <div class="auth-role">Authorized By</div>
      </div>
    </div>
  </div>

  <!-- DISCLAIMER -->
  <div class="disclaimer no-break">
    <strong>&#9888; Disclaimer:</strong>
    This document is generated for <strong>informational and estimation purposes only</strong> and does <strong>not constitute an official invoice</strong> or legally binding charge statement.
    Final billing is subject to official verification by the Port Authority at the time of delivery or clearance.
    VAT at <strong>${(vatRate * 100).toFixed(2)}%</strong> is applied on all applicable base charges. Levy is computed separately and is not subject to VAT.
    All figures are indicative and subject to revision.
  </div>

  <!-- DOCUMENT FOOTER -->
  <div class="doc-footer">
    <span class="df-ref">${billRef} &mdash; ${today}, ${issueTime}</span>
    <span>AI Assistant &mdash; Designed, Systemized, and Deployed by samiulAsumel</span>
  </div>

</div>
</body>
</html>`;
}

function buildPrintTable(rows) {
  return `<div style="overflow-x:auto;"><table><thead><tr><th>Description</th><th>Rate</th><th>From</th><th>To</th><th>Days</th><th>Amount (Tk)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function printTr(desc, rate, from, to, days, amt, cls) {
  const rowClassAttr = cls ? ` class="${cls}"` : "";
  return `<tr${rowClassAttr}><td>${desc}</td><td>${rate}</td><td>${from}</td><td>${to}</td><td>${days}</td><td>${amt}</td></tr>`;
}

function printTotRow(desc, amt, cls) {
  return `<tr class="${cls || "tot"}"><td colspan="5">${desc}</td><td>${amt}</td></tr>`;
}

const SEC_HEAD_CLASS_BY_PATTERN = [
  [/inside/i, " inside-head"],
  [/outside/i, " outside-head"],
  [/payable/i, " payable-head"],
];
function secHeadClass(label) {
  const match = SEC_HEAD_CLASS_BY_PATTERN.find(([pattern]) => pattern.test(label));
  return match ? match[1] : "";
}
function secHead(label, badge) {
  const badgeHtml = badge ? `<span class="sh-accent">${badge}</span>` : "";
  return `<div class="section-head${secHeadClass(label)}"><span>${label}</span>${badgeHtml}</div>`;
}

// Combined VAT / Levy / Grand-Total summary section for the printed invoice.
// VAT and Levy are charged ONCE on the combined inside+outside base. Values are
// passed in so callers can pass toggle-adjusted figures (cargo payable toggle).
function buildCombinedSummaryPrintSection(
  gBase, gVat, gLevy, gTotal, vatRate,
  baseLabel = "Total Bill (Base for VAT) — Inside + Outside",
  badge = "VAT & Levy on Inside + Outside",
) {
  const pct = (vatRate * 100).toFixed(2);
  let rows = printTotRow(baseLabel, fmt(gBase));
  if (gVat > 0)
    rows += printTotRow(`VAT @ ${pct}%  ·  ${fmt(gBase)} × ${pct}% = ${fmt(gVat)}`, fmt(gVat), "vrow");
  if (gLevy > 0)
    rows += printTotRow("Levy Charge (VAT-exempt)", fmt(gLevy), "lrow");
  rows += printTotRow("GRAND TOTAL", fmt(gTotal), "grand");
  return `${secHead("BILL SUMMARY", badge)}<div class="no-break">${buildPrintTable(rows)}</div>`;
}

function printCalcRow(rate, weight, days, amt) {
  return `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(rate)}&nbsp;Tk/ton/day &times; ${fmtN(weight)}&nbsp;ton(s) &times; ${days}&nbsp;day(s) = ${fmt(amt)}</td></tr>`;
}
function printCalcRowHalf(fullRate, weight, days, amt) {
  return `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(fullRate)}&nbsp;&times;&nbsp;0.50&nbsp;Tk/ton/day &times; ${fmtN(weight)}&nbsp;ton(s) &times; ${days}&nbsp;day(s) = ${fmt(amt)}</td></tr>`;
}

function expRow(key, val) {
  return `<div class="exp-row"><span class="exp-key">${key}</span><span class="exp-val">${val}</span></div>`;
}

function buildCarExplanationHtml(b) {
  const rawFd = Number.parseInt(document.getElementById("freeDays")?.value, 10);
  const freeDays = Number.isNaN(rawFd) ? 4 : Math.max(0, rawFd);
  const freeInfo =
    freeDays === 0
      ? `<strong>No free time</strong> — wharfrent applies from CLD itself (<strong>${fd(b.cld)}</strong>)`
      : `First <strong>${freeDays} day(s)</strong> from CLD are free (no charge). Free period: <strong>${fd(b.cld)}</strong> to <strong>${fd(b.freeEnd)}</strong>`;
  const wharfInfo = b.hasWharfrent
    ? `Starts <strong>${fd(b.storStart)}</strong>. Vehicle billed for <strong>${b.totalDays} chargeable day(s)</strong>.`
    : `Vehicle delivered within free time — <strong>no wharfrent charge applies</strong>.`;
  const splitRow = b.isSplit
    ? expRow(
        "Rate Period",
        `<strong>Split Billing applied</strong> — old rates used up to 22/07/2024; new (higher) rates from 23/07/2024 onwards. Both periods appear in the table below.`,
      )
    : "";
  return `<div class="exp-box no-break">
<div class="exp-box-title">How This Car Bill Is Calculated</div>
${expRow("CLD", `Cargo Landing Date — your vehicle arrived at the port on <strong>${fd(b.cld)}</strong>`)}
${expRow("Free Time", freeInfo)}
${expRow("Wharfrent", wharfInfo)}
${expRow("Slab System", `Daily rate has <strong>3 tiers</strong>: <strong>Days&nbsp;1–7</strong> (lowest) &rarr; <strong>Days&nbsp;8–14</strong> (mid) &rarr; <strong>Day&nbsp;15+</strong> (highest). Rate increases the longer the vehicle stays.`)}
${expRow("Vehicle Weight", `<strong>${fmtN(b.weight)} ton(s)</strong> — multiplied against the daily rate to get the charge`)}
${expRow("Inside Rate", `Vehicles stored <strong>inside the covered shed</strong> — charged at the <strong>full daily rate</strong>`)}
${expRow("Outside Rate", `Vehicles stored <strong>outside (open yard)</strong> — charged at exactly <strong>half (&frac12;) of the inside rate</strong> for the same period`)}
${expRow("VAT", `Value Added Tax at <strong>${(b.vatRate * 100).toFixed(2)}%</strong> — applied on the total wharfrent + payable charges subtotal`)}
${expRow("Levy", `Fixed regulatory charge — <strong>VAT does not apply</strong> to this amount; added separately`)}
${splitRow}
<div class="exp-formula"><div class="exp-formula-label">Calculation Formula</div>Amount per slab = Rate (Tk/ton/day) &times; ${fmtN(b.weight)} ton(s) &times; Number of days in that slab</div>
</div>`;
}

function buildCargoExplanationHtml(b) {
  const rawFd = Number.parseInt(
    document.getElementById("c-freeDays")?.value,
    10,
  );
  const freeDays = Number.isNaN(rawFd) ? 4 : Math.max(0, rawFd);
  const freeInfo =
    freeDays === 0
      ? `<strong>No free time</strong> — wharfrent applies from CLD itself (<strong>${fd(b.cld)}</strong>)`
      : `First <strong>${freeDays} day(s)</strong> from CLD are free of charge. Free period: <strong>${fd(b.cld)}</strong> to <strong>${fd(b.freeEnd)}</strong>`;
  const wharfInfo =
    b.hasWharfrent || b.isPartBilling
      ? `Wharfrent starts <strong>${fd(b.storStart)}</strong>. Total chargeable days: <strong>${b.totalDays}</strong>.`
      : `Cargo delivered within free time — <strong>no wharfrent charge applies</strong>.`;
  const tierLabel = getCargoTierLabel(b.totalWeight);
  const pbRow = b.isPartBilling
    ? expRow(
        "Part Billing",
        `Cargo delivered in <strong>${(b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery).length} stage(s)</strong>. The day-count runs <strong>continuously from CLD</strong> — it does not reset between stages. Only the billable weight changes after each partial delivery.`,
      )
    : "";
  const sdRow =
    b.wharfSdInside > 0 || b.wharfSdOutside > 0
      ? expRow(
          "Self Drive Tons",
          `Inside SD: <strong>${fmtN(b.wharfSdInside || 0)}t</strong>, Outside SD: <strong>${fmtN(b.wharfSdOutside || 0)}t</strong> — billed at <strong>Car Billing slab rates</strong> (not GC rates), shown as separate slab rows.`,
        )
      : "";
  return `<div class="exp-box no-break">
<div class="exp-box-title">How This General Cargo Bill Is Calculated</div>
${expRow("CLD", `Cargo Landing Date — goods arrived at the port on <strong>${fd(b.cld)}</strong>`)}
${expRow("Free Time", freeInfo)}
${expRow("Wharfrent", wharfInfo)}
${expRow("Total Weight", `<strong>${fmtN(b.totalWeight)} ton(s)</strong> split into Inside and Outside portions`)}
${expRow("Inside Weight", `<strong>${fmtN(b.insideW)} ton(s)</strong> stored inside the shed — charged at the <strong>full GC daily rate</strong>`)}
${expRow("Outside Weight", `<strong>${fmtN(b.outsideW)} ton(s)</strong> stored outside the shed — charged at <strong>half (&frac12;) of the inside rate</strong>`)}
${expRow("Landing Rate Tier", `Based on total weight <strong>${fmtN(b.totalWeight)}t</strong>: Tier = <strong>${tierLabel}</strong>. Heavier shipments use a higher tier rate.`)}
${expRow("Slab System", `Daily rate has <strong>3 tiers</strong>: <strong>Days&nbsp;1–7</strong> &rarr; <strong>Days&nbsp;8–14</strong> &rarr; <strong>Day&nbsp;15+</strong>. The rate increases the longer the cargo stays.`)}
${expRow("VAT", `<strong>${(b.vatRate * 100).toFixed(2)}%</strong> Value Added Tax — applied on the wharfrent + payable charges subtotal`)}
${expRow("Levy", `Fixed regulatory charge — <strong>VAT-exempt</strong>; added after VAT is calculated`)}
${pbRow}
${sdRow}
<div class="exp-formula"><div class="exp-formula-label">Calculation Formula</div>Inside Wharfrent = Rate (Tk/ton/day) &times; Inside tons &times; Days &nbsp;|&nbsp; Outside Wharfrent = (Rate &times; Outside tons &times; Days) &divide; 2</div>
</div>`;
}

// moduleFlag: true (legacy "isCargo") | false | "reexport" — accepts the
// legacy boolean from Car/Cargo callers unchanged, plus the "reexport" string.
function openPrintPreview(html, title, billRef, moduleFlag) {
  const dialog = document.getElementById("ppvDialog");
  const frame = document.getElementById("ppvFrame");
  const titleEl = document.getElementById("ppvTitle");
  const refEl = document.getElementById("ppvRef");
  const bar = document.getElementById("ppvBar");
  const printBtn = document.getElementById("ppvPrintBtn");
  const closeBtn = document.getElementById("ppvCloseBtn");

  let accentColor = "var(--gold)";
  if (moduleFlag === "reexport") accentColor = "var(--teal)";
  else if (moduleFlag) accentColor = "var(--sky)";
  const btnTextColor = "#fff";
  bar.style.borderTopColor = accentColor;
  bar.querySelector(".ppv-logo-mark").style.color = accentColor;
  printBtn.style.background = accentColor;
  printBtn.style.color = btnTextColor;

  titleEl.textContent = title;
  refEl.textContent = billRef;

  frame.style.height = "";
  frame.onload = () => {
    try {
      const h = frame.contentDocument.documentElement.scrollHeight;
      if (h > 200) frame.style.height = h + 40 + "px";
    } catch (e) {
      dbg.warn("print preview auto-height failed:", e);
    }
  };
  frame.srcdoc = html;

  printBtn.onclick = () => {
    const fw = frame.contentWindow;
    if (!fw) return;
    const fontsApi =
      frame.contentDocument && "fonts" in frame.contentDocument
        ? frame.contentDocument.fonts
        : null;
    if (fontsApi) {
      fontsApi.ready.finally(() => setTimeout(() => fw.print(), 180));
    } else {
      setTimeout(() => fw.print(), 600);
    }
  };

  closeBtn.onclick = () => dialog.close();
  dialog.onclose = () => {
    frame.srcdoc = "";
    frame.style.height = "";
  };

  dialog.showModal();
}

// Builds the printed invoice HTML for whichever of Car/Cargo/Re-Export was passed in.
// The three module branches share no meaningful structure (different tariff rules,
// different section layouts per CLAUDE.md's VAT/Levy presentation docs), so this is
// intentionally one big per-module switch rather than three half-shared helpers —
// splitting it risks the printed invoice silently drifting from the on-screen bill.
// eslint-disable-next-line sonarjs/cognitive-complexity
function printBill(type) {
  // NOSONAR
  const b = (LAST_BILL_BY_TYPE[type] ?? LAST_BILL_BY_TYPE.cargo)();
  if (!b) {
    showToast("Generate the bill first before printing.", "warning");
    return;
  }
  // Re-validate before printing in case inputs were edited after the bill was
  // generated — surface exactly what is wrong instead of printing an invalid bill.
  const printErrors = (COLLECT_ERRORS_BY_TYPE[type] ?? COLLECT_ERRORS_BY_TYPE.cargo)();
  if (reportInputErrors(printErrors)) return;
  try {
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const billRef = b.billNumber || nextBillNumber(type);
    if (!b.billNumber) {
      b.billNumber = billRef;
      renderBillNumberBadge(type, billRef);
    }

    let sectionsHtml = "";
    let grandTotal, grandLabel;
    let infoHtml, opts;

    if (type === "car") {
      // ── INFO GRID ──
      const RATE_MODE_PRINT_TEXT = {
        split: "Split (Old + New)",
        old: "Old Rates (Pre-23/07/2024)",
        new: "New Rates (From 23/07/2024)",
      };
      const rateMode = RATE_MODE_PRINT_TEXT[b.rateMode] ?? RATE_MODE_PRINT_TEXT.new;
      infoHtml = `<div class="info-grid">
      ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
      ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
      ${b.billEntryNumber ? `<div class="info-cell"><div class="info-label">Bill of Entry</div><div class="info-value">${b.billEntryNumber}</div></div>` : ""}
      ${b.billEntryDate ? `<div class="info-cell"><div class="info-label">B/E Date</div><div class="info-value">${b.billEntryDate}</div></div>` : ""}
      <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
      <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
      <div class="info-cell"><div class="info-label">Car Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : "—"}</div></div>
      <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
      <div class="info-cell"><div class="info-label">Vehicle Weight</div><div class="info-value">${b.weight} ton(s)</div></div>
      <div class="info-cell"><div class="info-label">Car Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + " days" : "Free Time"}</div></div>
      <div class="info-cell"><div class="info-label">Rate Mode</div><div class="info-value">${rateMode}</div></div>
      <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
    </div>`;

      // ── SECTIONS ──
      if (b.hasWharfrent) {
        // Renders the Car inside/outside wharfrent tables for the printed invoice —
        // mirrors buildCarBillTable's split-rate branching; see printBill's file-level note.
        // eslint-disable-next-line sonarjs/cognitive-complexity
        ["inside", "outside"].forEach((side) => {
          // NOSONAR
          const isIn = side === "inside";
          const storAmt = isIn ? b.insideStor : b.outsideHalf;
          const baseAmt = isIn ? b.iBase : b.oBase;
          const vatAmt = isIn ? b.iVat : b.oVat;
          const levyAmt = isIn ? b.iLevy : b.oLevy;
          const totAmt = isIn ? b.iTotal : b.oTotal;
          const subLabel = isIn
            ? "Inside Sub-Total (Base for VAT)"
            : "Outside Sub-Total (½ Rate · Base for VAT)";
          let rows = "";
          if (b.isSplit) {
            const oldS = b.slabs.filter((s) => s.group === "old");
            const newS = b.slabs.filter((s) => s.group === "new");
            if (oldS.length) {
              rows += `<tr class="sep"><td colspan="6">OLD RATE PERIOD — Up to 22/07/2024</td></tr>`;
              oldS.forEach((s) => {
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
                  ? printCalcRow(s.rate, b.weight, s.days, da)
                  : printCalcRowHalf(s.rate, b.weight, s.days, da);
              });
            }
            if (newS.length) {
              rows += `<tr class="sep"><td colspan="6">NEW RATE PERIOD — From 23/07/2024</td></tr>`;
              newS.forEach((s) => {
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
                  ? printCalcRow(s.rate, b.weight, s.days, da)
                  : printCalcRowHalf(s.rate, b.weight, s.days, da);
              });
            }
          } else {
            b.slabs.forEach((s) => {
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
                ? printCalcRow(s.rate, b.weight, s.days, da)
                : printCalcRowHalf(s.rate, b.weight, s.days, da);
            });
          }
          rows += printTotRow(
            `Car Wharfrent Sub-Total${isIn ? " (Full Rate)" : " (Half Rate = Inside ÷ 2)"} — ${b.totalDays} chargeable day(s)`,
            fmt(storAmt),
            "sub",
          );
          if (b.payables.length > 0) {
            rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
            b.payables.forEach((p) => {
              rows += printTr(
                p.label,
                `${p.rateStr ?? fmtN(p.rate)}/ton`,
                `${b.weight} ton(s)`,
                "—",
                "—",
                fmt(p.amt),
                "sub",
              );
              rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(b.weight)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
            });
          }
          rows += printTotRow(subLabel, fmt(baseAmt));
          rows += printTotRow(
            `VAT @ ${(b.vatRate * 100).toFixed(2)}%  ·  ${fmt(baseAmt)} × ${(b.vatRate * 100).toFixed(2)}% = ${fmt(vatAmt)}`,
            fmt(vatAmt),
            "vrow",
          );
          rows += printTotRow("Levy Charge (VAT-exempt)", fmt(levyAmt), "lrow");
          rows += printTotRow(
            `${isIn ? "INSIDE" : "OUTSIDE"} TOTAL`,
            fmt(totAmt),
            "grand",
          );
          const headLabel = isIn ? "INSIDE WHARFRENT" : "OUTSIDE WHARFRENT";
          const headBadge = isIn
            ? `${fmtN(b.weight)} ton(s) — Full Rate`
            : `${fmtN(b.weight)} ton(s) — ½ Rate`;
          const subNote = isIn
            ? "Full rate — inside shed / warehouse"
            : "½ rate — outside shed / warehouse";
          sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        });
        grandTotal = b.iTotal + b.oTotal;
        grandLabel = "CAR GRAND TOTAL";
      } else {
        let rows = "";
        b.payables.forEach((p) => {
          rows += printTr(
            p.label,
            `${p.rateStr ?? fmtN(p.rate)}/ton`,
            `${b.weight} ton(s)`,
            "—",
            "—",
            fmt(p.amt),
            "sub",
          );
          rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(b.weight)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
        });
        rows += printTotRow("Total Payable (Base for VAT)", fmt(b.nBase));
        rows += printTotRow(
          `VAT @ ${(b.vatRate * 100).toFixed(2)}%  ·  ${fmt(b.nBase)} × ${(b.vatRate * 100).toFixed(2)}% = ${fmt(b.nVat)}`,
          fmt(b.nVat),
          "vrow",
        );
        rows += printTotRow("Levy Charge (VAT-exempt)", fmt(b.nLevy), "lrow");
        rows += printTotRow("GRAND TOTAL", fmt(b.nTotal), "grand");
        sectionsHtml += `${secHead("PAYABLE CHARGES", "Within Free Time")}<div class="section-sub">No wharfrent — delivery within free storage period</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        grandTotal = b.nTotal;
        grandLabel = "CAR GRAND TOTAL";
      }
      opts = {
        title: "CAR BILL",
        subtitle: "Port Authority — Car Wharfrent & Payable Charges",
        billRef,
        today,
        infoHtml,
        sectionsHtml,
        grandTotal,
        grandLabel,
        vatRate: b.vatRate,
        isSplit: b.isSplit,
        showSplit: b.hasWharfrent,
        insideLabel: "Inside Wharfrent",
        outsideLabel: "Outside Wharfrent (½ Rate)",
        iSub: b.hasWharfrent ? b.iTotal : 0,
        oSub: b.hasWharfrent ? b.oTotal : 0,
        ioNote: `Full bill — incl. VAT${(b.levyAmt || 0) > 0 ? " &amp; Levy" : ""}`,
        totalLevy: b.levyAmt || 0,
        isCargo: false,
      };
    } else if (type === "cargo") {
      // ── CARGO INFO GRID ──
      if (b.isPartBilling) {
        const vp = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery);
        const firstDel = vp.length > 0 ? fd(vp[0].deliveryDate) : "—";
        const lastDel =
          vp.length > 0 ? fd(vp[vp.length - 1].deliveryDate) : "—";
        infoHtml = `<div class="info-grid">
        ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
        ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
        ${b.billEntryNumber ? `<div class="info-cell"><div class="info-label">Bill of Entry</div><div class="info-value">${b.billEntryNumber}</div></div>` : ""}
        ${b.billEntryDate ? `<div class="info-cell"><div class="info-label">B/E Date</div><div class="info-value">${b.billEntryDate}</div></div>` : ""}
        <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
        <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Starts</div><div class="info-value">${fd(b.storStart)}</div></div>
        <div class="info-cell"><div class="info-label">Billing Mode</div><div class="info-value">Part Billing</div></div>
        <div class="info-cell"><div class="info-label">Delivery Stages</div><div class="info-value">${vp.length} stages</div></div>
        <div class="info-cell"><div class="info-label">First Delivery</div><div class="info-value">${firstDel}</div></div>
        <div class="info-cell"><div class="info-label">Last Delivery</div><div class="info-value">${lastDel}</div></div>
        <div class="info-cell"><div class="info-label">Total Wharfrent Days</div><div class="info-value">${b.totalDays} days</div></div>
        <div class="info-cell"><div class="info-label">Initial Total Weight</div><div class="info-value">${fmtN(b.totalWeight)} ton(s)</div></div>
        <div class="info-cell"><div class="info-label">Inside / Outside (Initial)</div><div class="info-value">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div>
        <div class="info-cell"><div class="info-label">Landing Tier</div><div class="info-value">${getCargoTierLabel(b.totalWeight)}</div></div>
        <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
      </div>`;
      } else {
        infoHtml = `<div class="info-grid">
        ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
        ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
        ${b.billEntryNumber ? `<div class="info-cell"><div class="info-label">Bill of Entry</div><div class="info-value">${b.billEntryNumber}</div></div>` : ""}
        ${b.billEntryDate ? `<div class="info-cell"><div class="info-label">B/E Date</div><div class="info-value">${b.billEntryDate}</div></div>` : ""}
        <div class="info-cell"><div class="info-label">CLD</div><div class="info-value">${fd(b.cld)}</div></div>
        <div class="info-cell"><div class="info-label">Free Time Ends</div><div class="info-value">${fd(b.freeEnd)}</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Starts</div><div class="info-value">${b.hasWharfrent ? fd(b.storStart) : "—"}</div></div>
        <div class="info-cell"><div class="info-label">Delivery Date</div><div class="info-value">${fd(b.delivery)}</div></div>
        <div class="info-cell"><div class="info-label">Total Weight</div><div class="info-value">${fmtN(b.totalWeight)} ton(s)</div></div>
        <div class="info-cell"><div class="info-label">Inside / Outside</div><div class="info-value">${fmtN(b.insideW)}t / ${fmtN(b.outsideW)}t</div></div>
        <div class="info-cell"><div class="info-label">Wharfrent Days</div><div class="info-value">${b.hasWharfrent ? b.totalDays + " days" : "Free Time"}</div></div>
        <div class="info-cell"><div class="info-label">Landing Tier</div><div class="info-value">${getCargoTierLabel(b.totalWeight)}</div></div>
        <div class="info-cell"><div class="info-label">River Dues</div><div class="info-value">${nn("c-rRiver")} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">Landing Rate</div><div class="info-value">${b.dynamicLandingRate} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">Removal Rate</div><div class="info-value">${b.dynamicRemovalRate} Tk/ton</div></div>
        <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
      </div>`;
      }

      // ── CARGO SECTIONS ──
      const includeWharfrent = cargoIncludeWharfrent;
      if (b.isPartBilling && includeWharfrent) {
        ["inside", "outside"].forEach((side) => {
          sectionsHtml += buildPartBillingPrintSection(b, side);
        });
        // VAT + Levy charged ONCE on the combined base (toggle-adjusted).
        const _rp = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
        const _pbInBase = _rp(b.iBase - (cargoIncludePayables ? 0 : b.insidePaySub));
        const _pbOutBase = _rp(b.oBase - (cargoIncludePayables ? 0 : b.outsidePaySub));
        const _pbGBase = _rp(_pbInBase + _pbOutBase);
        const _pbGVat = calcVATmpa(_pbGBase, b.vatRate * 100);
        const _pbGLevy = cargoIncludePayables ? b.gLevy : 0;
        const _pbGTotal = _rp(_pbGBase + _pbGVat + _pbGLevy);
        sectionsHtml += buildCombinedSummaryPrintSection(
          _pbGBase,
          _pbGVat,
          _pbGLevy,
          _pbGTotal,
          b.vatRate,
        );
        grandTotal = _pbGTotal;
        grandLabel = "GENERAL CARGO GRAND TOTAL — PART BILLING";
      } else if (b.hasWharfrent && includeWharfrent) {
        // Per-portion sub-totals (toggle-adjusted). VAT + Levy are charged ONCE
        // on the combined base in the BILL SUMMARY appended after both sections.
        const _rp = (v) => (Math.ceil(v * 100 - 0.5) / 100) || 0;
        const inAdjBase = _rp(b.iBase - (cargoIncludePayables ? 0 : b.insidePaySub));
        const outAdjBase = _rp(b.oBase - (cargoIncludePayables ? 0 : b.outsidePaySub));
        const gBaseAdj = _rp(inAdjBase + outAdjBase);
        const gVatAdj = calcVATmpa(gBaseAdj, b.vatRate * 100);
        const gLevyAdj = cargoIncludePayables ? b.gLevy : 0;
        const gTotalAdj = _rp(gBaseAdj + gVatAdj + gLevyAdj);
        // Renders the Cargo inside/outside wharfrent + self-drive tables for the printed
        // invoice — mirrors cargoCompute's split-rate/self-drive branching; see printBill's
        // file-level note.
        // eslint-disable-next-line sonarjs/cognitive-complexity
        ["inside", "outside"].forEach((side) => {
          const isIn = side === "inside";
          const normalSlabs = isIn ? b.insideSlabs : b.outsideSlabs;
          const sdSlabs = isIn ? b.insideSdSlabs || [] : b.outsideSdSlabs || [];
          const normalW = isIn ? b.insideNormalW : b.outsideNormalW;
          const sdW = isIn ? b.wharfSdInside : b.wharfSdOutside;
          const wharfAmt = isIn ? b.insideWharfrent : b.outsideWharfrent;
          const weight = isIn ? b.insideW : b.outsideW;
          const rawBillPayables = isIn ? b.insidePayables : b.outsidePayables;
          const filteredPayables = cargoIncludePayables ? rawBillPayables : [];
          const baseAmt = isIn ? inAdjBase : outAdjBase;
          const subLabel = isIn
            ? "Inside Sub-Total (Base for VAT)"
            : "Outside Sub-Total (½ Rate · Base for VAT)";
          const rateSuffix = isIn ? "" : " × 0.50";
          let rows = "";
          // Normal GC-rate slabs
          normalSlabs.forEach((s) => {
            const da = isIn ? s.amt : s.amt * 0.5;
            rows += printTr(
              s.label,
              `${fmtN(s.rate)}/t/d${rateSuffix}`,
              fd(s.from),
              fd(s.to),
              s.days,
              fmt(da),
            );
            rows += isIn
              ? printCalcRow(s.rate, normalW, s.days, da)
              : printCalcRowHalf(s.rate, normalW, s.days, da);
          });
          // Self-drive Car-rate slabs
          if (sdSlabs.length > 0) {
            rows += `<tr class="sep"><td colspan="6">Self Drive Wharfrent (Car Billing Rates) — ${fmtN(sdW)} ton(s)</td></tr>`;
            sdSlabs.forEach((s) => {
              const da = isIn ? s.amt : s.amt * 0.5;
              rows += printTr(
                s.label,
                `${fmtN(s.rate)}/t/d${rateSuffix}`,
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
          const wharfrentHalfNote = isIn ? "" : " (½ Rate)";
          if (normalSlabs.length > 0 && sdSlabs.length > 0) {
            const normalAmt = isIn
              ? normalSlabs.reduce((a, s) => a + s.amt, 0)
              : normalSlabs.reduce((a, s) => a + s.amt, 0) * 0.5;
            const sdAmt = isIn
              ? sdSlabs.reduce((a, s) => a + s.amt, 0)
              : sdSlabs.reduce((a, s) => a + s.amt, 0) * 0.5;
            rows += printTotRow(
              `GC Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(normalW)} normal ton(s) × ${b.totalDays} day(s)`,
              fmt(normalAmt),
              "sub",
            );
            rows += printTotRow(
              `Self Drive Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(sdW)} SD ton(s) × ${b.totalDays} day(s)`,
              fmt(sdAmt),
              "sub",
            );
          } else {
            const subLbl =
              sdSlabs.length > 0
                ? `Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(sdW)} ton(s) × ${b.totalDays} day(s)`
                : `Wharfrent Sub-Total${wharfrentHalfNote} — ${fmtN(weight)} ton(s) × ${b.totalDays} day(s)`;
            rows += printTotRow(subLbl, fmt(wharfAmt), "sub");
          }
          if (filteredPayables.length > 0) {
            rows += `<tr class="sep"><td colspan="6">PAYABLE CHARGES</td></tr>`;
            filteredPayables.forEach((p) => {
              rows += printTr(
                p.label,
                `${p.rateStr ?? fmtN(p.rate)}/ton`,
                `${fmtN(p.tons)} ton(s)`,
                "—",
                "—",
                fmt(p.amt),
                "sub",
              );
              rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(p.tons)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
            });
          }
          rows += printTotRow(subLabel, fmt(baseAmt));
          const headLabel = isIn ? `INSIDE WHARFRENT` : `OUTSIDE WHARFRENT`;
          const sdWp = isIn ? b.wharfSdInside || 0 : b.wharfSdOutside || 0;
          const wWp = isIn ? b.insideW : b.outsideW;
          const headRateLabel = isIn ? "Full Rate" : "½ Rate";
          const headBadge =
            sdWp > 0
              ? `${fmtN(wWp - sdWp)}t Normal + ${fmtN(sdWp)}t SD — ${headRateLabel}`
              : `${fmtN(wWp)} ton(s) — ${headRateLabel}`;
          const subNote = isIn
            ? "Full rate — inside shed / warehouse"
            : "½ rate — outside shed / warehouse";
          sectionsHtml += `${secHead(headLabel, headBadge)}<div class="section-sub">${subNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        });
        sectionsHtml += buildCombinedSummaryPrintSection(
          gBaseAdj,
          gVatAdj,
          gLevyAdj,
          gTotalAdj,
          b.vatRate,
        );
        grandTotal = gTotalAdj;
        grandLabel = "GENERAL CARGO GRAND TOTAL";
      } else {
        // Payable-only: either free time OR wharfrent toggled off
        let rows = "";
        const hasPayables = b.payables && b.payables.length > 0;
        const mergedPayables = [...(b.insidePayables || []), ...(b.outsidePayables || [])];
        const payablesIfIncluded = hasPayables ? b.payables : mergedPayables;
        const rawPayList = cargoIncludePayables ? payablesIfIncluded : [];
        // When wharfrent is excluded, merge inside+outside rows of the same charge into one total-tons row
        const payList = !includeWharfrent
          ? (() => {
              const map = new Map();
              rawPayList.forEach((p) => {
                if (map.has(p.label)) {
                  const e = map.get(p.label);
                  e.tons = (e.tons || 0) + (p.tons || 0);
                  e.amt = (e.amt || 0) + (p.amt || 0);
                } else {
                  map.set(p.label, {
                    ...p,
                    tons: p.tons || 0,
                    amt: p.amt || 0,
                  });
                }
              });
              return [...map.values()];
            })()
          : rawPayList;
        payList.forEach((p) => {
          const tons = p.tons ?? b.totalWeight;
          rows += printTr(
            p.label,
            `${p.rateStr ?? fmtN(p.rate)}/ton`,
            `${fmtN(tons)} ton(s)`,
            "—",
            "—",
            fmt(p.amt),
            "sub",
          );
          rows += `<tr class="calc-row"><td colspan="6">&#8627; ${p.rateStr ?? fmtN(p.rate)}&nbsp;Tk/ton &times; ${fmtN(tons)}&nbsp;ton(s) = ${fmt(p.amt)}</td></tr>`;
        });
        const adjNBase = cargoIncludePayables ? b.nBase : 0;
        const adjNVat = cargoIncludePayables ? b.nVat : 0;
        const adjNLevy = cargoIncludePayables ? b.nLevy : 0;
        const adjNTotal = adjNBase + adjNVat + adjNLevy;
        if (adjNBase > 0)
          rows += printTotRow("Total Payable (Base for VAT)", fmt(adjNBase));
        if (adjNVat > 0)
          rows += printTotRow(
            `VAT @ ${(b.vatRate * 100).toFixed(2)}%  ·  ${fmt(adjNBase)} × ${(b.vatRate * 100).toFixed(2)}% = ${fmt(adjNVat)}`,
            fmt(adjNVat),
            "vrow",
          );
        if (adjNLevy > 0)
          rows += printTotRow(
            "Levy Charge (VAT-exempt)",
            fmt(adjNLevy),
            "lrow",
          );
        rows += printTotRow("GRAND TOTAL", fmt(adjNTotal), "grand");
        const payableBadge = `${fmtN(b.totalWeight)} ton(s)${!includeWharfrent ? " — Wharfrent Excluded" : " — Within Free Time"}`;
        const payableNote = !includeWharfrent
          ? "Wharfrent charges excluded — payable charges only"
          : "No wharfrent — delivery within free storage period";
        sectionsHtml += `${secHead("PAYABLE CHARGES", payableBadge)}<div class="section-sub">${payableNote}</div><div class="no-break">${buildPrintTable(rows)}</div>`;
        grandTotal = adjNTotal;
        grandLabel = "GENERAL CARGO GRAND TOTAL";
      }
      // Charge composition breakdown — only when wharfrent is included
      if (includeWharfrent && cargoIncludePayables)
        sectionsHtml += buildCargoBreakdownPrintHtml(b);
      const hasW = (b.hasWharfrent || b.isPartBilling) && includeWharfrent;
      let printTitle = "GENERAL CARGO BILL";
      let printSubtitle = "Port Authority — General Cargo Wharfrent & Payable Charges";
      if (!includeWharfrent) {
        printTitle = "GENERAL CARGO BILL — PAYABLE CHARGES";
        printSubtitle = "Port Authority — Payable Charges Only (Wharfrent Excluded)";
      } else if (b.isPartBilling) {
        const stageCount = (b.pbPeriods || []).filter((p) => !p.invalid || p.freeTimeDelivery).length;
        printTitle = "GENERAL CARGO BILL — PART BILLING";
        printSubtitle = `Port Authority — General Cargo Part Billing · ${stageCount} delivery stages`;
      }
      opts = {
        title: printTitle,
        subtitle: printSubtitle,
        billRef,
        today,
        infoHtml,
        sectionsHtml,
        grandTotal,
        grandLabel,
        vatRate: b.vatRate,
        isSplit: false,
        showSplit: hasW,
        insideLabel: `Inside Wharfrent${b.isPartBilling ? " — Part Billing" : ""}`,
        outsideLabel: `Outside Wharfrent (½ Rate)${b.isPartBilling ? " — Part Billing" : ""}`,
        iSub: hasW ? b.iBase : 0,
        oSub: hasW ? b.oBase : 0,
        ioNote: `Sub-total &mdash; before VAT${(b.totalLevy || 0) > 0 ? " &amp; Levy" : ""}`,
        totalLevy: b.totalLevy || 0,
        isCargo: true,
      };
    } else {
      // ── RE-EXPORT INFO GRID ──
      const printTotalWharfDays = b.beResults.reduce((a, be) => a + be.wharfRows.reduce((a2, w) => a2 + w.chargeableDays, 0), 0);
      infoHtml = `<div class="info-grid">
      ${b.cnfName ? `<div class="info-cell"><div class="info-label">C&amp;F Agent</div><div class="info-value">${b.cnfName}</div></div>` : ""}
      ${b.blNumber ? `<div class="info-cell"><div class="info-label">BL Number</div><div class="info-value">${b.blNumber}</div></div>` : ""}
      <div class="info-cell"><div class="info-label">Re-Export Date</div><div class="info-value">${fd(b.reexportDate)}</div></div>
      <div class="info-cell"><div class="info-label">Re-Export Type</div><div class="info-value">${b.isOverside ? "Overside" : "Port Side"}</div></div>
      <div class="info-cell"><div class="info-label">Wharf Type</div><div class="info-value">${b.wharfType === "diff" ? "Different (200%)" : "Same (150%)"}</div></div>
      <div class="info-cell"><div class="info-label">Bill of Entries</div><div class="info-value">${b.beResults.length}</div></div>
      <div class="info-cell"><div class="info-label">River Dues</div><div class="info-value">${fmtN(nn("re-rRiver"))} Tk/ton</div></div>
      <div class="info-cell"><div class="info-label">Total Wharf Rent Days</div><div class="info-value">${b.isOverside ? "—" : printTotalWharfDays + " days"}</div></div>
      <div class="info-cell"><div class="info-label">VAT Rate</div><div class="info-value">${(b.vatRate * 100).toFixed(2)}%</div></div>
    </div>`;

      // ── PER-BE SECTIONS ──
      b.beResults.forEach((be) => {
        let rows = "";
        if (!b.isOverside && be.wharfRows.length > 0) {
          be.wharfRows.forEach((w) => {
            if (w.slabs.length === 0) {
              rows += `<tr class="sep"><td colspan="6">CLD ${fd(w.date)} — Free Time Ends ${fd(w.freeEnd)} — delivery within free time, no wharf rent charge</td></tr>`;
              return;
            }
            rows += `<tr class="sep"><td colspan="6">CLD ${fd(w.date)} — Free Time Ends ${fd(w.freeEnd)} · Wharf Rent Starts ${fd(addD(w.freeEnd, 1))}</td></tr>`;
            w.slabs.forEach((s) => {
              rows += printTr(s.label, `${fmtN(s.rate)} Tk/t/d`, fd(s.from), fd(s.to), s.days, fmt(s.amt));
              rows += printCalcRow(s.rate, w.ton, s.days, s.amt);
            });
          });
          const totalWharfDays = be.wharfRows.reduce((a, w) => a + w.chargeableDays, 0);
          rows += printTotRow(`Transhipment Wharf Rent Sub-Total — ${totalWharfDays} day(s)`, fmt(be.wharfTotal), "sub");
        }
        rows += printTr("River Dues (Re-export)", `${fmtN(nn("re-rRiver"))}/ton`, `${fmtN(be.totalTon)} ton(s)`, "—", "—", fmt(be.riverDues), "sub");
        rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(nn("re-rRiver"))}&nbsp;Tk/ton &times; ${fmtN(be.totalTon)}&nbsp;ton(s) = ${fmt(be.riverDues)}</td></tr>`;
        if (b.hoistOn) {
          rows += printTr("Hoisting Charge", `${fmtN(nn("re-hoistPct") * 100)}% &times; ${fmtN(be.landingRate)}`, `${fmtN(be.totalTon)} ton(s)`, "—", "—", fmt(be.hoisting), "sub");
          rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(nn("re-hoistPct") * 100)}%&nbsp;&times;&nbsp;${fmtN(be.landingRate)}&nbsp;Tk/ton &times; ${fmtN(be.totalTon)}&nbsp;ton(s) = ${fmt(be.hoisting)}</td></tr>`;
        }
        const reshipLabel = b.wharfType === "diff" ? "Different Wharf (200%)" : "Same Wharf (150%)";
        rows += printTr(`Transhipment / Re-Shipment (${reshipLabel})`, `${fmtN(b.reshipPct * 100)}% &times; ${fmtN(be.landingRate)}`, `${fmtN(be.totalTon)} ton(s)`, "—", "—", fmt(be.reshipment), "sub");
        rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(b.reshipPct * 100)}%&nbsp;&times;&nbsp;${fmtN(be.landingRate)}&nbsp;Tk/ton &times; ${fmtN(be.totalTon)}&nbsp;ton(s) = ${fmt(be.reshipment)}</td></tr>`;
        if (!b.isOverside && be.removal > 0) {
          rows += printTr("Removal Charge", `${fmtN(nn("re-removalMult"))}&times; &times; ${fmtN(be.landingRate)}`, `${fmtN(be.removalTon)} ton(s)`, "—", "—", fmt(be.removal), "sub");
          rows += `<tr class="calc-row"><td colspan="6">&#8627; ${fmtN(nn("re-removalMult"))}&times;&nbsp;&times;&nbsp;${fmtN(be.landingRate)}&nbsp;Tk/ton &times; ${fmtN(be.removalTon)}&nbsp;ton(s) = ${fmt(be.removal)}</td></tr>`;
        }
        rows += printTotRow("Bill of Entry Sub-Total (Base for VAT)", fmt(be.vatBase));
        const beLabel = be.beNumber || `#${be.idx + 1}`;
        const headLabel = `BILL OF ENTRY ${beLabel}`;
        const beDateSuffix = be.beDate ? ` — ${be.beDate}` : "";
        const headBadge = `${fmtN(be.totalTon)} ton(s)${beDateSuffix} — Landing Rate ${fmtN(be.landingRate)} Tk/ton`;
        sectionsHtml += `${secHead(headLabel, headBadge)}<div class="no-break">${buildPrintTable(rows)}</div>`;
      });

      sectionsHtml += buildCombinedSummaryPrintSection(
        b.vatBaseTotal, b.vatAmount, b.levyTotal, b.grandTotal, b.vatRate,
        `Grand Sub Total (Base for VAT) — ${b.beResults.length} Bill${b.beResults.length !== 1 ? "s" : ""} of Entry`,
        "VAT & Levy on Combined Bill of Entries",
      );

      grandTotal = b.grandTotal;
      grandLabel = "TOTAL AMOUNT PAYABLE";
      opts = {
        title: "RE-EXPORT BILL",
        subtitle: "Port Authority — Transhipment / Re-Shipment & Payable Charges",
        billRef,
        today,
        infoHtml,
        sectionsHtml,
        grandTotal,
        grandLabel,
        vatRate: b.vatRate,
        isSplit: false,
        showSplit: false,
        totalLevy: b.levyTotal || 0,
        accent: "reexport",
      };
    }

    const html = buildInvoiceHtml(opts);
    openPrintPreview(html, opts.title, billRef, type === "reexport" ? "reexport" : type === "cargo");
  } catch (e) {
    dbg.warn("printBill failed:", e);
    showToast("Error building print preview. Please try again.", "error");
  }
}


document.getElementById("year").textContent = new Date().getFullYear();
globalThis.scrollTo(0, 0);
try {
  history.scrollRestoration = "manual";
} catch (e) {
  dbg.warn("scrollRestoration unsupported:", e);
}

// Native <dialog> event wiring
const overlay = document.getElementById("overlay");
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
overlay.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});

// Tab keyboard navigation (arrow keys)
document.querySelector(".module-tabs").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll(".tab-btn:not([hidden])")];
  const idx = tabs.indexOf(document.activeElement);
  if (idx === -1) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    tabs[(idx + 1) % tabs.length].focus();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    tabs[(idx - 1 + tabs.length) % tabs.length].focus();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    document.activeElement.click();
  }
});

const formatDateForInput = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};
const today = new Date();
document.getElementById("cld").value = formatDateForInput(today);
document.getElementById("delivery").value = formatDateForInput(today);
document.getElementById("c-cld").value = formatDateForInput(today);
document.getElementById("c-delivery").value = formatDateForInput(today);
document.getElementById("reexport-reexportDate").value = formatDateForInput(today);


loadSavedRates();
carRefresh();
cargoRefresh();
syncReexportSegUI();
renderBillOfEntries();
reexportRefresh();
isInitialLoad = false;

// Card stagger animations
document.querySelectorAll(".card").forEach((card, i) => {
  card.style.setProperty("--card-delay", `${0.7 + i * 0.1}s`);
});

// Hidden admin access: Ctrl+Shift+Click anywhere
document.addEventListener("mousedown", (e) => {
  if (e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    toggleAdmin();
  }
});

document.addEventListener("click", (e) => {
  const menu = document.getElementById("adminPassMenu");
  const card = document.getElementById("adminPassCard");
  if (!isAdmin || !menu || !card || card.hidden) return;
  if (!menu.contains(e.target)) closeAdminPasswordPanel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAdminPasswordPanel();
});

// Floating particles — decorative CSS positioning only, not security-sensitive
/* eslint-disable sonarjs/pseudo-random -- cosmetic randomness, no security implication */
(function () {
  const container = document.createElement("div");
  container.className = "particle-container";
  document.body.appendChild(container);
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 8}s`;
    p.style.animationDuration = `${6 + Math.random() * 4}s`;
    const sz = 2 + Math.random() * 4;
    p.style.width = sz + "px";
    p.style.height = sz + "px";
    container.appendChild(p);
  }
})();
/* eslint-enable sonarjs/pseudo-random */



// Returns headers for authenticated Worker PUT requests.
// The bearer token is the admin password (never stored — held in memory only).
function putHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (_sessionWriteToken) h['Authorization'] = 'Bearer ' + _sessionWriteToken;
  return h;
}

// Save rotations array to Cloudflare Worker
async function saveRotationsToWorker(rotationsArr) {
  if (!isAdmin || !_sessionWriteToken) return false;
  try {
    var r = await fetch(PROXY_URL + "/rotations", {
      method: "PUT",
      headers: putHeaders(),
      body: JSON.stringify(rotationsArr)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return true;
  } catch (e) {
    dbg.error("saveRotationsToWorker failed:", e.message);
    return false;
  }
}

// Save saved-bills array to Cloudflare Worker.
// Bill saving is not admin-gated — any user can save bills.
// Sends bearer token when in admin mode; Worker accepts both authenticated and open writes.
async function saveBillsToWorker(billsArr) {
  try {
    const r = await fetch(PROXY_URL + "/saved-bills", {
      method: "PUT",
      headers: putHeaders(),
      body: JSON.stringify(billsArr),
    });
    if (r.ok) return true;
    throw new Error("HTTP " + r.status);
  } catch (e) {
    dbg.error("saveBillsToWorker failed:", e.message);
    return false;
  }
}

async function saveConfigToWorker(config) {
  if (!isAdmin || !_sessionWriteToken) return false;
  try {
    const res = await fetch(PROXY_URL + '/config', {
      method: 'PUT',
      headers: putHeaders(),
      body: JSON.stringify(config),
    });
    return res.ok;
  } catch (e) {
    dbg.warn("saveConfigToWorker failed:", e);
    return false;
  }
}

async function loadConfigFromGitHub() {
  try {
    const res = await fetch(PROXY_URL + '/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg && cfg.adminPasswordHash) {
      _cloudPasswordHash = cfg.adminPasswordHash;
      localStorage.setItem(ADMIN_PASS_STORAGE_KEY, cfg.adminPasswordHash);
    }
  } catch (e) {
    dbg.warn("loadConfigFromGitHub failed, using localStorage:", e);
  }
}

// Load saved-bills from Cloudflare Worker on startup (enables cross-device sync)
async function loadBillsFromWorker() {
  try {
    const r = await fetch(PROXY_URL + "/saved-bills");
    if (r.ok) {
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    }
    throw new Error("HTTP " + r.status);
  } catch (e) {
    dbg.warn("loadBillsFromWorker failed:", e.message);
    return null;
  }
}


// Anonymous per-device counting: a random UUID in localStorage identifies the
// browser (no PII, no cookies). One "open" = one browser session (sessionStorage
// guard, so reloads don't inflate counts). Pings fail silently offline — same
// graceful degradation as the bill sync functions.
const DEVICE_ID_KEY = "pb_device_id";
const TRACKED_FLAG_KEY = "pb_tracked";

function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch (e) {
    dbg.warn("getDeviceId: storage unavailable:", e);
  }
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + "-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("");
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch (e) {
      dbg.warn("getDeviceId: storage unavailable:", e);
    }
  }
  return id;
}

async function trackVisit() {
  try {
    if (sessionStorage.getItem(TRACKED_FLAG_KEY)) return;
    const r = await fetch(PROXY_URL + "/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: getDeviceId() }),
    });
    if (r.ok) sessionStorage.setItem(TRACKED_FLAG_KEY, "1");
  } catch (e) {
    dbg.warn("trackVisit failed:", e.message);
  }
}

// Same-day key computation as the Worker: Asia/Dhaka (UTC+6, no DST)
function statsDayKey(offsetDays) {
  return new Date(Date.now() + (6 * 3600 + offsetDays * 86400) * 1000)
    .toISOString()
    .slice(0, 10);
}

async function loadStats() {
  const msg = document.getElementById("statsMsg");
  if (!msg) return;
  msg.hidden = false;
  msg.textContent = "Loading usage data…";
  try {
    const headers = {};
    if (_sessionWriteToken) headers["Authorization"] = "Bearer " + _sessionWriteToken;
    const r = await fetch(PROXY_URL + "/stats?days=30", { headers });
    if (!r.ok) throw new Error("HTTP " + r.status);
    renderStats(await r.json());
    msg.hidden = true;
  } catch (e) {
    dbg.warn("loadStats failed:", e.message);
    msg.textContent =
      "Analytics unavailable — you are offline, or the Worker stats database is not configured yet.";
  }
}

function renderStats(s) {
  const setNum = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = Number(v || 0).toLocaleString("en-US");
  };
  setNum("stTodayU", s.today?.uniques);
  setNum("stTodayO", s.today?.opens);
  setNum("stWeekU", s.last7?.uniques);
  setNum("stWeekO", s.last7?.opens);
  setNum("stMonthU", s.last30?.uniques);
  setNum("stMonthO", s.last30?.opens);
  setNum("stAllU", s.allTime?.uniques);
  setNum("stAllO", s.allTime?.opens);

  const chart = document.getElementById("statsChart");
  if (!chart) return;
  const byDay = {};
  (s.days || []).forEach((d) => {
    byDay[d.day] = d;
  });
  // Fill the last 30 days (zero for days with no visits) so the axis is continuous
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const key = statsDayKey(-i);
    days.push({ key, uniques: byDay[key] ? Number(byDay[key].uniques) || 0 : 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.uniques));
  const W = 600;
  const H = 150;
  const PAD = 4;
  const LBL = 14;
  const bw = (W - PAD * 2) / days.length;
  let bars = "";
  days.forEach((d, i) => {
    const h = Math.max(d.uniques > 0 ? 2 : 0, Math.round(((H - LBL - 8) * d.uniques) / max));
    const x = (PAD + i * bw).toFixed(1);
    const label = escHtml(d.key.slice(8) + "/" + d.key.slice(5, 7));
    bars +=
      `<rect x="${x}" y="${H - LBL - h}" width="${(bw * 0.68).toFixed(1)}" height="${h}" rx="1.5" class="sbar">` +
      `<title>${escHtml(d.key)} — ${d.uniques} unique user(s)</title></rect>`;
    if (i % 5 === 0 || i === days.length - 1) {
      // Anchor edge labels inward so they don't clip outside the viewBox
      const isFirst = i === 0;
      const isLast = i === days.length - 1;
      let anchor = "middle";
      let tx = PAD + i * bw + bw * 0.34;
      if (isFirst) { anchor = "start"; tx = PAD; }
      else if (isLast) { anchor = "end"; tx = W - PAD; }
      bars += `<text x="${tx.toFixed(1)}" y="${H - 2}" class="sbar-x" text-anchor="${anchor}">${label}</text>`;
    }
  });
  chart.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation" focusable="false">` +
    `<line x1="${PAD}" y1="${H - LBL - 0.5}" x2="${W - PAD}" y2="${H - LBL - 0.5}" class="sbar-axis"/>` +
    bars +
    `</svg>`;
}

// ─── STARTUP ────────────────────────────────────────────────────

function applyRotationAccessState() {
  var cldEl = document.getElementById("cld");
  if (cldEl) {
    if (isAdmin) {
      cldEl.removeAttribute("readonly");
      cldEl.classList.remove("cld-locked");
      cldEl.classList.add("ae");
    } else {
      cldEl.setAttribute("readonly", "");
      cldEl.classList.remove("ae");
      cldEl.classList.add("cld-locked");
    }
  }
  updateAdminNavigation();
  toggleRotationRegistry();
}

// Initialize rotation system and sync cloud data on page load
// ── PWA install banner ────────────────────────────────────────────────────────
(function () {
  // Don't show if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  let deferredPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const closeBtn = document.getElementById('pwaInstallClose');

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (banner) banner.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        if (banner) banner.hidden = true;
      });
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      if (banner) banner.hidden = true;
    });
  }

  // Hide banner once the app is installed
  window.addEventListener('appinstalled', function () {
    if (banner) banner.hidden = true;
    deferredPrompt = null;
  });
}());

// ── Print a saved bill directly without staying in Edit mode ──────────────────
function printSavedBill(billNumber) {
  const all = getSavedBills();
  const record = all.find((b) => b.billNumber === billNumber);
  if (!record) { showToast('Bill not found', 'error'); return; }
  const type = ['cargo', 'reexport'].includes(record.type) ? record.type : 'car';
  editSavedBill(billNumber);
  setTimeout(() => printBill(type), 80);
}

// ── Saved bills search ────────────────────────────────────────────────────────
let _sbCarSearch = '';
let _sbCargoSearch = '';
let _sbReexportSearch = '';

function sbSearch(type, q) {
  if (type === 'cargo') _sbCargoSearch = q.trim().toLowerCase();
  else if (type === 'reexport') _sbReexportSearch = q.trim().toLowerCase();
  else _sbCarSearch = q.trim().toLowerCase();
  renderSavedBills();
}

function matchesBillSearch(b, q) {
  if (!q) return true;
  const meta = b.metadata || {};
  const haystack = [
    b.billNumber, b.cld, b.delivery,
    meta.cnfName, meta.blNumber, meta.billEntryNumber,
    b.totalFormatted,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

// ── Draft auto-save ───────────────────────────────────────────────────────────
const DRAFT_TTL = 24 * 60 * 60 * 1000;
const DRAFT_KEYS = { car: 'pb_draft_car', cargo: 'pb_draft_cargo', reexport: 'pb_draft_reexport' };

function saveDraft(type) {
  try {
    const payload = { ts: Date.now(), inputs: billInputSnapshot(type) };
    if (type === 'reexport') payload.reexportBEs = JSON.parse(JSON.stringify(reexportBEs));
    localStorage.setItem(DRAFT_KEYS[type], JSON.stringify(payload));
  } catch (e) {
    dbg.warn(`saveDraft(${type}) failed:`, e);
  }
}

function clearDraft(type) {
  try {
    localStorage.removeItem(DRAFT_KEYS[type]);
  } catch (e) {
    dbg.warn(`clearDraft(${type}) failed:`, e);
  }
}

function getDraft(type) {
  try {
    const raw = localStorage.getItem(DRAFT_KEYS[type]);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.inputs || Date.now() - d.ts > DRAFT_TTL) {
      localStorage.removeItem(DRAFT_KEYS[type]);
      return null;
    }
    return d;
  } catch (e) {
    dbg.warn(`getDraft(${type}) failed:`, e);
    return null;
  }
}

function hasMeaningfulDraft(inputs, type) {
  if (type === 'car') {
    return !!(inputs['car-blNumber'] || inputs['car-cnfName'] ||
              (inputs['car-billEntry'] && inputs['car-billEntry'] !== 'C-'));
  }
  if (type === 'reexport') {
    return !!(inputs['reexport-blNumber'] || inputs['reexport-cnfName']);
  }
  return !!(inputs['c-blNumber'] || inputs['c-cnfName'] ||
            (inputs['c-billEntry'] && inputs['c-billEntry'] !== 'C-'));
}

function restoreFormDraft(type) {
  const draft = getDraft(type);
  if (!draft || !hasMeaningfulDraft(draft.inputs, type)) return;
  const root = document.getElementById(inputRootId(type));
  if (!root) return;
  Object.entries(draft.inputs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
  if (type === 'cargo') {
    cargoRefresh();
  } else if (type === 'reexport') {
    if (Array.isArray(draft.reexportBEs) && draft.reexportBEs.length > 0) {
      reexportBEs = JSON.parse(JSON.stringify(draft.reexportBEs));
    }
    syncReexportFreeTimeVisibility(document.getElementById("reexport-type")?.value === "overside");
    syncReexportSegUI();
    renderBillOfEntries();
    reexportRefresh();
  } else {
    carRefresh();
  }
  showToast('Draft restored from your last session.', 'info');
}

document.addEventListener("DOMContentLoaded", function() {
  loadConfigFromGitHub();
  updateAdminNavigation();
  applyRotationAccessState();
  loadRotations();
  trackVisit();
  // Pull saved bills from cloud — cloud is source of truth for cross-device sync.
  // Falls back silently to existing localStorage data when offline or on 404.
  loadBillsFromWorker().then(function(bills) {
    if (!Array.isArray(bills)) return;
    localStorage.setItem(SAVED_BILLS_KEY, JSON.stringify(bills));
    if (currentModule === 'saved') renderSavedBills();
  });

  // Restore drafts for both modules after defaults are set
  setTimeout(() => {
    restoreFormDraft('car');
    restoreFormDraft('cargo');
    restoreFormDraft('reexport');
  }, 0);

  // Auto-save draft every 10 seconds
  setInterval(() => {
    saveDraft('car');
    saveDraft('cargo');
    saveDraft('reexport');
  }, 10000);
});

// Patch carReset to also reset rotation state
var _origCarReset = typeof carReset === "function" ? carReset : null;
if (_origCarReset) {
  window.carReset = function() {
    _origCarReset();
    // Reset rotation dropdowns
    _selectedRotation = null;
    var yearSel = document.getElementById("rotYear");
    var numSel = document.getElementById("rotNum");
    var badge = document.getElementById("rotBadge");
    if (yearSel) yearSel.value = "";
    if (numSel) { numSel.innerHTML = '<option value="">Rotation Number</option>'; numSel.disabled = true; }
    if (badge) badge.textContent = "";
    // Remove rotation from bill
    var billBadge = document.getElementById("rot-bill-badge");
    if (billBadge) billBadge.remove();
    // clearDraft('car') already called inside _origCarReset()
  };
}

// Patch carCalculate to add rotation to bill after generation
var _origCarCalculate = typeof carCalculate === "function" ? carCalculate : null;
if (_origCarCalculate) {
  window.carCalculate = function() {
    _origCarCalculate();
    // After bill generation, add rotation info to bill
    setTimeout(refreshRotationInBill, 50);
  };
}



// Switch between Car / GC sub-tabs inside the Saved Bills module
function switchSavedTab(type) {
  const panels = {
    car: document.getElementById("saved-car-panel"),
    cargo: document.getElementById("saved-cargo-panel"),
    reexport: document.getElementById("saved-reexport-panel"),
  };
  const btns = {
    car: document.getElementById("saved-sub-car"),
    cargo: document.getElementById("saved-sub-cargo"),
    reexport: document.getElementById("saved-sub-reexport"),
  };
  const active = panels[type] ? type : "car";
  Object.entries(panels).forEach(([k, el]) => { if (el) el.style.display = k === active ? "" : "none"; });
  Object.entries(btns).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("active", k === active);
    el.setAttribute("aria-selected", String(k === active));
  });
}

// Parse a bill number back into its parts: prefix, datePart (YYYYMMDD), seq
function parseBillNumber(num) {
  if (!num) return null;
  const m = String(num).match(/^([A-Z]+)-(\d{8})(\d{6})$/);
  if (!m) return null;
  return { prefix: m[1], datePart: m[2], seq: parseInt(m[3], 10) };
}

// Re-render Car, GC, and Re-Export saved-bills tables
function renderSavedBills() {
  const carTbody = document.getElementById("savedCarTbody");
  const cargoTbody = document.getElementById("savedCargoTbody");
  const reexportTbody = document.getElementById("savedReexportTbody");
  if (!carTbody || !cargoTbody || !reexportTbody) return;

  const all = getSavedBills();
  const carBills = all.filter((b) => b.type !== "cargo" && b.type !== "reexport").sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const cargoBills = all.filter((b) => b.type === "cargo").sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const reexportBills = all.filter((b) => b.type === "reexport").sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  function buildRows(bills, searchQ) {
    const visible = searchQ ? bills.filter((b) => matchesBillSearch(b, searchQ)) : bills;
    if (!bills.length) {
      return '<tr><td colspan="8" style="text-align:center;color:var(--tx-2);padding:14px;">No saved bills yet</td></tr>';
    }
    if (!visible.length) {
      return '<tr><td colspan="8" style="text-align:center;color:var(--tx-2);padding:14px;">No bills match your search</td></tr>';
    }
    return visible.map((b, i) => {
      const meta = b.metadata || {};
      const cnf = escHtml(meta.cnfName || "—");
      const bl = escHtml(meta.blNumber || "—");
      const label = cnf !== "—" ? cnf : bl;
      const savedDate = b.savedAt ? new Date(b.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
      const bn = escHtml(JSON.stringify(b.billNumber));
      return `<tr>
        <td>${i + 1}</td>
        <td style="font-variant-numeric:tabular-nums lining-nums;font-family:var(--font-mono)">${escHtml(b.billNumber || "")}</td>
        <td>${escHtml(b.cld || "—")}</td>
        <td>${escHtml(b.delivery || "—")}</td>
        <td>${label}</td>
        <td style="font-variant-numeric:tabular-nums lining-nums">${escHtml(b.totalFormatted || "—")}</td>
        <td>${savedDate}</td>
        <td>
          <button type="button" class="rot-reg-add-btn saved-edit-btn" onclick="editSavedBill(${bn})">Edit</button>
          <button type="button" class="saved-print-btn" onclick="printSavedBill(${bn})">Print</button>
          <button type="button" class="rot-del-btn" onclick="deleteSavedBill(${bn})">Delete</button>
        </td>
      </tr>`;
    }).join("");
  }

  carTbody.innerHTML = buildRows(carBills, _sbCarSearch);
  cargoTbody.innerHTML = buildRows(cargoBills, _sbCargoSearch);
  reexportTbody.innerHTML = buildRows(reexportBills, _sbReexportSearch);
}

// Load a saved bill back into the Car/GC/Re-Export form for editing
function editSavedBill(billNumber) {
  const all = getSavedBills();
  const record = all.find((b) => b.billNumber === billNumber);
  if (!record) { showToast("Bill not found", "error"); return; }

  const type = ["cargo", "reexport"].includes(record.type) ? record.type : "car";
  switchModule(type);

  // Restore scalar inputs from snapshot
  const inputs = record.inputs || {};
  Object.entries(inputs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val;
  });

  // For cargo: restore part-billing stages then trigger the stage UI
  if (type === "cargo") {
    const savedStages = record.partBillingStages;
    if (Array.isArray(savedStages) && savedStages.length > 0) {
      partBillingStages = JSON.parse(JSON.stringify(savedStages));
    }
    // onPartBillingChange reads the checkbox state we already restored above
    onPartBillingChange();
  }

  // For re-export: restore the nested Bill of Entry / CLD state then re-render
  if (type === "reexport") {
    const savedBEs = record.reexportBEs;
    if (Array.isArray(savedBEs) && savedBEs.length > 0) {
      reexportBEs = JSON.parse(JSON.stringify(savedBEs));
    }
    syncReexportFreeTimeVisibility(document.getElementById("reexport-type")?.value === "overside");
    syncReexportSegUI();
    renderBillOfEntries();
  }

  // Mark as editing so next Save overwrites this bill number
  editingBillNumber[type] = billNumber;

  // Re-run calculation to populate results
  if (type === "cargo") cargoCalculate();
  else if (type === "reexport") reexportCalculate();
  else carCalculate();

  showToast(`Editing ${billNumber} — modify and Save to update`, "info");
}

// Delete a saved bill and resequence numbers in its date group
async function deleteSavedBill(billNumber) {
  const ok = await confirmModal(`Delete bill ${billNumber}? This cannot be undone.`);
  if (!ok) return;

  const parsed = parseBillNumber(billNumber);
  let all = getSavedBills();
  const target = all.find((b) => b.billNumber === billNumber);
  if (!target) return;
  const type = target.type;
  const prefix = parsed ? parsed.prefix : (BILL_PREFIX_BY_TYPE[type] ?? BILL_PREFIX_BY_TYPE.car);

  // Remove the bill
  all = all.filter((b) => b.billNumber !== billNumber);

  if (parsed) {
    // Resequence within the same date group for this type
    const dateKey = parsed.datePart;
    const sameGroup = all
      .filter((b) => {
        const p = parseBillNumber(b.billNumber);
        return p && p.prefix === prefix && p.datePart === dateKey;
      })
      .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));

    sameGroup.forEach((b, idx) => {
      b.billNumber = `${prefix}-${dateKey}${String(idx + 1).padStart(6, "0")}`;
    });

    // Rebuild the counter so future saves continue from the right place
    const counters = readJsonStorage(BILL_COUNTER_KEY, {});
    const cKey = `${prefix}-${dateKey}`;
    counters[cKey] = sameGroup.length;
    localStorage.setItem(BILL_COUNTER_KEY, JSON.stringify(counters));
  }

  localStorage.setItem(SAVED_BILLS_KEY, JSON.stringify(all));

  // If this bill was being edited, clear the editing marker
  if (editingBillNumber[type] === billNumber) editingBillNumber[type] = null;

  showToast(`Deleted ${billNumber}`, "success");
  renderSavedBills();
  // Sync to GitHub (async, non-blocking)
  saveBillsToWorker(getSavedBills()).then(ok => {
    if (!ok) showToast("GitHub sync failed — deleted locally only", "warning");
  });
}
