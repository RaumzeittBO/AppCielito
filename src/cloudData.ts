import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

const arrays = ['products', 'customers', 'orders', 'expenses', 'incomes'] as const;
type Bucket = typeof arrays[number];
type CloudData = { products: unknown[]; customers: unknown[]; orders: unknown[]; expenses: unknown[]; incomes: unknown[]; categories: string[]; business: string };

function rows(bucket: Bucket, values: unknown[]) {
  return values.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id ? record.id : `${bucket}-${index}`;
    return [{ id, ...record }];
  });
}

export async function hydrateOwnerData(uid: string, local: CloudData, onData: (value: Partial<CloudData>) => void, onStatus: (ok: boolean) => void): Promise<Unsubscribe> {
  const firestore = db;
  if (!firestore) throw new Error('Firestore no está configurado.');
  const legacySnapshot = await getDocs(collection(firestore, 'users', uid, 'records'));
  const legacy: Record<string, unknown> = {};
  legacySnapshot.docs.forEach(snapshot => {
    const value = snapshot.data() as { key?: string; value?: unknown };
    if (value.key) legacy[value.key] = value.value;
  });

  const values: Partial<CloudData> = {};
  const snapshots = await Promise.all(arrays.map(bucket => getDocs(collection(firestore, 'users', uid, bucket))));
  for (let i = 0; i < arrays.length; i++) {
    const bucket = arrays[i];
    const snapshot = snapshots[i];
    if (snapshot.empty) {
      const source = Array.isArray(legacy[bucket]) ? legacy[bucket] as unknown[] : local[bucket] as unknown[];
      values[bucket] = source;
      await Promise.all(rows(bucket, source).map(row => setDoc(doc(firestore, 'users', uid, bucket, String(row.id)), { ...row, updatedAt: serverTimestamp() })));
    } else {
      values[bucket] = snapshot.docs.map(item => item.data());
    }
  }
  const categorySnapshot = await getDocs(collection(firestore, 'users', uid, 'categories'));
  values.categories = categorySnapshot.empty
    ? (Array.isArray(legacy.categories) ? legacy.categories as string[] : local.categories)
    : categorySnapshot.docs.map(item => String(item.get('name')));
  if (categorySnapshot.empty) {
    await Promise.all(values.categories.map(name => setDoc(doc(firestore, 'users', uid, 'categories', encodeURIComponent(name)), { name, updatedAt: serverTimestamp() })));
  }
  const businessRef = doc(firestore, 'users', uid, 'settings', 'business');
  const businessSnapshot = await getDoc(businessRef);
  values.business = businessSnapshot.exists() ? String(businessSnapshot.get('name') || '') : String(legacy.business || local.business);
  if (!businessSnapshot.exists()) await setDoc(businessRef, { name: values.business, updatedAt: serverTimestamp() });
  onData(values);

  const unsubscribers: Unsubscribe[] = [];
  for (const bucket of arrays) {
    unsubscribers.push(onSnapshot(collection(firestore, 'users', uid, bucket), snapshot => {
      onData({ [bucket]: snapshot.docs.map(item => item.data()) } as Partial<CloudData>);
      onStatus(true);
    }, () => onStatus(false)));
  }
  unsubscribers.push(onSnapshot(collection(firestore, 'users', uid, 'categories'), snapshot => {
    onData({ categories: snapshot.docs.map(item => String(item.get('name'))) });
  }, () => onStatus(false)));
  unsubscribers.push(onSnapshot(businessRef, snapshot => {
    if (snapshot.exists()) onData({ business: String(snapshot.get('name') || '') });
  }, () => onStatus(false)));
  onStatus(true);
  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

export async function persistOwnerData(uid: string, value: CloudData) {
  const firestore = db;
  if (!firestore) throw new Error('Firestore no está configurado.');
  await Promise.all([
    ...arrays.flatMap(bucket => rows(bucket, value[bucket]).map(row => setDoc(doc(firestore, 'users', uid, bucket, String(row.id)), { ...row, updatedAt: serverTimestamp() }))),
    ...value.categories.map(name => setDoc(doc(firestore, 'users', uid, 'categories', encodeURIComponent(name)), { name, updatedAt: serverTimestamp() })),
    setDoc(doc(firestore, 'users', uid, 'settings', 'business'), { name: value.business, updatedAt: serverTimestamp() }),
  ]);
}
