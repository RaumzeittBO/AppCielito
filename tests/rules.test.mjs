import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Bytes, deleteField, doc, setDoc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
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

test('Firestore protege las imágenes y limita tipo, dimensiones y bytes', async () => {
  const owner = env.authenticatedContext(ownerUid).firestore();
  const other = env.authenticatedContext('otra-cuenta').firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const path = `users/${ownerUid}/images/plato-1`;
  const valid = {
    id: 'plato-1', kind: 'dish', mimeType: 'image/webp',
    bytes: Bytes.fromUint8Array(Uint8Array.from([1, 2, 3, 4])), size: 4,
    width: 640, height: 480, updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(owner, path), valid));
  await assertSucceeds(getDoc(doc(owner, path)));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(setDoc(doc(other, path), valid));
  await assertFails(getDoc(doc(anonymous, path)));
  await assertFails(setDoc(doc(anonymous, path), valid));
  await assertFails(setDoc(doc(owner, `users/${ownerUid}/images/large`), {
    ...valid, id: 'large', bytes: Bytes.fromUint8Array(new Uint8Array(204801)), size: 204801,
  }));
  await assertFails(setDoc(doc(owner, `users/${ownerUid}/images/fake-type`), {
    ...valid, id: 'fake-type', mimeType: 'image/png',
  }));
  await assertFails(setDoc(doc(owner, `users/${ownerUid}/images/large-dimensions`), {
    ...valid, id: 'large-dimensions', width: 641,
  }));
  await assertSucceeds(setDoc(doc(owner, `users/${ownerUid}/images/logo-1`), {
    ...valid, id: 'logo-1', kind: 'logo', width: 300, height: 150,
  }));
});

test('Firestore permite guardar categorías y actualizar el logo del negocio con su esquema real', async () => {
  const owner = env.authenticatedContext(ownerUid).firestore();
  const other = env.authenticatedContext('otra-cuenta').firestore();
  const category = doc(owner, `users/${ownerUid}/categories/${encodeURIComponent('Ingredientes')}`);
  const business = doc(owner, `users/${ownerUid}/settings/business`);
  const logo = doc(owner, `users/${ownerUid}/images/logo-audit`);

  await assertSucceeds(setDoc(category, { name: 'Ingredientes', updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(business, { name: 'Cielito', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(other, `users/${ownerUid}/settings/business`), { name: 'Intruso', updatedAt: serverTimestamp() }));

  await assertSucceeds(setDoc(logo, {
    id: 'logo-audit', kind: 'logo', mimeType: 'image/webp', bytes: Bytes.fromUint8Array(Uint8Array.from([1, 2, 3])),
    size: 3, width: 320, height: 180, updatedAt: serverTimestamp(),
  }));
  const attachLogo = writeBatch(owner);
  attachLogo.update(business, { logoImageId: 'logo-audit', updatedAt: serverTimestamp() });
  await assertSucceeds(attachLogo.commit());
  assert.equal((await getDoc(business)).get('logoImageId'), 'logo-audit');
});

test('Firestore permite registrar tokens FCM solamente con identidad y timestamp válidos', async () => {
  const owner = env.authenticatedContext(ownerUid).firestore();
  const deviceId = encodeURIComponent('token-device-audit');
  const device = doc(owner, `users/${ownerUid}/devices/${deviceId}`);
  await assertSucceeds(setDoc(device, {
    id: deviceId, token: 'token-device-audit', platform: 'test browser', updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(owner, `users/${ownerUid}/devices/invalid-id`), {
    id: 'different-id', token: 'token-device-audit', platform: 'test browser', updatedAt: serverTimestamp(),
  }));
});

test('La referencia a la imagen se cambia o elimina sin borrar otros datos del producto', async () => {
  const owner = env.authenticatedContext(ownerUid).firestore();
  const product = doc(owner, `users/${ownerUid}/products/with-image`);
  const image = doc(owner, `users/${ownerUid}/images/replace-me`);
  await assertSucceeds(setDoc(product, { id: 'with-image', name: 'Plato', price: 10, cost: 4, active: true, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(image, {
    id: 'replace-me', kind: 'dish', mimeType: 'image/jpeg', bytes: Bytes.fromUint8Array(Uint8Array.from([7, 8])), size: 2,
    width: 320, height: 240, updatedAt: serverTimestamp(),
  }));
  const attach = writeBatch(owner);
  attach.update(product, { imageId: 'replace-me', updatedAt: serverTimestamp() });
  await assertSucceeds(attach.commit());
  const remove = writeBatch(owner);
  remove.update(product, { imageId: deleteField(), updatedAt: serverTimestamp() });
  remove.delete(image);
  await assertSucceeds(remove.commit());
  const stored = (await getDoc(product)).data();
  assert.equal(stored.name, 'Plato');
  assert.equal(stored.imageId, undefined);
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
