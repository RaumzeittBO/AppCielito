import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { diffRecords, type SyncRecord } from './syncDiff';

const arrays = ['products', 'customers', 'orders', 'expenses', 'incomes'] as const;
type Bucket = typeof arrays[number];
type CloudData = { products: unknown[]; customers: unknown[]; orders: unknown[]; expenses: unknown[]; incomes: unknown[]; categories: string[]; business: string; businessLogoId?: string };

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
  values.businessLogoId = businessSnapshot.exists() ? String(businessSnapshot.get('logoImageId') || '') || undefined : local.businessLogoId;
  if (!businessSnapshot.exists()) await setDoc(businessRef, { name: values.business, ...(values.businessLogoId ? { logoImageId: values.businessLogoId } : {}), updatedAt: serverTimestamp() });
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
    if (snapshot.exists()) onData({ business: String(snapshot.get('name') || ''), businessLogoId: String(snapshot.get('logoImageId') || '') || undefined });
  }, () => onStatus(false)));
  onStatus(true);
  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

export async function persistOwnerData(uid: string, value: CloudData, previous: CloudData) {
  const firestore = db;
  if (!firestore) throw new Error('Firestore no está configurado.');
  const writes: Promise<unknown>[] = [];
  for (const bucket of arrays) {
    const delta = diffRecords(rows(bucket, previous[bucket]) as SyncRecord[], rows(bucket, value[bucket]) as SyncRecord[]);
    for (const row of delta.upsert) writes.push(setDoc(doc(firestore, 'users', uid, bucket, row.id), { ...row, updatedAt: serverTimestamp() }));
    for (const id of delta.remove) writes.push(deleteDoc(doc(firestore, 'users', uid, bucket, id)));
  }
  const oldCategories = new Set(previous.categories);
  const nextCategories = new Set(value.categories);
  for (const name of nextCategories) {
    if (!oldCategories.has(name)) writes.push(setDoc(doc(firestore, 'users', uid, 'categories', encodeURIComponent(name)), { name, updatedAt: serverTimestamp() }));
  }
  for (const name of oldCategories) {
    if (!nextCategories.has(name)) writes.push(deleteDoc(doc(firestore, 'users', uid, 'categories', encodeURIComponent(name))));
  }
  if (value.business !== previous.business || value.businessLogoId !== previous.businessLogoId) {
    writes.push(setDoc(doc(firestore, 'users', uid, 'settings', 'business'), { name: value.business, ...(value.businessLogoId ? { logoImageId: value.businessLogoId } : {}), updatedAt: serverTimestamp() }));
  }
  await Promise.all(writes);
}

/** Remove a single owner record explicitly; persistOwnerData is intentionally additive. */
export async function deleteOwnerRecord(uid: string, bucket: Bucket, recordId: string) {
  if (!arrays.includes(bucket)) throw new Error('Colección no permitida.');
  if (!db) throw new Error('Firestore no está configurado.');
  await deleteDoc(doc(db, 'users', uid, bucket, recordId));
}

export async function deleteOwnerProduct(uid: string, recordId: string, imageId?: string) {
  if (!db) throw new Error('Firestore no está configurado.');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'products', recordId));
  if (imageId) batch.delete(doc(db, 'users', uid, 'images', imageId));
  await batch.commit();
}
