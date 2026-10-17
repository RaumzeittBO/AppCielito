import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import {
  ArrowLeft, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList,
  Clock3, Download, Eye, EyeOff, Home, LogOut, Menu, Minus, Plus, Printer,
  Search, Settings, ShoppingBasket, Trash2, Utensils, Wallet, X,
} from 'lucide-react';
import { auth, authReady, db, firebaseConfigured } from './firebase';
import { deleteOwnerProduct, deleteOwnerRecord, hydrateOwnerData, persistOwnerData } from './cloudData';
import { readImageDataUrl } from './managedImages';
import { CloudImage } from './ManagedImageUi';
import { MoreScreen } from './MoreScreen';
import { getBalance, getDateRange, paymentTotals, validPayment, type Payment, type PaymentMethod } from './domain';
import './style.css';

type Product = { id: string; name: string; price: number; cost: number; active: boolean; imageId?: string };
type Customer = { id: string; name: string; phone: string };
type Line = { productId: string; name: string; qty: number; price: number; cost: number };
type Order = { id: string; customer: string; date: string; time: string; createdAt?: string; items: Line[]; total: number; paid: number; payments?: Payment[]; status: 'Pendiente' | 'Entregado' | 'Cancelado'; method: string; note: string };
type Expense = { id: string; amount: number; category: string; date: string; note: string; method?: string };
type Income = { id: string; amount: number; category: string; date: string; note: string };
type Data = { products: Product[]; customers: Customer[]; orders: Order[]; expenses: Expense[]; incomes: Income[]; categories: string[]; business: string; businessLogoId?: string };
type Page = 'Inicio' | 'Vender' | 'Pedidos' | 'Dinero' | 'Más';

