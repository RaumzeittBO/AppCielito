import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, ChevronRight, Download, ImagePlus, LogOut, Package, Printer, Plus, Settings, Users, Wallet, Trash2, Edit3 } from 'lucide-react';
import { CloudImage, PhotoEditor } from './ManagedImageUi';
import { removeProductImage, saveProductImage, saveBusinessLogo, removeBusinessLogo, type PreparedImage } from './managedImages';
import type { ProductWithImage } from './managedImages';
import { useBodyScrollLock } from './useBodyScrollLock';

type Product = ProductWithImage;
type Customer = { id: string; name: string; phone: string };
type MoreScreenProps = {
  products: Product[]; customers: Customer[]; business: string; businessLogoId?: string; uid?: string;
  soldProductIds: Set<string>;
  onAddProduct: (name: string, price: number, cost: number) => Promise<boolean>;
  onEditProduct: (product: Product) => Promise<boolean>; onDeleteProduct: (id: string, imageId?: string) => void | Promise<void>;
  onToggleProduct: (id: string) => Promise<boolean>; onAddCustomer: (name: string, phone: string) => Promise<boolean>;
  onSaveBusiness: (name: string) => Promise<boolean>; onProductImageSaved: (id: string, imageId: string) => void;
  onProductImageDeleted: (id: string) => void; onBusinessLogoSaved: (imageId: string) => void;
  onBusinessLogoDeleted: () => void; onToast: (message: string) => void;
  onInstall: () => void; onLogout: () => void;
};

type Section = '' | 'Productos' | 'Clientes' | 'Configuración' | 'Impresora';

