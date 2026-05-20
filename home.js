"use strict";

(function bootSubokHome() {
  const accountKey = "subok-alpha-account-v2";
  const legacyAccountKey = "subok-alpha-account-v1";

  function sanitizeNickname(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 16) || "Player";
  }

  function readAccount() {
    const raw = localStorage.getItem(accountKey) || localStorage.getItem(legacyAccountKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function saveAccount(account) {
    localStorage.setItem(accountKey, JSON.stringify(account));
    localStorage.removeItem(legacyAccountKey);
    renderAccount();
  }

  function clearAccount() {
    localStorage.removeItem(accountKey);
    localStorage.removeItem(legacyAccountKey);
    renderAccount();
  }

  function renderAccount() {
    const account = readAccount();
    const quickState = document.getElementById("quickAccountState");
    const logoutButton = document.getElementById("logoutButton");
    const loginButtons = Array.from(document.querySelectorAll("[data-auth-open]"));

    if (account?.nickname) {
      loginButtons.forEach((button) => {
        if (button.classList.contains("text-button")) button.textContent = account.nickname;
        if (button.classList.contains("outline-button")) button.textContent = "계정 수정";
      });
      if (quickState) quickState.textContent = `${account.nickname} 계정으로 준비 완료`;
      logoutButton?.classList.remove("hidden");
      return;
    }

    loginButtons.forEach((button) => {
      if (button.classList.contains("text-button")) button.textContent = "로그인";
      if (button.classList.contains("outline-button")) button.textContent = "알파 계정 만들기";
    });
    if (quickState) quickState.textContent = "플레이 기록을 남길 계정 준비";
    logoutButton?.classList.add("hidden");
  }

  function setupAuth() {
    const dialog = document.getElementById("authDialog");
    const form = document.getElementById("authForm");
    const closeButton = document.getElementById("authClose");
    const logoutButton = document.getElementById("logoutButton");
    const nickname = document.getElementById("authNickname");
    const email = document.getElementById("authEmail");
    const code = document.getElementById("authCode");
    const inlineForm = document.getElementById("inlineAuthForm");

    function openDialog() {
      const account = readAccount();
      if (nickname) nickname.value = account?.nickname || "";
      if (email) email.value = account?.email || "";
      if (code) code.value = account?.code || "";
      if (dialog?.showModal) dialog.showModal();
      else dialog?.setAttribute("open", "open");
      window.setTimeout(() => nickname?.focus(), 30);
    }

    function closeDialog() {
      if (dialog?.close) dialog.close();
      else dialog?.removeAttribute("open");
    }

    document.querySelectorAll("[data-auth-open]").forEach((button) => {
      button.addEventListener("click", openDialog);
    });

    closeButton?.addEventListener("click", closeDialog);
    logoutButton?.addEventListener("click", () => {
      clearAccount();
      closeDialog();
    });

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveAccount({
        nickname: sanitizeNickname(nickname?.value),
        email: String(email?.value || "").trim(),
        code: String(code?.value || "").trim(),
        updatedAt: Date.now()
      });
      closeDialog();
    });

    inlineForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const inlineNickname = document.getElementById("inlineNickname");
      const inlineEmail = document.getElementById("inlineEmail");
      saveAccount({
        nickname: sanitizeNickname(inlineNickname?.value),
        email: String(inlineEmail?.value || "").trim(),
        code: "",
        updatedAt: Date.now()
      });
      inlineForm.reset();
    });

    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });

    renderAccount();
  }

  function setupFactions() {
    const buttons = Array.from(document.querySelectorAll(".faction-button"));
    const logo = document.getElementById("factionLogo");
    const type = document.getElementById("factionType");
    const name = document.getElementById("factionName");
    const motto = document.getElementById("factionMotto");
    const note = document.getElementById("factionNote");
    const rank = document.getElementById("factionRank");

    function selectFaction(button) {
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      if (logo) logo.src = button.dataset.logo || "";
      if (type) type.textContent = button.dataset.type || "";
      if (name) name.textContent = button.dataset.name || "";
      if (motto) motto.textContent = button.dataset.motto || "";
      if (note) note.textContent = button.dataset.note || "";
      if (rank) rank.textContent = button.dataset.rank || "";
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => selectFaction(button));
    });
  }

  function setupHeader() {
    const header = document.getElementById("siteHeader");
    if (!header) return;

    function syncHeader() {
      header.classList.toggle("scrolled", window.scrollY > 12);
    }

    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }

  setupHeader();
  setupAuth();
  setupFactions();
})();