const OWNER_UID = '4iftAGoQawabSz1EEpKufdPQccC2';
const seed: Data = {
  business: 'Mi cocina',
  products: [
    { id: 'p1', name: 'Picante de pollo', price: 35, cost: 19, active: true },
    { id: 'p2', name: 'Silpancho', price: 32, cost: 18, active: true },
    { id: 'p3', name: 'Falso conejo', price: 30, cost: 16, active: true },
  ], customers: [], orders: [], expenses: [], incomes: [],
  categories: ['Ingredientes', 'Verduras', 'Carnes', 'Transporte', 'Gas', 'Envases', 'Servicios', 'Otros'],
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
const money = (value: number) => `Bs ${Number(value || 0).toFixed(2)}`;
const uid = () => crypto.randomUUID();
function load(): Data {
  try { const saved = JSON.parse(localStorage.getItem('cielito-data') || '{}'); return { ...seed, ...saved, incomes: saved.incomes || [], categories: saved.categories || seed.categories }; }
  catch { return seed; }
}

function App() {
  const [data, setData] = useState<Data>(load);
  const [page, setPage] = useState<Page>('Inicio');
  const [selectedDate, setSelectedDate] = useState(today);
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [syncReady, setSyncReady] = useState(!db);
  const [checkoutOrderId, setCheckoutOrderId] = useState('');
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => { localStorage.setItem('cielito-data', JSON.stringify(data)); }, [data]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (hadController) setUpdateReady(true);
      hadController = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);
  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('orderId');
    if (orderId) { setPage('Pedidos'); setModal(`detail:${orderId}`); }
  }, []);
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    return onAuthStateChanged(auth, current => {
      setAuthLoading(false);
    if (current && current.uid !== OWNER_UID) {
        setUser(null); setSyncReady(true); setAuthError('Esta cuenta no está autorizada para ver el negocio.'); void signOut(auth!); return;
      }
      setSyncReady(!current);
      setUser(current);
    });
  }, []);
  useEffect(() => {
    if (!db || !user) { setSyncReady(true); return; }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setSyncReady(false);
    setCloud(false);
    void hydrateOwnerData(user.uid, data, value => { if (active) setData(current => ({ ...current, ...value }) as Data); }, setCloud)
      .then(stop => { if (active) { unsubscribe = stop; setSyncReady(true); } else stop(); })
      .catch(error => { console.error('[Cielito] No se pudieron cargar los datos de Firestore.', error); if (active) { setCloud(false); setSyncReady(true); } });
    return () => { active = false; unsubscribe?.(); };
    // Hydration deliberately runs once per authenticated owner session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const update = (next: Data) => {
    if (db && user && !syncReady) { ping('Espera a que termine la sincronización para guardar.'); return; }
    const previous = data;
    setData(next);
    if (db && user) void persistOwnerData(user.uid, next, previous).then(() => setCloud(true)).catch(error => { console.error('[Cielito] Falló la sincronización de cambios.', error); setCloud(false); ping('No se pudo sincronizar. Revisa tu conexión.'); });
  };
  const ping = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };

  useEffect(() => {
    const scan = () => {
      const now = Date.now();
      for (const order of data.orders) {
        if (order.status !== 'Pendiente' || !order.time) continue;
        const delivery = new Date(`${order.date}T${order.time}:00-04:00`).getTime();
        for (const [kind, at] of [['15m', delivery - 15 * 60_000], ['hora', delivery]] as const) {
          const key = `cielito-reminder-${order.id}-${order.date}-${order.time}-${kind}`;
          if (now < at || now >= at + 60_000 || localStorage.getItem(key)) continue;
          localStorage.setItem(key, '1');
          const message = kind === '15m' ? `En 15 minutos entregas el pedido de ${order.customer || 'un cliente'}.` : `Es hora de entregar el pedido de ${order.customer || 'un cliente'}.`;
          ping(message);
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Recordatorio de entrega', { body: message, icon: '/icon.svg', data: { url: `/?orderId=${order.id}` } });
        }
      }
    };
    scan(); const interval = window.setInterval(scan, 15_000); return () => window.clearInterval(interval);
  }, [data.orders]);

  const ordersToday = data.orders.filter(order => order.date === selectedDate && order.status !== 'Cancelado');
  const pending = data.orders.filter(order => order.status === 'Pendiente').sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
  const collected = data.orders.flatMap(order => getOrderPayments(order)).filter(payment => localDate(payment.date) === selectedDate).reduce((sum, payment) => sum + payment.amount, 0);
  const due = ordersToday.reduce((sum, order) => sum + getBalance(order.total, order.paid), 0);
  const nav = [
    ['Inicio', Home], ['Vender', ShoppingBasket], ['Pedidos', ClipboardList], ['Dinero', Wallet], ['Más', Menu],
  ] as const;

  const addOrder = (customer: string, items: Line[], date: string, time: string, payments: Payment[], note: string) => {
    if (!items.length) return;
    const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paid > total || paid < 0) { ping('El pago supera el total del pedido.'); return; }
    const order: Order = { id: uid(), customer, date, time, createdAt: new Date().toISOString(), items, total, paid, payments, status: 'Pendiente', method: paymentLabel(payments, paid, total), note };
    update({ ...data, orders: [order, ...data.orders] });
    setCheckoutOrderId(order.id); setModal('saved'); setPage('Pedidos');
  };
  const addCustomer = (name: string, phone: string) => {
    const customer = { id: uid(), name, phone };
    update({ ...data, customers: [customer, ...data.customers] });
    return customer;
  };
  const markDone = (id: string) => { update({ ...data, orders: data.orders.map(order => order.id === id ? { ...order, status: 'Entregado' } : order) }); ping('Pedido marcado como entregado'); };
  const saveExpense = (value: Expense) => {
    const exists = data.expenses.some(expense => expense.id === value.id);
    update({ ...data, expenses: exists ? data.expenses.map(expense => expense.id === value.id ? value : expense) : [value, ...data.expenses] });
    setModal(''); ping(exists ? 'Gasto actualizado' : 'Gasto guardado');
  };
  const install = () => { if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => ping('No se pudo instalar ahora.')); ping('Usa “Añadir a pantalla de inicio” en el menú del navegador.'); };

  if (authLoading) return <main className="login"><div className="login-card loading-card"><BrandMark/><p>Preparando Cielito…</p></div></main>;
  if (auth && firebaseConfigured && !user) return <Login email={email} setEmail={setEmail} password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} error={authError} loading={loginLoading} onSubmit={async event => {
    event.preventDefault(); setAuthError(''); setLoginLoading(true);
    try { await authReady; await signInWithEmailAndPassword(auth!, email.trim(), password); }
    catch (error) { const code = (error as { code?: string }).code; setAuthError(code === 'auth/network-request-failed' ? 'No hay conexión. Revisa internet e inténtalo otra vez.' : 'No se pudo iniciar sesión. Revisa el correo y la contraseña.'); }
    finally { setLoginLoading(false); }
  }}/>;
  if (db && user && !syncReady) return <main className="login"><div className="login-card loading-card"><BrandMark/><p>Sincronizando tus datos…</p></div></main>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><BrandMark/><span><b>Cielito</b><small>{data.business}</small></span></div>
      <div className="side-caption">MENÚ</div>
      {nav.map(([name, Icon]) => <button className={`nav-item ${page === name ? 'active' : ''}`} key={name} onClick={() => setPage(name)}><Icon size={19}/>{name}</button>)}
      <div className="side-bottom"><div className="cloud-chip"><span className={`dot ${cloud ? 'online' : ''}`}/>{cloud ? 'Sincronizado' : user ? 'Conectando…' : 'Guardado en este teléfono'}</div>{user && <button className="nav-item" onClick={() => auth && void signOut(auth)}><LogOut size={18}/>Cerrar sesión</button>}</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="mobile-brand"><BrandMark/><b>Cielito</b></div><div className="crumb">{page}<span>/</span><b>{page === 'Inicio' ? 'Tu día, con calma' : data.business}</b></div><div className="top-actions"><span className="connection"><span className={`dot ${cloud ? 'online' : ''}`}/>{cloud ? 'Sincronizado' : user ? 'Sin conexión' : 'Este dispositivo'}</span><button className="icon-button" onClick={() => setPage('Más')} aria-label="Abrir Configuración" title="Configuración"><Settings size={19}/></button><button className="avatar" onClick={() => setPage('Más')} aria-label="Abrir menú">{data.business.slice(0, 1).toUpperCase()}</button></div></header>
      <div className="content">
        {page === 'Inicio' && <HomeScreen date={selectedDate} setDate={setSelectedDate} orders={ordersToday} pending={pending} collected={collected} due={due} onSell={() => setPage('Vender')} onExpense={() => setModal('expense')} onOpen={id => setModal(`detail:${id}`)} onDone={markDone} onHistory={() => setPage('Pedidos')}/>}
        {page === 'Vender' && <Sell products={data.products.filter(product => product.active)} customers={data.customers} uid={user?.uid} onSave={addOrder} onCustomer={addCustomer}/>}
        {page === 'Pedidos' && <History data={data} date={selectedDate} setDate={setSelectedDate} onNew={() => setPage('Vender')} onOpen={id => setModal(`detail:${id}`)}/>}
        {page === 'Dinero' && <Money data={data} onExpense={() => setModal('expense')} onIncome={() => setModal('income')} onEditExpense={id => setModal(`expense:${id}`)} onDeleteExpense={id => { if (window.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) void (async () => { try { if (user) await deleteOwnerRecord(user.uid, 'expenses', id); update({ ...data, expenses: data.expenses.filter(expense => expense.id !== id) }); ping('Gasto eliminado'); } catch { ping('No se pudo eliminar. Comprueba la conexión.'); } })(); }}/>}
        {page === 'Más' && <MoreScreen products={data.products} customers={data.customers} business={data.business} businessLogoId={data.businessLogoId} uid={user?.uid}
          onAddProduct={(name, price, cost) => update({ ...data, products: [{ id: uid(), name, price, cost, active: true }, ...data.products] })}
          onEditProduct={edited => update({ ...data, products: data.products.map(product => product.id === edited.id ? edited : product) })}
          onDeleteProduct={async (id, imageId) => { if (user) await deleteOwnerProduct(user.uid, id, imageId); update({ ...data, products: data.products.filter(product => product.id !== id) }); }}
          onToggleProduct={id => update({ ...data, products: data.products.map(product => product.id === id ? { ...product, active: !product.active } : product) })}
          soldProductIds={new Set(data.orders.flatMap(order => order.items.map(item => item.productId)))}
          onAddCustomer={(name, phone) => { addCustomer(name, phone); }} onSaveBusiness={business => update({ ...data, business })}
          onProductImageSaved={(id, imageId) => update({ ...data, products: data.products.map(product => product.id === id ? { ...product, imageId } : product) })}
          onProductImageDeleted={id => update({ ...data, products: data.products.map(product => { if (product.id !== id) return product; const { imageId: _imageId, ...rest } = product; return rest; }) })}
          onBusinessLogoSaved={businessLogoId => update({ ...data, businessLogoId })} onBusinessLogoDeleted={() => update({ ...data, businessLogoId: undefined })}
          onToast={ping} onInstall={install} onLogout={() => auth && void signOut(auth)}/>}
      </div>
    </main>
    <nav className="mobile-nav">{nav.map(([name, Icon]) => <button className={page === name ? 'active' : ''} key={name} onClick={() => setPage(name)}><Icon size={20}/><span>{name}</span></button>)}</nav>
    {updateReady && <div className="update-banner" role="status"><span>Hay una versión nueva lista. Actualiza cuando termines lo que estás haciendo.</span><button onClick={() => window.location.reload()}>Actualizar</button></div>}
    {(modal === 'expense' || modal === 'income' || modal.startsWith('expense:')) && <ExpenseModal categories={modal === 'income' ? ['Venta adicional', 'Otro'] : data.categories} expense={modal.startsWith('expense:') ? data.expenses.find(item => item.id === modal.split(':')[1]) : undefined} income={modal === 'income'} onCategory={category => update({ ...data, categories: data.categories.includes(category) ? data.categories : [...data.categories, category] })} onClose={() => setModal('')} onSave={value => saveExpense(value)} onIncomeSave={(amount, category, date, note) => { update({ ...data, incomes: [{ id: uid(), amount, category, date, note }, ...data.incomes] }); setModal(''); ping('Ingreso guardado'); }}/>}
    {modal.startsWith('detail:') && <OrderDetail order={data.orders.find(order => order.id === modal.split(':')[1])} data={data} uid={user?.uid} onClose={() => setModal('')} onDone={markDone} onUpdate={order => { update({ ...data, orders: data.orders.map(item => item.id === order.id ? order : item) }); ping('Pedido actualizado'); }} onAddPayment={(id, amount, method) => {
      update({ ...data, orders: data.orders.map(order => {
        if (order.id !== id) return order;
        if (!validPayment(order.total, order.paid, amount)) { ping(`El saldo disponible es ${money(getBalance(order.total, order.paid))}.`); return order; }
        const payment: Payment = { id: uid(), amount, method, date: new Date().toISOString() };
        const payments = [...(order.payments || []), payment]; const paid = payments.reduce((sum, item) => sum + item.amount, 0);
        return { ...order, payments, paid, method: paymentLabel(payments, paid, order.total) };
      }) }); ping('Abono registrado');
    }} onCancel={id => { if (window.confirm('¿Cancelar este pedido? Se conservará en el historial.')) { update({ ...data, orders: data.orders.map(order => order.id === id ? { ...order, status: 'Cancelado' } : order) }); setModal(''); ping('Pedido cancelado'); } }} onReceipt={order => void shareReceipt(order, data.business, data.businessLogoId, user?.uid, paperWidth())}/>}
    {modal === 'saved' && <div className="modal-backdrop" role="presentation"><div className="modal saved-modal" role="dialog" aria-modal="true"><div className="success-mark"><Check size={24}/></div><div className="eyebrow">PEDIDO GUARDADO</div><h2>Listo, ya está anotado</h2><p>Elige qué quieres hacer ahora.</p><div className="saved-actions"><button className="primary wide" onClick={() => { const order = data.orders.find(item => item.id === checkoutOrderId); if (order) void shareReceipt(order, data.business, data.businessLogoId, user?.uid, paperWidth()); }}>Compartir recibo</button><button className="secondary wide" onClick={() => { const order = data.orders.find(item => item.id === checkoutOrderId); if (order) printReceipt(order, data.business, data.businessLogoId, user?.uid, paperWidth()); }}>Imprimir</button><button className="secondary wide" onClick={() => { setModal(''); setPage('Vender'); }}>Nuevo pedido</button><button className="text-button wide" onClick={() => setModal(`detail:${checkoutOrderId}`)}>Ver pedido <ChevronRight size={16}/></button></div><button className="modal-close" onClick={() => setModal('')} aria-label="Cerrar"><X/></button></div></div>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}

