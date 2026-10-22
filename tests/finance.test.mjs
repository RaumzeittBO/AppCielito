import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableAmount, getCategoryTotals, getIncomeSummaries, getPendingPlateCount } from '../src/finance.ts';

test('los ingresos de venta aparecen una sola vez al entregar y conservan pagos reales', () => {
  const order = { id: 'o1', customer: 'Ana', date: '2026-10-20', status: 'Pendiente', total: 100, paid: 40, method: 'Efectivo', items: [{ name: 'Plato', qty: 2, price: 50 }], payments: [{ id: 'p1', amount: 40, method: 'Efectivo', date: '2026-10-20T12:00:00-04:00' }] };
  assert.deepEqual(getIncomeSummaries([], [order], '2026-10-20', '2026-10-20'), []);
  const delivered = { ...order, status: 'Entregado' };
  const summary = getIncomeSummaries([], [delivered], '2026-10-20', '2026-10-20');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].incomeId, 'sale:o1');
  assert.equal(summary[0].amount, 40);
  assert.equal(summary[0].periodAmount, 40);
  assert.equal(summary[0].balanceDue, 60);
});

test('un abono posterior se cuenta en la fecha efectiva del pago, no en la fecha del pedido', () => {
  const order = { id: 'o1', customer: 'Ana', date: '2026-10-20', status: 'Entregado', total: 100, paid: 100, method: 'Mixto', items: [{ name: 'Plato', qty: 1, price: 100 }], payments: [
    { id: 'p1', amount: 40, method: 'Efectivo', date: '2026-10-20T12:00:00-04:00' },
    { id: 'p2', amount: 60, method: 'QR / transferencia', date: '2026-10-22T12:00:00-04:00' },
  ] };
  assert.equal(getIncomeSummaries([], [order], '2026-10-22', '2026-10-22')[0].periodAmount, 60);
  assert.equal(getIncomeSummaries([], [order], '2026-10-22', '2026-10-22')[0].date, '2026-10-22');
});

test('los ingresos manuales usan sus pagos por fecha y admiten deducciones enlazadas sin duplicar gastos', () => {
  const income = { id: 'i1', amount: 100, category: 'Otros ingresos', date: '2026-10-20', note: 'Venta extra', payments: [
    { id: 'p1', amount: 30, method: 'Efectivo', date: '2026-10-20' },
    { id: 'p2', amount: 70, method: 'QR / transferencia', date: '2026-10-21' },
  ] };
  const summary = getIncomeSummaries([income], [], '2026-10-21', '2026-10-21')[0];
  assert.equal(summary.periodAmount, 70);
  const deductions = [{ id: 'd1', incomeId: 'manual:i1', amount: 25, note: 'Pollo', date: '2026-10-21', expenseId: 'e1' }];
  assert.equal(getAvailableAmount(summary, deductions), 75);
  const noDiscounts = getIncomeSummaries([{ ...income, amount: 100 }], [], '2026-10-20', '2026-10-20')[0];
  assert.equal(getAvailableAmount(noDiscounts, []), 100);
  assert.deepEqual(getCategoryTotals([{ category: 'Carne', amount: 20 }, { category: 'Carne', amount: 5 }]), [{ category: 'Carne', amount: 25 }]);
});

test('el resumen de pedidos pendientes cuenta platos y no comandas', () => {
  assert.equal(getPendingPlateCount([
    { status: 'Pendiente', items: [{ qty: 3 }, { qty: 2 }] },
    { status: 'Entregado', items: [{ qty: 10 }] },
    { status: 'Pendiente', items: [{ qty: 1 }] },
  ]), 6);
});
