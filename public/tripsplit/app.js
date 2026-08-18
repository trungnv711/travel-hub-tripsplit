(() => {
  "use strict";

  const STORAGE_KEY = "trip-split-portfolio-v2";
  const LEGACY_KEY = "trip-split-state-v1";
  const SCRIPT_URL_KEY = "trip-split-apps-script-url";
  const SCRIPT_SECRET_KEY = "trip-split-apps-script-secret";
  const SHEET_LINKS_KEY = "trip-split-sheet-links";
  const Logic = window.TravelExpenseLogic;
  const Report = window.TravelExpenseReport;
  const Dashboard = window.TravelDashboard;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const dom = Object.fromEntries([
    "tripSelect", "tripStatus", "tripTitle", "tripMeta", "saveStatus", "memberForm", "memberName",
    "memberEmail", "memberPrepaidAmount", "memberError", "memberList", "btnSaveMember", "btnCancelMemberEdit", "appsScriptUrl", "appsScriptSecret", "btnGenerateSecret", "btnCheckAppsScript", "btnShareSheet", "btnOpenSheet", "sheetStatus", "sheetStatusTitle", "sheetStatusText", "sheetError",
    "expenseForm", "expenseFormTitle", "expenseDescription", "expenseAmount", "expensePayer", "expensePaymentSource",
    "expenseDate", "expenseCategory", "expenseNote", "participantList", "customShares",
    "equalSplitPreview", "expenseError", "btnCancelEdit", "btnSaveExpense", "expenseTableBody",
    "expenseEmpty", "expenseSearch", "summaryTableBody", "settlementList", "paymentHistoryList", "statTotal",
    "statExpenseCount", "statMemberCount", "statTransferCount", "toast", "btnNewTrip", "btnShareTrip", "btnEditTrip",
    "btnDeleteTrip", "btnExportJson", "btnExportCsv", "btnPreviewPdf", "pdfPreviewDialog", "pdfReport", "btnClosePdfPreview", "btnCancelPdfPreview", "btnPrintPdf", "fileImportJson", "btnSelectAll",
    "btnClearParticipants", "tripDialog", "tripForm", "tripDialogTitle", "tripId", "tripName",
    "tripDestination", "tripStartDate", "tripEndDate", "tripStatusInput", "tripError",
    "btnCloseTripDialog", "btnCancelTrip", "accountBox", "accountName", "accountEmail",
    "btnSignIn", "btnSignOut", "authDialog", "authForm", "authDisplayName", "authEmail", "authPassword", "authError", "btnCloseAuthDialog", "btnGoogleSignIn", "btnEmailSignIn", "btnEmailSignUp", "btnResetPassword", "shareControl", "shareMenu", "shareMenuHint", "shareNative",
    "shareEmail", "shareEmailHint", "btnHome", "homeView", "workspaceView", "btnOpenCurrentTrip", "btnHomeNewTrip", "homePeriod", "homePeriodHint", "homeTripCount", "homeTotalExpense", "homeAveragePerson", "homeExpenseCount", "homeCategoryChart", "homeContributorList", "homeTripList",
    "fundKeeper", "fundTotalDeposited", "fundTotalSpent", "fundTotalRefunded", "fundBalance", "fundBalanceLabel", "fundBalanceCard", "fundTransactionForm", "fundTransactionMember", "fundTransactionType", "fundTransactionAmount", "fundTransactionNote", "fundTransactionList", "fundError"
  ].map((id) => [id, document.getElementById(id)]));

  let portfolio = loadPortfolio();
  let editingExpenseId = null;
  let editingMemberId = null;
  let toastTimer = null;
  const remoteSyncTimers = new Map();
  const shareCreationPromises = new Map();
  let isApplyingSharedTrip = false;
  let account = null;
  let preparedShareUrl = "";
  let sharePreparationToken = 0;
  let currentView = "workspace";
  let firebaseAuthPromise = null;
  const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function uid(prefix) {
    return window.crypto?.randomUUID ? `${prefix}_${crypto.randomUUID()}` : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  function now() { return new Date().toISOString(); }
  function localDateTimeString(date = new Date()) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function localDateString() { return localDateTimeString().slice(0, 10); }
  function expenseDateInput(value) { return String(value || "").slice(0, 10); }
  function stampExpenseDate(selectedDate, existingValue = "") {
    const date = selectedDate || localDateString();
    const existing = String(existingValue || "");
    if (existing.startsWith(`${date}T`)) return existing;
    return `${date}T${localDateTimeString().slice(11)}`;
  }
  function formatExpenseDateTime(value) {
    const text = String(value || "");
    if (!text) return "";
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text);
    if (Number.isNaN(date.getTime())) return text;
    const options = text.includes("T") ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" };
    return new Intl.DateTimeFormat("vi-VN", options).format(date);
  }
  function activeTrip() { return portfolio.trips.find((trip) => trip.id === portfolio.activeTripId) || portfolio.trips[0]; }
  function formatCurrency(value) { return `${new Intl.NumberFormat("vi-VN").format(Number(value) || 0)} ₫`; }
  function formatNumber(value) { return new Intl.NumberFormat("vi-VN").format(Number(value) || 0); }
  function parseMoney(value) { return Logic.toSafeInteger(String(value || "").replace(/[^\d]/g, "")); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()); }
  function memberName(id) { return activeTrip().members.find((member) => member.id === id)?.name || "Không xác định"; }
  function averagePerParticipant(expense) { const count = new Set(expense.participantIds || []).size; return count ? Math.round((Number(expense.amount) || 0) / count) : 0; }
  function statusLabel(status) { return ({ planning: "Đang chuẩn bị", active: "Đang diễn ra", settling: "Đang quyết toán", closed: "Đã kết thúc" })[status] || "Đang chuẩn bị"; }
  function formatDateRange(trip) {
    if (!trip.startDate && !trip.endDate) return "Chưa đặt thời gian";
    const format = (date) => date ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${date}T00:00:00`)) : "?";
    return `${format(trip.startDate)} – ${format(trip.endDate)}`;
  }

  function makeTrip({ id = uid("trip"), name, destination = "", startDate = "", endDate = "", status = "planning", members = [], expenses = [], payments = [], fundKeeperId = "", fundTransactions = [] }) {
    return { id, name, destination, startDate, endDate, status, members, expenses, payments, fundKeeperId: fundKeeperId || members[0]?.id || "", fundTransactions, createdAt: now(), updatedAt: now() };
  }

  function createSamplePortfolio() {
    const people = (prefix, names) => names.map((name, index) => ({ id: `${prefix}_m${index + 1}`, name, email: "", prepaidAmount: 0 }));
    const dalatMembers = people("dl", ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khang", "Lan", "Minh", "Ngọc"]);
    const baolocMembers = people("bl", ["An", "Bình", "Chi", "Dũng", "Hà", "Lan", "Minh", "Phúc"]);
    const expense = (id, description, amount, payerId, participantIds, category, date) => ({ id, description, amount, payerId, participantIds, splitMode: "equal", customShares: {}, category, date, note: "", included: true, paymentSource: "personal", createdAt: now() });
    const dalat = makeTrip({ id: "trip_da_lat", name: "Trip 1 — Đà Lạt", destination: "Đà Lạt", startDate: "2026-08-15", endDate: "2026-08-17", status: "planning", members: dalatMembers });
    dalat.expenses = [expense("dl_e1", "Đặt cọc villa", 6000000, dalatMembers[0].id, dalatMembers.map((m) => m.id), "Lưu trú", "2026-08-01")];
    const baoloc = makeTrip({ id: "trip_bao_loc", name: "Trip 2 — Bảo Lộc", destination: "Bảo Lộc", startDate: "2026-09-05", endDate: "2026-09-06", status: "planning", members: baolocMembers });
    baoloc.expenses = [expense("bl_e1", "Đặt xe khứ hồi", 3200000, baolocMembers[1].id, baolocMembers.map((m) => m.id), "Di chuyển", "2026-08-03")];
    return { version: 4, activeTripId: dalat.id, trips: [dalat, baoloc] };
  }

  function migrateLegacy(legacy) {
    const trip = makeTrip({ name: String(legacy.tripName || "Chuyến đi đã nhập"), members: legacy.members.map((m) => ({ ...m, email: m.email || "", prepaidAmount: Logic.toSafeInteger(m.prepaidAmount) })), expenses: legacy.expenses.map((expense) => ({ ...expense, included: expense.included !== false })) });
    return normalizePortfolio({ version: 4, activeTripId: trip.id, trips: [trip] });
  }

  function normalizePortfolio(candidate) {
    candidate.version = 4;
    candidate.trips.forEach((trip) => {
      trip.destination ||= ""; trip.startDate ||= ""; trip.endDate ||= ""; trip.status ||= "planning";
      trip.payments ||= [];
      trip.fundTransactions = Array.isArray(trip.fundTransactions) ? trip.fundTransactions : [];
      trip.members.forEach((member) => { member.email ||= ""; member.prepaidAmount = Logic.toSafeInteger(member.prepaidAmount); });
      trip.expenses.forEach((expense) => { expense.included = expense.included !== false; expense.paymentSource = expense.paymentSource === "fund" ? "fund" : "personal"; });
      if (!trip.members.some((member) => member.id === trip.fundKeeperId)) trip.fundKeeperId = trip.members[0]?.id || "";
    });
    return candidate;
  }

  function loadPortfolio() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Logic.validatePortfolio(current).valid) return normalizePortfolio(current);
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (Logic.validateState(legacy).valid) return migrateLegacy(legacy);
    } catch { /* use sample data */ }
    return createSamplePortfolio();
  }

  function savePortfolio(message = "Đã lưu trên thiết bị", sync = true) {
    const trip = activeTrip();
    trip.updatedAt = now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    dom.saveStatus.textContent = message;
    clearTimeout(savePortfolio.timer);
    savePortfolio.timer = setTimeout(() => { dom.saveStatus.textContent = activeTrip().shareId ? "Đã đồng bộ cho cả nhóm" : "Đã lưu trên thiết bị"; }, 1500);
    if (!isApplyingSharedTrip && sync && location.protocol !== "file:") {
      if (trip.shareId) scheduleRemoteSync(trip);
      else ensureTripShared(trip).catch(() => {});
    }
  }
  function showToast(message) { dom.toast.textContent = message; dom.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2600); }

  function shareIdFromUrl() {
    return new URLSearchParams(window.location.search).get("trip") || "";
  }
  function sharedUrl(shareId) {
    let origin = window.location.origin;
    try { if (window.parent !== window) origin = window.parent.location.origin; } catch { /* use iframe origin */ }
    return `${origin}/cong-cu?trip=${encodeURIComponent(shareId)}`;
  }
  function setSharedUrl(shareId) {
    const outerUrl = shareId ? sharedUrl(shareId) : `${window.location.origin}/`;
    try { if (window.parent !== window) window.parent.history.replaceState({}, "", outerUrl); } catch { /* parent may be unavailable */ }
    history.replaceState({}, "", shareId ? `${location.pathname}?trip=${encodeURIComponent(shareId)}` : location.pathname);
    return outerUrl;
  }
  function firebaseAuthClient() {
    if (window.TripSplitFirebaseAuth) return Promise.resolve(window.TripSplitFirebaseAuth);
    if (!firebaseAuthPromise) {
      firebaseAuthPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Firebase Authentication chưa tải được.")), 10_000);
        window.addEventListener("tripsplit-firebase-ready", () => {
          clearTimeout(timeout);
          resolve(window.TripSplitFirebaseAuth);
        }, { once: true });
      });
    }
    return firebaseAuthPromise;
  }
  async function authFetch(url, init = {}) {
    const headers = new Headers(init.headers || {});
    try {
      const auth = await firebaseAuthClient();
      const token = await auth.getIdToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch { /* continue as guest when Firebase is unavailable */ }
    return fetch(url, { ...init, headers });
  }
  function renderAccount() {
    if (account?.authenticated) {
      dom.accountName.textContent = account.user.displayName || "Tài khoản TripSplit";
      dom.accountEmail.textContent = `${account.user.email} · Đã lưu đám mây`;
      dom.btnSignIn.classList.add("hidden");
      dom.btnSignOut.classList.remove("hidden");
    } else {
      dom.accountName.textContent = "Chế độ khách";
      dom.accountEmail.textContent = "Đăng nhập để lưu trên mọi thiết bị";
      dom.btnSignIn.classList.remove("hidden");
      dom.btnSignOut.classList.add("hidden");
    }
  }
  async function loadAccountTrips() {
    try {
      const meResponse = await authFetch("/api/me", { cache: "no-store" });
      account = meResponse.ok ? await meResponse.json() : { authenticated: false };
      renderAccount();
      if (!account.authenticated) return;

      const tripsResponse = await authFetch("/api/account/trips", { cache: "no-store" });
      if (!tripsResponse.ok) return;
      const result = await tripsResponse.json();
      const accountTrips = Array.isArray(result.trips)
        ? result.trips.filter((trip) => Logic.validateTrip(trip).valid)
        : [];
      accountTrips.forEach((trip) => {
        trip.payments ||= [];
        trip.fundTransactions = Array.isArray(trip.fundTransactions) ? trip.fundTransactions : [];
        trip.members.forEach((member) => { member.email ||= ""; member.prepaidAmount = Logic.toSafeInteger(member.prepaidAmount); });
        trip.expenses.forEach((expense) => { expense.included = expense.included !== false; expense.paymentSource = expense.paymentSource === "fund" ? "fund" : "personal"; });
        if (!trip.members.some((member) => member.id === trip.fundKeeperId)) trip.fundKeeperId = trip.members[0]?.id || "";
        const index = portfolio.trips.findIndex((item) => item.shareId === trip.shareId || item.id === trip.id);
        if (index >= 0) portfolio.trips[index] = trip;
        else portfolio.trips.push(trip);
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
      if (accountTrips.length) dom.saveStatus.textContent = `Đã tải ${accountTrips.length} trip từ tài khoản`;
    } catch {
      account = { authenticated: false };
      renderAccount();
    }
  }
  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch { /* use fallback */ }
    const input = document.createElement("textarea"); input.value = value; input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select();
    const copied = document.execCommand("copy"); input.remove(); return copied;
  }
  function scheduleRemoteSync(trip = activeTrip()) {
    clearTimeout(remoteSyncTimers.get(trip.id));
    const timer = setTimeout(() => {
      remoteSyncTimers.delete(trip.id);
      syncSharedTrip(trip).catch(() => {});
    }, 700);
    remoteSyncTimers.set(trip.id, timer);
  }
  async function fetchSharedTrip(shareId) {
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await authFetch(`/api/shared-trips/${encodeURIComponent(shareId)}`);
      if (response.status !== 404 || attempt === 2) return response;
      await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
    }
    return response;
  }
  async function syncSharedTrip(trip = activeTrip()) {
    if (!trip.shareId || location.protocol === "file:") return;
    clearTimeout(savePortfolio.timer);
    if (activeTrip().id === trip.id) dom.saveStatus.textContent = "Đang đồng bộ…";
    const response = await authFetch(`/api/shared-trips/${encodeURIComponent(trip.shareId)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (activeTrip().id === trip.id) dom.saveStatus.textContent = "Đã lưu trên thiết bị · chờ đồng bộ";
      throw new Error(result.error || "Không thể đồng bộ chuyến đi.");
    }
    trip.shareRevision = result.revision;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    if (activeTrip().id === trip.id) dom.saveStatus.textContent = "Đã đồng bộ cho cả nhóm";
  }
  function ensureTripShared(trip = activeTrip()) {
    if (trip.shareId) return Promise.resolve(trip.shareId);
    if (location.protocol === "file:") return Promise.reject(new Error("Chức năng đồng bộ chỉ có trên bản online."));
    if (shareCreationPromises.has(trip.id)) return shareCreationPromises.get(trip.id);
    const creation = (async () => {
      clearTimeout(savePortfolio.timer);
      if (activeTrip().id === trip.id) dom.saveStatus.textContent = "Đang tạo link riêng cho trip…";
      const response = await authFetch("/api/shared-trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thể tạo link cho chuyến đi.");
      trip.shareId = result.shareId;
      trip.shareRevision = result.revision;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
      if (activeTrip().id === trip.id) {
        setSharedUrl(trip.shareId);
        dom.btnShareTrip.textContent = "↗ Chia sẻ";
        dom.saveStatus.textContent = "Đã tạo link · đang đồng bộ…";
      }
      await syncSharedTrip(trip);
      if (activeTrip().id === trip.id) showToast("Đã tự tạo link riêng và lưu trip cho cả nhóm.");
      return trip.shareId;
    })().catch((error) => {
      if (activeTrip().id === trip.id) {
        dom.saveStatus.textContent = "Đã lưu trên thiết bị · chưa đồng bộ";
        showToast(error instanceof Error ? error.message : "Không thể tạo link cho chuyến đi.");
      }
      throw error;
    }).finally(() => shareCreationPromises.delete(trip.id));
    shareCreationPromises.set(trip.id, creation);
    return creation;
  }
  function memberEmails(trip = activeTrip()) {
    return Logic.normalizeShareEmails(trip.members);
  }
  function closeShareMenu(restoreFocus = false) {
    sharePreparationToken += 1;
    dom.shareMenu.classList.add("hidden");
    dom.btnShareTrip.setAttribute("aria-expanded", "false");
    preparedShareUrl = "";
    if (restoreFocus) dom.btnShareTrip.focus();
  }
  function setShareMenuState(state, message) {
    const emails = memberEmails();
    const unavailable = state !== "ready";
    dom.shareMenuHint.textContent = message;
    dom.shareMenuHint.dataset.state = state;
    dom.shareEmailHint.textContent = emails.length ? `${emails.length} thành viên có email` : "Chưa có email thành viên";
    dom.shareNative.classList.toggle("hidden", typeof navigator.share !== "function");
    dom.shareMenu.querySelectorAll("[data-share-action]").forEach((button) => { button.disabled = unavailable; });
    dom.shareEmail.disabled = unavailable || !emails.length;
  }
  async function openShareMenu() {
    if (!dom.shareMenu.classList.contains("hidden")) { closeShareMenu(true); return; }
    if (location.protocol === "file:") { showToast("Chức năng chia sẻ chỉ có trên bản online."); return; }

    const trip = activeTrip();
    const token = ++sharePreparationToken;
    preparedShareUrl = "";
    dom.shareMenu.classList.remove("hidden");
    dom.btnShareTrip.setAttribute("aria-expanded", "true");
    setShareMenuState("loading", "Đang lưu dữ liệu mới nhất và chuẩn bị liên kết…");
    try {
      if (!trip.shareId) await ensureTripShared(trip); else await syncSharedTrip(trip);
      if (token !== sharePreparationToken || activeTrip().id !== trip.id) return;
      preparedShareUrl = setSharedUrl(trip.shareId);
      setShareMenuState("ready", "Liên kết đã sẵn sàng để gửi cho cả nhóm.");
    } catch (error) {
      if (token !== sharePreparationToken) return;
      dom.saveStatus.textContent = "Đã lưu trên thiết bị";
      setShareMenuState("error", error instanceof Error ? error.message : "Không thể chuẩn bị liên kết.");
      showToast(error instanceof Error ? error.message : "Không thể chuẩn bị liên kết chia sẻ.");
    }
  }
  async function runShareAction(action) {
    if (!preparedShareUrl) { showToast("Liên kết chưa sẵn sàng. Vui lòng thử lại."); return; }
    const trip = activeTrip();
    const content = Logic.buildShareContent(trip.name, preparedShareUrl, trip.members);

    if (action === "native") {
      try {
        await navigator.share({ title: content.title, text: content.message, url: content.url });
        closeShareMenu();
      } catch (error) {
        if (error?.name !== "AbortError") showToast("Thiết bị không thể mở bảng chia sẻ. Hãy dùng Sao chép liên kết.");
      }
      return;
    }
    if (action === "email") {
      const emails = content.emails;
      if (!emails.length) { showToast("Hãy bổ sung email thành viên trước khi gửi."); return; }
      const link = document.createElement("a");
      link.href = content.mailtoUrl;
      link.target = "_top";
      document.body.appendChild(link); link.click(); link.remove();
      closeShareMenu();
      showToast("Đã mở ứng dụng email. Hãy kiểm tra rồi bấm Gửi.");
      return;
    }
    if (action === "facebook") {
      const popup = window.open(content.facebookUrl, "tripsplit-facebook-share", "popup,width=720,height=720");
      if (!popup) { showToast("Trình duyệt đang chặn cửa sổ Facebook. Hãy cho phép popup rồi thử lại."); return; }
      try { popup.opener = null; } catch { /* Browser controls opener policy. */ }
      closeShareMenu();
      return;
    }
    if (action === "copy") {
      const copied = await copyText(preparedShareUrl);
      if (copied) closeShareMenu();
      showToast(copied ? "Đã sao chép liên kết chuyến đi." : `Không thể tự sao chép. Link: ${preparedShareUrl}`);
    }
  }
  async function loadSharedTripFromUrl() {
    const shareId = shareIdFromUrl();
    if (!shareId) return;
    if (!SHARE_ID_PATTERN.test(shareId)) { showToast("Link trip không hợp lệ."); return; }
    dom.saveStatus.textContent = "Đang tải dữ liệu chung…";
    try {
      const response = await fetchSharedTrip(shareId);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thể tải chuyến đi.");
      if (!Logic.validateTrip(result.trip).valid) throw new Error("Dữ liệu chuyến đi trên máy chủ không hợp lệ.");
      const sharedTrip = { ...result.trip, payments: Array.isArray(result.trip.payments) ? result.trip.payments : [], fundTransactions: Array.isArray(result.trip.fundTransactions) ? result.trip.fundTransactions : [], shareId, shareRevision: result.revision };
      sharedTrip.members.forEach((member) => { member.email ||= ""; member.prepaidAmount = Logic.toSafeInteger(member.prepaidAmount); });
      sharedTrip.expenses.forEach((expense) => { expense.included = expense.included !== false; expense.paymentSource = expense.paymentSource === "fund" ? "fund" : "personal"; });
      if (!sharedTrip.members.some((member) => member.id === sharedTrip.fundKeeperId)) sharedTrip.fundKeeperId = sharedTrip.members[0]?.id || "";
      sharedTrip.expenses.forEach((expense) => { expense.included = expense.included !== false; });
      isApplyingSharedTrip = true;
      const index = portfolio.trips.findIndex((trip) => trip.shareId === shareId || trip.id === sharedTrip.id);
      if (index >= 0) portfolio.trips[index] = sharedTrip; else portfolio.trips.unshift(sharedTrip);
      portfolio.activeTripId = sharedTrip.id;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
      dom.saveStatus.textContent = "Đã tải dữ liệu chung";
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tải chuyến đi.");
      dom.saveStatus.textContent = "Không tải được dữ liệu chung";
    } finally { isApplyingSharedTrip = false; }
  }

  function showHome() {
    currentView = "home";
    dom.homeView.classList.remove("hidden");
    dom.workspaceView.classList.add("hidden");
    document.body.classList.add("home-mode");
    renderHome();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showWorkspace() {
    currentView = "workspace";
    dom.homeView.classList.add("hidden");
    dom.workspaceView.classList.remove("hidden");
    document.body.classList.remove("home-mode");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderHome() {
    const period = dom.homePeriod.value || "year";
    const metrics = Dashboard.aggregate(portfolio, Logic, period);
    const periodLabels = { week: "tuần này", month: "tháng này", year: "năm nay", all: "toàn bộ lịch sử" };
    dom.homePeriodHint.textContent = `Tổng hợp các khoản đã bật tính tiền trong ${periodLabels[period]}.`;
    dom.homeTripCount.textContent = metrics.activeTripCount;
    dom.homeTotalExpense.textContent = formatCurrency(metrics.total);
    dom.homeAveragePerson.textContent = formatCurrency(metrics.averagePerPerson);
    dom.homeExpenseCount.textContent = metrics.expenseCount;

    const maxCategory = metrics.categories[0]?.amount || 0;
    dom.homeCategoryChart.innerHTML = metrics.categories.length ? metrics.categories.map((item) => {
      const percent = maxCategory ? Math.max(6, Math.round((item.amount / maxCategory) * 100)) : 0;
      return `<div class="category-row"><div><strong>${escapeHtml(item.name)}</strong><span>${formatCurrency(item.amount)}</span></div><div class="category-track"><span style="--bar:${percent}%"></span></div></div>`;
    }).join("") : '<div class="home-empty">Chưa có chi phí đã chốt trong khoảng thời gian này.</div>';

    dom.homeContributorList.innerHTML = metrics.payers.length ? metrics.payers.slice(0, 6).map((item, index) => `<article class="contributor-item"><span class="contributor-rank">${index + 1}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.tripName)}</small></div><div class="contributor-thanks" title="Lời cảm ơn theo mức đã ứng">${"🙏".repeat(item.thanks)}</div><span class="contributor-amount">${formatCurrency(item.amount)}</span></article>`).join("") : '<div class="home-empty">Chưa có người ứng chi phí trong khoảng thời gian này.</div>';

    dom.homeTripList.innerHTML = metrics.tripSummaries.length ? metrics.tripSummaries.map((item) => {
      const trip = item.trip;
      const topPayerEntry = Object.entries(item.payers).sort((a, b) => b[1] - a[1])[0];
      const topPayer = topPayerEntry ? trip.members.find((member) => member.id === topPayerEntry[0]) : null;
      const categories = Object.entries(item.categories).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name).join(" · ") || "Chưa có hoạt động";
      const memberCosts = item.memberCosts.map((member) => `<span><strong>${escapeHtml(member.name)}</strong><small>${formatCurrency(member.amount)}</small></span>`).join("");
      return `<article class="home-trip-card"><div class="home-trip-card__top"><span class="status-chip" data-status="${escapeHtml(trip.status)}">${escapeHtml(statusLabel(trip.status))}</span><span>${escapeHtml(formatDateRange(trip))}</span></div><h3>${escapeHtml(trip.name)}</h3><p class="home-trip-card__destination">📍 ${escapeHtml(trip.destination || "Chưa cập nhật điểm đến")}</p><div class="home-trip-card__stats"><span><small>Thành viên</small><strong>${trip.members.length}</strong></span><span><small>Tổng chi</small><strong>${formatCurrency(item.total)}</strong></span><span><small>Bình quân/người</small><strong>${formatCurrency(item.averagePerMember)}</strong></span></div><div class="home-trip-card__story"><p><strong>Đã trải nghiệm:</strong> ${escapeHtml(categories)}</p><p><strong>Chi phí cao nhất:</strong> ${item.highestExpense ? `${escapeHtml(item.highestExpense.description)} · ${formatCurrency(item.highestExpense.amount)}` : "Chưa có"}</p><p><strong>Ứng nhiều nhất:</strong> ${topPayer ? `${escapeHtml(topPayer.name)} 🙏🙏🙏` : "Chưa có"}</p>${item.plannedCount ? `<p class="planned-note">${item.plannedCount} khoản đang chờ chốt, chưa tính vào tổng.</p>` : ""}</div><details class="home-member-costs"><summary>Chi phí từng người</summary><div>${memberCosts || "Chưa có thành viên"}</div></details><button class="btn btn--soft" type="button" data-open-home-trip="${escapeHtml(trip.id)}">Mở chuyến đi →</button></article>`;
    }).join("") : '<div class="home-empty">Chưa có chuyến đi. Hãy bắt đầu hành trình đầu tiên.</div>';
  }

  function render() {
    const trip = activeTrip();
    portfolio.activeTripId = trip.id;
    dom.tripSelect.innerHTML = portfolio.trips.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${item.members.length} người</option>`).join("");
    dom.tripSelect.value = trip.id;
    dom.tripStatus.textContent = statusLabel(trip.status);
    dom.tripStatus.dataset.status = trip.status;
    dom.tripTitle.textContent = trip.name;
    dom.tripMeta.textContent = [trip.destination || "Chưa có điểm đến", formatDateRange(trip), `${trip.members.length} thành viên`].join(" · ");
    dom.btnShareTrip.textContent = "↗ Chia sẻ";
    renderMembers(); renderPayerOptions(); renderParticipants(); renderExpenses(); renderFund(); renderSummary(); renderStats(); updateSplitEditor(); renderAccount(); renderSheetLink();
    if (currentView === "home") showHome(); else showWorkspace();
  }

  function renderMembers() {
    const trip = activeTrip();
    dom.memberList.innerHTML = trip.members.length ? trip.members.map((member) => {
      const inUse = trip.expenses.some((expense) => expense.payerId === member.id || expense.participantIds.includes(member.id)) || trip.fundTransactions.some((transaction) => transaction.memberId === member.id) || trip.fundKeeperId === member.id;
      const fund = Logic.calculateFundSummary(trip.members, trip.expenses, trip.fundTransactions, trip.fundKeeperId).memberRows[member.id];
      return `<div class="member-item ${editingMemberId === member.id ? "member-item--editing" : ""}"><div><strong>${escapeHtml(member.name)}${trip.fundKeeperId === member.id ? ' <span class="keeper-badge">Giữ quỹ</span>' : ""}</strong><small class="${member.email ? "" : "missing-email"}">${escapeHtml(member.email || "Chưa có email · vẫn dùng được")}</small><small class="member-prepaid">Tổng tạm ứng: <strong>${formatCurrency(fund.totalDeposited)}</strong> · Còn lại: <strong>${formatCurrency(fund.remainingAdvance)}</strong></small></div><div class="member-item__actions"><button class="icon-button" type="button" data-edit-member="${escapeHtml(member.id)}" title="Sửa tên, email hoặc tạm ứng ban đầu" aria-label="Sửa ${escapeHtml(member.name)}">✎</button><button class="icon-button icon-button--danger" type="button" data-remove-member="${escapeHtml(member.id)}" ${inUse ? "disabled" : ""} title="${inUse ? "Đang có dữ liệu chi phí hoặc quỹ" : "Xóa thành viên"}" aria-label="Xóa ${escapeHtml(member.name)}">✕</button></div></div>`;
    }).join("") : '<div class="empty-state">Chưa có thành viên.</div>';
  }

  function renderPayerOptions() {
    const selected = dom.expensePayer.value;
    const members = activeTrip().members;
    dom.expensePayer.innerHTML = members.length ? members.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("") : '<option value="">Hãy thêm thành viên</option>';
    if (members.some((m) => m.id === selected)) dom.expensePayer.value = selected;
    const options = members.length ? members.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("") : '<option value="">Hãy thêm thành viên</option>';
    dom.fundKeeper.innerHTML = options;
    dom.fundTransactionMember.innerHTML = options;
    dom.fundKeeper.value = members.some((member) => member.id === activeTrip().fundKeeperId) ? activeTrip().fundKeeperId : (members[0]?.id || "");
    updateExpensePaymentSource();
  }

  function updateExpensePaymentSource() {
    const fromFund = dom.expensePaymentSource.value === "fund";
    const keeperId = activeTrip().fundKeeperId;
    if (fromFund && keeperId) dom.expensePayer.value = keeperId;
    dom.expensePayer.disabled = fromFund;
    dom.expensePayer.closest(".field")?.classList.toggle("field--readonly", fromFund);
  }

  function renderFund() {
    const trip = activeTrip();
    const fund = Logic.calculateFundSummary(trip.members, trip.expenses, trip.fundTransactions, trip.fundKeeperId);
    dom.fundTotalDeposited.textContent = formatCurrency(fund.totalDeposited);
    dom.fundTotalSpent.textContent = formatCurrency(fund.fundSpent);
    dom.fundTotalRefunded.textContent = formatCurrency(fund.totalRefunded);
    dom.fundBalance.textContent = `${fund.fundBalance < 0 ? "−" : ""}${formatCurrency(Math.abs(fund.fundBalance))}`;
    dom.fundBalanceLabel.textContent = fund.fundBalance < 0 ? "Quỹ đang thiếu" : "Quỹ còn lại";
    dom.fundBalanceCard.classList.toggle("fund-kpi--negative", fund.fundBalance < 0);
    const transactions = [...trip.fundTransactions].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
    dom.fundTransactionList.innerHTML = transactions.length ? transactions.map((transaction) => `<div class="fund-ledger__item"><span class="fund-ledger__type fund-ledger__type--${transaction.type}">${transaction.type === "refund" ? "Hoàn" : "Nạp"}</span><div><strong>${escapeHtml(memberName(transaction.memberId))}</strong><small>${escapeHtml(formatExpenseDateTime(transaction.occurredAt))}${transaction.note ? ` · ${escapeHtml(transaction.note)}` : ""}</small></div><strong class="${transaction.type === "refund" ? "balance-negative" : "balance-positive"}">${transaction.type === "refund" ? "−" : "+"}${formatCurrency(transaction.amount)}</strong><button class="icon-button icon-button--danger" type="button" data-delete-fund-transaction="${escapeHtml(transaction.id)}" title="Xóa giao dịch quỹ">🗑</button></div>`).join("") : '<div class="empty-state">Chưa có lần nạp thêm hoặc hoàn tiền. Tạm ứng ban đầu vẫn được tính trong tổng quỹ.</div>';
  }
  function selectedParticipantIds() { return $$('input[name="participant"]:checked').map((input) => input.value); }
  function renderParticipants(selectedIds) {
    const trip = activeTrip();
    const selected = new Set(selectedIds || selectedParticipantIds().filter((id) => trip.members.some((m) => m.id === id)));
    if (!selectedIds && !selected.size && !editingExpenseId) trip.members.forEach((m) => selected.add(m.id));
    dom.participantList.innerHTML = trip.members.length ? trip.members.map((m) => `<label class="check-card"><input type="checkbox" name="participant" value="${escapeHtml(m.id)}" ${selected.has(m.id) ? "checked" : ""}/><span>${escapeHtml(m.name)}</span></label>`).join("") : '<div class="empty-state">Hãy thêm thành viên trước.</div>';
  }

  function renderExpenses() {
    const keyword = dom.expenseSearch.value.trim().toLocaleLowerCase("vi");
    const expenses = activeTrip().expenses.filter((e) => `${e.description} ${e.category || ""} ${e.note || ""} ${Logic.isExpenseIncluded(e) ? "đang tính" : "kế hoạch"} ${Logic.isFundExpense(e) ? "quỹ" : "cá nhân"}`.toLocaleLowerCase("vi").includes(keyword));
    dom.expenseEmpty.classList.toggle("hidden", !!expenses.length);
    dom.expenseTableBody.innerHTML = expenses.map((e) => { const included = Logic.isExpenseIncluded(e); const source = Logic.isFundExpense(e) ? "Quỹ chuyến đi" : "Cá nhân tự trả"; return `<tr class="${included ? "" : "expense-row--planned"}"><td><label class="expense-toggle"><input type="checkbox" role="switch" data-toggle-expense="${escapeHtml(e.id)}" ${included ? "checked" : ""} aria-label="${included ? "Đang tính" : "Chưa tính"} khoản ${escapeHtml(e.description)}"><span aria-hidden="true"></span><small>${included ? "Đang tính" : "Kế hoạch"}</small></label></td><td><div class="expense-main">${escapeHtml(e.description)}</div><div class="expense-sub">${escapeHtml(e.category || "Khác")}${e.note ? ` · ${escapeHtml(e.note)}` : ""}</div></td><td>${escapeHtml(formatExpenseDateTime(e.date))}</td><td><strong>${escapeHtml(memberName(e.payerId))}</strong><div class="expense-source ${Logic.isFundExpense(e) ? "expense-source--fund" : ""}">${escapeHtml(source)}</div></td><td><div class="pill-group">${e.participantIds.map((id) => `<span class="pill">${escapeHtml(memberName(id))}</span>`).join("")}</div></td><td class="align-right amount">${formatCurrency(e.amount)}</td><td class="align-right per-person"><strong>${formatCurrency(averagePerParticipant(e))}</strong><small>${e.participantIds.length} người</small></td><td><div class="row-actions"><button class="icon-button" type="button" data-edit-expense="${escapeHtml(e.id)}" title="Sửa">✎</button><button class="icon-button icon-button--danger" type="button" data-delete-expense="${escapeHtml(e.id)}" title="Xóa">🗑</button></div></td></tr>`; }).join("");
  }

  function setExpenseIncluded(id, included) {
    const expense = activeTrip().expenses.find((item) => item.id === id);
    if (!expense) return;
    expense.included = Boolean(included);
    savePortfolio(expense.included ? "Đã đưa khoản chi vào quyết toán" : "Đã chuyển khoản chi sang kế hoạch");
    render();
    showToast(expense.included ? `Đã bật tính tiền cho “${expense.description}”.` : `“${expense.description}” chưa được tính vào công nợ.`);
  }

  function renderSummary() {
    const trip = activeTrip();
    const summary = Logic.calculateOutstandingSummary(trip.members, trip.expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId);
    dom.summaryTableBody.innerHTML = trip.members.length ? trip.members.map((m) => {
      const row = summary[m.id];
      const cls = row.balance > 0 ? "balance-positive" : row.balance < 0 ? "balance-negative" : "";
      const hasPayment = row.transferred > 0 || row.received > 0;
      const status = row.balance > 0 ? '<span class="status-badge status-badge--receive">Còn được nhận</span>' : row.balance < 0 ? '<span class="status-badge status-badge--pay">Còn phải trả</span>' : hasPayment ? '<span class="status-badge status-badge--done">Đã thanh toán</span>' : '<span class="status-badge status-badge--done">Đã cân bằng</span>';
      const advanceNote = row.advanceShortfall ? `<small class="advance-shortfall">Thiếu ${formatCurrency(row.advanceShortfall)}</small>` : "";
      return `<tr class="${hasPayment && row.balance === 0 ? "summary-row--settled" : ""}"><td><strong>${escapeHtml(m.name)}</strong>${row.fundHeld ? `<small class="fund-held-note">Đang giữ ${formatCurrency(Math.abs(row.fundHeld))} quỹ</small>` : ""}</td><td class="align-right">${formatCurrency(row.owed)}</td><td class="align-right prepaid-amount">${formatCurrency(row.prepaid)}</td><td class="align-right payment-in">${formatCurrency(row.refunded)}</td><td class="align-right prepaid-remaining">${formatCurrency(row.remainingAdvance)}${advanceNote}</td><td class="align-right">${formatCurrency(row.paid)}</td><td class="align-right payment-out">${formatCurrency(row.transferred)}</td><td class="align-right payment-in">${formatCurrency(row.received)}</td><td class="align-right amount ${cls}">${row.balance > 0 ? "+" : ""}${formatCurrency(row.balance)}</td><td>${status}</td></tr>`;
    }).join("") : '<tr><td colspan="10" class="empty-state">Chưa có thành viên.</td></tr>';
    const transfers = Logic.calculateSettlements(trip.members, trip.expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId);
    dom.settlementList.innerHTML = transfers.length ? transfers.map((t) => `<div class="settlement-item settlement-item--pending"><div class="settlement-person">${escapeHtml(t.fromName)}<small>cần trả</small></div><div class="transfer-arrow"><span>chuyển cho</span><strong>${formatCurrency(t.amount)}</strong><span>→</span></div><div class="settlement-person">${escapeHtml(t.toName)}<small>sẽ nhận</small></div><button class="btn btn--paid" type="button" data-mark-paid="${escapeHtml(t.fromId)}" data-paid-to="${escapeHtml(t.toId)}" data-paid-amount="${t.amount}">✓ Đánh dấu đã trả</button></div>`).join("") : '<div class="empty-state empty-state--success">✓ Không còn khoản tiền nào cần chuyển.</div>';
    const payments = [...trip.payments].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
    dom.paymentHistoryList.innerHTML = payments.length ? payments.map((payment) => `<div class="settlement-item settlement-item--paid"><div class="settlement-person">${escapeHtml(memberName(payment.fromId))}<small>đã trả</small></div><div class="transfer-arrow"><span>${escapeHtml(formatExpenseDateTime(payment.paidAt))}</span><strong>${formatCurrency(payment.amount)}</strong><span>→</span></div><div class="settlement-person">${escapeHtml(memberName(payment.toId))}<small>đã nhận</small></div><button class="link-button link-button--danger" type="button" data-undo-payment="${escapeHtml(payment.id)}">Hoàn tác</button></div>`).join("") : '<div class="empty-state">Chưa có giao dịch nào được đánh dấu đã trả.</div>';
  }
  function renderStats() {
    const trip = activeTrip();
    const included = Logic.includedExpenses(trip.expenses);
    dom.statTotal.textContent = formatCurrency(included.reduce((sum, e) => sum + e.amount, 0));
    dom.statExpenseCount.textContent = included.length === trip.expenses.length ? String(included.length) : `${included.length}/${trip.expenses.length}`;
    dom.statMemberCount.textContent = trip.members.length;
    dom.statTransferCount.textContent = Logic.calculateSettlements(trip.members, trip.expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId).length;
  }

  function selectedSplitMode() { return $('input[name="splitMode"]:checked')?.value || "equal"; }
  function parseCustomShareEntry(rawValue, totalAmount) {
    const text = String(rawValue ?? "").trim();
    if (!text) return { empty: true, valid: true, amount: 0 };
    if (text.endsWith("%")) {
      const percentText = text.slice(0, -1).replace(/\s/g, "").replace(",", ".");
      const percent = Number(percentText);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { empty: false, valid: false, amount: 0 };
      return { empty: false, valid: true, amount: Math.round(totalAmount * percent / 100) };
    }
    if (!/^\d[\d.,\s]*$/.test(text)) return { empty: false, valid: false, amount: 0 };
    return { empty: false, valid: true, amount: parseMoney(text) };
  }
  function getCustomSharePlan() {
    const amount = parseMoney(dom.expenseAmount.value);
    const entries = $$("#customShares input[data-share-member]").map((input) => ({ id: input.dataset.shareMember, input, ...parseCustomShareEntry(input.value, amount) }));
    const invalidEntries = entries.filter((entry) => !entry.valid);
    const explicitTotal = entries.filter((entry) => entry.valid && !entry.empty).reduce((sum, entry) => sum + entry.amount, 0);
    const emptyIds = entries.filter((entry) => entry.valid && entry.empty).map((entry) => entry.id);
    const remaining = amount - explicitTotal;
    const suggestions = remaining >= 0 ? Logic.splitEqual(remaining, emptyIds) : {};
    const shares = Object.fromEntries(entries.map((entry) => [entry.id, entry.empty ? (suggestions[entry.id] || 0) : entry.amount]));
    const allocatedTotal = Object.values(shares).reduce((sum, value) => sum + value, 0);
    return { amount, entries, invalidEntries, explicitTotal, emptyIds, remaining, suggestions, shares, allocatedTotal };
  }
  function updateCustomSuggestions() {
    const plan = getCustomSharePlan();
    plan.entries.forEach((entry) => {
      const suggestion = plan.suggestions[entry.id] || 0;
      entry.input.placeholder = entry.empty && plan.remaining >= 0 ? `Gợi ý ${formatNumber(suggestion)} ₫` : "Nhập số tiền hoặc %";
      entry.input.classList.toggle("custom-share-input--suggested", entry.empty && plan.remaining >= 0);
      entry.input.classList.toggle("custom-share-input--invalid", !entry.valid);
    });
    const output = $("#customTotalValue");
    if (!output) return;
    if (plan.invalidEntries.length) output.textContent = "Có giá trị không hợp lệ";
    else if (plan.remaining < 0) output.textContent = `Vượt ${formatCurrency(Math.abs(plan.remaining))}`;
    else if (plan.emptyIds.length) output.textContent = `Đã nhập ${formatCurrency(plan.explicitTotal)} · tự chia còn lại ${formatCurrency(plan.remaining)} / ${formatCurrency(plan.amount)}`;
    else output.textContent = `Đã phân bổ ${formatCurrency(plan.allocatedTotal)} / ${formatCurrency(plan.amount)}`;
    output.classList.toggle("custom-total--error", !!plan.invalidEntries.length || plan.remaining < 0 || (!plan.emptyIds.length && plan.allocatedTotal !== plan.amount));
  }
  function updateSplitEditor() {
    const mode = selectedSplitMode(), ids = selectedParticipantIds(), amount = parseMoney(dom.expenseAmount.value);
    dom.customShares.classList.toggle("hidden", mode !== "custom"); dom.equalSplitPreview.classList.toggle("hidden", mode !== "equal");
    if (mode === "equal") {
      if (!ids.length || !amount) { dom.equalSplitPreview.textContent = "Nhập tổng tiền và chọn người tham gia để xem phần chia."; return; }
      const values = Object.values(Logic.splitEqual(amount, ids)), min = Math.min(...values), max = Math.max(...values);
      dom.equalSplitPreview.textContent = min === max ? `${ids.length} người × ${formatCurrency(min)}` : `${ids.length} người, khoảng ${formatCurrency(min)}–${formatCurrency(max)} mỗi người.`;
      return;
    }
    const old = Object.fromEntries($$("#customShares input[data-share-member]").map((input) => [input.dataset.shareMember, input.value]));
    dom.customShares.innerHTML = `<p class="custom-guide">Nhập số tiền như <strong>800.000</strong> hoặc tỷ lệ như <strong>80%</strong>. Các ô trống sẽ tự chia đều phần còn lại.</p>` + ids.map((id) => `<div class="custom-share-row"><label>${escapeHtml(memberName(id))}</label><input type="text" inputmode="decimal" data-share-member="${escapeHtml(id)}" value="${escapeHtml(old[id] || "")}" aria-label="Phần chi phí của ${escapeHtml(memberName(id))}" /></div>`).join("") + `<div class="custom-total"><span id="customTotalValue">${formatCurrency(amount)}</span></div>`;
    updateCustomSuggestions();
  }

  function resetExpenseForm() {
    editingExpenseId = null; dom.expenseForm.reset(); dom.expenseDate.value = localDateString(); dom.expenseCategory.value = "Ăn uống";
    dom.expenseFormTitle.textContent = "Thêm khoản chi"; dom.btnSaveExpense.textContent = "Lưu khoản chi"; dom.btnCancelEdit.classList.add("hidden"); dom.expenseError.textContent = "";
    renderPayerOptions(); dom.expensePaymentSource.value = "personal"; updateExpensePaymentSource(); renderParticipants(activeTrip().members.map((m) => m.id)); updateSplitEditor();
  }
  function beginEditExpense(id) {
    const e = activeTrip().expenses.find((item) => item.id === id); if (!e) return;
    editingExpenseId = id; dom.expenseFormTitle.textContent = "Sửa khoản chi"; dom.btnSaveExpense.textContent = "Cập nhật"; dom.btnCancelEdit.classList.remove("hidden");
    dom.expenseDescription.value = e.description; dom.expenseAmount.value = formatNumber(e.amount); dom.expensePaymentSource.value = Logic.isFundExpense(e) ? "fund" : "personal"; dom.expensePayer.value = e.payerId; updateExpensePaymentSource(); dom.expenseDate.value = expenseDateInput(e.date); dom.expenseCategory.value = e.category || "Khác"; dom.expenseNote.value = e.note || "";
    $(`input[name="splitMode"][value="${e.splitMode || "equal"}"]`).checked = true; renderParticipants(e.participantIds); updateSplitEditor();
    if (e.splitMode === "custom") Object.entries(e.customShares || {}).forEach(([id2, value]) => { const input = $(`#customShares input[data-share-member="${CSS.escape(id2)}"]`); if (input) input.value = Number(value) > 0 ? formatNumber(value) : ""; });
    updateCustomSuggestions(); dom.expenseForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function validateExpense() {
    const data = { description: dom.expenseDescription.value.trim(), amount: parseMoney(dom.expenseAmount.value), payerId: dom.expensePayer.value, paymentSource: dom.expensePaymentSource.value === "fund" ? "fund" : "personal", participantIds: selectedParticipantIds(), splitMode: selectedSplitMode(), customShares: {}, date: dom.expenseDate.value, category: dom.expenseCategory.value, note: dom.expenseNote.value.trim() };
    if (!data.description) return { message: "Vui lòng nhập nội dung khoản chi." }; if (!data.amount) return { message: "Tổng tiền phải lớn hơn 0." };
    if (!activeTrip().members.some((m) => m.id === data.payerId)) return { message: data.paymentSource === "fund" ? "Hãy chọn người giữ quỹ trước." : "Vui lòng chọn người trả." }; if (!data.participantIds.length) return { message: "Chọn ít nhất một người tham gia." };
    if (data.splitMode === "custom") {
      const plan = getCustomSharePlan();
      if (plan.invalidEntries.length) return { message: "Chỉ nhập số tiền hoặc tỷ lệ từ 0% đến 100%." };
      if (plan.remaining < 0) return { message: `Phần đã nhập vượt tổng tiền ${formatCurrency(Math.abs(plan.remaining))}.` };
      if (!plan.emptyIds.length && plan.allocatedTotal !== data.amount) return { message: `Tổng phần chia ${formatCurrency(plan.allocatedTotal)} phải bằng ${formatCurrency(data.amount)}.` };
      data.customShares = plan.shares;
    }
    return { data };
  }

  function openTripDialog(trip = null) {
    dom.tripDialogTitle.textContent = trip ? "Sửa chuyến đi" : "Tạo chuyến đi mới"; dom.tripId.value = trip?.id || ""; dom.tripName.value = trip?.name || ""; dom.tripDestination.value = trip?.destination || ""; dom.tripStartDate.value = trip?.startDate || ""; dom.tripEndDate.value = trip?.endDate || ""; dom.tripStatusInput.value = trip?.status || "planning"; dom.tripError.textContent = ""; dom.tripDialog.showModal(); dom.tripName.focus();
  }
  function saveTripFromDialog() {
    const name = dom.tripName.value.trim(), startDate = dom.tripStartDate.value, endDate = dom.tripEndDate.value;
    if (!name) { dom.tripError.textContent = "Vui lòng nhập tên chuyến đi."; return; }
    if (startDate && endDate && startDate > endDate) { dom.tripError.textContent = "Ngày kết thúc không thể trước ngày bắt đầu."; return; }
    const existing = portfolio.trips.find((t) => t.id === dom.tripId.value);
    if (existing) Object.assign(existing, { name, destination: dom.tripDestination.value.trim(), startDate, endDate, status: dom.tripStatusInput.value, updatedAt: now() });
    else { const trip = makeTrip({ name, destination: dom.tripDestination.value.trim(), startDate, endDate, status: dom.tripStatusInput.value }); portfolio.trips.unshift(trip); portfolio.activeTripId = trip.id; }
    dom.tripDialog.close(); editingExpenseId = null; savePortfolio(); resetExpenseForm(); render(); showToast(existing ? "Đã cập nhật chuyến đi." : "Đã tạo chuyến đi mới.");
  }

  function resetMemberForm() {
    editingMemberId = null;
    dom.memberForm.reset();
    dom.memberError.textContent = "";
    dom.btnSaveMember.textContent = "Thêm thành viên";
    dom.btnCancelMemberEdit.classList.add("hidden");
  }

  function beginEditMember(id) {
    const member = activeTrip().members.find((item) => item.id === id);
    if (!member) return;
    editingMemberId = id;
    dom.memberName.value = member.name;
    dom.memberEmail.value = member.email || "";
    dom.memberPrepaidAmount.value = member.prepaidAmount ? formatNumber(member.prepaidAmount) : "";
    dom.memberError.textContent = "";
    dom.btnSaveMember.textContent = "Cập nhật thông tin";
    dom.btnCancelMemberEdit.classList.remove("hidden");
    renderMembers();
    dom.memberEmail.focus();
  }

  function saveMember() {
    const trip = activeTrip(), name = dom.memberName.value.trim().replace(/\s+/g, " "), email = dom.memberEmail.value.trim().toLowerCase(), prepaidAmount = parseMoney(dom.memberPrepaidAmount.value);
    if (!name) { dom.memberError.textContent = "Vui lòng nhập tên thành viên."; return; }
    if (email && !validEmail(email)) { dom.memberError.textContent = "Email không đúng định dạng."; return; }
    if (trip.members.some((m) => m.id !== editingMemberId && m.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) { dom.memberError.textContent = "Tên thành viên đã tồn tại trong trip này."; return; }
    if (email && trip.members.some((m) => m.id !== editingMemberId && m.email === email)) { dom.memberError.textContent = "Email đã thuộc một thành viên trong trip này."; return; }
    const existing = trip.members.find((m) => m.id === editingMemberId);
    if (existing) {
      const memberTransactions = trip.fundTransactions.filter((item) => item.memberId === existing.id);
      const extraDeposits = memberTransactions.filter((item) => item.type === "deposit").reduce((sum, item) => sum + item.amount, 0);
      const refunded = memberTransactions.filter((item) => item.type === "refund").reduce((sum, item) => sum + item.amount, 0);
      if (prepaidAmount + extraDeposits < refunded) { dom.memberError.textContent = `Tạm ứng ban đầu không thể thấp đến mức tổng đã hoàn ${formatCurrency(refunded)} vượt tổng đã nạp.`; return; }
      existing.name = name;
      existing.email = email;
      existing.prepaidAmount = prepaidAmount;
    } else {
      trip.members.push({ id: uid("member"), name, email, prepaidAmount });
    }
    resetMemberForm(); savePortfolio(); render(); showToast(existing ? `Đã cập nhật thông tin ${name}.` : `Đã thêm ${name}.`);
  }
  function removeMember(id) {
    const trip = activeTrip(), member = trip.members.find((m) => m.id === id); if (!member) return;
    if (trip.expenses.some((e) => e.payerId === id || e.participantIds.includes(id)) || trip.fundTransactions.some((transaction) => transaction.memberId === id) || trip.fundKeeperId === id) { showToast("Không thể xóa thành viên đang có dữ liệu chi phí hoặc quỹ."); return; }
    trip.members = trip.members.filter((m) => m.id !== id); if (editingMemberId === id) resetMemberForm(); savePortfolio(); render();
  }

  function saveFundTransaction() {
    const trip = activeTrip();
    const memberId = dom.fundTransactionMember.value;
    const type = dom.fundTransactionType.value === "refund" ? "refund" : "deposit";
    const amount = parseMoney(dom.fundTransactionAmount.value);
    const note = dom.fundTransactionNote.value.trim();
    dom.fundError.textContent = "";
    if (!trip.members.some((member) => member.id === memberId)) { dom.fundError.textContent = "Hãy chọn thành viên."; return; }
    if (!amount) { dom.fundError.textContent = "Số tiền phải lớn hơn 0."; return; }
    if (type === "refund") {
      const fund = Logic.calculateFundSummary(trip.members, trip.expenses, trip.fundTransactions, trip.fundKeeperId);
      const memberFund = fund.memberRows[memberId];
      if (amount > memberFund.remainingAdvance) { dom.fundError.textContent = `Thành viên chỉ còn ${formatCurrency(memberFund.remainingAdvance)} tạm ứng chưa sử dụng.`; return; }
      if (amount > Math.max(0, fund.fundBalance)) { dom.fundError.textContent = `Quỹ hiện chỉ còn ${formatCurrency(Math.max(0, fund.fundBalance))}.`; return; }
    }
    trip.fundTransactions.push({ id: uid("fund"), memberId, type, amount, note, occurredAt: now() });
    dom.fundTransactionForm.reset();
    savePortfolio(type === "refund" ? "Đã ghi nhận hoàn quỹ" : "Đã ghi nhận nạp quỹ");
    render();
    showToast(type === "refund" ? "Đã ghi nhận tiền hoàn cho thành viên." : "Đã cộng tiền nạp thêm vào quỹ.");
  }

  function deleteFundTransaction(id) {
    const trip = activeTrip();
    const transaction = trip.fundTransactions.find((item) => item.id === id);
    if (!transaction || !confirm("Xóa giao dịch quỹ này và tính lại toàn bộ đối soát?")) return;
    trip.fundTransactions = trip.fundTransactions.filter((item) => item.id !== id);
    savePortfolio("Đã xóa giao dịch quỹ"); render(); showToast("Đã xóa và tính lại số dư quỹ.");
  }

  function download(filename, content, mime) { const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
  function safeFilename(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "trip"; }
  function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
  function buildSheetPayload() {
    const trip = activeTrip(), fund = Logic.calculateFundSummary(trip.members, trip.expenses, trip.fundTransactions, trip.fundKeeperId), summary = Logic.calculateOutstandingSummary(trip.members, trip.expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId), settlements = Logic.calculateSettlements(trip.members, trip.expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId);
    const payments = trip.payments.map((payment) => ({ ...payment, fromName: memberName(payment.fromId), toName: memberName(payment.toId) }));
    return { version: 4, trip: { id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, status: statusLabel(trip.status), members: trip.members, fundKeeperId: trip.fundKeeperId, fundKeeperName: memberName(trip.fundKeeperId), fundTransactions: trip.fundTransactions.map((item) => ({ ...item, memberName: memberName(item.memberId) })), expenses: trip.expenses.map((e) => ({ ...e, included: Logic.isExpenseIncluded(e), paymentSource: Logic.isFundExpense(e) ? "fund" : "personal", paymentSourceLabel: Logic.isFundExpense(e) ? "Quỹ chuyến đi" : "Cá nhân tự trả", averagePerPerson: averagePerParticipant(e), payerName: memberName(e.payerId), participantNames: e.participantIds.map(memberName), shares: Logic.getExpenseShares(e) })) }, fund, summary: trip.members.map((m) => ({ ...summary[m.id], email: m.email || "" })), settlements, payments, generatedAt: now() };
  }
  function exportCsv() {
    const payload = buildSheetPayload(), rows = [["CHUYẾN ĐI", payload.trip.name], ["Điểm đến", payload.trip.destination], ["Thời gian", formatDateRange(activeTrip())], ["Người giữ quỹ", payload.trip.fundKeeperName], ["Tổng đã nạp", payload.fund.totalDeposited], ["Chi từ quỹ", payload.fund.fundSpent], ["Đã hoàn", payload.fund.totalRefunded], ["Quỹ còn lại", payload.fund.fundBalance], [], ["CHI PHÍ"], ["Quyết toán", "Nội dung", "Ngày & giờ", "Nhóm", "Nguồn tiền", "Tổng tiền", "Tổng tiền/người", "Người trả/giữ quỹ", "Người tham gia", "Cách chia", "Ghi chú"]];
    payload.trip.expenses.forEach((e) => rows.push([e.included ? "Đang tính" : "Kế hoạch - chưa tính", e.description, e.date, e.category, e.paymentSourceLabel, e.amount, e.averagePerPerson, e.payerName, e.participantNames.join(", "), e.splitMode === "custom" ? "Tùy chỉnh" : "Chia đều", e.note]));
    rows.push([], ["SỔ QUỸ"], ["Thời gian", "Thành viên", "Loại", "Số tiền", "Ghi chú"]); payload.trip.fundTransactions.forEach((r) => rows.push([r.occurredAt, r.memberName, r.type === "refund" ? "Hoàn" : "Nạp", r.amount, r.note]));
    rows.push([], ["ĐỐI SOÁT"], ["Thành viên", "Email", "Phải chịu", "Tổng tạm ứng", "Đã hoàn", "Còn lại tạm ứng", "Đã ứng cá nhân", "Đã chuyển", "Đã nhận", "Quyết toán"]); payload.summary.forEach((r) => rows.push([r.name, r.email, r.owed, r.prepaid, r.refunded, r.remainingAdvance, r.paid, r.transferred, r.received, r.balance]));
    rows.push([], ["CÔNG NỢ CHƯA THANH TOÁN"], ["Người cần trả", "Người cần nhận", "Số tiền", "Trạng thái"]); payload.settlements.forEach((r) => rows.push([r.fromName, r.toName, r.amount, "Chưa thanh toán"]));
    rows.push([], ["LỊCH SỬ ĐÃ THANH TOÁN"], ["Người trả", "Người nhận", "Số tiền", "Thời gian"]); payload.payments.forEach((r) => rows.push([r.fromName, r.toName, r.amount, r.paidAt]));
    download(`${safeFilename(payload.trip.name)}.csv`, "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  function reportBalanceStatus(row) {
    if (row.balance < 0) return { label: "Còn phải trả", className: "status-pay" };
    if (row.balance > 0) return { label: "Còn được nhận", className: "status-receive" };
    return { label: row.transferred || row.received ? "Đã thanh toán" : "Đã cân bằng", className: "status-done" };
  }

  function buildPdfReport() {
    const trip = activeTrip();
    const model = Report.buildModel(trip, Logic);
    const { summary, settlements, fund, totalExpense, totalPrepaid, totalOutstanding, collectedDifference, plannedTotal } = model;
    const generatedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short" }).format(new Date());
    const summaryRows = trip.members.map((member) => {
      const row = summary[member.id];
      const status = reportBalanceStatus(row);
      return `<tr><td><strong>${escapeHtml(member.name)}</strong>${member.email ? `<br><small>${escapeHtml(member.email)}</small>` : ""}</td><td class="num">${formatCurrency(row.prepaid)}</td><td class="num">${formatCurrency(row.refunded)}</td><td class="num">${formatCurrency(row.remainingAdvance)}</td><td class="num">${formatCurrency(row.owed)}</td><td class="num">${formatCurrency(row.paid)}</td><td class="num ${status.className}">${row.balance > 0 ? "+" : ""}${formatCurrency(row.balance)}</td><td class="${status.className}">${status.label}</td></tr>`;
    }).join("");
    const settlementRows = settlements.map((item, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.fromName)}</strong></td><td>chuyển cho</td><td><strong>${escapeHtml(item.toName)}</strong></td><td class="num status-pay">${formatCurrency(item.amount)}</td><td>Chưa thanh toán</td></tr>`).join("");
    const expenseRows = [...model.includedExpenses].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(formatExpenseDateTime(item.date))}</td><td><strong>${escapeHtml(item.description)}</strong>${item.note ? `<br><small>${escapeHtml(item.note)}</small>` : ""}</td><td>${escapeHtml(item.category || "Khác")}</td><td>${Logic.isFundExpense(item) ? "Quỹ chuyến đi" : `Cá nhân · ${escapeHtml(memberName(item.payerId))}`}</td><td>${escapeHtml(item.participantIds.map(memberName).join(", "))}</td><td class="num"><strong>${formatCurrency(item.amount)}</strong><br><small>${formatCurrency(averagePerParticipant(item))}/người</small></td></tr>`).join("");
    const plannedRows = [...model.plannedExpenses].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(formatExpenseDateTime(item.date))}</td><td><strong>${escapeHtml(item.description)}</strong>${item.note ? `<br><small>${escapeHtml(item.note)}</small>` : ""}</td><td>${escapeHtml(item.category || "Khác")}</td><td>${escapeHtml(memberName(item.payerId))}</td><td class="num">${formatCurrency(item.amount)}</td><td>Chưa tính</td></tr>`).join("");
    const paymentRows = [...trip.payments].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(formatExpenseDateTime(item.paidAt))}</td><td>${escapeHtml(memberName(item.fromId))}</td><td>${escapeHtml(memberName(item.toId))}</td><td class="num status-done">${formatCurrency(item.amount)}</td><td>Đã thanh toán</td></tr>`).join("");
    const fundRows = [...trip.fundTransactions].sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt))).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(formatExpenseDateTime(item.occurredAt))}</td><td>${escapeHtml(memberName(item.memberId))}</td><td>${item.type === "refund" ? "Hoàn tiền" : "Nạp thêm"}</td><td class="num ${item.type === "refund" ? "status-pay" : "status-receive"}">${item.type === "refund" ? "−" : "+"}${formatCurrency(item.amount)}</td><td>${escapeHtml(item.note || "")}</td></tr>`).join("");

    return `<header class="pdf-report__header"><div><div class="pdf-report__brand">✈ TripSplit · Báo cáo thu chi</div><h1>${escapeHtml(trip.name)}</h1><div class="pdf-report__meta">${escapeHtml(trip.destination || "Chưa cập nhật điểm đến")} · ${escapeHtml(formatDateRange(trip))} · ${escapeHtml(statusLabel(trip.status))}<br>${trip.members.length} thành viên · ${model.includedExpenses.length} khoản đã chốt · ${model.plannedExpenses.length} khoản kế hoạch</div></div><div class="pdf-report__generated">Ngày lập báo cáo<br><strong>${escapeHtml(generatedAt)}</strong></div></header>
      <section class="pdf-report__stats"><div class="pdf-report__stat pdf-report__stat--income"><span>Tổng tiền đã nạp</span><strong>${formatCurrency(totalPrepaid)}</strong></div><div class="pdf-report__stat pdf-report__stat--expense"><span>Chi phí đã chốt</span><strong>${formatCurrency(totalExpense)}</strong></div><div class="pdf-report__stat"><span>Chi từ quỹ</span><strong>${formatCurrency(fund.fundSpent)}</strong></div><div class="pdf-report__stat"><span>Đã hoàn thành viên</span><strong>${formatCurrency(fund.totalRefunded)}</strong></div><div class="pdf-report__stat ${collectedDifference < 0 ? "pdf-report__stat--debt" : "pdf-report__stat--income"}"><span>${collectedDifference < 0 ? "Quỹ đang thiếu" : "Quỹ còn lại"}</span><strong>${formatCurrency(Math.abs(collectedDifference))}</strong></div><div class="pdf-report__stat"><span>Chi phí kế hoạch</span><strong>${formatCurrency(plannedTotal)}</strong></div><div class="pdf-report__stat pdf-report__stat--debt"><span>Công nợ còn lại</span><strong>${formatCurrency(totalOutstanding)}</strong></div></section>
      <section class="pdf-report__section"><h2>1. Đối soát theo thành viên</h2><p class="pdf-report__section-note">Tổng tạm ứng gồm tiền ban đầu và các lần nạp thêm. “Còn lại tạm ứng” là số tiền chưa sử dụng và chưa hoàn của từng người.</p>${summaryRows ? `<table><thead><tr><th>Thành viên</th><th class="num">Tổng tạm ứng</th><th class="num">Đã hoàn</th><th class="num">Còn tạm ứng</th><th class="num">Phải chịu</th><th class="num">Ứng cá nhân</th><th class="num">Quyết toán</th><th>Trạng thái</th></tr></thead><tbody>${summaryRows}</tbody></table>` : '<div class="pdf-report__empty">Chưa có thành viên.</div>'}</section>
      <section class="pdf-report__section"><h2>2. Ai còn nợ ai?</h2>${settlementRows ? `<table><thead><tr><th>STT</th><th>Người cần trả</th><th></th><th>Người cần nhận</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>${settlementRows}</tbody></table>` : '<div class="pdf-report__empty">✓ Chuyến đi hiện không còn giao dịch cần thanh toán.</div>'}</section>
      <section class="pdf-report__section"><h2>3. Sổ quỹ chuyến đi</h2><p class="pdf-report__section-note">Người giữ quỹ: <strong>${escapeHtml(memberName(trip.fundKeeperId))}</strong>.</p>${fundRows ? `<table><thead><tr><th>STT</th><th>Thời gian</th><th>Thành viên</th><th>Loại</th><th class="num">Số tiền</th><th>Ghi chú</th></tr></thead><tbody>${fundRows}</tbody></table>` : '<div class="pdf-report__empty">Chưa có lần nạp thêm hoặc hoàn tiền.</div>'}</section>
      <section class="pdf-report__section"><h2>4. Chi tiết chi phí đã chốt</h2>${expenseRows ? `<table><thead><tr><th>STT</th><th>Ngày & giờ</th><th>Nội dung</th><th>Nhóm</th><th>Nguồn tiền</th><th>Người tham gia</th><th class="num">Số tiền</th></tr></thead><tbody>${expenseRows}</tbody></table>` : '<div class="pdf-report__empty">Chưa có khoản chi được bật quyết toán.</div>'}</section>
      <section class="pdf-report__section"><h2>5. Chi phí kế hoạch chưa tính</h2>${plannedRows ? `<table><thead><tr><th>STT</th><th>Ngày & giờ</th><th>Nội dung</th><th>Nhóm</th><th>Người dự kiến trả</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>${plannedRows}</tbody></table>` : '<div class="pdf-report__empty">Không có khoản kế hoạch đang tắt.</div>'}</section>
      <section class="pdf-report__section"><h2>6. Lịch sử đã thanh toán</h2>${paymentRows ? `<table><thead><tr><th>STT</th><th>Thời gian</th><th>Người trả</th><th>Người nhận</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>${paymentRows}</tbody></table>` : '<div class="pdf-report__empty">Chưa có giao dịch được đánh dấu đã thanh toán.</div>'}</section>
      <section class="pdf-report__section"><h2>7. Lưu ý cách đọc báo cáo</h2><div class="pdf-report__notes"><ul><li>“Tổng tiền đã nạp” gồm tạm ứng ban đầu và toàn bộ lần nạp thêm, chưa trừ tiền đã hoàn.</li><li>Khoản chi chọn “Quỹ chuyến đi” làm giảm tiền mặt người giữ quỹ; khoản “Cá nhân tự trả” tạo quyền được nhận lại cho người trực tiếp trả.</li><li>“Còn lại tạm ứng” là phần nạp quỹ chưa dùng và chưa hoàn của từng thành viên; tổng có thể khác số tiền cuối cùng cần chuyển nếu có chi cá nhân.</li><li>“Chi phí kế hoạch” chỉ để tham khảo và không tham gia tổng chi, quỹ hay công nợ.</li><li>Số quyết toán âm nghĩa là còn phải trả; số dương nghĩa là còn được nhận.</li></ul></div></section>
      <footer class="pdf-report__footer">Báo cáo được tạo tự động bởi TripSplit · Vui lòng đối chiếu chứng từ trước khi quyết toán.</footer>`;
  }

  function openPdfPreview() {
    dom.pdfReport.innerHTML = buildPdfReport();
    if (!dom.pdfPreviewDialog.open) dom.pdfPreviewDialog.showModal();
  }

  function closePdfPreview() {
    if (dom.pdfPreviewDialog.open) dom.pdfPreviewDialog.close();
  }

  function printPdfReport() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { showToast("Trình duyệt đang chặn cửa sổ lưu PDF. Hãy cho phép popup rồi thử lại."); return; }
    printWindow.opener = null;
    const stylesheetUrl = new URL("styles.css?v=17", window.location.href).toString();
    const title = `Bao-cao-thu-chi-${safeFilename(activeTrip().name)}`;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${escapeHtml(stylesheetUrl)}"><style>@page{size:A4;margin:12mm}html,body{margin:0!important;background:#fff!important}.pdf-report{width:auto!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important}.pdf-report__section{break-inside:auto}.pdf-report tr,.pdf-report__stat,.pdf-report__notes{break-inside:avoid}.pdf-report__footer{margin-top:18px}</style></head><body><article class="pdf-report">${dom.pdfReport.innerHTML}</article></body></html>`);
    printWindow.document.close();
    const triggerPrint = () => { printWindow.focus(); setTimeout(() => printWindow.print(), 250); };
    if (printWindow.document.readyState === "complete") triggerPrint();
    else printWindow.addEventListener("load", triggerPrint, { once: true });
  }
  function setSheetStatus(state, title, message) {
    dom.sheetStatus.dataset.state = state;
    dom.sheetStatusTitle.textContent = title;
    dom.sheetStatusText.textContent = message;
  }
  function savedSheetLinks() {
    try { return JSON.parse(localStorage.getItem(SHEET_LINKS_KEY)) || {}; } catch { return {}; }
  }
  function renderSheetLink() {
    const url = savedSheetLinks()[activeTrip().id];
    dom.btnOpenSheet.classList.toggle("hidden", !url);
    dom.btnOpenSheet.href = url || "#";
  }
  function setSheetBusy(busy) {
    dom.btnCheckAppsScript.disabled = busy;
    dom.btnShareSheet.disabled = busy;
  }
  function sheetConfig(requireSecret = false) {
    const scriptUrl = dom.appsScriptUrl.value.trim();
    const secret = dom.appsScriptSecret.value.trim();
    dom.sheetError.textContent = "";
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(scriptUrl)) {
      throw new Error("Web App URL không hợp lệ. Hãy dùng URL /exec từ deployment mới nhất.");
    }
    if (requireSecret && !secret) throw new Error("Hãy nhập mã bí mật khớp với TRIPSPLIT_SECRET.");
    localStorage.setItem(SCRIPT_URL_KEY, scriptUrl);
    if (secret) localStorage.setItem(SCRIPT_SECRET_KEY, secret);
    return { scriptUrl, secret };
  }
  async function callSheetBridge(action) {
    const config = sheetConfig(action === "sync");
    const response = await authFetch("/api/google-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...config, payload: action === "sync" ? buildSheetPayload() : undefined }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Không thể kết nối Google Sheet.");
    return result;
  }
  async function checkAppsScript() {
    setSheetBusy(true);
    setSheetStatus("checking", "Đang kiểm tra kết nối", "TripSplit đang xác minh URL và quyền truy cập Apps Script…");
    try {
      const result = await callSheetBridge("check");
      setSheetStatus("success", "Kết nối hoạt động", result.message || "Apps Script sẵn sàng nhận dữ liệu.");
      showToast("Kết nối Google Apps Script thành công.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể kiểm tra Apps Script.";
      dom.sheetError.textContent = message;
      setSheetStatus("error", "Kết nối chưa sẵn sàng", message);
    } finally { setSheetBusy(false); }
  }
  async function shareSheet() {
    if (!activeTrip().members.length) { dom.sheetError.textContent = "Trip chưa có thành viên."; return; }
    setSheetBusy(true);
    setSheetStatus("checking", "Đang cập nhật Google Sheet", "Vui lòng giữ trang mở trong khi tạo báo cáo và cấp quyền thành viên…");
    try {
      const result = await callSheetBridge("sync");
      if (result.sheetUrl) {
        const links = savedSheetLinks();
        links[activeTrip().id] = result.sheetUrl;
        localStorage.setItem(SHEET_LINKS_KEY, JSON.stringify(links));
        renderSheetLink();
      }
      const failedCount = Array.isArray(result.failedEmails) ? result.failedEmails.length : 0;
      const detail = failedCount
        ? `Sheet đã cập nhật, nhưng ${failedCount} email chưa được cấp quyền. Bạn có thể mở Sheet và chia sẻ thủ công.`
        : result.message || "Sheet đã được cập nhật và chia sẻ thành công.";
      setSheetStatus("success", "Google Sheet đã sẵn sàng", detail);
      showToast("Đã tạo/cập nhật Google Sheet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể tạo Google Sheet.";
      dom.sheetError.textContent = message;
      setSheetStatus("error", "Không thể cập nhật Sheet", message);
    } finally { setSheetBusy(false); }
  }
  function markSettlementPaid(fromId, toId, amount) {
    const trip = activeTrip(), value = Logic.toSafeInteger(amount);
    const from = memberName(fromId), to = memberName(toId);
    if (!value || !confirm(`Xác nhận ${from} đã chuyển ${formatCurrency(value)} cho ${to}?`)) return;
    trip.payments.push({ id: uid("payment"), fromId, toId, amount: value, paidAt: now() });
    savePortfolio("Đã ghi nhận thanh toán"); render(); showToast(`Đã đánh dấu ${from} thanh toán cho ${to}.`);
  }
  function undoPayment(paymentId) {
    const trip = activeTrip(), payment = trip.payments.find((item) => item.id === paymentId);
    if (!payment || !confirm("Hoàn tác giao dịch đã thanh toán này?")) return;
    trip.payments = trip.payments.filter((item) => item.id !== paymentId);
    savePortfolio("Đã hoàn tác thanh toán"); render(); showToast("Đã hoàn tác và tính lại công nợ.");
  }
  async function generateAppsScriptSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const secret = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    dom.appsScriptSecret.value = secret;
    localStorage.setItem(SCRIPT_SECRET_KEY, secret);
    await copyText(secret);
    dom.appsScriptSecret.type = "text";
    dom.appsScriptSecret.select();
    showToast("Đã tạo và sao chép mã bí mật. Dán mã này vào TRIPSPLIT_SECRET.");
  }
  function importJson(file) {
    const reader = new FileReader(); reader.onload = () => { try { const candidate = JSON.parse(String(reader.result)); let next; if (Logic.validatePortfolio(candidate).valid) next = normalizePortfolio(candidate); else if (Logic.validateState(candidate).valid) next = migrateLegacy(candidate); else throw new Error("Cấu trúc dữ liệu không hợp lệ."); portfolio = next; savePortfolio("Đã khôi phục dữ liệu"); editingExpenseId = null; resetExpenseForm(); render(); showToast("Khôi phục dữ liệu thành công."); } catch (error) { showToast(`Không thể nhập file: ${error.message}`); } finally { dom.fileImportJson.value = ""; } }; reader.readAsText(file);
  }

  function firebaseErrorMessage(error) {
    const code = String(error?.code || "");
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email hoặc mật khẩu chưa đúng.";
    if (code.includes("email-already-in-use")) return "Email này đã có tài khoản. Hãy chọn Đăng nhập.";
    if (code.includes("weak-password")) return "Mật khẩu cần có ít nhất 6 ký tự.";
    if (code.includes("invalid-email")) return "Địa chỉ email chưa hợp lệ.";
    if (code.includes("popup-closed-by-user")) return "Cửa sổ đăng nhập Google đã được đóng.";
    if (code.includes("popup-blocked")) return "Trình duyệt đang chặn cửa sổ đăng nhập Google.";
    if (code.includes("unauthorized-domain")) return "Tên miền này chưa được cho phép trong Firebase Authentication.";
    if (code.includes("too-many-requests")) return "Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.";
    return error instanceof Error ? error.message : "Không thể đăng nhập. Vui lòng thử lại.";
  }
  function setAuthBusy(busy) {
    dom.authDialog.dataset.busy = busy ? "true" : "false";
    [dom.btnGoogleSignIn, dom.btnEmailSignIn, dom.btnEmailSignUp, dom.btnResetPassword].forEach((button) => { button.disabled = busy; });
  }
  function openAuthDialog() {
    dom.authError.textContent = "";
    dom.authDialog.showModal();
    setTimeout(() => dom.authEmail.focus(), 0);
  }
  async function runAuthAction(action, successMessage) {
    setAuthBusy(true);
    dom.authError.textContent = "";
    try {
      await action(await firebaseAuthClient());
      dom.authDialog.close();
      showToast(successMessage);
    } catch (error) {
      dom.authError.textContent = firebaseErrorMessage(error);
    } finally { setAuthBusy(false); }
  }
  async function initializeAccountAuth() {
    try {
      const auth = await firebaseAuthClient();
      await auth.waitUntilReady();
      await loadAccountTrips();
      auth.onChange(() => { loadAccountTrips(); });
    } catch {
      await loadAccountTrips();
    }
  }

  dom.tripSelect.addEventListener("change", () => { closeShareMenu(); portfolio.activeTripId = dom.tripSelect.value; editingExpenseId = null; resetMemberForm(); localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); resetExpenseForm(); render(); setSharedUrl(activeTrip().shareId || ""); });
  dom.btnSignIn.addEventListener("click", openAuthDialog);
  dom.btnCloseAuthDialog.addEventListener("click", () => dom.authDialog.close());
  dom.authDialog.addEventListener("click", (event) => { if (event.target === dom.authDialog) dom.authDialog.close(); });
  dom.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runAuthAction((auth) => auth.signInWithEmail(dom.authEmail.value.trim(), dom.authPassword.value), "Đăng nhập thành công.");
  });
  dom.btnEmailSignUp.addEventListener("click", () => {
    if (!dom.authForm.reportValidity()) return;
    runAuthAction((auth) => auth.createAccount(dom.authEmail.value.trim(), dom.authPassword.value, dom.authDisplayName.value.trim()), "Tạo tài khoản thành công.");
  });
  dom.btnGoogleSignIn.addEventListener("click", () => runAuthAction((auth) => auth.signInWithGoogle(), "Đăng nhập Google thành công."));
  dom.btnResetPassword.addEventListener("click", () => {
    const email = dom.authEmail.value.trim();
    if (!validEmail(email)) { dom.authError.textContent = "Hãy nhập email hợp lệ để nhận liên kết đặt lại mật khẩu."; return; }
    runAuthAction((auth) => auth.resetPassword(email), "Đã gửi email đặt lại mật khẩu.");
  });
  dom.btnSignOut.addEventListener("click", async () => {
    try { const auth = await firebaseAuthClient(); await auth.signOut(); showToast("Đã đăng xuất."); }
    catch (error) { showToast(firebaseErrorMessage(error)); }
  });
  dom.btnHome.addEventListener("click", showHome);
  dom.btnOpenCurrentTrip.addEventListener("click", showWorkspace);
  dom.btnHomeNewTrip.addEventListener("click", () => openTripDialog());
  dom.homePeriod.addEventListener("change", renderHome);
  dom.homeTripList.addEventListener("click", (event) => { const button = event.target.closest("[data-open-home-trip]"); if (!button) return; const trip = portfolio.trips.find((item) => item.id === button.dataset.openHomeTrip); if (!trip) return; portfolio.activeTripId = trip.id; localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); render(); showWorkspace(); setSharedUrl(trip.shareId || ""); });
  dom.btnNewTrip.addEventListener("click", () => openTripDialog()); dom.btnEditTrip.addEventListener("click", () => openTripDialog(activeTrip()));
  dom.btnShareTrip.addEventListener("click", openShareMenu);
  dom.shareMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-share-action]");
    if (button && !button.disabled) runShareAction(button.dataset.shareAction);
  });
  document.addEventListener("click", (event) => {
    if (!dom.shareMenu.classList.contains("hidden") && !dom.shareControl.contains(event.target)) closeShareMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.shareMenu.classList.contains("hidden")) closeShareMenu(true);
  });
  dom.btnDeleteTrip.addEventListener("click", () => { if (portfolio.trips.length === 1) { showToast("Cần giữ lại ít nhất một chuyến đi."); return; } const trip = activeTrip(); if (!confirm(`Xóa toàn bộ dữ liệu của “${trip.name}” khỏi thiết bị này?`)) return; portfolio.trips = portfolio.trips.filter((t) => t.id !== trip.id); portfolio.activeTripId = portfolio.trips[0].id; resetMemberForm(); localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); resetExpenseForm(); render(); setSharedUrl(activeTrip().shareId || ""); showToast("Đã xóa chuyến đi khỏi thiết bị này."); });
  dom.tripForm.addEventListener("submit", (event) => { event.preventDefault(); saveTripFromDialog(); }); [dom.btnCloseTripDialog, dom.btnCancelTrip].forEach((button) => button.addEventListener("click", () => dom.tripDialog.close()));
  dom.memberForm.addEventListener("submit", (event) => { event.preventDefault(); saveMember(); }); dom.memberPrepaidAmount.addEventListener("input", () => { const value = parseMoney(dom.memberPrepaidAmount.value); dom.memberPrepaidAmount.value = value ? formatNumber(value) : ""; }); dom.btnCancelMemberEdit.addEventListener("click", () => { resetMemberForm(); renderMembers(); }); dom.memberList.addEventListener("click", (event) => { const editButton = event.target.closest("[data-edit-member]"), removeButton = event.target.closest("[data-remove-member]"); if (editButton) beginEditMember(editButton.dataset.editMember); if (removeButton) removeMember(removeButton.dataset.removeMember); });
  dom.fundKeeper.addEventListener("change", () => { const trip = activeTrip(); if (!trip.members.some((member) => member.id === dom.fundKeeper.value)) return; trip.fundKeeperId = dom.fundKeeper.value; trip.expenses.filter(Logic.isFundExpense).forEach((expense) => { expense.payerId = trip.fundKeeperId; }); savePortfolio("Đã đổi người giữ quỹ"); render(); showToast(`Đã chọn ${memberName(trip.fundKeeperId)} giữ quỹ.`); });
  dom.fundTransactionForm.addEventListener("submit", (event) => { event.preventDefault(); saveFundTransaction(); });
  dom.fundTransactionAmount.addEventListener("input", () => { const value = parseMoney(dom.fundTransactionAmount.value); dom.fundTransactionAmount.value = value ? formatNumber(value) : ""; });
  dom.fundTransactionList.addEventListener("click", (event) => { const button = event.target.closest("[data-delete-fund-transaction]"); if (button) deleteFundTransaction(button.dataset.deleteFundTransaction); });
  dom.expenseForm.addEventListener("submit", (event) => { event.preventDefault(); const result = validateExpense(); if (result.message) { dom.expenseError.textContent = result.message; return; } const trip = activeTrip(); if (editingExpenseId) { const index = trip.expenses.findIndex((e) => e.id === editingExpenseId), existing = trip.expenses[index]; result.data.date = stampExpenseDate(result.data.date, existing.date); trip.expenses[index] = { ...existing, ...result.data, included: existing.included !== false, updatedAt: now() }; showToast("Đã cập nhật khoản chi."); } else { result.data.date = stampExpenseDate(result.data.date); trip.expenses.unshift({ id: uid("expense"), ...result.data, included: true, createdAt: now() }); showToast("Đã thêm khoản chi."); } savePortfolio(); resetExpenseForm(); render(); });
  dom.expenseTableBody.addEventListener("click", (event) => { const edit = event.target.closest("[data-edit-expense]"), remove = event.target.closest("[data-delete-expense]"); if (edit) beginEditExpense(edit.dataset.editExpense); if (remove) { const trip = activeTrip(), e = trip.expenses.find((item) => item.id === remove.dataset.deleteExpense); if (e && confirm(`Xóa khoản “${e.description}”?`)) { trip.expenses = trip.expenses.filter((item) => item.id !== e.id); if (editingExpenseId === e.id) resetExpenseForm(); savePortfolio(); render(); } } });
  dom.expenseTableBody.addEventListener("change", (event) => { const toggle = event.target.closest("[data-toggle-expense]"); if (toggle) setExpenseIncluded(toggle.dataset.toggleExpense, toggle.checked); });
  dom.settlementList.addEventListener("click", (event) => { const button = event.target.closest("[data-mark-paid]"); if (button) markSettlementPaid(button.dataset.markPaid, button.dataset.paidTo, button.dataset.paidAmount); });
  dom.paymentHistoryList.addEventListener("click", (event) => { const button = event.target.closest("[data-undo-payment]"); if (button) undoPayment(button.dataset.undoPayment); });
  dom.expenseSearch.addEventListener("input", renderExpenses); dom.expenseAmount.addEventListener("input", () => { const value = parseMoney(dom.expenseAmount.value); dom.expenseAmount.value = value ? formatNumber(value) : ""; updateSplitEditor(); }); dom.expensePaymentSource.addEventListener("change", updateExpensePaymentSource); dom.participantList.addEventListener("change", updateSplitEditor); $$('input[name="splitMode"]').forEach((r) => r.addEventListener("change", updateSplitEditor)); dom.customShares.addEventListener("input", (event) => { const input = event.target.closest("[data-share-member]"); if (input) { if (!input.value.includes("%")) { const value = parseMoney(input.value); input.value = input.value.trim() ? formatNumber(value) : ""; } updateCustomSuggestions(); } });
  dom.btnSelectAll.addEventListener("click", () => { $$('input[name="participant"]').forEach((i) => { i.checked = true; }); updateSplitEditor(); }); dom.btnClearParticipants.addEventListener("click", () => { $$('input[name="participant"]').forEach((i) => { i.checked = false; }); updateSplitEditor(); }); dom.btnCancelEdit.addEventListener("click", resetExpenseForm);
  dom.btnExportJson.addEventListener("click", () => download("trip-split-backup.json", JSON.stringify(portfolio, null, 2), "application/json;charset=utf-8")); dom.btnExportCsv.addEventListener("click", exportCsv); dom.btnPreviewPdf.addEventListener("click", openPdfPreview); dom.btnClosePdfPreview.addEventListener("click", closePdfPreview); dom.btnCancelPdfPreview.addEventListener("click", closePdfPreview); dom.btnPrintPdf.addEventListener("click", printPdfReport); dom.fileImportJson.addEventListener("change", () => { if (dom.fileImportJson.files[0]) importJson(dom.fileImportJson.files[0]); }); dom.btnGenerateSecret.addEventListener("click", generateAppsScriptSecret); dom.btnCheckAppsScript.addEventListener("click", checkAppsScript); dom.btnShareSheet.addEventListener("click", shareSheet); dom.appsScriptUrl.addEventListener("change", () => { localStorage.setItem(SCRIPT_URL_KEY, dom.appsScriptUrl.value.trim()); setSheetStatus("idle", "Chưa kiểm tra kết nối", "URL đã thay đổi. Hãy kiểm tra lại trước khi tạo Sheet."); }); dom.appsScriptSecret.addEventListener("change", () => localStorage.setItem(SCRIPT_SECRET_KEY, dom.appsScriptSecret.value.trim()));

  async function initialize() {
    dom.appsScriptUrl.value = localStorage.getItem(SCRIPT_URL_KEY) || "";
    dom.appsScriptSecret.value = localStorage.getItem(SCRIPT_SECRET_KEY) || "";
    renderSheetLink();
    dom.expenseDate.value = localDateString();
    await initializeAccountAuth();
    await loadSharedTripFromUrl();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    render();
  }
  initialize();
})();
