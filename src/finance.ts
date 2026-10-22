import { getBalance, sumCurrency, type Payment, type PaymentMethod } from './domain.ts';

export type FinanceLine = { name: string; qty: number; price: number };
export type FinanceOrder = {
  id: string; customer: string; date: string; status: string; total: number; paid: number;
  method: string; items: FinanceLine[]; payments?: Payment[];
};
export type ManualIncome = {
  id: string; amount: number; category: string; date: string; note: string;
  method?: string; payments?: Payment[]; source?: 'manual';
};
export type IncomeSummary = {
  id: string; source: 'manual' | 'sale'; category: string; date: string; title: string;
  amount: number; periodAmount: number; payments: Payment[]; totalSold?: number;
  balanceDue?: number; order?: FinanceOrder; incomeId: string;
};
export type IncomeDeduction = {
  id: string; incomeId: string; amount: number; note: string; category?: string;
  date: string; expenseId?: string;
};

function localDate(value: string) {
  if (value.length === 10) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(date);
}

function paymentDate(payment: Payment, fallback: string) {
  return localDate(payment.date || fallback);
}

function orderPayments(order: FinanceOrder): Payment[] {
  if (order.payments?.length) return order.payments;
  if (!order.paid) return [];
  const normalized = order.method.toLowerCase();
  const method: PaymentMethod = normalized.includes('qr') || normalized.includes('transfer')
    ? 'QR / transferencia'
    : normalized.includes('efectivo') || normalized.includes('cash')
      ? 'Efectivo'
      : 'Otro / sin detalle';
  return [{ id: `historic-${order.id}`, amount: order.paid, method, date: order.date }];
}

function manualPayments(income: ManualIncome): Payment[] {
  if (income.payments?.length) return income.payments;
  const normalized = (income.method || '').toLowerCase();
  const method: PaymentMethod = normalized.includes('qr') || normalized.includes('transfer')
    ? 'QR / transferencia'
    : normalized.includes('efectivo') || normalized.includes('cash')
      ? 'Efectivo'
      : 'Otro / sin detalle';
  return [{ id: `historic-${income.id}`, amount: income.amount, method, date: income.date }];
}

function amountInRange(payments: Payment[], fallbackDate: string, from: string, to: string) {
  return sumCurrency(payments.filter(payment => paymentDate(payment, fallbackDate) >= from && paymentDate(payment, fallbackDate) <= to).map(payment => payment.amount));
}

function latestPaymentDate(payments: Payment[], fallbackDate: string, from: string, to: string) {
  const dates = payments.map(payment => paymentDate(payment, fallbackDate)).filter(date => date >= from && date <= to).sort();
  return dates.at(-1) || fallbackDate;
}

export function getIncomeSummaries(
  incomes: ManualIncome[], orders: FinanceOrder[], from: string, to: string,
): IncomeSummary[] {
  const rows: IncomeSummary[] = [];
  for (const income of incomes) {
    const payments = manualPayments(income);
    const periodAmount = amountInRange(payments, income.date, from, to);
    if (!periodAmount) continue;
    rows.push({
      id: `manual:${income.id}`, incomeId: `manual:${income.id}`, source: 'manual',
      category: income.category, date: latestPaymentDate(payments, income.date, from, to), title: income.note || income.category,
      amount: income.amount, periodAmount, payments,
    });
  }
  for (const order of orders) {
    if (order.status !== 'Entregado') continue;
    const payments = orderPayments(order);
    const periodAmount = amountInRange(payments, order.date, from, to);
    if (!periodAmount && (payments.length || order.date < from || order.date > to)) continue;
    rows.push({
      id: `sale:${order.id}`, incomeId: `sale:${order.id}`, source: 'sale',
      category: 'Venta de comida', date: latestPaymentDate(payments, order.date, from, to),
      title: order.customer ? `Venta de comida — ${order.customer}` : 'Venta de comida — venta sin cliente',
      amount: order.paid, periodAmount, payments, totalSold: order.total,
      balanceDue: getBalance(order.total, order.paid), order,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function getAvailableAmount(income: IncomeSummary, deductions: IncomeDeduction[]) {
  return Math.max(0, sumCurrency([income.amount, -sumCurrency(deductions
    .filter(item => item.incomeId === income.incomeId)
    .map(item => item.amount))]));
}

export function getPendingPlateCount(orders: Array<{ status: string; items: Array<{ qty: number }> }>) {
  return orders.filter(order => order.status === 'Pendiente')
    .reduce((total, order) => total + order.items.reduce((count, item) => count + item.qty, 0), 0);
}

export function getCategoryTotals(expenses: Array<{ category: string; amount: number }>) {
  const totals = new Map<string, number>();
  for (const expense of expenses) totals.set(expense.category, sumCurrency([totals.get(expense.category) || 0, expense.amount]));
  return [...totals.entries()].map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}
