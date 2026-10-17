import { Bytes, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export type ImageKind = 'dish' | 'logo';
export type PreparedImage = {
  bytes: Uint8Array;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
};
export type StoredImage = PreparedImage & { id: string; size: number };
export type ProductWithImage = { id: string; name: string; price: number; cost: number; active: boolean; imageId?: string };

export const IMAGE_TARGET_BYTES = 80 * 1024;
export const IMAGE_MAX_BYTES = 200 * 1024;
export const IMAGE_MAX_DIMENSION = 640;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const imageCache = new Map<string, Promise<{ image: StoredImage; url: string }>>();

function firestore() {
  if (!db) throw new Error('Firestore no está configurado.');
  return db;
}

function blobFromBytes(bytes: Uint8Array, type: string) {
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Este navegador no pudo comprimir la imagen.')), type, quality));
}

export async function compressImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una fotografía JPG, PNG o WebP.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('La fotografía original supera 20 MB. Elige una imagen más pequeña.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se pudo abrir esta imagen. Prueba con JPG, PNG o WebP.');
  }

  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 12000 || bitmap.height > 12000) throw new Error('Las dimensiones de la fotografía no son válidas.');
    const ratio = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const baseWidth = Math.max(1, Math.round(bitmap.width * ratio));
    const baseHeight = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador no permite preparar la fotografía.');

    let best: PreparedImage | undefined;
    for (let scale = 1; scale >= 0.5; scale *= 0.85) {
      const width = Math.max(1, Math.round(baseWidth * scale));
      const height = Math.max(1, Math.round(baseHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      for (const [mimeType, quality] of [
        ['image/webp', 0.82], ['image/webp', 0.74], ['image/webp', 0.66], ['image/webp', 0.58], ['image/webp', 0.5], ['image/webp', 0.42],
        ['image/jpeg', 0.78], ['image/jpeg', 0.68], ['image/jpeg', 0.58], ['image/jpeg', 0.48],
      ] as const) {
        let blob: Blob;
        try {
          if (mimeType === 'image/jpeg') {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            context.drawImage(bitmap, 0, 0, width, height);
          }
          blob = await canvasBlob(canvas, mimeType, quality);
        } catch {
          if (mimeType === 'image/webp') continue;
          throw new Error('No se pudo comprimir la fotografía.');
        }
        const actualType = blob.type === 'image/webp' ? 'image/webp' : blob.type === 'image/jpeg' ? 'image/jpeg' : null;
        if (!actualType) continue;
        const candidate: PreparedImage = { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: actualType, width, height };
        if (candidate.bytes.byteLength <= IMAGE_TARGET_BYTES) return candidate;
        if (candidate.bytes.byteLength <= IMAGE_MAX_BYTES) best = candidate;
      }
    }
    if (best) return best;
    throw new Error('La fotografía no se pudo reducir por debajo de 200 KB. Prueba con otra imagen.');
  } finally {
    bitmap.close();
  }
}

async function writeImage(uid: string, id: string, kind: ImageKind, image: PreparedImage) {
  if (image.bytes.byteLength < 1 || image.bytes.byteLength > IMAGE_MAX_BYTES) throw new Error('La imagen debe pesar como máximo 200 KB.');
  if (image.width < 1 || image.height < 1 || image.width > IMAGE_MAX_DIMENSION || image.height > IMAGE_MAX_DIMENSION) throw new Error('La imagen supera las dimensiones permitidas.');
  if (image.mimeType !== 'image/webp' && image.mimeType !== 'image/jpeg') throw new Error('Formato de imagen no permitido.');
  await setDoc(doc(firestore(), 'users', uid, 'images', id), {
    id,
    kind,
    mimeType: image.mimeType,
    bytes: Bytes.fromUint8Array(image.bytes),
    size: image.bytes.byteLength,
    width: image.width,
    height: image.height,
    updatedAt: serverTimestamp(),
  });
}

export async function saveProductImage(uid: string, product: ProductWithImage, image: PreparedImage): Promise<string> {
  const database = firestore();
  const imageId = crypto.randomUUID();
  await writeImage(uid, imageId, 'dish', image);
  const batch = writeBatch(database);
  batch.update(doc(database, 'users', uid, 'products', product.id), { imageId, updatedAt: serverTimestamp() });
  if (product.imageId) batch.delete(doc(database, 'users', uid, 'images', product.imageId));
  try {
    await batch.commit();
    return imageId;
  } catch (error) {
    await deleteDoc(doc(database, 'users', uid, 'images', imageId)).catch(() => undefined);
    throw error;
  }
}

export async function removeProductImage(uid: string, product: ProductWithImage) {
  if (!product.imageId) return;
  const database = firestore();
  const batch = writeBatch(database);
  batch.update(doc(database, 'users', uid, 'products', product.id), { imageId: deleteField(), updatedAt: serverTimestamp() });
  batch.delete(doc(database, 'users', uid, 'images', product.imageId));
  await batch.commit();
}

export async function saveBusinessLogo(uid: string, oldImageId: string | undefined, image: PreparedImage): Promise<string> {
  const database = firestore();
  const imageId = crypto.randomUUID();
  await writeImage(uid, imageId, 'logo', image);
  const batch = writeBatch(database);
  batch.update(doc(database, 'users', uid, 'settings', 'business'), { logoImageId: imageId, updatedAt: serverTimestamp() });
  if (oldImageId) batch.delete(doc(database, 'users', uid, 'images', oldImageId));
  try {
    await batch.commit();
    return imageId;
  } catch (error) {
    await deleteDoc(doc(database, 'users', uid, 'images', imageId)).catch(() => undefined);
    throw error;
  }
}

export async function removeBusinessLogo(uid: string, imageId: string | undefined) {
  if (!imageId) return;
  const database = firestore();
  const batch = writeBatch(database);
  batch.update(doc(database, 'users', uid, 'settings', 'business'), { logoImageId: deleteField(), updatedAt: serverTimestamp() });
  batch.delete(doc(database, 'users', uid, 'images', imageId));
  await batch.commit();
}

export async function readImage(uid: string, imageId: string) {
  const key = `${uid}/${imageId}`;
  let pending = imageCache.get(key);
  if (!pending) {
    pending = (async () => {
      const snapshot = await getDoc(doc(firestore(), 'users', uid, 'images', imageId));
      if (!snapshot.exists()) throw new Error('La imagen ya no está disponible.');
      const data = snapshot.data();
      if (!(data.bytes instanceof Bytes) || (data.mimeType !== 'image/webp' && data.mimeType !== 'image/jpeg')) throw new Error('La imagen guardada no es válida.');
      const bytes = data.bytes.toUint8Array();
      const image: StoredImage = { id: imageId, bytes, mimeType: data.mimeType, width: data.width, height: data.height, size: bytes.byteLength };
      const url = URL.createObjectURL(blobFromBytes(bytes, image.mimeType));
      return { image, url };
    })();
    imageCache.set(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    imageCache.delete(key);
    throw error;
  }
}

export async function readImageDataUrl(uid: string, imageId: string) {
  const { image } = await readImage(uid, imageId);
  let binary = '';
  for (let start = 0; start < image.bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...image.bytes.subarray(start, start + 0x8000));
  }
  return `data:${image.mimeType};base64,${btoa(binary)}`;
}
