(function (global) {
  "use strict";
  function toAmount(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }
  function buildModel(trip, logic) {
    const expenses = Array.isArray(trip?.expenses) ? trip.expenses : [];
    const includedExpenses = expenses.filter((item) => logic.isExpenseIncluded(item));
    const plannedExpenses = expenses.filter((item) => !logic.isExpenseIncluded(item));
    const fund = logic.calculateFundSummary(trip.members, expenses, trip.fundTransactions, trip.fundKeeperId);
    const summary = logic.calculateOutstandingSummary(trip.members, expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId);
    const settlements = logic.calculateSettlements(trip.members, expenses, trip.payments, trip.fundTransactions, trip.fundKeeperId);
    const totalExpense = includedExpenses.reduce((sum, item) => sum + toAmount(item.amount), 0);
    const plannedTotal = plannedExpenses.reduce((sum, item) => sum + toAmount(item.amount), 0);
    const totalPrepaid = fund.totalDeposited;
    const totalOutstanding = Object.values(summary).filter((row) => row.balance < 0).reduce((sum, row) => sum + Math.abs(row.balance), 0);
    return { trip, expenses, includedExpenses, plannedExpenses, summary, settlements, payments: Array.isArray(trip.payments) ? trip.payments : [], fund, totalExpense, plannedTotal, totalPrepaid, totalOutstanding, collectedDifference: fund.fundBalance };
  }
  global.TravelExpenseReport = { buildModel };
  if (typeof module !== "undefined" && module.exports) module.exports = { buildModel };
})(typeof window !== "undefined" ? window : globalThis);