export function MoreScreen(props: MoreScreenProps) {
  const { products, customers, business, businessLogoId, uid, soldProductIds, onAddProduct, onEditProduct, onDeleteProduct,
    onToggleProduct, onAddCustomer, onSaveBusiness, onProductImageSaved, onProductImageDeleted, onBusinessLogoSaved,
    onBusinessLogoDeleted, onToast, onInstall, onLogout } = props;
  const [section, setSection] = useState<Section>('');
  const [photoProductId, setPhotoProductId] = useState('');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [name, setName] = useState(''), [price, setPrice] = useState(''), [cost, setCost] = useState('');
  const [customer, setCustomer] = useState(''), [phone, setPhone] = useState(''), [businessDraft, setBusinessDraft] = useState(business);
  const [busy, setBusy] = useState(false);
  const [paper, setPaper] = useState<'58mm' | '80mm'>(() => localStorage.getItem('cielito-paper-width') === '80mm' ? '80mm' : '58mm');
  const [printer, setPrinter] = useState(() => localStorage.getItem('cielito-printer-label') || '');
  useEffect(() => setBusinessDraft(business), [business]);
  useBodyScrollLock(Boolean(photoProductId || editProduct));

  const addProduct = async () => {
    if (!name.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0 || !Number.isFinite(Number(cost)) || Number(cost) < 0) return;
    setBusy(true);
    try {
      if (await onAddProduct(name.trim(), Number(price), Number(cost))) {
        setName(''); setPrice(''); setCost(''); onToast('Plato agregado');
      }
    } finally { setBusy(false); }
  };
  const savePhoto = async (product: Product, image: PreparedImage) => {
    if (!uid) throw new Error('Inicia sesión para guardar fotografías.');
    const imageId = await saveProductImage(uid, product, image); onProductImageSaved(product.id, imageId); onToast('Fotografía guardada y sincronizada.');
  };
  const deletePhoto = async (product: Product) => {
    if (!uid) throw new Error('Inicia sesión para eliminar fotografías.');
    await removeProductImage(uid, product); onProductImageDeleted(product.id); onToast('Fotografía eliminada.');
  };
  const deleteProduct = async (product: Product) => {
    setBusy(true);
    try {
      await onDeleteProduct(product.id, product.imageId);
      onToast('Plato eliminado');
    } catch {
      onToast('No se pudo eliminar. Comprueba la conexión e inténtalo otra vez.');
    } finally { setBusy(false); }
  };
  const toggleProduct = async (product: Product) => {
    setBusy(true);
    try {
      if (await onToggleProduct(product.id)) onToast(product.active ? (soldProductIds.has(product.id) ? 'Plato archivado; sus pedidos se conservaron.' : 'Plato pausado.') : 'Plato disponible de nuevo.');
    } finally { setBusy(false); }
  };
  const back = <button className="back-button" onClick={() => { setSection(''); setEditProduct(null); }} aria-label="Volver a Más"><ArrowLeft size={21}/></button>;

  if (section === 'Productos') return <>
    <div className="page-title secondary-page-title"><div className="page-title-leading">{back}<div><div className="eyebrow">TU MENÚ</div><h1>Productos</h1><p>Precios, costos y disponibilidad.</p></div></div><button className="primary" onClick={() => document.getElementById('new-product-name')?.focus()}><Plus size={18}/>Agregar</button></div>
    <form className="panel product-form" onSubmit={event => { event.preventDefault(); void addProduct(); }}><div className="eyebrow">NUEVO PLATO</div><label className="form-label">Nombre<input id="new-product-name" required value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Picante de pollo"/></label><div className="delivery-fields"><label className="form-label">Precio de venta · Bs<input required type="number" min="0.01" step="0.01" value={price} onChange={event => setPrice(event.target.value)} placeholder="0.00"/></label><label className="form-label">Costo estimado · Bs<input required type="number" min="0" step="0.01" value={cost} onChange={event => setCost(event.target.value)} placeholder="0.00"/></label></div><button className="primary" disabled={busy || !name.trim() || Number(price) <= 0}>{busy ? 'Guardando…' : <><Plus size={17}/>Guardar plato</>}</button></form>
    <div className="section-head"><div><div className="eyebrow">CATÁLOGO</div><h2>Tus platos</h2></div><span className="muted">{products.filter(product => product.active).length} disponibles</span></div>
    <div className="product-admin-list">{products.map(product => <article className={`product-admin-card ${!product.active ? 'is-paused' : ''}`} key={product.id}><CloudImage uid={uid} imageId={product.imageId} alt={`Fotografía de ${product.name}`} className="product-admin-image"/><div className="product-admin-main"><b>{product.name}</b><span>Venta {currency(product.price)} · costo {currency(product.cost)}</span><small>Margen estimado por unidad <b>{currency(product.price - product.cost)}</b></small><span className={`product-state ${product.active ? 'available' : ''}`}>{product.active ? 'Disponible' : 'Pausado'}</span></div><div className="product-admin-actions"><button className="icon-button" disabled={busy} onClick={() => setEditProduct(product)} aria-label={`Editar ${product.name}`} title="Editar"><Edit3 size={17}/></button><button className="icon-button" onClick={() => setPhotoProductId(product.id)} aria-label={`Cambiar foto de ${product.name}`} title={product.imageId ? 'Cambiar fotografía' : 'Agregar fotografía'} disabled={!uid || busy}><ImagePlus size={18}/></button>{soldProductIds.has(product.id) ? <button className="secondary compact" disabled={busy} onClick={() => { if (product.active && !window.confirm(`“${product.name}” tiene pedidos anteriores. Se ocultará del menú y sus pedidos se conservarán.`)) return; void toggleProduct(product); }}>{product.active ? 'Archivar' : 'Reactivar'}</button> : <><button className="secondary compact" disabled={busy} onClick={() => void toggleProduct(product)}>{product.active ? 'Pausar' : 'Reactivar'}</button><button className="icon-button danger-icon" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar “${product.name}”?`)) void deleteProduct(product); }} aria-label="Eliminar plato"><Trash2 size={17}/></button></>}</div></article>)}{!products.length && <div className="empty"><b>Aún no hay platos</b><p>Agrega el primero para comenzar a vender.</p></div>}</div>
    {photoProductId && (() => { const product = products.find(item => item.id === photoProductId); return product ? <div className="modal-backdrop"><div className="modal photo-modal"><PhotoEditor uid={uid || ''} imageId={product.imageId} kind="dish" title={`Foto de ${product.name}`} onSave={image => savePhoto(product, image)} onDelete={() => deletePhoto(product)} onClose={() => setPhotoProductId('')}/></div></div> : null; })()}
    {editProduct && <ProductEditor product={editProduct} onClose={() => setEditProduct(null)} onSave={async product => { if (await onEditProduct(product)) { setEditProduct(null); onToast('Cambios del plato guardados'); } }}/>}
  </>;

  if (section === 'Clientes') return <>
    <div className="page-title secondary-page-title"><div className="page-title-leading">{back}<div><div className="eyebrow">PERSONAS QUE TE COMPRAN</div><h1>Clientes</h1></div></div></div>
    <form className="panel quick-client" onSubmit={event => { event.preventDefault(); if (!customer.trim() || busy) return; setBusy(true); void onAddCustomer(customer.trim(), phone.trim()).then(saved => { if (saved) { setCustomer(''); setPhone(''); onToast('Cliente agregado'); } }).finally(() => setBusy(false)); }}><label className="form-label">Nombre<input required value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Nombre del cliente"/></label><label className="form-label">Teléfono <small>Opcional</small><input inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="Celular"/></label><button className="primary" disabled={busy}><Plus size={17}/>{busy ? 'Guardando…' : 'Agregar cliente'}</button></form>
    <div className="simple-list">{customers.map(item => <article className="simple-list-row" key={item.id}><span className="customer-avatar">{item.name.slice(0, 1).toUpperCase()}</span><div><b>{item.name}</b><span>{item.phone || 'Sin teléfono'}</span></div></article>)}{!customers.length && <div className="empty"><b>Aún no hay clientes guardados</b><p>También puedes crear un cliente al preparar un pedido.</p></div>}</div>
  </>;

  if (section === 'Configuración') return <>
    <div className="page-title secondary-page-title"><div className="page-title-leading">{back}<div><div className="eyebrow">A TU MANERA</div><h1>Configuración</h1></div></div></div>
    <form className="panel settings-form" onSubmit={event => { event.preventDefault(); const next = businessDraft.trim(); if (!next || busy) return; setBusy(true); void onSaveBusiness(next).then(saved => { if (saved) onToast('Nombre del negocio guardado'); }).finally(() => setBusy(false)); }}><div className="eyebrow">TU NEGOCIO</div><label className="form-label">Nombre del negocio<input required maxLength={120} value={businessDraft} onChange={event => setBusinessDraft(event.target.value)} placeholder="Ej. Cocina de mamá"/></label><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></form>
    <div className="panel logo-settings"><div className="eyebrow">IDENTIDAD DEL NEGOCIO</div><h3>Logo</h3><p>Se guarda en Firestore y aparece en los recibos.</p>{uid ? <PhotoEditor uid={uid} imageId={businessLogoId} kind="logo" title="Logo del negocio" onSave={async image => { const imageId = await saveBusinessLogo(uid, businessLogoId, image); onBusinessLogoSaved(imageId); onToast('Logo guardado y sincronizado.'); }} onDelete={async () => { await removeBusinessLogo(uid, businessLogoId); onBusinessLogoDeleted(); onToast('Logo eliminado.'); }}/>: <p>Inicia sesión para administrar el logo.</p>}</div>
    <div className="settings-card"><div><Bell size={19}/><div><b>Recordatorios</b><p>Los avisos de entregas funcionan con Cielito abierta. No hay notificaciones programadas en segundo plano.</p></div></div><button className="secondary" onClick={playTestSound}>Probar sonido</button></div>
    <button className="more-card full-card" onClick={() => setSection('Impresora')}><span className="more-icon"><Printer size={21}/></span><span><b>Impresora</b><small>Tickets en papel de 58 u 80 mm</small></span><ChevronRight size={18}/></button>
    {uid && <button className="secondary logout-button" onClick={onLogout}><LogOut size={17}/>Cerrar sesión</button>}
  </>;

  if (section === 'Impresora') return <>
    <div className="page-title secondary-page-title"><div className="page-title-leading">{back}<div><div className="eyebrow">PREFERENCIAS LOCALES</div><h1>Impresora</h1></div></div></div>
    <section className="panel printer-settings"><span className="printer-icon"><Printer size={23}/></span><h2>Imprimir tickets</h2><p>Cielito abre el diálogo de impresión del navegador. Elige allí la impresora que esté configurada en tu teléfono o computadora.</p><label className="form-label">Tamaño del papel<select value={paper} onChange={event => { const value = event.target.value as '58mm' | '80mm'; setPaper(value); localStorage.setItem('cielito-paper-width', value); onToast(`Preferencia guardada: ${value}`); }}><option value="58mm">58 mm · ticket compacto</option><option value="80mm">80 mm · ticket amplio</option></select></label><label className="form-label">Impresora del sistema <small>Se elige al imprimir</small><input value={printer} onChange={event => setPrinter(event.target.value)} placeholder="Nombre para recordarla (opcional)"/></label>{printer && <p className="muted">Se guardará solo en este dispositivo; no confirma conexión.</p>}<button className="primary wide" onClick={() => { localStorage.setItem('cielito-printer-label', printer.trim()); printTestTicket(paper); }}><Printer size={17}/>Imprimir ticket de prueba</button><button className="text-button" onClick={() => { setPrinter(''); localStorage.removeItem('cielito-printer-label'); onToast('Preferencia de impresora borrada'); }}>Desvincular impresora recordada</button></section>
    <div className="printer-note"><b>Acerca de Bluetooth</b><p>Esta versión web no puede conectarse directamente a impresoras Bluetooth Classic ESC/POS. Para eso se necesita una aplicación Android nativa con un adaptador compatible. Nunca mostraremos una impresora como conectada sin comprobarlo.</p></div>
  </>;

  return <><div className="page-title"><div><div className="eyebrow">TODO EN SU SITIO</div><h1>Más</h1><p>Administra el menú y los detalles del negocio.</p></div></div><div className="more-grid">{[
    ['Productos', 'Platos, precios, costos y fotos', Package], ['Clientes', 'Nombres y teléfonos', Users], ['Configuración', 'Negocio, logo y recordatorios', Settings], ['Instalar aplicación', 'Añade Cielito a tu pantalla', Download],
  ].map(([title, description, Icon]) => <button className="more-card" key={title as string} onClick={() => title === 'Instalar aplicación' ? onInstall() : setSection(title as Section)}><span className="more-icon"><Icon size={21}/></span><span><b>{title as string}</b><small>{description as string}</small></span><ChevronRight size={18}/></button>)}</div><div className="panel storage-panel"><Wallet size={19}/><div><b>{uid ? 'Firebase sincroniza tus datos' : 'Tus datos se guardan en este dispositivo'}</b><p>{uid ? 'El menú, los pedidos y las fotografías están en el espacio privado del negocio.' : 'Inicia sesión con la cuenta autorizada para sincronizar entre dispositivos.'}</p></div><span className={`dot ${uid ? 'online' : ''}`}/></div></>;
}

function ProductEditor({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (product: Product) => Promise<void> }) {
  const [name, setName] = useState(product.name), [price, setPrice] = useState(String(product.price)), [cost, setCost] = useState(String(product.cost));
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop"><form className="modal product-editor" onSubmit={event => { event.preventDefault(); if (busy || !name.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0 || !Number.isFinite(Number(cost)) || Number(cost) < 0) return; setBusy(true); void onSave({ ...product, name: name.trim(), price: Number(price), cost: Number(cost) }).finally(() => setBusy(false)); }}><button type="button" className="back-button modal-back" onClick={onClose} aria-label="Volver"><ArrowLeft size={20}/></button><div className="eyebrow">EDITAR PLATO</div><h2>Datos del producto</h2><label className="form-label">Nombre<input required value={name} onChange={event => setName(event.target.value)}/></label><div className="delivery-fields"><label className="form-label">Precio de venta · Bs<input type="number" required min="0.01" step="0.01" value={price} onChange={event => setPrice(event.target.value)}/></label><label className="form-label">Costo · Bs<input type="number" required min="0" step="0.01" value={cost} onChange={event => setCost(event.target.value)}/></label></div><div className="margin-preview">Ganancia estimada por unidad <b>{currency(Number(price) - Number(cost))}</b></div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div></form></div>;
}

function currency(value: number) { return `Bs ${value.toFixed(2)}`; }

function playTestSound() {
  try { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 660; gain.gain.value = .12; oscillator.start(); oscillator.stop(context.currentTime + .18); } catch { /* The app remains usable when audio is unavailable. */ }
}

function printTestTicket(paper: '58mm' | '80mm') {
  const target = window.open('', '_blank', 'width=420,height=600');
  if (!target) { window.alert('Permite ventanas emergentes para imprimir.'); return; }
  target.onload = () => { target.focus(); target.print(); };
  target.document.open(); target.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba de impresión</title><style>@page{size:${paper} auto;margin:3mm}body{font:13px Arial;width:calc(${paper} - 6mm);margin:0 auto;padding:5mm 0;color:#20251f;text-align:center}.rule{border-top:1px dashed #555;margin:12px 0}.sample{display:flex;justify-content:space-between;padding:5px 0}</style><body><h2>Cielito</h2><p>Prueba de impresión · ${paper}</p><div class="rule"></div><div class="sample"><span>1 × Plato de prueba</span><b>Bs 25.00</b></div><div class="rule"></div><p>Gracias</p></body></html>`); target.document.close();
}
