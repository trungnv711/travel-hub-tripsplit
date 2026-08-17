(function (global) {
  "use strict";

  function toSafeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.round(number));
  }

  function splitEqual(amount, participantIds) {
    const total = toSafeInteger(amount);
    const ids = Array.from(new Set(participantIds || []));
    if (!ids.length) return {};

    const base = Math.floor(total / ids.length);
    let remainder = total % ids.length;
    const shares = {};

    ids.forEach((id) => {
      shares[id] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    });

    return shares;
  }

  function getExpenseShares(expense) {
    if (!expense) return {};
    if (expense.splitMode === "custom") {
      return Object.fromEntries(
        (expense.participantIds || []).map((id) => [
          id,
          toSafeInteger((expense.customShares || {})[id]),
        ])
      );
    }
    return splitEqual(expense.amount, expense.participantIds);
  }

  function isExpenseIncluded(expense) {
    return Boolean(expense) && expense.included !== false;
  }

  function includedExpenses(expenses) {
    return (Array.isArray(expenses) ? expenses : []).filter(isExpenseIncluded);
  }

  function calculateSummary(members, expenses) {
    const summary = Object.fromEntries(
      (members || []).map((member) => [
        member.id,
        {
          memberId: member.id,
          name: member.name,
          owed: 0,
          paid: 0,
          prepaid: toSafeInteger(member.prepaidAmount),
          balance: 0,
        },
      ])
    );

    includedExpenses(expenses).forEach((expense) => {
      if (summary[expense.payerId]) {
        summary[expense.payerId].paid += toSafeInteger(expense.amount);
      }

      const shares = getExpenseShares(expense);
      Object.entries(shares).forEach(([memberId, share]) => {
        if (summary[memberId]) {
          summary[memberId].owed += toSafeInteger(share);
        }
      });
    });

    Object.values(summary).forEach((row) => {
      row.balance = row.paid - row.owed;
    });

    return summary;
  }

  function calculateOutstandingSummary(members, expenses, payments) {
    const summary = calculateSummary(members, expenses);
    Object.values(summary).forEach((row) => {
      row.originalBalance = row.balance;
      row.transferred = 0;
      row.received = 0;
    });

    (payments || []).forEach((payment) => {
      const amount = toSafeInteger(payment && payment.amount);
      if (!amount) return;
      if (summary[payment.fromId]) {
        summary[payment.fromId].transferred += amount;
        summary[payment.fromId].balance += amount;
      }
      if (summary[payment.toId]) {
        summary[payment.toId].received += amount;
        summary[payment.toId].balance -= amount;
      }
    });

    return summary;
  }

  function calculateSettlements(members, expenses, payments) {
    const summary = calculateOutstandingSummary(members, expenses, payments);

    const creditors = Object.values(summary)
      .filter((row) => row.balance > 0)
      .map((row) => ({ ...row, remaining: row.balance }))
      .sort((a, b) => b.remaining - a.remaining);

    const debtors = Object.values(summary)
      .filter((row) => row.balance < 0)
      .map((row) => ({ ...row, remaining: Math.abs(row.balance) }))
      .sort((a, b) => b.remaining - a.remaining);

    const transfers = [];
    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amount = Math.min(creditor.remaining, debtor.remaining);

      if (amount > 0) {
        transfers.push({
          fromId: debtor.memberId,
          fromName: debtor.name,
          toId: creditor.memberId,
          toName: creditor.name,
          amount,
        });
      }

      creditor.remaining -= amount;
      debtor.remaining -= amount;

      if (creditor.remaining === 0) creditorIndex += 1;
      if (debtor.remaining === 0) debtorIndex += 1;
    }

    return transfers;
  }

  function validateState(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return { valid: false, message: "Dữ liệu không hợp lệ." };
    }

    if (!Array.isArray(candidate.members) || !Array.isArray(candidate.expenses)) {
      return { valid: false, message: "Thiếu danh sách thành viên hoặc chi phí." };
    }

    const memberIds = new Set();
    for (const member of candidate.members) {
      if (!member || typeof member.id !== "string" || typeof member.name !== "string" || !member.name.trim()) {
        return { valid: false, message: "Thông tin thành viên không hợp lệ." };
      }
      if (memberIds.has(member.id)) {
        return { valid: false, message: "Mã thành viên bị trùng." };
      }
      if (member.prepaidAmount !== undefined && (!Number.isSafeInteger(member.prepaidAmount) || member.prepaidAmount < 0)) {
        return { valid: false, message: `Tiền tạm ứng của "${member.name}" không hợp lệ.` };
      }
      memberIds.add(member.id);
    }

    const expenseIds = new Set();
    for (const expense of candidate.expenses) {
      if (!expense || typeof expense.id !== "string" || typeof expense.description !== "string" || !expense.description.trim()) {
        return { valid: false, message: "Thông tin khoản chi không hợp lệ." };
      }
      if (expenseIds.has(expense.id)) return { valid: false, message: "Mã khoản chi bị trùng." };
      expenseIds.add(expense.id);
      if (!Number.isSafeInteger(expense.amount) || expense.amount <= 0) {
        return { valid: false, message: `Khoản "${expense.description}" có số tiền không hợp lệ.` };
      }
      if (!memberIds.has(expense.payerId)) {
        return { valid: false, message: `Khoản "${expense.description}" có người trả không tồn tại.` };
      }
      if (!Array.isArray(expense.participantIds) || expense.participantIds.length === 0) {
        return { valid: false, message: `Khoản "${expense.description}" chưa có người tham gia.` };
      }
      if (expense.participantIds.some((id) => !memberIds.has(id))) {
        return { valid: false, message: `Khoản "${expense.description}" có người tham gia không tồn tại.` };
      }
      if (new Set(expense.participantIds).size !== expense.participantIds.length) {
        return { valid: false, message: `Khoản "${expense.description}" bị trùng người tham gia.` };
      }
      if (expense.included !== undefined && typeof expense.included !== "boolean") {
        return { valid: false, message: `Khoản "${expense.description}" có trạng thái quyết toán không hợp lệ.` };
      }
      const splitMode = expense.splitMode || "equal";
      if (!["equal", "custom"].includes(splitMode)) {
        return { valid: false, message: `Khoản "${expense.description}" có cách chia không hợp lệ.` };
      }
      if (splitMode === "custom") {
        const shares = getExpenseShares(expense);
        const total = Object.values(shares).reduce((sum, share) => sum + share, 0);
        if (total !== expense.amount) {
          return { valid: false, message: `Khoản "${expense.description}" có tổng phần chia không khớp.` };
        }
      }
    }

    return { valid: true, message: "" };
  }

  function validateTrip(trip) {
    if (!trip || typeof trip !== "object" || typeof trip.id !== "string") {
      return { valid: false, message: "Thông tin chuyến đi không hợp lệ." };
    }
    if (typeof trip.name !== "string" || !trip.name.trim()) {
      return { valid: false, message: "Chuyến đi chưa có tên." };
    }
    return validateState({ members: trip.members, expenses: trip.expenses });
  }

  function validatePortfolio(candidate) {
    if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.trips)) {
      return { valid: false, message: "Tệp không chứa danh sách chuyến đi." };
    }
    if (!candidate.trips.length) {
      return { valid: false, message: "Danh sách chuyến đi đang trống." };
    }
    const tripIds = new Set();
    for (const trip of candidate.trips) {
      const validation = validateTrip(trip);
      if (!validation.valid) return validation;
      if (tripIds.has(trip.id)) return { valid: false, message: "Mã chuyến đi bị trùng." };
      tripIds.add(trip.id);
    }
    if (!tripIds.has(candidate.activeTripId)) {
      return { valid: false, message: "Chuyến đi đang chọn không tồn tại." };
    }
    return { valid: true, message: "" };
  }

  function normalizeShareEmails(members, limit = 50) {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const safeLimit = Math.max(0, Math.min(50, toSafeInteger(limit)));
    const emails = (Array.isArray(members) ? members : [])
      .map((member) => String(member?.email || "").trim().toLowerCase())
      .filter((email) => validEmail.test(email));
    return [...new Set(emails)].slice(0, safeLimit);
  }

  function buildShareContent(tripName, shareUrl, members) {
    const name = String(tripName || "Chuyến đi").trim() || "Chuyến đi";
    const url = new URL(String(shareUrl || ""));
    if (!/^https?:$/.test(url.protocol)) throw new Error("Liên kết chia sẻ không hợp lệ.");
    const normalizedUrl = url.toString();
    const title = `TripSplit · ${name}`;
    const message = `Cùng theo dõi và đối soát chi phí chuyến đi “${name}” trên TripSplit.`;
    const emails = normalizeShareEmails(members);
    return {
      title,
      message,
      url: normalizedUrl,
      emails,
      mailtoUrl: `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(`[TripSplit] ${name}`)}&body=${encodeURIComponent(`${message}\n\n${normalizedUrl}`)}`,
      facebookUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(normalizedUrl)}`,
    };
  }

  const api = {
    toSafeInteger,
    splitEqual,
    getExpenseShares,
    isExpenseIncluded,
    includedExpenses,
    calculateSummary,
    calculateOutstandingSummary,
    calculateSettlements,
    validateState,
    validateTrip,
    validatePortfolio,
    normalizeShareEmails,
    buildShareContent,
  };

  global.TravelExpenseLogic = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
