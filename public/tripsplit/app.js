(() => {
  "use strict";

  const STORAGE_KEY = "trip-split-portfolio-v2";
  const LEGACY_KEY = "trip-split-state-v1";
  const SCRIPT_URL_KEY = "trip-split-apps-script-url";
  const SCRIPT_SECRET_KEY = "trip-split-apps-script-secret";
  const Logic = window.TravelExpenseLogic;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const dom = Object.fromEntries([
    "tripSelect", "tripStatus", "tripTitle", "tripMeta", "saveStatus", "memberForm", "memberName",
    "memberEmail", "memberError", "memberList", "btnSaveMember", "btnCancelMemberEdit", "appsScriptUrl", "appsScriptSecret", "btnGenerateSecret", "btnShareSheet", "sheetError",
    "expenseForm", "expenseFormTitle", "expenseDescription", "expenseAmount", "expensePayer",
    "expenseDate", "expenseCategory", "expenseNote", "participantList", "customShares",
    "equalSplitPreview", "expenseError", "btnCancelEdit", "btnSaveExpense", "expenseTableBody",
    "expenseEmpty", "expenseSearch", "summaryTableBody", "settlementList", "paymentHistoryList", "statTotal",
    "statExpenseCount", "statMemberCount", "statTransferCount", "toast", "btnNewTrip", "btnShareTrip", "btnEditTrip",
    "btnDeleteTrip", "btnExportJson", "btnExportCsv", "fileImportJson", "btnSelectAll",
    "btnClearParticipants", "tripDialog", "tripForm", "tripDialogTitle", "tripId", "tripName",
    "tripDestination", "tripStartDate", "tripEndDate", "tripStatusInput", "tripError",
    "btnCloseTripDialog", "btnCancelTrip"
  ].map((id) => [id, document.getElementById(id)]));

  let portfolio = loadPortfolio();
  let editingExpenseId = null;
  let editingMemberId = null;
  let toastTimer = null;
  const remoteSyncTimers = new Map();
  const shareCreationPromises = new Map();
  let isApplyingSharedTrip = false;
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
  function statusLabel(status) { return ({ planning: "Đang chuẩn bị", active: "Đang diễn ra", settling: "Đang quyết toán", closed: "Đã kết thúc" })[status] || "Đang chuẩn bị"; }
  function formatDateRange(trip) {
    if (!trip.startDate && !trip.endDate) return "Chưa đặt thời gian";
    const format = (date) => date ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${date}T00:00:00`)) : "?";
    return `${format(trip.startDate)} – ${format(trip.endDate)}`;
  }

  function makeTrip({ id = uid("trip"), name, destination = "", startDate = "", endDate = "", status = "planning", members = [], expenses = [], payments = [] }) {
    return { id, name, destination, startDate, endDate, status, members, expenses, payments, createdAt: now(), updatedAt: now() };
  }

  function createSamplePortfolio() {
    const people = (prefix, names) => names.map((name, index) => ({ id: `${prefix}_m${index + 1}`, name, email: "" }));
    const dalatMembers = people("dl", ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khang", "Lan", "Minh", "Ngọc"]);
    const baolocMembers = people("bl", ["An", "Bình", "Chi", "Dũng", "Hà", "Lan", "Minh", "Phúc"]);
    const expense = (id, description, amount, payerId, participantIds, category, date) => ({ id, description, amount, payerId, participantIds, splitMode: "equal", customShares: {}, category, date, note: "", createdAt: now() });
    const dalat = makeTrip({ id: "trip_da_lat", name: "Trip 1 — Đà Lạt", destination: "Đà Lạt", startDate: "2026-08-15", endDate: "2026-08-17", status: "planning", members: dalatMembers });
    dalat.expenses = [expense("dl_e1", "Đặt cọc villa", 6000000, dalatMembers[0].id, dalatMembers.map((m) => m.id), "Lưu trú", "2026-08-01")];
    const baoloc = makeTrip({ id: "trip_bao_loc", name: "Trip 2 — Bảo Lộc", destination: "Bảo Lộc", startDate: "2026-09-05", endDate: "2026-09-06", status: "planning", members: baolocMembers });
    baoloc.expenses = [expense("bl_e1", "Đặt xe khứ hồi", 3200000, baolocMembers[1].id, baolocMembers.map((m) => m.id), "Di chuyển", "2026-08-03")];
    return { version: 2, activeTripId: dalat.id, trips: [dalat, baoloc] };
  }

  function migrateLegacy(legacy) {
    const trip = makeTrip({ name: String(legacy.tripName || "Chuyến đi đã nhập"), members: legacy.members.map((m) => ({ ...m, email: m.email || "" })), expenses: legacy.expenses });
    return { version: 2, activeTripId: trip.id, trips: [trip] };
  }

  function normalizePortfolio(candidate) {
    candidate.version = 2;
    candidate.trips.forEach((trip) => {
      trip.destination ||= ""; trip.startDate ||= ""; trip.endDate ||= ""; trip.status ||= "planning";
      trip.payments ||= [];
      trip.members.forEach((member) => { member.email ||= ""; });
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
    return `${origin}/?trip=${encodeURIComponent(shareId)}`;
  }
  function setSharedUrl(shareId) {
    const outerUrl = shareId ? sharedUrl(shareId) : `${window.location.origin}/`;
    try { if (window.parent !== window) window.parent.history.replaceState({}, "", outerUrl); } catch { /* parent may be unavailable */ }
    history.replaceState({}, "", shareId ? `${location.pathname}?trip=${encodeURIComponent(shareId)}` : location.pathname);
    return outerUrl;
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
      response = await fetch(`/api/shared-trips/${encodeURIComponent(shareId)}`);
      if (response.status !== 404 || attempt === 2) return response;
      await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
    }
    return response;
  }
  async function syncSharedTrip(trip = activeTrip()) {
    if (!trip.shareId || location.protocol === "file:") return;
    clearTimeout(savePortfolio.timer);
    if (activeTrip().id === trip.id) dom.saveStatus.textContent = "Đang đồng bộ…";
    const response = await fetch(`/api/shared-trips/${encodeURIComponent(trip.shareId)}`, {
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
      const response = await fetch("/api/shared-trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thể tạo link cho chuyến đi.");
      trip.shareId = result.shareId;
      trip.shareRevision = result.revision;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
      if (activeTrip().id === trip.id) {
        setSharedUrl(trip.shareId);
        dom.btnShareTrip.textContent = "🔗 Sao chép link trip";
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
  async function shareCurrentTrip() {
    if (location.protocol === "file:") { showToast("Chức năng chia sẻ chỉ có trên bản online."); return; }
    const trip = activeTrip();
    dom.btnShareTrip.disabled = true;
    try {
      if (!trip.shareId) await ensureTripShared(trip); else await syncSharedTrip(trip);
      const url = setSharedUrl(trip.shareId);
      const copied = await copyText(url);
      render();
      showToast(copied ? "Đã sao chép link trip. Gửi link này cho cả nhóm." : `Link trip: ${url}`);
    } catch (error) {
      dom.saveStatus.textContent = "Đã lưu trên thiết bị";
      showToast(error instanceof Error ? error.message : "Không thể chia sẻ chuyến đi.");
    } finally { dom.btnShareTrip.disabled = false; }
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
      const sharedTrip = { ...result.trip, payments: Array.isArray(result.trip.payments) ? result.trip.payments : [], shareId, shareRevision: result.revision };
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

  function render() {
    const trip = activeTrip();
    portfolio.activeTripId = trip.id;
    dom.tripSelect.innerHTML = portfolio.trips.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${item.members.length} người</option>`).join("");
    dom.tripSelect.value = trip.id;
    dom.tripStatus.textContent = statusLabel(trip.status);
    dom.tripStatus.dataset.status = trip.status;
    dom.tripTitle.textContent = trip.name;
    dom.tripMeta.textContent = [trip.destination || "Chưa có điểm đến", formatDateRange(trip), `${trip.members.length} thành viên`].join(" · ");
    dom.btnShareTrip.textContent = trip.shareId ? "🔗 Sao chép link trip" : "🔗 Chia sẻ trip";
    renderMembers(); renderPayerOptions(); renderParticipants(); renderExpenses(); renderSummary(); renderStats(); updateSplitEditor();
  }

  function renderMembers() {
    const trip = activeTrip();
    dom.memberList.innerHTML = trip.members.length ? trip.members.map((member) => {
      const inUse = trip.expenses.some((expense) => expense.payerId === member.id || expense.participantIds.includes(member.id));
      return `<div class="member-item ${editingMemberId === member.id ? "member-item--editing" : ""}"><div><strong>${escapeHtml(member.name)}</strong><small class="${member.email ? "" : "missing-email"}">${escapeHtml(member.email || "Chưa có email · vẫn dùng được")}</small></div><div class="member-item__actions"><button class="icon-button" type="button" data-edit-member="${escapeHtml(member.id)}" title="Sửa tên hoặc email" aria-label="Sửa ${escapeHtml(member.name)}">✎</button><button class="icon-button icon-button--danger" type="button" data-remove-member="${escapeHtml(member.id)}" ${inUse ? "disabled" : ""} title="${inUse ? "Đang có dữ liệu chi phí" : "Xóa thành viên"}" aria-label="Xóa ${escapeHtml(member.name)}">✕</button></div></div>`;
    }).join("") : '<div class="empty-state">Chưa có thành viên.</div>';
  }

  function renderPayerOptions() {
    const selected = dom.expensePayer.value;
    const members = activeTrip().members;
    dom.expensePayer.innerHTML = members.length ? members.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("") : '<option value="">Hãy thêm thành viên</option>';
    if (members.some((m) => m.id === selected)) dom.expensePayer.value = selected;
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
    const expenses = activeTrip().expenses.filter((e) => `${e.description} ${e.category || ""} ${e.note || ""}`.toLocaleLowerCase("vi").includes(keyword));
    dom.expenseEmpty.classList.toggle("hidden", !!expenses.length);
    dom.expenseTableBody.innerHTML = expenses.map((e) => `<tr><td><div class="expense-main">${escapeHtml(e.description)}</div><div class="expense-sub">${escapeHtml(e.category || "Khác")}${e.note ? ` · ${escapeHtml(e.note)}` : ""}</div></td><td>${escapeHtml(formatExpenseDateTime(e.date))}</td><td><strong>${escapeHtml(memberName(e.payerId))}</strong></td><td><div class="pill-group">${e.participantIds.map((id) => `<span class="pill">${escapeHtml(memberName(id))}</span>`).join("")}</div></td><td class="align-right amount">${formatCurrency(e.amount)}</td><td><div class="row-actions"><button class="icon-button" type="button" data-edit-expense="${escapeHtml(e.id)}" title="Sửa">✎</button><button class="icon-button icon-button--danger" type="button" data-delete-expense="${escapeHtml(e.id)}" title="Xóa">🗑</button></div></td></tr>`).join("");
  }

  function renderSummary() {
    const trip = activeTrip();
    const summary = Logic.calculateOutstandingSummary(trip.members, trip.expenses, trip.payments);
    dom.summaryTableBody.innerHTML = trip.members.length ? trip.members.map((m) => {
      const row = summary[m.id];
      const cls = row.balance > 0 ? "balance-positive" : row.balance < 0 ? "balance-negative" : "";
      const hasPayment = row.transferred > 0 || row.received > 0;
      const status = row.balance > 0 ? '<span class="status-badge status-badge--receive">Còn được nhận</span>' : row.balance < 0 ? '<span class="status-badge status-badge--pay">Còn phải trả</span>' : hasPayment ? '<span class="status-badge status-badge--done">Đã thanh toán</span>' : '<span class="status-badge status-badge--done">Đã cân bằng</span>';
      return `<tr class="${hasPayment && row.balance === 0 ? "summary-row--settled" : ""}"><td><strong>${escapeHtml(m.name)}</strong></td><td class="align-right">${formatCurrency(row.owed)}</td><td class="align-right">${formatCurrency(row.paid)}</td><td class="align-right payment-out">${formatCurrency(row.transferred)}</td><td class="align-right payment-in">${formatCurrency(row.received)}</td><td class="align-right amount ${cls}">${row.balance > 0 ? "+" : ""}${formatCurrency(row.balance)}</td><td>${status}</td></tr>`;
    }).join("") : '<tr><td colspan="7" class="empty-state">Chưa có thành viên.</td></tr>';
    const transfers = Logic.calculateSettlements(trip.members, trip.expenses, trip.payments);
    dom.settlementList.innerHTML = transfers.length ? transfers.map((t) => `<div class="settlement-item settlement-item--pending"><div class="settlement-person">${escapeHtml(t.fromName)}<small>cần trả</small></div><div class="transfer-arrow"><span>chuyển cho</span><strong>${formatCurrency(t.amount)}</strong><span>→</span></div><div class="settlement-person">${escapeHtml(t.toName)}<small>sẽ nhận</small></div><button class="btn btn--paid" type="button" data-mark-paid="${escapeHtml(t.fromId)}" data-paid-to="${escapeHtml(t.toId)}" data-paid-amount="${t.amount}">✓ Đánh dấu đã trả</button></div>`).join("") : '<div class="empty-state empty-state--success">✓ Không còn khoản tiền nào cần chuyển.</div>';
    const payments = [...trip.payments].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
    dom.paymentHistoryList.innerHTML = payments.length ? payments.map((payment) => `<div class="settlement-item settlement-item--paid"><div class="settlement-person">${escapeHtml(memberName(payment.fromId))}<small>đã trả</small></div><div class="transfer-arrow"><span>${escapeHtml(formatExpenseDateTime(payment.paidAt))}</span><strong>${formatCurrency(payment.amount)}</strong><span>→</span></div><div class="settlement-person">${escapeHtml(memberName(payment.toId))}<small>đã nhận</small></div><button class="link-button link-button--danger" type="button" data-undo-payment="${escapeHtml(payment.id)}">Hoàn tác</button></div>`).join("") : '<div class="empty-state">Chưa có giao dịch nào được đánh dấu đã trả.</div>';
  }
  function renderStats() {
    const trip = activeTrip();
    dom.statTotal.textContent = formatCurrency(trip.expenses.reduce((sum, e) => sum + e.amount, 0));
    dom.statExpenseCount.textContent = trip.expenses.length;
    dom.statMemberCount.textContent = trip.members.length;
    dom.statTransferCount.textContent = Logic.calculateSettlements(trip.members, trip.expenses, trip.payments).length;
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
    renderPayerOptions(); renderParticipants(activeTrip().members.map((m) => m.id)); updateSplitEditor();
  }
  function beginEditExpense(id) {
    const e = activeTrip().expenses.find((item) => item.id === id); if (!e) return;
    editingExpenseId = id; dom.expenseFormTitle.textContent = "Sửa khoản chi"; dom.btnSaveExpense.textContent = "Cập nhật"; dom.btnCancelEdit.classList.remove("hidden");
    dom.expenseDescription.value = e.description; dom.expenseAmount.value = formatNumber(e.amount); dom.expensePayer.value = e.payerId; dom.expenseDate.value = expenseDateInput(e.date); dom.expenseCategory.value = e.category || "Khác"; dom.expenseNote.value = e.note || "";
    $(`input[name="splitMode"][value="${e.splitMode || "equal"}"]`).checked = true; renderParticipants(e.participantIds); updateSplitEditor();
    if (e.splitMode === "custom") Object.entries(e.customShares || {}).forEach(([id2, value]) => { const input = $(`#customShares input[data-share-member="${CSS.escape(id2)}"]`); if (input) input.value = Number(value) > 0 ? formatNumber(value) : ""; });
    updateCustomSuggestions(); dom.expenseForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function validateExpense() {
    const data = { description: dom.expenseDescription.value.trim(), amount: parseMoney(dom.expenseAmount.value), payerId: dom.expensePayer.value, participantIds: selectedParticipantIds(), splitMode: selectedSplitMode(), customShares: {}, date: dom.expenseDate.value, category: dom.expenseCategory.value, note: dom.expenseNote.value.trim() };
    if (!data.description) return { message: "Vui lòng nhập nội dung khoản chi." }; if (!data.amount) return { message: "Tổng tiền phải lớn hơn 0." };
    if (!activeTrip().members.some((m) => m.id === data.payerId)) return { message: "Vui lòng chọn người trả." }; if (!data.participantIds.length) return { message: "Chọn ít nhất một người tham gia." };
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
    dom.memberError.textContent = "";
    dom.btnSaveMember.textContent = "Cập nhật thông tin";
    dom.btnCancelMemberEdit.classList.remove("hidden");
    renderMembers();
    dom.memberEmail.focus();
  }

  function saveMember() {
    const trip = activeTrip(), name = dom.memberName.value.trim().replace(/\s+/g, " "), email = dom.memberEmail.value.trim().toLowerCase();
    if (!name) { dom.memberError.textContent = "Vui lòng nhập tên thành viên."; return; }
    if (email && !validEmail(email)) { dom.memberError.textContent = "Email không đúng định dạng."; return; }
    if (trip.members.some((m) => m.id !== editingMemberId && m.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) { dom.memberError.textContent = "Tên thành viên đã tồn tại trong trip này."; return; }
    if (email && trip.members.some((m) => m.id !== editingMemberId && m.email === email)) { dom.memberError.textContent = "Email đã thuộc một thành viên trong trip này."; return; }
    const existing = trip.members.find((m) => m.id === editingMemberId);
    if (existing) {
      existing.name = name;
      existing.email = email;
    } else {
      trip.members.push({ id: uid("member"), name, email });
    }
    resetMemberForm(); savePortfolio(); render(); showToast(existing ? `Đã cập nhật thông tin ${name}.` : `Đã thêm ${name}.`);
  }
  function removeMember(id) {
    const trip = activeTrip(), member = trip.members.find((m) => m.id === id); if (!member) return;
    if (trip.expenses.some((e) => e.payerId === id || e.participantIds.includes(id))) { showToast("Không thể xóa thành viên đang có dữ liệu chi phí."); return; }
    trip.members = trip.members.filter((m) => m.id !== id); if (editingMemberId === id) resetMemberForm(); savePortfolio(); render();
  }

  function download(filename, content, mime) { const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
  function safeFilename(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "trip"; }
  function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
  function buildSheetPayload() {
    const trip = activeTrip(), summary = Logic.calculateOutstandingSummary(trip.members, trip.expenses, trip.payments), settlements = Logic.calculateSettlements(trip.members, trip.expenses, trip.payments);
    const payments = trip.payments.map((payment) => ({ ...payment, fromName: memberName(payment.fromId), toName: memberName(payment.toId) }));
    return { version: 2, trip: { id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, status: statusLabel(trip.status), members: trip.members, expenses: trip.expenses.map((e) => ({ ...e, payerName: memberName(e.payerId), participantNames: e.participantIds.map(memberName), shares: Logic.getExpenseShares(e) })) }, summary: trip.members.map((m) => ({ ...summary[m.id], email: m.email || "" })), settlements, payments, generatedAt: now() };
  }
  function exportCsv() {
    const payload = buildSheetPayload(), rows = [["CHUYẾN ĐI", payload.trip.name], ["Điểm đến", payload.trip.destination], ["Thời gian", formatDateRange(activeTrip())], [], ["CHI PHÍ"], ["Nội dung", "Ngày & giờ", "Nhóm", "Tổng tiền", "Người trả", "Người tham gia", "Cách chia", "Ghi chú"]];
    payload.trip.expenses.forEach((e) => rows.push([e.description, e.date, e.category, e.amount, e.payerName, e.participantNames.join(", "), e.splitMode === "custom" ? "Tùy chỉnh" : "Chia đều", e.note]));
    rows.push([], ["ĐỐI SOÁT"], ["Thành viên", "Email", "Phải chịu", "Đã ứng", "Đã chuyển", "Đã nhận", "Còn lại"]); payload.summary.forEach((r) => rows.push([r.name, r.email, r.owed, r.paid, r.transferred, r.received, r.balance]));
    rows.push([], ["CÔNG NỢ CHƯA THANH TOÁN"], ["Người cần trả", "Người cần nhận", "Số tiền", "Trạng thái"]); payload.settlements.forEach((r) => rows.push([r.fromName, r.toName, r.amount, "Chưa thanh toán"]));
    rows.push([], ["LỊCH SỬ ĐÃ THANH TOÁN"], ["Người trả", "Người nhận", "Số tiền", "Thời gian"]); payload.payments.forEach((r) => rows.push([r.fromName, r.toName, r.amount, r.paidAt]));
    download(`${safeFilename(payload.trip.name)}.csv`, "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function shareSheet() {
    const url = dom.appsScriptUrl.value.trim(); dom.sheetError.textContent = "";
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) { dom.sheetError.textContent = "Hãy nhập Web App URL hợp lệ theo hướng dẫn cấu hình phía trên."; return; }
    if (!activeTrip().members.length) { dom.sheetError.textContent = "Trip chưa có thành viên."; return; }
    localStorage.setItem(SCRIPT_URL_KEY, url);
    const secret = dom.appsScriptSecret.value.trim(); if (!secret) { dom.sheetError.textContent = "Hãy nhập mã bí mật đã cấu hình trong Script Properties."; return; }
    localStorage.setItem(SCRIPT_SECRET_KEY, secret);
    const form = document.createElement("form"); form.method = "POST"; form.action = url; form.target = "_blank";
    const input = document.createElement("textarea"); input.name = "payload"; input.value = JSON.stringify({ ...buildSheetPayload(), secret }); form.appendChild(input); form.hidden = true; document.body.appendChild(form); form.submit(); form.remove();
    showToast("Đang tạo/cập nhật Sheet và cấp quyền thành viên…");
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

  dom.tripSelect.addEventListener("change", () => { portfolio.activeTripId = dom.tripSelect.value; editingExpenseId = null; resetMemberForm(); localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); resetExpenseForm(); render(); setSharedUrl(activeTrip().shareId || ""); });
  dom.btnNewTrip.addEventListener("click", () => openTripDialog()); dom.btnEditTrip.addEventListener("click", () => openTripDialog(activeTrip()));
  dom.btnShareTrip.addEventListener("click", shareCurrentTrip);
  dom.btnDeleteTrip.addEventListener("click", () => { if (portfolio.trips.length === 1) { showToast("Cần giữ lại ít nhất một chuyến đi."); return; } const trip = activeTrip(); if (!confirm(`Xóa toàn bộ dữ liệu của “${trip.name}” khỏi thiết bị này?`)) return; portfolio.trips = portfolio.trips.filter((t) => t.id !== trip.id); portfolio.activeTripId = portfolio.trips[0].id; resetMemberForm(); localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); resetExpenseForm(); render(); setSharedUrl(activeTrip().shareId || ""); showToast("Đã xóa chuyến đi khỏi thiết bị này."); });
  dom.tripForm.addEventListener("submit", (event) => { event.preventDefault(); saveTripFromDialog(); }); [dom.btnCloseTripDialog, dom.btnCancelTrip].forEach((button) => button.addEventListener("click", () => dom.tripDialog.close()));
  dom.memberForm.addEventListener("submit", (event) => { event.preventDefault(); saveMember(); }); dom.btnCancelMemberEdit.addEventListener("click", () => { resetMemberForm(); renderMembers(); }); dom.memberList.addEventListener("click", (event) => { const editButton = event.target.closest("[data-edit-member]"), removeButton = event.target.closest("[data-remove-member]"); if (editButton) beginEditMember(editButton.dataset.editMember); if (removeButton) removeMember(removeButton.dataset.removeMember); });
  dom.expenseForm.addEventListener("submit", (event) => { event.preventDefault(); const result = validateExpense(); if (result.message) { dom.expenseError.textContent = result.message; return; } const trip = activeTrip(); if (editingExpenseId) { const index = trip.expenses.findIndex((e) => e.id === editingExpenseId), existing = trip.expenses[index]; result.data.date = stampExpenseDate(result.data.date, existing.date); trip.expenses[index] = { ...existing, ...result.data, updatedAt: now() }; showToast("Đã cập nhật khoản chi."); } else { result.data.date = stampExpenseDate(result.data.date); trip.expenses.unshift({ id: uid("expense"), ...result.data, createdAt: now() }); showToast("Đã thêm khoản chi."); } savePortfolio(); resetExpenseForm(); render(); });
  dom.expenseTableBody.addEventListener("click", (event) => { const edit = event.target.closest("[data-edit-expense]"), remove = event.target.closest("[data-delete-expense]"); if (edit) beginEditExpense(edit.dataset.editExpense); if (remove) { const trip = activeTrip(), e = trip.expenses.find((item) => item.id === remove.dataset.deleteExpense); if (e && confirm(`Xóa khoản “${e.description}”?`)) { trip.expenses = trip.expenses.filter((item) => item.id !== e.id); if (editingExpenseId === e.id) resetExpenseForm(); savePortfolio(); render(); } } });
  dom.settlementList.addEventListener("click", (event) => { const button = event.target.closest("[data-mark-paid]"); if (button) markSettlementPaid(button.dataset.markPaid, button.dataset.paidTo, button.dataset.paidAmount); });
  dom.paymentHistoryList.addEventListener("click", (event) => { const button = event.target.closest("[data-undo-payment]"); if (button) undoPayment(button.dataset.undoPayment); });
  dom.expenseSearch.addEventListener("input", renderExpenses); dom.expenseAmount.addEventListener("input", () => { const value = parseMoney(dom.expenseAmount.value); dom.expenseAmount.value = value ? formatNumber(value) : ""; updateSplitEditor(); }); dom.participantList.addEventListener("change", updateSplitEditor); $$('input[name="splitMode"]').forEach((r) => r.addEventListener("change", updateSplitEditor)); dom.customShares.addEventListener("input", (event) => { const input = event.target.closest("[data-share-member]"); if (input) { if (!input.value.includes("%")) { const value = parseMoney(input.value); input.value = input.value.trim() ? formatNumber(value) : ""; } updateCustomSuggestions(); } });
  dom.btnSelectAll.addEventListener("click", () => { $$('input[name="participant"]').forEach((i) => { i.checked = true; }); updateSplitEditor(); }); dom.btnClearParticipants.addEventListener("click", () => { $$('input[name="participant"]').forEach((i) => { i.checked = false; }); updateSplitEditor(); }); dom.btnCancelEdit.addEventListener("click", resetExpenseForm);
  dom.btnExportJson.addEventListener("click", () => download("trip-split-backup.json", JSON.stringify(portfolio, null, 2), "application/json;charset=utf-8")); dom.btnExportCsv.addEventListener("click", exportCsv); dom.fileImportJson.addEventListener("change", () => { if (dom.fileImportJson.files[0]) importJson(dom.fileImportJson.files[0]); }); dom.btnGenerateSecret.addEventListener("click", generateAppsScriptSecret); dom.btnShareSheet.addEventListener("click", shareSheet); dom.appsScriptUrl.addEventListener("change", () => localStorage.setItem(SCRIPT_URL_KEY, dom.appsScriptUrl.value.trim())); dom.appsScriptSecret.addEventListener("change", () => localStorage.setItem(SCRIPT_SECRET_KEY, dom.appsScriptSecret.value.trim()));

  async function initialize() {
    dom.appsScriptUrl.value = localStorage.getItem(SCRIPT_URL_KEY) || "";
    dom.appsScriptSecret.value = localStorage.getItem(SCRIPT_SECRET_KEY) || "";
    dom.expenseDate.value = localDateString();
    await loadSharedTripFromUrl();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    render();
  }
  initialize();
})();
