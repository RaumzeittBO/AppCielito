export type PaymentMethod = 'Efectivo' | 'QR / transferencia' | 'Otro / sin detalle';
export type Payment = { id: string; amount: number; date: string; method: PaymentMethod };

export function paymentTotals(payments: Payment[]) {
  return payments.reduce((totals, payment) => {
    totals[payment.method] += payment.amount;
    return totals;
  }, { 'Efectivo': 0, 'QR / transferencia': 0, 'Otro / sin detalle': 0 });
}

export function getBalance(total: number, paid: number) {
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

export function validPayment(total: number, paid: number, amount: number) {
  return Number.isFinite(amount) && amount > 0 && amount <= getBalance(total, paid);
}

export function getDateRange(date: string, range: 'day' | 'week' | 'month') {
  if (range === 'day') return { from: date, to: date };
  const parsed = new Date(`${date}T12:00:00-04:00`);
  if (range === 'week') {
    const weekday = (parsed.getDay() + 6) % 7;
    parsed.setDate(parsed.getDate() - weekday);
    const from = formatDate(parsed);
    parsed.setDate(parsed.getDate() + 6);
    return { from, to: formatDate(parsed) };
  }
  const year = parsed.getFullYear();
  const month = parsed.getMonth();
  return {
    from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`,
  };
}

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getOrderCost(items: Array<{ qty: number; cost: number }>) {
  return items.reduce((sum, item) => sum + item.qty * item.cost, 0);
}