function BrandMark() { return <div className="brandmark" aria-label="Cielito">c</div>; }

function Login({ email, setEmail, password, setPassword, showPassword, setShowPassword, error, loading, onSubmit }: {
  email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void;
  showPassword: boolean; setShowPassword: (value: boolean) => void; error: string; loading: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <main className="login"><section className="login-card"><div className="login-brand"><BrandMark/><span><b>Cielito</b><small>Tu cocina, en orden</small></span></div><div className="eyebrow">BIENVENIDA</div><h1>Qué bueno verte</h1><p>Entra para revisar tus pedidos y cuentas.</p><form onSubmit={onSubmit}>
    <label className="form-label">Correo electrónico<input type="email" autoComplete="username" inputMode="email" autoCapitalize="none" required value={email} onChange={event => setEmail(event.target.value)} placeholder="tu@correo.com"/></label>
    <label className="form-label">Contraseña<span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Tu contraseña"/><button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></span></label>
    {error && <p className="error" role="alert">{error}</p>}<button className="primary wide login-submit" disabled={loading}>{loading ? <><span className="spinner"/>Ingresando…</> : 'Entrar a Cielito'}</button>
  </form><div className="login-private">Acceso privado · Si tienes problemas, pide ayuda a quien administra el negocio.</div></section><div className="login-footer">Hecho para que el día vaya más tranquilo.</div></main>;
}

function HomeScreen({ date, setDate, orders, pending, collected, due, onSell, onExpense, onOpen, onDone, onHistory }: {
  date: string; setDate: (date: string) => void; orders: Order[]; pending: Order[]; collected: number; due: number;
  onSell: () => void; onExpense: () => void; onOpen: (id: string) => void; onDone: (id: string) => void; onHistory: () => void;
}) {
  const late = pending.filter(order => order.date < today() || (order.date === today() && order.time && new Date(`${order.date}T${order.time}:00-04:00`).getTime() < Date.now()));
  const todayLabel = new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/La_Paz' }).format(new Date(`${date}T12:00:00-04:00`));
  return <>
    <div className="welcome-row"><div><div className="eyebrow">{todayLabel}</div><h1>Hola, bienvenida</h1><p>Esto es lo que necesita atención hoy.</p></div><label className="date-select"><CalendarDays size={17}/><input aria-label="Fecha de inicio" type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div>
    <div className="home-actions"><button className="primary" onClick={onSell}><Plus size={20}/>Nuevo pedido</button><button className="secondary" onClick={onExpense}><Plus size={19}/>Registrar gasto</button></div>
    <div className="home-summary"><div><span>Pedidos del día</span><b>{orders.length}</b></div><div><span>Dinero cobrado</span><b>{money(collected)}</b></div><div><span>Por cobrar</span><b>{money(due)}</b></div></div>
    {late.length > 0 && <section className="late-banner"><Clock3 size={20}/><div><b>{late.length} {late.length === 1 ? 'pedido atrasado' : 'pedidos atrasados'}</b><span>Revisa la entrega y actualiza su estado.</span></div><button className="text-button" onClick={onHistory}>Revisar</button></section>}
    <div className="section-head home-section-head"><div><div className="eyebrow">LO QUE SIGUE</div><h2>Entregas pendientes <span className="count-pill">{pending.length}</span></h2></div><button className="link-button" onClick={onHistory}>Ver historial <ChevronRight size={16}/></button></div>
    <div className="orders-list">{pending.length ? pending.map(order => <OrderRow key={order.id} order={order} onOpen={() => onOpen(order.id)} onDone={() => onDone(order.id)}/>) : <div className="empty"><div className="empty-icon"><Check size={23}/></div><b>Todo al día</b><p>Cuando haya una entrega aparecerá aquí.</p><button className="secondary" onClick={onSell}><Plus size={16}/>Crear pedido</button></div>}</div>
  </>;
}

function OrderRow({ order, onOpen, onDone }: { order: Order; onOpen: () => void; onDone: () => void }) {
  const balance = getBalance(order.total, order.paid);
  const late = order.status === 'Pendiente' && (order.date < today() || (order.date === today() && !!order.time && new Date(`${order.date}T${order.time}:00-04:00`).getTime() < Date.now()));
  return <article className="order-row"><button className="order-main" onClick={onOpen}><span className="order-time">{order.time || 'Sin hora'}<small>{order.date === today() ? 'Hoy' : formatReadableDate(order.date)}</small></span><span className="order-info"><b>{order.customer || 'Venta sin cliente'}</b><small>{order.items.map(item => `${item.qty} × ${item.name}`).join(' · ')}</small></span><span className="order-status"><span className={`badge ${late ? 'late' : order.status === 'Entregado' ? 'done' : ''}`}>{late ? 'Atrasado' : order.status}</span><b>{money(order.total)}</b><small>{balance ? `${money(balance)} pendiente` : 'Pagado'}</small></span></button>{order.status === 'Pendiente' && <button className="done-button" onClick={onDone}><Check size={16}/><span>Entregado</span></button>}</article>;
}

function Sell({ products, customers, uid: ownerUid, onSave, onCustomer }: { products: Product[]; customers: Customer[]; uid?: string; onSave: (customer: string, items: Line[], date: string, time: string, payments: Payment[], note: string) => void; onCustomer: (name: string, phone: string) => Customer }) {
  const [cart, setCart] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [newClient, setNewClient] = useState(false);
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Pendiente' | 'Efectivo' | 'QR / transferencia' | 'Mixto'>('Pendiente');
  const [cash, setCash] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  useBodyScrollLock(cartOpen);
  const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const cashAmount = paymentMode === 'Efectivo' ? Number(cash) : paymentMode === 'Mixto' ? Number(cash || 0) : 0;
  const qrAmount = paymentMode === 'QR / transferencia' ? Number(qr) : paymentMode === 'Mixto' ? Number(qr || 0) : 0;
  const paid = cashAmount + qrAmount;
  const balance = getBalance(total, paid);
  const add = (product: Product) => setCart(current => {
    const found = current.find(item => item.productId === product.id);
    return found ? current.map(item => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item) : [...current, { productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost }];
  });
  const setQty = (id: string, qty: number) => setCart(current => current.map(item => item.productId === id ? { ...item, qty } : item).filter(item => item.qty > 0));
  const submit = () => {
    setError('');
    const payments: Payment[] = [];
    if (paymentMode !== 'Pendiente' && paid <= 0) { setError('Indica el monto recibido o elige “Pendiente”.'); return; }
    if (cashAmount > 0) payments.push({ id: uid(), amount: cashAmount, method: 'Efectivo', date: new Date().toISOString() });
    if (qrAmount > 0) payments.push({ id: uid(), amount: qrAmount, method: 'QR / transferencia', date: new Date().toISOString() });
    if (paid > total) { setError('El monto recibido supera el total. Ajusta el efectivo o el QR.'); return; }
    if (!cart.length) { setError('Agrega al menos un plato.'); return; }
    onSave(customer, cart, date, time, payments, note);
  };
  return <>
    <div className="page-title sell-title"><div><div className="eyebrow">VENTA RÁPIDA</div><h1>Elige los platos</h1><p>Toca un plato para agregarlo al pedido.</p></div></div>
    <label className="search product-search"><Search size={19}/><input placeholder="Buscar un plato" aria-label="Buscar platos" value={search} onChange={event => setSearch(event.target.value)}/></label>
    <div className="product-grid">{products.filter(product => product.name.toLowerCase().includes(search.toLowerCase())).map(product => <button className="product-tile" key={product.id} onClick={() => add(product)} aria-label={`Agregar ${product.name}, ${money(product.price)}`}>
      <span className="food-icon">{product.imageId && ownerUid ? <CloudImage uid={ownerUid} imageId={product.imageId} alt={product.name} className="food-photo"/> : <Utensils size={23}/>}</span><b>{product.name}</b><span>{money(product.price)}</span><i><Plus size={18}/></i>
    </button>)}</div>
    {!products.length && <div className="empty"><b>Aún no hay platos disponibles</b><p>Agrega un plato en Más → Productos.</p></div>}
    {products.length > 0 && !products.some(product => product.name.toLowerCase().includes(search.toLowerCase())) && <div className="empty"><b>No encontramos ese plato</b><p>Prueba con otro nombre.</p></div>}
    {cart.length > 0 && <button className="cart-dock" onClick={() => setCartOpen(true)}><span className="cart-dock-count">{count}</span><span className="cart-dock-copy"><b>{count} {count === 1 ? 'plato' : 'platos'}</b><small>Ver y completar el pedido</small></span><b>{money(total)}</b><span className="cart-dock-cta">Ver carrito <ChevronRight size={18}/></span></button>}
    {cartOpen && <div className="checkout-backdrop"><section className="checkout-sheet" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><header className="checkout-header"><button className="back-button" onClick={() => setCartOpen(false)} aria-label="Volver al catálogo"><ArrowLeft size={21}/></button><div><div className="eyebrow">REVISIÓN DEL PEDIDO</div><h2 id="checkout-title">Tu carrito <span>{count}</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Cerrar"><X/></button></header>
      <div className="checkout-body"><section className="checkout-items">{cart.map(item => <div className="cart-line" key={item.productId}><div className="cart-item-copy"><b>{item.name}</b><small>{money(item.price)} cada uno</small></div><div className="qty"><button aria-label={`Quitar uno de ${item.name}`} onClick={() => setQty(item.productId, item.qty - 1)}><Minus size={16}/></button><b>{item.qty}</b><button aria-label={`Agregar uno de ${item.name}`} onClick={() => setQty(item.productId, item.qty + 1)}><Plus size={16}/></button></div><strong>{money(item.price * item.qty)}</strong><button className="remove-line" aria-label={`Eliminar ${item.name}`} onClick={() => setQty(item.productId, 0)}><Trash2 size={17}/></button></div>)}
        <div className="customer-section"><label className="form-label">Cliente<select value={customer} onChange={event => setCustomer(event.target.value)}><option value="">Venta sin cliente</option>{customers.map(item => <option key={item.id} value={item.name}>{item.name}{item.phone ? ` · ${item.phone}` : ''}</option>)}</select></label>{newClient ? <div className="quick-client"><input aria-label="Nombre del cliente" placeholder="Nombre" value={clientName} onChange={event => setClientName(event.target.value)}/><input aria-label="Teléfono opcional" placeholder="Teléfono (opcional)" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)}/><div><button className="secondary" onClick={() => setNewClient(false)}>Cancelar</button><button className="primary" disabled={!clientName.trim()} onClick={() => { if (!clientName.trim()) return; const added = onCustomer(clientName.trim(), phone.trim()); setCustomer(added.name); setClientName(''); setPhone(''); setNewClient(false); }}>Guardar cliente</button></div></div> : <button className="add-client" onClick={() => setNewClient(true)}><Plus size={16}/>Cliente nuevo</button>}</div>
        <div className="delivery-fields delivery-schedule"><label className="form-label">Fecha de entrega<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label className="form-label">Hora <small>Opcional</small><input type="time" value={time} onChange={event => setTime(event.target.value)}/></label></div>
        <button className="disclosure" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span>Nota para la cocina <small>Opcional</small></span><ChevronDown className={advanced ? 'rotated' : ''} size={18}/></button>{advanced && <label className="form-label note-input">Notas<input value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. sin picante"/></label>}
        <section className="payment-section"><div className="section-label"><b>Pago</b><span>{paid ? `${money(paid)} recibido` : 'Puedes cobrar después'}</span></div><div className="payment-options">{(['Pendiente', 'Efectivo', 'QR / transferencia', 'Mixto'] as const).map(mode => <button key={mode} className={paymentMode === mode ? 'selected' : ''} onClick={() => { setPaymentMode(mode); setCash(mode === 'Efectivo' ? String(total) : ''); setQr(mode === 'QR / transferencia' ? String(total) : ''); setError(''); }}>{mode}</button>)}</div>
          {(paymentMode === 'Efectivo' || paymentMode === 'Mixto') && <label className="form-label payment-amount">Efectivo (Bs)<input type="number" min="0" step="0.01" max={total} value={cash} onChange={event => setCash(event.target.value)} placeholder={paymentMode === 'Efectivo' ? String(total.toFixed(2)) : '0.00'}/></label>}
          {(paymentMode === 'QR / transferencia' || paymentMode === 'Mixto') && <label className="form-label payment-amount">QR / transferencia (Bs)<input type="number" min="0" step="0.01" max={total} value={qr} onChange={event => setQr(event.target.value)} placeholder={paymentMode === 'QR / transferencia' ? String(total.toFixed(2)) : '0.00'}/></label>}
          <div className="payment-totals"><span>Total <b>{money(total)}</b></span><span>Pagado <b>{money(paid)}</b></span><span>Saldo <b>{money(balance)}</b></span></div>
        </section>
      </section></div>
      <footer className="checkout-footer"><div className="checkout-total"><span>Total del pedido</span><b>{money(total)}</b></div>{error && <p className="error" role="alert">{error}</p>}<button className="primary wide" onClick={submit}><Check size={18}/>Guardar pedido</button></footer>
    </section></div>}
  </>;
}

