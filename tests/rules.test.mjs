import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const ownerUid = '4iftAGoQawabSz1EEpKufdPQccC2';
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'appcielito',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
    storage: { rules: await readFile('storage.rules', 'utf8') },
  });
});
after(async () => env?.cleanup());

test('Firestore permite solamente al UID propietario', async () => {
  const owner = env.authenticatedContext(ownerUid).firestore();
  const other = env.authenticatedContext('otra-cuenta').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const path = 'users/4iftAGoQawabSz1EEpKufdPQccC2/products/p1';
  const valid = { id: 'p1', name: 'Plato', price: 35, cost: 19, active: true, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(owner, path), valid));
  await assertSucceeds(getDoc(doc(owner, path)));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(setDoc(doc(other, path), valid));
  await assertFails(getDoc(doc(anonymous, path)));
  await assertFails(setDoc(doc(owner, 'users/4iftAGoQawabSz1EEpKufdPQccC2/products/p2'), { ...valid, id: 'p2', price: -1 }));
});

test('Storage limita lectura y escritura al propietario y a imágenes pequeñas', async () => {
  const owner = env.authenticatedContext(ownerUid).storage();
  const other = env.authenticatedContext('otra-cuenta').storage();
  const anonymous = env.unauthenticatedContext().storage();
  const ownerRef = ref(owner, `users/${ownerUid}/business/logo.png`);
  const bytes = new Uint8Array([137, 80, 78, 71]);
  await assertSucceeds(uploadBytes(ownerRef, bytes, { contentType: 'image/png' }));
  await assertSucceeds(getBytes(ownerRef));
  await assertFails(getBytes(ref(other, `users/${ownerUid}/business/logo.png`)));
  await assertFails(getBytes(ref(anonymous, `users/${ownerUid}/business/logo.png`)));
  await assertFails(uploadBytes(ref(owner, `users/${ownerUid}/business/not-image.txt`), bytes, { contentType: 'text/plain' }));
});
