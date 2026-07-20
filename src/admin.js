// admin.js — Module tab switching (nav-guard for admin-only tabs),
// admin authentication (login/lockout/password change), and cloud
// rate-config restore. Depends on core.js (state, toast, crypto, escHtml).

function switchModule(mod) {
  if ((mod === "rotation" || mod === "saved" || mod === "stats") && !isAdmin) {
    showToast("Admin login required for this module", "warning");
    mod = "car";
  }
  const page = document.getElementById("page-" + mod);
  const activeTab = document.getElementById("tab-" + mod);
  if (!page || !activeTab || activeTab.hidden) return;
  currentModule = mod;
  document
    .querySelectorAll(".module-page")
    .forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  page.classList.add("active");
  activeTab.classList.add("active");
  activeTab.setAttribute("aria-selected", "true");
  document.body.classList.toggle("mode-cargo", mod === "cargo");
  document.body.classList.toggle("mode-reexport", mod === "reexport");
  document.body.classList.toggle("mode-rotation", mod === "rotation");
  document.body.classList.toggle("mode-saved", mod === "saved");
  document.body.classList.toggle("mode-stats", mod === "stats");
  if (mod === "saved") renderSavedBills();
  if (mod === "stats") loadStats();
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

// Shared by updateAdminNavigation — hides/shows one admin-only tab button.
function setAdminTabVisibility(tab) {
  if (!tab) return;
  tab.hidden = !isAdmin;
  tab.tabIndex = isAdmin ? 0 : -1;
  tab.setAttribute("aria-hidden", isAdmin ? "false" : "true");
}

const ADMIN_ONLY_MODULES = ["rotation", "saved", "stats"];

function updateAdminNavigation() {
  ADMIN_ONLY_MODULES.forEach((mod) => setAdminTabVisibility(document.getElementById("tab-" + mod)));
  if (isAdmin) return;
  closeAdminPasswordPanel();
  ADMIN_ONLY_MODULES.forEach((mod) => document.getElementById("page-" + mod)?.classList.remove("active"));
  if (ADMIN_ONLY_MODULES.includes(currentModule)) switchModule("car");
}


function toggleAdmin() {
  if (isAdmin) {
    isAdmin = false;
    _sessionWriteToken = null;
    applyAdmin();
    showToast("Logged out of admin mode", "info");
    return;
  }
  document.getElementById("muser").value = "";
  document.getElementById("mpass").value = "";
  document.getElementById("merr").classList.remove("show");
  const dlg = document.getElementById("overlay");
  dlg.showModal();
  requestAnimationFrame(() => dlg.classList.add("is-open"));
  setTimeout(() => document.getElementById("muser").focus(), 200);
}
function closeModal() {
  const dlg = document.getElementById("overlay");
  dlg.classList.remove("is-open");
  setTimeout(() => dlg.close(), 320);
}

// Reusable in-app confirm dialog. Returns a Promise<boolean>.
// Falls back to window.confirm if the dialog element is absent.
function confirmModal(message) {
  return new Promise(function(resolve) {
    const dlg = document.getElementById('confirmDialog');
    const msgEl = document.getElementById('confirmMsg');
    if (!dlg || !msgEl) { resolve(window.confirm(message)); return; }
    msgEl.textContent = message;
    dlg.classList.remove('is-open');
    dlg.showModal();
    requestAnimationFrame(() => dlg.classList.add('is-open'));
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    function finish(result) {
      dlg.classList.remove('is-open');
      dlg.removeEventListener('cancel', onEscape);
      setTimeout(() => dlg.close(), 320);
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { finish(true); }
    function onCancel() { finish(false); }
    function onEscape(e) { e.preventDefault(); finish(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dlg.addEventListener('cancel', onEscape);
  });
}

async function doLogin() {
  const u = document.getElementById("muser").value.trim();
  const p = document.getElementById("mpass").value;
  const errEl = document.getElementById("merr");
  if (loginAttempts >= 5) {
    errEl.textContent =
      "Too many failed attempts. Please close this tab and try again.";
    errEl.classList.add("show");
    document.getElementById("mpass").value = "";
    return;
  }
  try {
    const hash = await hashText(p);
    if (u === AU && hash === getAdminPasswordHash()) {
      loginAttempts = 0;
      _setAttempts(0);
      isAdmin = true;
      _sessionWriteToken = p;
      closeModal();
      applyAdmin();
      switchModule("rotation");
      showToast("Admin mode activated", "success");
      flushSync();
    } else {
      loginAttempts++;
      _setAttempts(loginAttempts);
      const remaining = 5 - loginAttempts;
      const attemptWord = remaining === 1 ? "attempt" : "attempts";
      errEl.textContent =
        remaining > 0
          ? `Invalid username or password. ${remaining} ${attemptWord} remaining.`
          : "Too many failed attempts. Please close this tab and try again.";
      errEl.classList.add("show");
      document.getElementById("mpass").value = "";
      document.getElementById("mpass").focus();
    }
  } catch (e) {
    errEl.textContent =
      e.message === "no-subtle"
        ? "Login requires a secure context (HTTPS). Open the app via a web server."
        : "Login failed due to a browser error. Please try again.";
    errEl.classList.add("show");
    document.getElementById("mpass").value = "";
  }
}

function closeAdminPasswordPanel() {
  const card = document.getElementById("adminPassCard");
  const badge = document.getElementById("modeBadge");
  if (card) card.hidden = true;
  if (badge) badge.setAttribute("aria-expanded", "false");
}

function openAdminPasswordPanel() {
  if (!isAdmin) return;
  const card = document.getElementById("adminPassCard");
  const badge = document.getElementById("modeBadge");
  const statusEl = document.getElementById("adminPassStatus");
  if (!card) return;
  const willOpen = card.hidden;
  card.hidden = !willOpen;
  if (badge) badge.setAttribute("aria-expanded", willOpen ? "true" : "false");
  if (!willOpen) return;
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "rot-reg-status admin-pass-status";
  }
  requestAnimationFrame(() => {
    const currentEl = document.getElementById("adminCurrentPass");
    if (currentEl) currentEl.focus();
  });
}
async function changeAdminPassword() {
  if (!isAdmin) return;
  const currentEl = document.getElementById("adminCurrentPass");
  const newEl = document.getElementById("adminNewPass");
  const confirmEl = document.getElementById("adminConfirmPass");
  const statusEl = document.getElementById("adminPassStatus");
  const setStatus = (msg, state) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "rot-reg-status admin-pass-status" + (state ? " " + state : "");
  };
  const currentPass = currentEl ? currentEl.value : "";
  const newPass = newEl ? newEl.value : "";
  const confirmPass = confirmEl ? confirmEl.value : "";

  if (!currentPass || !newPass || !confirmPass) {
    setStatus("Please fill all password fields", "err");
    return;
  }
  if (newPass.length < 6) {
    setStatus("New password must be at least 6 characters", "err");
    return;
  }
  if (newPass !== confirmPass) {
    setStatus("New password and confirmation do not match", "err");
    return;
  }

  try {
    if ((await hashText(currentPass)) !== getAdminPasswordHash()) {
      setStatus("Current password is incorrect", "err");
      if (currentEl) currentEl.focus();
      return;
    }
  const newHash = await hashText(newPass);
  localStorage.setItem(ADMIN_PASS_STORAGE_KEY, newHash);
  _cloudPasswordHash = newHash;
  saveConfigToWorker({ adminPasswordHash: newHash });
    loginAttempts = 0;
    _setAttempts(0);
    [currentEl, newEl, confirmEl].forEach((el) => {
      if (el) el.value = "";
    });
    setStatus("Admin password updated", "ok");
    showToast("Admin password updated", "success");
  } catch (e) {
    setStatus(
      e.message === "no-subtle"
        ? "Password change requires HTTPS or localhost"
        : "Password update failed. Please try again.",
      "err",
    );
  }
}



function applyAdmin() {
  document.getElementById("adot").style.background = isAdmin
    ? "var(--gold)"
    : "var(--m2)";
  document.getElementById("adminTxt").textContent = isAdmin
    ? "Logout"
    : "Admin";
  const adminIcon = document.getElementById("adminIcon");
  if (adminIcon) adminIcon.style.display = isAdmin ? "none" : "block";
  const modeBadge = document.getElementById("modeBadge");
  modeBadge.style.display = isAdmin ? "inline-flex" : "none";
  modeBadge.textContent = isAdmin ? "ADMIN" : "USER";
  modeBadge.tabIndex = isAdmin ? 0 : -1;
  modeBadge.setAttribute("aria-label", "Change admin password");
  if (!isAdmin) closeAdminPasswordPanel();
  isAdmin
    ? document.getElementById("adminBtn").classList.add("active")
    : document.getElementById("adminBtn").classList.remove("active");
  const rrb = document.getElementById("resetRatesBtn");
  if (rrb) rrb.style.display = isAdmin ? "inline-flex" : "none";


  // CAR admin fields
  [
    "freeDays",
    "rRiver",
    "rLanding",
    "rRemoval",
    "rWeighment",
    "rHoisting",
    "rLevy",
    "vatRate",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isAdmin) {
      el.removeAttribute("readonly");
      el.classList.remove("ro");
      el.classList.add("ae");
    } else {
      el.setAttribute("readonly", "");
      el.classList.add("ro");
      el.classList.remove("ae");
    }
  });
  ["nr1", "nr2", "nr3", "or1", "or2", "or3"].forEach((id) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById("d" + id);
    if (isAdmin) {
      inp.style.display = "inline-block";
      inp.classList.remove("ro");
      inp.removeAttribute("readonly");
      if (spn) spn.style.display = "none";
    } else {
      inp.style.display = "none";
      inp.classList.add("ro");
      inp.setAttribute("readonly", "");
      if (spn) {
        spn.style.display = "inline";
        spn.textContent = inp.value;
      }
    }
  });

  // CARGO admin fields (Landing/Removal/Hoisting are formula-derived — always locked)
  ["c-freeDays", "c-rRiver", "c-rWeighment", "c-rLevy", "c-vatRate"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isAdmin) {
        el.removeAttribute("readonly");
        el.classList.remove("ro");
        el.classList.add("ae");
      } else {
        el.setAttribute("readonly", "");
        el.classList.add("ro");
        el.classList.remove("ae");
      }
    },
  );
  ["c-or1", "c-or2", "c-or3"].forEach((id) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById(id.replace("c-", "c-d"));
    if (isAdmin) {
      inp.style.display = "inline-block";
      inp.classList.remove("ro");
      inp.removeAttribute("readonly");
      if (spn) spn.style.display = "none";
    } else {
      inp.style.display = "none";
      inp.classList.add("ro");
      inp.setAttribute("readonly", "");
      if (spn) {
        spn.style.display = "inline";
        spn.textContent = inp.value;
      }
    }
  });

  // RE-EXPORT admin fields
  ["reexport-freeDays", "re-hoistPct", "re-rLevy", "reexport-vatRate"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isAdmin) {
        el.removeAttribute("readonly");
        el.classList.remove("ro");
        el.classList.add("ae");
      } else {
        el.setAttribute("readonly", "");
        el.classList.add("ro");
        el.classList.remove("ae");
      }
    },
  );
  [
    "re-rRiver", "re-wharfLow", "re-wharfHigh", "re-reshipSame",
    "re-reshipDiff", "re-removalMult", "re-land1", "re-land2", "re-land3",
  ].forEach((id) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const spn = document.getElementById("d" + id);
    if (isAdmin) {
      inp.style.display = "inline-block";
      inp.classList.remove("ro");
      inp.removeAttribute("readonly");
      if (spn) spn.style.display = "none";
    } else {
      inp.style.display = "none";
      inp.classList.add("ro");
      inp.setAttribute("readonly", "");
      if (spn) {
        spn.style.display = "inline";
        spn.textContent = inp.value;
      }
    }
  });

  applyRotationAccessState();
  carRefresh();
  cargoRefresh();
  reexportRefresh();
}