function History({ data, date, setDate, onNew, onOpen }: { data: Data; date: string; setDate: (date: string) => void; onNew: () => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Todos');
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day');
  const [tab, setTab] = useState<'orders' | 'receipts'>('orders');
  const [paymentStatus, setPaymentStatus] = useState('Todos');
  const days = getDateRange(date, range);
  const orders = data.orders.filter(order => {
    const balance = getBalance(order.total, order.paid);
    const paidStatus = !order.paid ? 'Pendiente' : balance ? 'Parcial' : 'Pagado';
    return order.date >= days.from && order.date <= days.to && (status === 'Todos' || order.status === status)
      && (paymentStatus === 'Todos' || paymentStatus === paidStatus)
      && `${order.customer} ${order.items.map(item => item.name).join(' ')}`.toLowerCase().includes(query.toLowerCase());
  });
  return <>
    <div className="page-title"><div><div className="eyebrow">TU HISTORIAL</div><h1>Pedidos y recibos</h1><p>Consulta entregas y comprobantes de cualquier fecha.</p></div><button className="primary" onClick={onNew}><Plus size={18}/>Nuevo pedido</button></div>
    <div className="history-tabs"><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ClipboardList size={17}/>Pedidos</button><button className={tab === 'receipts' ? 'active' : ''} onClick={() => setTab('receipts')}><Download size={17}/>Recibos</button></div>
    <div className="history-filters"><div className="date-shortcuts"><button onClick={() => setDate(offsetDate(date, -1))}>Ayer</button><button className={date === today() ? 'selected' : ''} onClick={() => setDate(today())}>Hoy</button><label className="date-select"><CalendarDays size={17}/><input aria-label="Elegir fecha" type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div><div className="segmented">{(['day', 'week', 'month'] as const).map(key => <button key={key} className={range === key ? 'selected' : ''} onClick={() => setRange(key)}>{key === 'day' ? 'Día' : key === 'week' ? 'Semana' : 'Mes'}</button>)}</div><label className="search"><Search size={18}/><input aria-label="Buscar pedido" placeholder="Buscar por cliente o plato" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <label className="payment-filter">Estado del pago<select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value)}><option>Todos</option><option>Pendiente</option><option>Parcial</option><option>Pagado</option></select></label>
    {tab === 'orders' && <><div className="filter-tabs">{['Todos', 'Pendiente', 'Entregado', 'Cancelado'].map(key => <button key={key} className={status === key ? 'selected' : ''} onClick={() => setStatus(key)}>{key === 'Pendiente' ? 'Pendientes' : key === 'Entregado' ? 'Entregados' : key === 'Cancelado' ? 'Cancelados' : key}<b>{data.orders.filter(order => order.date >= days.from && order.date <= days.to && (key === 'Todos' || order.status === key)).length}</b></button>)}</div><div className="orders-list">{orders.map(order => <OrderRow key={order.id} order={order} onOpen={() => onOpen(order.id)} onDone={() => onOpen(order.id)}/>)}{!orders.length && <div className="empty"><b>No hay pedidos en este período</b><p>Prueba con otra fecha o registra un pedido nuevo.</p><button className="secondary" onClick={onNew}><Plus size={17}/>Nuevo pedido</button></div>}</div></>}
    {tab === 'receipts' && <div className="receipt-list">{orders.map(order => <article className="receipt-row" key={order.id}><div className="receipt-icon"><Download size={19}/></div><div><b>{order.customer || 'Venta sin cliente'}</b><span>{order.date}{order.time ? ` · ${order.time}` : ''} · {order.items.length} {order.items.length === 1 ? 'plato' : 'platos'}</span></div><div className="receipt-amount"><b>{money(order.total)}</b><small>{getBalance(order.total, order.paid) ? `Saldo ${money(getBalance(order.total, order.paid))}` : 'Pagado'}</small></div><button className="secondary" onClick={() => onOpen(order.id)}>Abrir recibo</button></article>)}{!orders.length && <div className="empty"><b>No hay recibos para mostrar</b><p>Los comprobantes de los pedidos aparecerán aquí.</p></div>}</div>}
  </>;
}

