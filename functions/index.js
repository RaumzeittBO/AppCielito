import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

initializeApp();
const db = getFirestore();
const ownerUid = '4iftAGoQawabSz1EEpKufdPQccC2';
const toInstant = (date, time) => new Date(`${date}T${time}:00-04:00`);

export const sendDeliveryReminders = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'America/La_Paz',
  region: 'southamerica-east1',
  maxInstances: 1,
}, async () => {
  const now = Date.now();
  const userRef = db.collection('users').doc(ownerUid);
  const ordersSnapshot = await userRef.collection('orders').get();
  const orders = ordersSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  const devices = await userRef.collection('devices').get();
  const tokenDocs = devices.docs.filter(d => d.get('token'));
  const tokens = tokenDocs.map(d => d.get('token'));
  if (!tokens.length) return;

  for (const order of orders) {
    if (order.status !== 'Pendiente' || !order.time || !order.date || !order.id) continue;
    const delivery = toInstant(order.date, order.time).getTime();
    for (const [kind, sendAt] of [['15m', delivery - 15 * 60_000], ['now', delivery]]) {
      // Skip reminders created after their window; never send old alerts on re-open.
      if (now < sendAt || now >= sendAt + 3 * 60_000) continue;
      const reminderId = `${order.id}_${order.date}_${order.time}_${kind}`;
      const marker = userRef.collection('reminders').doc(reminderId);
      const claim = await db.runTransaction(async tx => {
        const existing = await tx.get(marker);
        if (existing.exists && existing.get('status') === 'sent') return false;
        if (existing.exists && existing.get('status') === 'sending' && existing.get('claimedAt')?.toMillis() > now - 5 * 60_000) return false;
        tx.set(marker, { status: 'sending', orderId: order.id, kind, sendAt: Timestamp.fromMillis(sendAt), claimedAt: Timestamp.now() });
        return true;
      });
      if (!claim) continue;
      const customer = order.customer || 'un cliente';
      const title = kind === '15m' ? 'Entrega en 15 minutos' : 'Hora de entregar';
      const body = kind === '15m'
        ? `Pronto debes entregar el pedido de ${customer}. Faltan 15 minutos.`
        : `Es hora de entregar el pedido de ${customer}.`;
      try {
        const response = await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title, body },
          data: { url: `/?orderId=${encodeURIComponent(order.id)}`, orderId: String(order.id), reminderId },
          webpush: { notification: { icon: '/icon.svg', tag: reminderId, renotify: false } },
        });
        const invalid = tokenDocs.filter((_, index) => {
          const result = response.responses[index];
          return !result.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(result.error?.code || '');
        });
        await Promise.all(invalid.map(device => device.ref.delete()));
        await marker.set({ status: 'sent', sentAt: Timestamp.now(), successCount: response.successCount }, { merge: true });
      } catch (error) {
        await marker.set({ status: 'failed', failedAt: Timestamp.now() }, { merge: true });
        logger.error('Reminder send failed', { reminderId, error });
      }
    }
  }
});
