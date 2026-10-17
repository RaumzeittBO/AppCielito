import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, Trash2, Upload, X } from 'lucide-react';
import { compressImage, IMAGE_TARGET_BYTES, readImage, type ImageKind, type PreparedImage } from './managedImages';

export function CloudImage({ uid, imageId, alt, className = '' }: { uid?: string; imageId?: string; alt: string; className?: string }) {
  const imageRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState('');
  useEffect(() => {
    setSrc('');
    setVisible(false);
    const element = imageRef.current;
    if (!uid || !imageId || !element) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [uid, imageId]);
  useEffect(() => {
    if (!visible || !uid || !imageId) return;
    let mounted = true;
    void readImage(uid, imageId).then(result => {
      if (mounted) setSrc(result.url);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [visible, uid, imageId]);
  return <span ref={imageRef} className={`image-holder ${className}`}>{src ? <img src={src} alt={alt} loading="lazy"/> : <span className="image-placeholder" aria-label={alt}><ImagePlus size={18} aria-hidden="true" /></span>}</span>;
}

export function PhotoEditor({ uid, imageId, kind, title, onSave, onDelete, onClose }: {
  uid: string;
  imageId?: string;
  kind: ImageKind;
  title: string;
  onSave: (image: PreparedImage) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose?: () => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef('');
  const [prepared, setPrepared] = useState<PreparedImage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const clearPreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = '';
  };
  useEffect(() => () => clearPreview(), []);
  const choose = async (file?: File) => {
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const result = await compressImage(file);
      clearPreview();
      previewRef.current = URL.createObjectURL(new Blob([result.bytes.slice().buffer as ArrayBuffer], { type: result.mimeType }));
      setPrepared(result);
      setMessage(result.bytes.byteLength <= IMAGE_TARGET_BYTES ? 'Imagen optimizada para sincronizar.' : 'Imagen optimizada; quedó cerca del límite recomendado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo preparar la imagen.');
    }
  };
  const save = async () => {
    if (!prepared) return;
    setBusy(true);
    setError('');
    try {
      await onSave(prepared);
      setPrepared(undefined);
      clearPreview();
      setMessage('Imagen guardada y sincronizada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la imagen. La imagen anterior se conserva.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!imageId || !window.confirm('¿Eliminar esta fotografía?')) return;
    setBusy(true);
    setError('');
    try {
      await onDelete();
      setPrepared(undefined);
      clearPreview();
      setMessage('Fotografía eliminada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo eliminar la fotografía.');
    } finally {
      setBusy(false);
    }
  };
  const preview = prepared ? previewRef.current : undefined;
  return <section className="photo-editor" aria-label={title}>
    <input ref={galleryRef} className="visually-hidden" type="file" accept="image/*" onChange={event => { void choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={event => { void choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    <div className="photo-editor-head"><div><h3>{title}</h3><p>{kind === 'logo' ? 'El logo' : 'La fotografía'} se ajusta hasta 640 × 640 px y se comprime a 200 KB como máximo.</p></div>{onClose&&<button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={18}/></button>}</div>
    <div className="photo-editor-preview">{preview ? <img src={preview} alt="Vista previa de la nueva imagen"/> : imageId ? <CloudImage uid={uid} imageId={imageId} alt={title}/> : <div className="photo-empty"><ImagePlus size={26}/><span>Sin fotografía</span></div>}</div>
    {prepared && <small className="photo-meta">Vista previa · {prepared.width} × {prepared.height} px · {(prepared.bytes.byteLength / 1024).toFixed(0)} KB · {prepared.mimeType === 'image/webp' ? 'WebP' : 'JPEG'}</small>}
    <div className="photo-actions"><button className="secondary" type="button" disabled={busy} onClick={() => galleryRef.current?.click()}><Upload size={16}/>Galería</button><button className="secondary" type="button" disabled={busy} onClick={() => cameraRef.current?.click()}><Camera size={16}/>Cámara</button></div>
    {prepared && <div className="photo-actions"><button className="primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Upload size={16}/>}Guardar imagen</button><button className="secondary" type="button" disabled={busy} onClick={() => { setPrepared(undefined); clearPreview(); setMessage(''); }}>Cancelar cambio</button></div>}
    {imageId && <button className="danger-button" type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/>Eliminar fotografía</button>}
    {message && <p className="photo-message" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