function Money({ data, onExpense, onIncome, onEditExpense, onDeleteExpense }: { data: Data; onExpense: () => void; onIncome: () => void; onEditExpense: (id: string) => void; onDeleteExpense: (id: string) => void }) {
  const [date, setDate] = useState(today());
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day');
  const days = getDateRange(date, range);
  const periodOrders = data.orders.filter(order => order.date >= days.from && order.date <= days.to);
  const orders = periodOrders.filter(order => order.status !== 'Cancelado');
  const expenses = data.expenses.filter(expense => expense.date >= days.from && expense.date <= days.to);
  const incomes = data.incomes.filter(income => income.date >= days.from && income.date <= days.to);
  const periodPayments = data.orders.flatMap(order => getOrderPayments(order).filter(payment => localDate(payment.date) >= days.from && localDate(payment.date) <= days.to).map(payment => ({ order, payment })));
  const sales = periodPayments.reduce((sum, row) => sum + row.payment.amount, 0);
  const outstanding = orders.reduce((sum, order) => sum + getBalance(order.total, order.paid), 0);
  const extra = incomes.reduce((sum, income) => sum + income.amount, 0);
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const balance = sales + extra - spent;
  const movements = [
    ...periodPayments.map(({ order, payment }) => ({ id: payment.id, title: order.status === 'Cancelado' ? `Pedido cancelado · ${order.customer || 'Venta sin cliente'}` : order.customer || 'Venta sin cliente', detail: order.items.map(item => `${item.qty} × ${item.name}`).join(' · '), amount: payment.amount, date: localDate(payment.date), kind: 'income' as const, category: payment.method })),
    ...incomes.map(income => ({ id: income.id, title: income.note || 'Otro ingreso', detail: income.category, amount: income.amount, date: income.date, kind: 'income' as const, category: income.category })),
    ...expenses.map(expense => ({ id: expense.id, title: expense.note || 'Gasto de cocina', detail: expense.category, amount: expense.amount, date: expense.date, kind: 'expense' as const, category: expense.category })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const estimatedMargin = orders.filter(order => order.status === 'Entregado').reduce((sum, order) => sum + order.items.reduce((lineSum, item) => lineSum + item.qty * (item.price - item.cost), 0), 0);
  return <>
    <div className="page-title"><div><div className="eyebrow">CUENTAS CLARAS</div><h1>Dinero</h1><p>Entradas, gastos y saldos del período.</p></div><div className="money-actions"><button className="secondary" onClick={onIncome}><Plus size={17}/>Otro ingreso</button><button className="primary" onClick={onExpense}><Plus size={17}/>Registrar gasto</button></div></div>
    <div className="money-period"><div className="segmented">{(['day', 'week', 'month'] as const).map(key => <button key={key} className={range === key ? 'selected' : ''} onClick={() => setRange(key)}>{key === 'day' ? 'Día' : key === 'week' ? 'Semana' : 'Mes'}</button>)}</div><label className="date-select"><CalendarDays size={17}/><input aria-label="Fecha de resumen" type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div>
    <section className="money-overview"><div className="money-primary"><span>Dinero que entró</span><b>{money(sales + extra)}</b><small>Solo cobros registrados en este período</small></div><div><span>Dinero que salió</span><b>{money(spent)}</b></div><div><span>Te queda en caja</span><b>{money(balance)}</b><small>Entradas menos gastos</small></div><div><span>Por cobrar</span><b>{money(outstanding)}</b></div></section>
    <div className="money-note">Margen estimado de pedidos entregados: <b>{money(estimatedMargin)}</b>. Usa el costo guardado en cada pedido y no resta nuevamente los gastos reales.</div>
    <div className="section-head"><div><div className="eyebrow">MOVIMIENTOS</div><h2>Actividad reciente</h2></div><button className="secondary" onClick={() => exportCsv('movimientos-cielito.csv', ['Tipo', 'Fecha', 'Detalle', 'Categoría', 'Monto'], movements.map(item => [item.kind === 'income' ? 'Ingreso' : 'Gasto', item.date, item.title, item.category, item.kind === 'income' ? item.amount : -item.amount]))}><Download size={16}/>Exportar</button></div>
    {periodPayments.some(({ order }) => order.status === 'Cancelado') && <p className="money-note">Los abonos de pedidos cancelados siguen como dinero recibido. Si devolviste el monto, regístralo como gasto de reembolso.</p>}
    <div className="movement-list">{movements.map(item => <article className="movement-row" key={item.id}><span className={`movement-sign ${item.kind}`}>{item.kind === 'income' ? '+' : '−'}</span><div className="movement-copy"><b>{item.title}</b><span>{item.detail} · {formatReadableDate(item.date)}</span></div><b className={`movement-amount ${item.kind}`}>{item.kind === 'income' ? '+' : '−'} {money(item.amount)}</b>{item.kind === 'expense' && <div className="row-actions"><button className="icon-button" onClick={() => onEditExpense(item.id)} aria-label="Editar gasto"><Settings size={17}/></button><button className="icon-button danger-icon" onClick={() => onDeleteExpense(item.id)} aria-label="Eliminar gasto"><Trash2 size={17}/></button></div>}</article>)}{!movements.length && <div className="empty"><b>No hay movimientos en este período</b><p>Cuando registres cobros o gastos, aparecerán aquí.</p></div>}</div>
  </>;
}

function ExpenseModal({ categories, expense, income, onCategory, onClose, onSave, onIncomeSave }: { categories: string[]; expense?: Expense; income: boolean; onCategory: (category: string) => void; onClose: () => void; onSave: (expense: Expense) => void; onIncomeSave: (amount: number, category: string, date: string, note: string) => void }) {
  useBodyScrollLock(true);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category || categories[0] || 'Otros');
  const [date, setDate] = useState(expense?.date || today());
  const [note, setNote] = useState(expense?.note || '');
  const [method, setMethod] = useState(expense?.method || '');
  const [newCategory, setNewCategory] = useState('');
  const parsedAmount = Number(amount);
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !note.trim() && !income) return; if (income) onIncomeSave(parsedAmount, category, date, note.trim()); else onSave({ id: expense?.id || uid(), amount: parsedAmount, category, date, note: note.trim(), ...(method ? { method } : {}) }); };
  return <div className="modal-backdrop" role="presentation"><form className="modal expense-modal" role="dialog" aria-modal="true" onSubmit={submit}>
    <button type="button" className="back-button modal-back" onClick={onClose} aria-label="Volver"><ArrowLeft size={20}/></button><div className="eyebrow">{income ? 'ENTRADA DE DINERO' : 'SALIDA DE DINERO'}</div><h2>{income ? 'Registrar un ingreso' : expense ? 'Editar gasto' : 'Registrar un gasto'}</h2><p>{income ? 'Anota un ingreso que no venga de un pedido.' : 'Primero cuéntanos qué compraste o pagaste.'}</p>
    <label className="form-label expense-note-label">Detalle del gasto{!income && <input required value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. Compré pollo"/>}{income && <input value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. Venta adicional"/>}</label>
    <label className="form-label amount-label">Monto <span>Bs</span><input aria-label="Monto en bolivianos" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/></label>
    <label className="form-label">Categoría<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}{income && !categories.length && <option>Otro</option>}</select></label>
    {!income && <>{newCategory === null ? null : newCategory !== '' ? <div className="category-add"><input aria-label="Nueva categoría" value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="Nombre de la categoría"/><button className="secondary" type="button" onClick={() => { const value = newCategory.trim(); if (value && !categories.includes(value)) { onCategory(value); setCategory(value); } setNewCategory(''); }}>Agregar</button></div> : <button type="button" className="add-client" onClick={() => setNewCategory(' ')}><Plus size={16}/>Crear categoría</button>}</>}
    <div className="delivery-fields expense-meta"><label className="form-label">Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label className="form-label">Forma de pago <small>Opcional</small><select value={method} onChange={event => setMethod(event.target.value)}><option value="">Sin especificar</option><option>Efectivo</option><option>QR / transferencia</option></select></label></div>
    <button className="primary wide expense-submit" disabled={!parsedAmount || parsedAmount <= 0 || !income && !note.trim()}>{expense ? 'Guardar cambios' : income ? 'Guardar ingreso' : 'Guardar gasto'}</button>
  </form></div>;
}

