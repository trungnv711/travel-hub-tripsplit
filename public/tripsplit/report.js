(function (global) {
  "use strict";
  function toAmount(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }
  function buildModel(trip, logic) {
    const expenses = Array.isArray(trip?.expenses) ? trip.expenses : [];
    const includedExpenses = expenses.filter((item) => logic.isExpenseIncluded(item));
    const plannedExpenses = expenses.filter((item) => !logic.isExpenseIncluded(item));
    const summary = logic.calculateOutstandingSummary(trip.members, expenses, trip.payments);
    const settlements = logic.calculateSettlements(trip.members, expenses, trip.payments);
    const totalExpense = includedExpenses.reduce((sum, item) => sum + toAmount(item.amount), 0);
    const plannedTotal = plannedExpenses.reduce((sum, item) => sum + toAmount(item.amount), 0);
    const totalPrepaid = trip.members.reduce((sum, member) => sum + toAmount(member.prepaidAmount), 0);
    const totalOutstanding = Object.values(summary).filter((row) => row.balance < 0).reduce((sum, row) => sum + Math.abs(row.balance), 0);
    return { trip, expenses, includedExpenses, plannedExpenses, summary, settlements, payments: Array.isArray(trip.payments) ? trip.payments : [], totalExpense, plannedTotal, totalPrepaid, totalOutstanding, collectedDifference: totalPrepaid - totalExpense };
  }
  global.TravelExpenseReport = { buildModel };
  if (typeof module !== "undefined" && module.exports) module.exports = { buildModel };
})(typeof window !== "undefined" ? window : globalThis);
