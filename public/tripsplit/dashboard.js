(function (global) {
  "use strict";
  function toAmount(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }
  function expenseDate(expense, trip) { const raw = String(expense?.date || trip?.startDate || trip?.createdAt || ""); const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw); return Number.isNaN(date.getTime()) ? null : date; }
  function periodBounds(period, anchor = new Date()) { const end = new Date(anchor); end.setHours(23, 59, 59, 999); if (period === "all") return { start: null, end: null }; const start = new Date(anchor); start.setHours(0, 0, 0, 0); if (period === "year") start.setMonth(0, 1); else if (period === "month") start.setDate(1); else { const mondayOffset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - mondayOffset); } return { start, end }; }
  function inPeriod(date, bounds) { if (!bounds.start || !bounds.end) return true; return Boolean(date) && date >= bounds.start && date <= bounds.end; }
  function summarizeTrip(trip, logic) {
    const expenses = (trip.expenses || []).filter((item) => logic.isExpenseIncluded(item));
    const summary = logic.calculateSummary(trip.members || [], trip.expenses || []);
    const total = expenses.reduce((sum, item) => sum + toAmount(item.amount), 0); const categories = {}; const payers = {};
    expenses.forEach((item) => { const category = String(item.category || "Khác"); categories[category] = (categories[category] || 0) + toAmount(item.amount); payers[item.payerId] = (payers[item.payerId] || 0) + toAmount(item.amount); });
    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || ["Chưa có", 0]; const highestExpense = [...expenses].sort((a, b) => toAmount(b.amount) - toAmount(a.amount))[0] || null;
    return { trip, expenses, total, averagePerMember: trip.members?.length ? Math.round(total / trip.members.length) : 0, categories, payers, topCategory: { name: topCategory[0], amount: topCategory[1] }, highestExpense, plannedCount: (trip.expenses || []).filter((item) => !logic.isExpenseIncluded(item)).length, memberCosts: (trip.members || []).map((member) => ({ id: member.id, name: member.name, amount: summary[member.id]?.owed || 0 })) };
  }
  function aggregate(portfolio, logic, period = "year", anchor = new Date()) {
    const trips = Array.isArray(portfolio?.trips) ? portfolio.trips : []; const bounds = periodBounds(period, anchor); const tripSummaries = trips.map((trip) => summarizeTrip(trip, logic)); const included = [];
    tripSummaries.forEach((item) => item.expenses.forEach((expense) => { const date = expenseDate(expense, item.trip); if (inPeriod(date, bounds)) included.push({ trip: item.trip, expense, date }); }));
    const total = included.reduce((sum, item) => sum + toAmount(item.expense.amount), 0); const memberVisits = new Set(); included.forEach(({ trip }) => (trip.members || []).forEach((member) => memberVisits.add(`${trip.id}:${member.id}`))); const categories = {}; const payers = {};
    included.forEach(({ trip, expense }) => { const category = String(expense.category || "Khác"); categories[category] = (categories[category] || 0) + toAmount(expense.amount); const member = (trip.members || []).find((item) => item.id === expense.payerId); const key = `${trip.id}:${expense.payerId}`; if (!payers[key]) payers[key] = { key, name: member?.name || "Không xác định", tripName: trip.name, amount: 0 }; payers[key].amount += toAmount(expense.amount); });
    const categoryList = Object.entries(categories).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount); const payerList = Object.values(payers).sort((a, b) => b.amount - a.amount); const maxPayer = payerList[0]?.amount || 0; payerList.forEach((item) => { item.thanks = maxPayer ? Math.max(1, Math.ceil((item.amount / maxPayer) * 5)) : 0; });
    return { period, tripSummaries, activeTripCount: new Set(included.map((item) => item.trip.id)).size, expenseCount: included.length, total, averagePerPerson: memberVisits.size ? Math.round(total / memberVisits.size) : 0, categories: categoryList, payers: payerList };
  }
  global.TravelDashboard = { aggregate, summarizeTrip, periodBounds };
  if (typeof module !== "undefined" && module.exports) module.exports = { aggregate, summarizeTrip, periodBounds };
})(typeof window !== "undefined" ? window : globalThis);