function OrderDetail({ order, data, uid: ownerUid, onClose, onDone, onUpdate, onAddPayment, onCancel, onReceipt }: { order?: Order; data: Data; uid?: string; onClose: () => void; onDone: (id: string) => void; onUpdate: (order: Order) => void; onAddPayment: (id: string, amount: number, method: PaymentMethod) => void; onCancel: (id: string) => void; onReceipt: (order: Order) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Efectivo');
  const [customer, setCustomer] = useState(order?.customer || '');
  const [date, setDate] = useState(order?.date || today());
  const [time, setTime] = useState(order?.time || '');
  const [note, setNote] = useState(order?.note || '');
  const [items, setItems] = useState<Line[]>(order?.items || []);
  const [newProduct, setNewProduct] = useState('');
  useEffect(() => { if (!order) return; setCustomer(order.customer); setDate(order.date); setTime(order.time); setNote(order.note); setItems(order.items); setEditing(false); setAmount(''); }, [order?.id]);
  if (!order) return null;
  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const balance = getBalance(order.total, order.paid);
  const paymentSum = paymentTotals(order.payments || []);
  const saveEdit = () => {
    if (!items.length || total < order.paid) return;
    onUpdate({ ...order, customer: customer.trim(), date, time, note: note.trim(), items, total }); setEditing(false);
  };
  return <div className="modal-backdrop" role="presentation"><section className="modal detail-modal" role="dialog" aria-modal="true">
    <header className="detail-header"><button className="back-button" onClick={onClose} aria-label="Volver al historial"><ArrowLeft size={21}/></button><div><div className="eyebrow">{editing ? 'EDITAR PEDIDO' : 'DETALLE DEL PEDIDO'}</div><h2>{editing ? 'Modificar pedido' : order.customer || 'Venta sin cliente'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></header>
    {editing ? <div className="detail-body"><label className="form-label">Cliente<input value={customer} onChange={event => setCustomer(event.target.value)}/></label><div className="delivery-fields delivery-schedule"><label className="form-label">Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label className="form-label">Hora<input type="time" value={time} onChange={event => setTime(event.target.value)}/></label></div><label className="form-label">Nota<input value={note} onChange={event => setNote(event.target.value)}/></label><div className="eyebrow detail-subhead">PLATOS DEL PEDIDO</div>{items.map((item, index) => <div className="cart-line" key={`${item.productId}:${index}`}><div className="cart-item-copy"><b>{item.name}</b><small>{money(item.price)} cada uno</small></div><div className="qty"><button onClick={() => setItems(current => current.map((line, i) => i === index ? { ...line, qty: line.qty - 1 } : line).filter(line => line.qty > 0))}><Minus size={16}/></button><b>{item.qty}</b><button onClick={() => setItems(current => current.map((line, i) => i === index ? { ...line, qty: line.qty + 1 } : line))}><Plus size={16}/></button></div><b>{money(item.qty * item.price)}</b><button className="remove-line" onClick={() => setItems(current => current.filter((_, i) => i !== index))} aria-label={`Eliminar ${item.name}`}><Trash2 size={17}/></button></div>)}<label className="form-label">Agregar plato<select value={newProduct} onChange={event => { const product = data.products.find(item => item.id === event.target.value); if (!product) return; const old = items.find(item => item.productId === product.id); setItems(old ? items.map(item => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item) : [...items, { productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost }]); setNewProduct(''); }}><option value="">Seleccionar plato…</option>{data.products.filter(product => product.active).map(product => <option value={product.id} key={product.id}>{product.name} · {money(product.price)}</option>)}</select></label><div className="checkout-total"><span>Nuevo total</span><b>{money(total)}</b></div>{total < order.paid && <p className="error">El nuevo total no puede ser menor a lo ya pagado ({money(order.paid)}).</p>}<button className="primary wide" disabled={!items.length || total < order.paid} onClick={saveEdit}>Guardar cambios</button></div>
      : <><div className="detail-body"><div className="detail-date"><CalendarDays size={17}/>{formatReadableDate(order.date)}{order.time && <><span>·</span><Clock3 size={16}/>{order.time}</>}</div><div className="detail-items">{order.items.map((item, index) => <div className="detail-line" key={`${item.productId}:${index}`}><span>{item.qty} × {item.name}<small>{money(item.price)} cada uno</small></span><b>{money(item.qty * item.price)}</b></div>)}</div>{order.note && <p className="detail-note">{order.note}</p>}<div className="receipt-totals"><div><span>Total</span><b>{money(order.total)}</b></div><div><span>Pagado</span><b>{money(order.paid)}</b></div><div><span>Saldo</span><b>{money(balance)}</b></div></div><div className="payment-breakdown"><b>Pagos recibidos</b><span>Efectivo {money(paymentSum.Efectivo)} · QR {money(paymentSum['QR / transferencia'])}{paymentSum['Otro / sin detalle'] ? ` · Otros ${money(paymentSum['Otro / sin detalle'])}` : ''}</span>{(order.payments || []).map(payment => <div className="payment-entry" key={payment.id}><span>{payment.method} · {formatReadableDate(payment.date)}</span><b>{money(payment.amount)}</b></div>)}{!(order.payments || []).length && <small>{order.paid ? `Pago inicial · ${order.method}` : 'Aún no se registraron pagos.'}</small>}</div>
        {!editing && order.status !== 'Cancelado' && balance > 0 && <section className="add-payment"><div className="section-label"><b>Registrar abono</b><span>Saldo {money(balance)}</span></div><label className="form-label">Monto (Bs)<input type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/></label><label className="form-label">Forma de pago<select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}><option>Efectivo</option><option>QR / transferencia</option></select></label><button className="secondary wide" disabled={!validPayment(order.total, order.paid, Number(amount))} onClick={() => { onAddPayment(order.id, Number(amount), method); setAmount(''); }}>Guardar abono</button></section>}
      </div><footer className="detail-footer"><button className="secondary" onClick={() => onReceipt(order)}><Download size={17}/>Compartir recibo</button><button className="secondary" onClick={() => void downloadReceipt(order, data.business, data.businessLogoId, ownerUid, paperWidth())}><Download size={17}/>Descargar</button><button className="secondary" onClick={() => printReceipt(order, data.business, data.businessLogoId, ownerUid, paperWidth())}><Printer size={17}/>Imprimir</button>{order.status === 'Pendiente' && <button className="secondary" onClick={() => setEditing(true)}>Editar</button>}{order.status === 'Pendiente' && <button className="primary" onClick={() => { onDone(order.id); onClose(); }}><Check size={17}/>Entregado</button>}{order.status === 'Pendiente' && <button className="danger-button" onClick={() => onCancel(order.id)}>Cancelar pedido</button>}</footer></>}
  </section></div>;
}

function paymentLabel(payments: Payment[], paid: number, total: number) {
  if (!paid || paid < total) return paid ? 'Parcial' : 'Pendiente';
  const methods = new Set(payments.map(payment => payment.method));
  return methods.size > 1 ? 'Mixto' : payments[0]?.method || 'Efectivo';
}

function legacyPaymentMethod(method: string): PaymentMethod {
  const normalized = method.toLowerCase();
  if (normalized.includes('qr') || normalized.includes('transfer')) return 'QR / transferencia';
  if (normalized.includes('efectivo') || normalized.includes('cash')) return 'Efectivo';
  return 'Otro / sin detalle';
}

function getOrderPayments(order: Order): Payment[] {
  if (order.payments?.length) return order.payments;
  if (!order.paid) return [];
  return [{ id: `${order.id}-historic-payment`, amount: order.paid, date: `${order.date}T12:00:00-04:00`, method: legacyPaymentMethod(order.method) }];
}

function formatReadableDate(value: string) {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'America/La_Paz' }).format(parsed);
}

