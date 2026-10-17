import { useEffect, useState } from 'react';
import { Bell, ChevronRight, Download, ImagePlus, LogOut, Package, Printer, Plus, Settings, Users, Wallet } from 'lucide-react';
import { CloudImage, PhotoEditor } from './ManagedImageUi';
import { removeProductImage, saveProductImage, saveBusinessLogo, removeBusinessLogo, type PreparedImage } from './managedImages';
import type { ProductWithImage } from './managedImages';

type Product = ProductWithImage;
type Customer = { id: string; name: string; phone: string };
type MoreScreenProps = {
  products: Product[];
  customers: Customer[];
  business: string;
  businessLogoId?: string;
  uid?: string;
  onAddProduct: (name: string, price: number, cost: number) => void;
  onToggleProduct: (id: string) => void;
  onAddCustomer: (name: string, phone: string) => void;
  onSaveBusiness: (name: string) => void;
  onProductImageSaved: (id: string, imageId: string) => void;
  onProductImageDeleted: (id: string) => void;
  onBusinessLogoSaved: (imageId: string) => void;
  onBusinessLogoDeleted: () => void;
  onToast: (message: string) => void;
  onInstall: () => void;
  onLogout: () => void;
};

export function MoreScreen(props: MoreScreenProps) {
  const { products, customers, business, businessLogoId, uid, onAddProduct, onToggleProduct, onAddCustomer, onSaveBusiness, onProductImageSaved, onProductImageDeleted, onBusinessLogoSaved, onBusinessLogoDeleted, onToast, onInstall, onLogout } = props;
  const [section, setSection] = useState('');
  const [photoProductId, setPhotoProductId] = useState('');
  const [name, setName] = useState(''), [price, setPrice] = useState(''), [cost, setCost] = useState('');
  const [customer, setCustomer] = useState(''), [phone, setPhone] = useState(''), [businessDraft, setBusinessDraft] = useState(business);
  useEffect(() => setBusinessDraft(business), [business]);
  const addProduct = () => {
    if (!name.trim() || !Number(price) || Number(price) < 0 || Number(cost) < 0) return;
    onAddProduct(name.trim(), Number(price), Number(cost));
    setName(''); setPrice(''); setCost(''); onToast('Plato agregado');
  };
  const savePhoto = async (product: Product, image: PreparedImage) => {
    if (!uid) throw new Error('Inicia sesión para guardar fotografías.');
    const imageId = await saveProductImage(uid, product, image);
    onProductImageSaved(product.id, imageId);
    onToast('Fotografía guardada y sincronizada.');
  };
  const deletePhoto = async (product: Product) => {
    if (!uid) throw new Error('Inicia sesión para eliminar fotografías.');
    await removeProductImage(uid, product);
    onProductImageDeleted(product.id);
    onToast('Fotografía eliminada.');
  };
  if (section === 'Productos') return <>
    <div className="page-title"><div><div className="eyebrow">TU MENÚ</div><h1>Platos</h1><p>Precios, costos y fotografías de cada preparación.</p></div><button className="text-button" onClick={() => setSection('')}>← Más</button></div>
    <div className="panel simple-form"><h3>Agregar un plato</h3><div className="form-grid"><label className="form-label">Nombre<input value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Picante de pollo"/></label><label className="form-label">Precio (Bs)<input type="number" min="0" value={price} onChange={event => setPrice(event.target.value)}/></label><label className="form-label">Costo estimado<input type="number" min="0" value={cost} onChange={event => setCost(event.target.value)}/></label><button className="primary" onClick={addProduct}><Plus size={17}/>Agregar plato</button></div></div>
    <div className="orders-list">{products.map(product => <div className="expense-row product-admin-row" key={product.id}><CloudImage uid={uid} imageId={product.imageId} alt={`Fotografía de ${product.name}`} className="product-admin-image"/><div><b>{product.name}</b><span>Bs {product.price.toFixed(2)} · costo Bs {product.cost.toFixed(2)} · ganancia Bs {(product.price - product.cost).toFixed(2)}</span></div><button className="secondary compact" onClick={() => setPhotoProductId(product.id)} disabled={!uid}><ImagePlus size={16}/>{product.imageId ? 'Cambiar foto' : 'Agregar foto'}</button><button className="icon-button" onClick={() => onToggleProduct(product.id)}>{product.active ? 'Disponible' : 'Pausado'}</button></div>)}</div>
    {photoProductId && (() => { const product = products.find(item => item.id === photoProductId); return product ? <div className="modal-backdrop"><div className="modal photo-modal"><PhotoEditor uid={uid || ''} imageId={product.imageId} kind="dish" title={`Foto de ${product.name}`} onSave={image => savePhoto(product, image)} onDelete={() => deletePhoto(product)} onClose={() => setPhotoProductId('')}/></div></div> : null; })()}
  </>;
  if (section === 'Clientes') return <>
    <div className="page-title"><div><div className="eyebrow">PERSONAS QUE TE COMPRAN</div><h1>Clientes</h1></div><button className="text-button" onClick={() => setSection('')}>← Más</button></div>
    <div className="panel simple-form"><div className="form-grid"><input placeholder="Nombre" value={customer} onChange={event => setCustomer(event.target.value)}/><input placeholder="Celular" value={phone} onChange={event => setPhone(event.target.value)}/><button className="primary" onClick={() => { if (customer.trim()) { onAddCustomer(customer.trim(), phone); setCustomer(''); setPhone(''); onToast('Cliente agregado'); } }}><Plus size={17}/>Agregar cliente</button></div></div>
    <div className="orders-list">{customers.map(item => <div className="expense-row" key={item.id}><div className="avatar">{item.name[0]}</div><div><b>{item.name}</b><span>{item.phone || 'Sin teléfono'}</span></div></div>)}</div>
  </>;
  if (section === 'Configuración') return <>
    <div className="page-title"><div><div className="eyebrow">A TU MANERA</div><h1>Configuración</h1></div><button className="text-button" onClick={() => setSection('')}>← Más</button></div>
    <div className="panel simple-form"><label className="form-label">Nombre del negocio<input value={businessDraft} onChange={event => setBusinessDraft(event.target.value)}/></label><button className="primary" onClick={() => { onSaveBusiness(businessDraft); onToast('Nombre guardado'); }}>Guardar cambios</button></div>
    <div className="panel logo-settings"><h3>Logo del negocio</h3><p>Se sincroniza en Firestore y aparece en el encabezado y los recibos.</p>{uid ? <PhotoEditor uid={uid} imageId={businessLogoId} kind="logo" title="Logo" onSave={async image => { const imageId = await saveBusinessLogo(uid, businessLogoId, image); onBusinessLogoSaved(imageId); onToast('Logo guardado y sincronizado.'); }} onDelete={async () => { await removeBusinessLogo(uid, businessLogoId); onBusinessLogoDeleted(); onToast('Logo eliminado.'); }}/>: <p>Inicia sesión para administrar el logo.</p>}</div>
    <div className="panel settings-info"><h3>Recordatorios y sonidos</h3><p>Los avisos atrasados, mensajes en pantalla y sonidos funcionan mientras Cielito está abierta. Las notificaciones programadas en segundo plano no están activas porque aún no hay un backend desplegado.</p><button className="secondary" onClick={() => { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 660; gain.gain.value = .12; oscillator.start(); oscillator.stop(context.currentTime + .18); onToast('Sonido de prueba'); }}><Bell size={17}/>Probar sonido</button></div>
    <div className="panel settings-info"><h3>Impresora</h3><p>La impresión desde web usa el diálogo de impresión del dispositivo. Bluetooth SPP requiere una app Android nativa y un plugin compatible; no se simula una conexión.</p><button className="secondary" onClick={() => window.print()}><Printer size={17}/>Probar impresión</button></div><button className="secondary" onClick={onInstall}><Download size={17}/>Instalar aplicación</button>{uid&&<button className="secondary" onClick={onLogout}><LogOut size={17}/>Cerrar sesión</button>}
  </>;
  return <><div className="page-title"><div><div className="eyebrow">TODO EN SU SITIO</div><h1>Más</h1><p>Administra lo importante de tu cocina.</p></div></div><div className="more-grid">{[['Productos','Tus platos, precios, costos y fotos',Package],['Clientes','Nombres y teléfonos',Users],['Configuración','Negocio, logo, avisos e impresión',Settings],['Instalar aplicación','Lleva Cielito a tu pantalla de inicio',Download]].map(([title,description,Icon]) => <button className="more-card" key={title as string} onClick={() => title === 'Instalar aplicación' ? onInstall() : setSection(title as string)}><span className="more-icon"><Icon size={21}/></span><span><b>{title as string}</b><small>{description as string}</small></span><ChevronRight size={18}/></button>)}</div><div className="panel storage-panel"><Wallet size={19}/><div><b>{uid ? 'Firebase está sincronizando tus datos' : 'Tus datos se guardan en este dispositivo'}</b><p>{uid ? 'Los productos, pedidos y fotografías se guardan en el espacio privado del negocio.' : 'Inicia sesión con la cuenta autorizada para sincronizar entre dispositivos.'}</p></div><span className={`dot ${uid ? 'online' : ''}`}/></div></>;
}
