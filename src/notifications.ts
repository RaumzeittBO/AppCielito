import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db, firebaseApp } from './firebase';

export async function enablePush(user: User) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !firebaseApp || !db) {
    throw new Error('Este navegador no permite notificaciones push.');
  }
  if (!(await isSupported())) throw new Error('Este navegador no es compatible con Firebase Messaging.');
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error('Falta configurar la clave pública VAPID de Firebase.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No se concedió permiso para notificaciones.');
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token || auth?.currentUser?.uid !== user.uid) throw new Error('No se pudo registrar este dispositivo.');
  await setDoc(doc(db, 'users', user.uid, 'devices', encodeURIComponent(token)), {
    token,
    platform: navigator.userAgent,
    updatedAt: new Date().toISOString(),
  });
  return true;
}
