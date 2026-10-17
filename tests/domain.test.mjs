import test from 'node:test';
import assert from 'node:assert/strict';
import { getBalance, getDateRange, paymentTotals, validPayment } from '../src/domain.ts';

test('un pago mixto conserva el total por método', () => {
  const totals = paymentTotals([
    { id: '1', amount: 40, method: 'Efectivo', date: '2026-01-01' },
    { id: '2', amount: 60, method: 'QR / transferencia', date: '2026-01-01' },
    { id: '3', amount: 5, method: 'Efectivo', date: '2026-01-02' },
  ]);
  assert.deepEqual(totals, { Efectivo: 45, 'QR / transferencia': 60, 'Otro / sin detalle': 0 });
});

test('el saldo y los abonos respetan el total pendiente', () => {
  assert.equal(getBalance(100, 40), 60);
  assert.equal(getBalance(100, 105), 0);
  assert.equal(validPayment(100, 40, 60), true);
  assert.equal(validPayment(100, 40, 60.01), false);
  assert.equal(validPayment(100, 40, 0), false);
  assert.equal(validPayment(100, 40, Number.NaN), false);
});

test('los filtros generan rangos locales de semana y mes', () => {
  assert.deepEqual(getDateRange('2026-10-16', 'day'), { from: '2026-10-16', to: '2026-10-16' });
  assert.deepEqual(getDateRange('2026-10-16', 'week'), { from: '2026-10-12', to: '2026-10-18' });
  assert.deepEqual(getDateRange('2026-10-16', 'month'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(getDateRange('2026-02-10', 'month'), { from: '2026-02-01', to: '2026-02-28' });
});