function localDate(value: string) {
  if (value.length === 10) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(date);
}

function offsetDate(date: string, delta: number) {
  const parsed = new Date(`${date}T12:00:00-04:00`); parsed.setDate(parsed.getDate() + delta);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(parsed);
}

function exportCsv(filename: string, headers: string[], rows: unknown[][]) {
  const quote = (value: unknown) => { let text = String(value ?? ''); if (typeof value === 'string' && /^[=+@\-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const content = '\ufeff' + [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function receiptMarkup(order: Order, business: string, logo: string, width: '58mm' | '80mm') {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
  const payments = order.payments || [];
  const paymentsHtml = payments.length ? payments.map(payment => `<div class="row"><span>${escape(payment.method)}</span><b>${money(payment.amount)}</b></div>`).join('') : `<div class="row"><span>${escape(order.method)}</span><b>${money(order.paid)}</b></div>`;
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Recibo ${escape(order.id.slice(0, 8))}</title><style>
    @page{size:${width} auto;margin:3mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#20251f;width:calc(${width} - 6mm);margin:0 auto;padding:2mm 0;line-height:1.4}.logo{text-align:center;margin-bottom:8px}.logo img{max-width:35mm;max-height:22mm;object-fit:contain}.brand{text-align:center;font-weight:bold;font-size:19px}.sub{text-align:center;margin:3px 0 12px;color:#555}.line{border-top:1px dashed #999;margin:9px 0}.row{display:flex;justify-content:space-between;gap:8px;padding:4px 0}.row span{min-width:0;overflow-wrap:anywhere}.total{font-size:16px;font-weight:bold;border-top:2px solid #222;margin-top:7px;padding-top:7px}.thanks{text-align:center;margin-top:14px}</style>
    ${logo ? `<div class="logo"><img src="${logo}" alt="Logo"></div>` : ''}<div class="brand">${escape(business)}</div><div class="sub">Comprobante de pedido · #${escape(order.id.slice(0, 8).toUpperCase())}</div><div>Fecha: ${escape(order.createdAt ? formatReadableDate(order.createdAt) : order.date)}</div><div>Entrega: ${escape(order.date)}${order.time ? ` · ${escape(order.time)}` : ''}</div><div>Cliente: ${escape(order.customer || 'Venta sin cliente')}</div><div class="line"></div>
    ${order.items.map(item => `<div class="row"><span>${item.qty} × ${escape(item.name)}<br>${money(item.price)} c/u</span><b>${money(item.qty * item.price)}</b></div>`).join('')}<div class="line"></div><div class="row total"><span>Total</span><b>${money(order.total)}</b></div>${paymentsHtml}<div class="row"><span>Pagado</span><b>${money(order.paid)}</b></div><div class="row"><span>Saldo pendiente</span><b>${money(getBalance(order.total, order.paid))}</b></div><div class="thanks">Gracias por tu compra</div></html>`;
}

function paperWidth(): '58mm' | '80mm' { return localStorage.getItem('cielito-paper-width') === '80mm' ? '80mm' : '58mm'; }

async function logoData(uidValue: string | undefined, imageId: string | undefined) {
  if (!uidValue || !imageId) return '';
  try { return await readImageDataUrl(uidValue, imageId); } catch { return ''; }
}

async function printReceipt(order: Order, business: string, imageId?: string, ownerUid?: string, width: '58mm' | '80mm' = paperWidth()) {
  const printWindow = window.open('', '_blank', 'width=420,height=700');
  if (!printWindow) { window.alert('Permite las ventanas emergentes para imprimir el recibo.'); return; }
  const logo = await logoData(ownerUid, imageId);
  printWindow.document.open(); printWindow.document.write(receiptMarkup(order, business, logo, width)); printWindow.document.close();
  printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
}

async function shareReceipt(order: Order, business: string, imageId?: string, ownerUid?: string, width: '58mm' | '80mm' = paperWidth()) {
  const html = receiptMarkup(order, business, await logoData(ownerUid, imageId), width);
  const fileName = `recibo-${order.id.slice(0, 8)}.html`;
  const file = new File([html], fileName, { type: 'text/html' });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `Recibo ${business}` }); return; }
  } catch (error) { if ((error as DOMException).name === 'AbortError') return; }
  const text = `${business}\nPedido #${order.id.slice(0, 8).toUpperCase()} · ${order.date}${order.time ? ` · Entrega ${order.time}` : ''}\nCliente: ${order.customer || 'Venta sin cliente'}\n${order.items.map(item => `${item.qty} × ${item.name} — ${money(item.qty * item.price)}`).join('\n')}\nTotal ${money(order.total)}\nPagado ${money(order.paid)} · Saldo ${money(getBalance(order.total, order.paid))}\nGracias por tu compra`;
  const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(file); anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

async function downloadReceipt(order: Order, business: string, imageId?: string, ownerUid?: string, width: '58mm' | '80mm' = paperWidth()) {
  const html = receiptMarkup(order, business, await logoData(ownerUid, imageId), width);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `recibo-${order.id.slice(0, 8)}.html`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
