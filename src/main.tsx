import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import {
  ArrowLeft, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList,
  Clock3, Download, Eye, EyeOff, Home, LogOut, Menu, Minus, Plus, Printer,
  Search, Settings, ShoppingBasket, Trash2, Utensils, Wallet, X,
} from 'lucide-react';
import { auth, authReady, db, firebaseConfigured } from './firebase';
import { deleteOwnerProduct, hydrateOwnerData, persistOwnerData } from './cloudData';
import { readImageDataUrl } from './managedImages';
import { CloudImage } from './ManagedImageUi';
import { MoreScreen } from './MoreScreen';
import { getBalance, getDateRange, paymentTotals, roundCurrency, sumCurrency, validPayment, type Payment, type PaymentMethod } from './domain';
import { useBodyScrollLock } from './useBodyScrollLock';
import { getAvailableAmount, getCategoryTotals, getIncomeSummaries, getPendingPlateCount, type IncomeDeduction, type IncomeSummary } from './finance';
import './style.css';

type Product = { id: string; name: string; price: number; cost: number; active: boolean; imageId?: string };
type Customer = { id: string; name: string; phone: string };
type Line = { productId: string; name: string; qty: number; price: number; cost: number };
type Order = { id: string; customer: string; date: string; time: string; createdAt?: string; items: Line[]; total: number; paid: number; payments?: Payment[]; status: 'Pendiente' | 'Entregado' | 'Cancelado'; method: string; note: string };
type Expense = { id: string; amount: number; category: string; date: string; note: string; method?: string };
type Income = { id: string; amount: number; category: string; date: string; note: string; method?: string; payments?: Payment[]; source?: 'manual' };
type Data = { products: Product[]; customers: Customer[]; orders: Order[]; expenses: Expense[]; incomes: Income[]; incomeDeductions: IncomeDeduction[]; categories: string[]; incomeCategories: string[]; business: string; businessLogoId?: string };
type Page = 'Inicio' | 'Vender' | 'Pedidos' | 'Dinero' | 'Más';

const OWNER_UID = '4iftAGoQawabSz1EEpKufdPQccC2';
const seed: Data = {
  business: 'Mi cocina',
  products: [
    { id: 'p1', name: 'Picante de pollo', price: 35, cost: 19, active: true },
    { id: 'p2', name: 'Silpancho', price: 32, cost: 18, active: true },
    { id: 'p3', name: 'Falso conejo', price: 30, cost: 16, active: true },
  ], customers: [], orders: [], expenses: [], incomes: [], incomeDeductions: [],
  categories: ['Ingredientes', 'Verduras', 'Carnes', 'Transporte', 'Gas', 'Envases', 'Servicios', 'Otros'],
  incomeCategories: ['Venta de comida', 'Otros ingresos'],
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());

const money = (value: number) => `Bs ${Number(value || 0).toFixed(2)}`;
const uid = () => crypto.randomUUID();
function load(): Data {
  try { const saved = JSON.parse(localStorage.getItem('cielito-data') || '{}'); return { ...seed, ...saved, incomes: saved.incomes || [], incomeDeductions: saved.incomeDeductions || [], categories: saved.categories || seed.categories, incomeCategories: saved.incomeCategories || seed.incomeCategories }; }
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

  useBodyScrollLock(Boolean(modal));

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
  const update = async (next: Data): Promise<boolean> => {
    if (db && user) {
      if (!syncReady) { ping('Espera a que termine la sincronización para guardar.'); return false; }
      try {
        await persistOwnerData(user.uid, next, data);
        setCloud(true);
      } catch (error) {
        console.error('[Cielito] Falló la sincronización de cambios.', error);
        setCloud(false);
        const code = (error as { code?: string }).code;
        ping(code === 'permission-denied' ? 'Firebase rechazó el cambio por permisos.' : 'No se pudo sincronizar. Revisa tu conexión.');
        return false;
      }
    }
    setData(next);
    return true;
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

  const pending = data.orders.filter(order => order.status === 'Pendiente').sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
  const pendingPlates = getPendingPlateCount(pending);
  const nav = [
    ['Inicio', Home], ['Vender', ShoppingBasket], ['Pedidos', ClipboardList], ['Dinero', Wallet], ['Más', Menu],
  ] as const;

  const addOrder = async (customer: string, items: Line[], date: string, time: string, payments: Payment[], note: string) => {
    if (!items.length) return false;
    const total = sumCurrency(items.map(item => item.qty * item.price));
    const paid = sumCurrency(payments.map(payment => payment.amount));
    if (paid > total || paid < 0) { ping('El pago supera el total del pedido.'); return false; }
    const order: Order = { id: uid(), customer, date, time, createdAt: new Date().toISOString(), items, total, paid, payments, status: 'Pendiente', method: paymentLabel(payments, paid, total), note };
    if (!await update({ ...data, orders: [order, ...data.orders] })) return false;
    setCheckoutOrderId(order.id); setModal('saved'); setPage('Pedidos');
    return true;
  };
  const addCustomer = async (name: string, phone: string): Promise<Customer | undefined> => {
    const customer = { id: uid(), name, phone };
    if (!await update({ ...data, customers: [customer, ...data.customers] })) return undefined;
    return customer;
  };
  const markDone = async (id: string): Promise<boolean> => { const saved = await update({ ...data, orders: data.orders.map(order => order.id === id ? { ...order, status: 'Entregado' } : order) }); if (saved) ping('Pedido marcado como entregado'); return saved; };
  const saveExpense = async (value: Expense) => {
    const exists = data.expenses.some(expense => expense.id === value.id);
    if (!await update({ ...data, expenses: exists ? data.expenses.map(expense => expense.id === value.id ? value : expense) : [value, ...data.expenses] })) return;
    setModal(''); ping(exists ? 'Gasto actualizado' : 'Gasto guardado');
  };
  const saveIncome = async (value: Income) => {
    const exists = data.incomes.some(income => income.id === value.id);
    const normalized = { ...value, source: 'manual' as const };
    if (sumCurrency(normalized.payments?.map(payment => payment.amount) || []) !== normalized.amount) { ping('Los medios de pago deben sumar exactamente el monto recibido.'); return false; }
    const linkedDiscounts = sumCurrency(data.incomeDeductions.filter(item => item.incomeId === `manual:${value.id}`).map(item => item.amount));
    if (linkedDiscounts > normalized.amount) { ping('El monto no puede ser menor que los descuentos ya vinculados.'); return false; }
    if (!await update({ ...data, incomes: exists ? data.incomes.map(income => income.id === value.id ? normalized : income) : [normalized, ...data.incomes] })) return false;
    setModal(''); ping(exists ? 'Ingreso actualizado' : 'Ingreso guardado');
    return true;
  };
  const saveIncomeDeduction = async (value: IncomeDeduction) => {
    const existing = data.incomeDeductions.find(item => item.id === value.id);
    const income = getIncomeSummaries(data.incomes, data.orders, '0000-01-01', '9999-12-31').find(item => item.incomeId === value.incomeId);
    if (!income) { ping('No encontramos ese ingreso.'); return false; }
    const deductions = data.incomeDeductions.filter(item => item.incomeId === value.incomeId && item.id !== value.id);
    const alreadyLinked = value.expenseId && data.incomeDeductions.some(item => item.expenseId === value.expenseId && item.id !== value.id);
    if (alreadyLinked) { ping('Ese gasto ya está vinculado a un ingreso.'); return false; }
    if (value.expenseId) {
      const expense = data.expenses.find(item => item.id === value.expenseId);
      if (!expense || expense.amount !== value.amount || expense.date !== value.date) { ping('El gasto vinculado debe conservar su monto y fecha originales.'); return false; }
    }
    if (sumCurrency([...deductions.map(item => item.amount), value.amount]) > income.amount) { ping('El descuento supera lo disponible en este ingreso.'); return false; }
    const next = existing
      ? data.incomeDeductions.map(item => item.id === value.id ? value : item)
      : [value, ...data.incomeDeductions];
    return update({ ...data, incomeDeductions: next });
  };
  const deleteIncomeDeduction = async (id: string) => update({ ...data, incomeDeductions: data.incomeDeductions.filter(item => item.id !== id) });
  const deleteManualIncome = async (id: string) => {
    if (!window.confirm('¿Eliminar este ingreso manual? Sus descuentos vinculados también se quitarán.')) return false;
    const deductionIds = new Set(data.incomeDeductions.filter(item => item.incomeId === `manual:${id}`).map(item => item.id));
    if (!await update({ ...data, incomes: data.incomes.filter(item => item.id !== id), incomeDeductions: data.incomeDeductions.filter(item => !deductionIds.has(item.id)) })) return false;
    ping('Ingreso eliminado'); return true;
  };
  const deleteExpense = async (id: string) => {
    if (!window.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return false;
    const nextDeductions = data.incomeDeductions.map(item => {
      if (item.expenseId !== id) return item;
      const { expenseId: _expenseId, ...snapshot } = item;
      return snapshot;
    });
    if (!await update({ ...data, expenses: data.expenses.filter(expense => expense.id !== id), incomeDeductions: nextDeductions })) return false;
    ping('Gasto eliminado'); return true;
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
        {page === 'Inicio' && <HomeScreen data={data} pendingPlates={pendingPlates} onExpense={() => setModal('expense')} onIncome={() => setModal('income')} onOrders={() => setPage('Pedidos')}/>}
        {page === 'Vender' && <Sell products={data.products.filter(product => product.active)} customers={data.customers} uid={user?.uid} onSave={addOrder} onCustomer={addCustomer}/>}
        {page === 'Pedidos' && <History data={data} date={selectedDate} setDate={setSelectedDate} onNew={() => setPage('Vender')} onOpen={id => setModal(`detail:${id}`)}/>}
        {page === 'Dinero' && <Money data={data} onExpense={() => setModal('expense')} onIncome={() => setModal('income')} onEditExpense={id => setModal(`expense:${id}`)} onDeleteExpense={id => void deleteExpense(id)} onEditIncome={id => setModal(`income:${id}`)} onDeleteIncome={id => void deleteManualIncome(id)} onSaveDeduction={saveIncomeDeduction} onDeleteDeduction={deleteIncomeDeduction} onOpenOrder={id => setModal(`detail:${id}`)}/>}
        {page === 'Más' && <MoreScreen products={data.products} customers={data.customers} business={data.business} businessLogoId={data.businessLogoId} uid={user?.uid}
          onAddProduct={async (name, price, cost) => update({ ...data, products: [{ id: uid(), name, price, cost, active: true }, ...data.products] })}
          onEditProduct={edited => update({ ...data, products: data.products.map(product => product.id === edited.id ? edited : product) })}
          onDeleteProduct={async (id, imageId) => { if (user) { await deleteOwnerProduct(user.uid, id, imageId); setCloud(true); } setData(current => ({ ...current, products: current.products.filter(product => product.id !== id) })); }}
          onToggleProduct={id => update({ ...data, products: data.products.map(product => product.id === id ? { ...product, active: !product.active } : product) })}
          soldProductIds={new Set(data.orders.flatMap(order => order.items.map(item => item.productId)))}
          onAddCustomer={async (name, phone) => Boolean(await addCustomer(name, phone))} onSaveBusiness={business => update({ ...data, business })}
          onProductImageSaved={(id, imageId) => { setData(current => ({ ...current, products: current.products.map(product => product.id === id ? { ...product, imageId } : product) })); setCloud(true); }}
          onProductImageDeleted={id => { setData(current => ({ ...current, products: current.products.map(product => { if (product.id !== id) return product; const { imageId: _imageId, ...rest } = product; return rest; }) })); setCloud(true); }}
          onBusinessLogoSaved={businessLogoId => { setData(current => ({ ...current, businessLogoId })); setCloud(true); }} onBusinessLogoDeleted={() => { setData(current => ({ ...current, businessLogoId: undefined })); setCloud(true); }}
          onToast={ping} onInstall={install} onLogout={() => auth && void signOut(auth)}/>}
      </div>
    </main>
    <nav className="mobile-nav">{nav.map(([name, Icon]) => <button className={page === name ? 'active' : ''} key={name} onClick={() => setPage(name)}><Icon size={20}/><span>{name}</span></button>)}</nav>
    {updateReady && <div className="update-banner" role="status"><span>Hay una versión nueva lista. Actualiza cuando termines lo que estás haciendo.</span><button onClick={() => window.location.reload()}>Actualizar</button></div>}
    {(modal === 'expense' || modal.startsWith('expense:')) && <ExpenseModal categories={data.categories} expense={modal.startsWith('expense:') ? data.expenses.find(item => item.id === modal.split(':')[1]) : undefined} income={false} onCategory={category => update({ ...data, categories: data.categories.includes(category) ? data.categories : [...data.categories, category] })} onClose={() => setModal('')} onSave={saveExpense} onIncomeSave={async () => false}/>}
    {(modal === 'income' || modal.startsWith('income:')) && <IncomeModal categories={data.incomeCategories} income={modal.startsWith('income:') ? data.incomes.find(item => item.id === modal.split(':')[1]) : undefined} onCategory={category => update({ ...data, incomeCategories: data.incomeCategories.includes(category) ? data.incomeCategories : [...data.incomeCategories, category] })} onClose={() => setModal('')} onSave={saveIncome}/>}
    {modal.startsWith('detail:') && <OrderDetail order={data.orders.find(order => order.id === modal.split(':')[1])} data={data} uid={user?.uid} onClose={() => setModal('')} onDone={markDone} onUpdate={async order => { if (await update({ ...data, orders: data.orders.map(item => item.id === order.id ? order : item) })) { ping('Pedido actualizado'); return true; } return false; }} onAddPayment={async (id, amount, method) => {
      const order = data.orders.find(item => item.id === id);
      if (!order || !validPayment(order.total, order.paid, amount)) { ping(`El saldo disponible es ${money(getBalance(order?.total || 0, order?.paid || 0))}.`); return false; }
      const payment: Payment = { id: uid(), amount, method, date: new Date().toISOString() };
      const payments = [...(order.payments || []), payment]; const paid = sumCurrency(payments.map(item => item.amount));
      if (await update({ ...data, orders: data.orders.map(item => item.id === id ? { ...item, payments, paid, method: paymentLabel(payments, paid, order.total) } : item) })) { ping('Abono registrado'); return true; }
      return false;
    }} onCancel={async id => { if (window.confirm('¿Cancelar este pedido? Se conservará en el historial.') && await update({ ...data, orders: data.orders.map(order => order.id === id ? { ...order, status: 'Cancelado' } : order) })) { setModal(''); ping('Pedido cancelado'); } }} onReceipt={order => void shareReceipt(order, data.business, data.businessLogoId, user?.uid, paperWidth())}/>}
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

function HomeScreen({ data, pendingPlates, onExpense, onIncome, onOrders }: { data: Data; pendingPlates: number; onExpense: () => void; onIncome: () => void; onOrders: () => void }) {
  const date = today();
  const days = getDateRange(date, 'day');
  const todayExpenses = sumCurrency(data.expenses.filter(item => item.date === date).map(item => item.amount));
  const todayIncome = sumCurrency(getIncomeSummaries(data.incomes, data.orders, days.from, days.to).map(item => item.periodAmount));
  const lateOrders = data.orders.filter(order => order.status === 'Pendiente' && (order.date < date || (order.date === date && order.time && new Date(`${order.date}T${order.time}:00-04:00`).getTime() < Date.now())));
  return <>
    <div className="welcome-row"><div><div className="eyebrow">{new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/La_Paz' }).format(new Date(`${date}T12:00:00-04:00`))}</div><h1>Hola, bienvenida</h1><p>Un resumen claro para empezar el día.</p></div></div>
    <section className="home-finance-summary"><div><span>Gastos de hoy</span><b>{money(todayExpenses)}</b></div><div><span>Ingresos de hoy</span><b>{money(todayIncome)}</b></div></section>
    <section className="home-primary-actions"><button className="home-action expense-action" onClick={onExpense}><span className="home-action-icon"><Wallet size={25}/></span><span><small>ANOTAR UNA SALIDA</small><b>Nuevo gasto</b></span><Plus size={22}/></button><button className="home-action income-action" onClick={onIncome}><span className="home-action-icon"><Download size={25}/></span><span><small>ANOTAR UNA ENTRADA</small><b>Nuevo ingreso</b></span><Plus size={22}/></button></section>
    <button className="home-pending-link" onClick={onOrders}><span><b>{pendingPlates} {pendingPlates === 1 ? 'plato pendiente' : 'platos pendientes'}</b><small>{lateOrders.length ? `${lateOrders.length} ${lateOrders.length === 1 ? 'pedido atrasado' : 'pedidos atrasados'} · Revisar pedidos` : 'Ver entregas y pedidos'}</small></span><ChevronRight size={20}/></button>
  </>;
}
function OrderRow({ order, onOpen, onDone }: { order: Order; onOpen: () => void; onDone: () => void }) {
  const balance = getBalance(order.total, order.paid);
  const late = order.status === 'Pendiente' && (order.date < today() || (order.date === today() && !!order.time && new Date(`${order.date}T${order.time}:00-04:00`).getTime() < Date.now()));
  return <article className="order-row"><button className="order-main" onClick={onOpen}><span className="order-time">{order.time || 'Sin hora'}<small>{order.date === today() ? 'Hoy' : formatReadableDate(order.date)}</small></span><span className="order-info"><b>{order.customer || 'Venta sin cliente'}</b><small>{order.items.map(item => `${item.qty} × ${item.name}`).join(' · ')}</small></span><span className="order-status"><span className={`badge ${late ? 'late' : order.status === 'Entregado' ? 'done' : ''}`}>{late ? 'Atrasado' : order.status}</span><b>{money(order.total)}</b><small>{balance ? `${money(balance)} pendiente` : 'Pagado'}</small></span></button>{order.status === 'Pendiente' && <button className="done-button" onClick={onDone}><Check size={16}/><span>Entregado</span></button>}</article>;
}

function Sell({ products, customers, uid: ownerUid, onSave, onCustomer }: { products: Product[]; customers: Customer[]; uid?: string; onSave: (customer: string, items: Line[], date: string, time: string, payments: Payment[], note: string) => Promise<boolean>; onCustomer: (name: string, phone: string) => Promise<Customer | undefined> }) {
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
  const [customerSaving, setCustomerSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'Pendiente' | 'Efectivo' | 'QR / transferencia' | 'Mixto'>('Pendiente');
  const [cash, setCash] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  useBodyScrollLock(cartOpen);
  const total = sumCurrency(cart.map(item => item.qty * item.price));
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const cashAmount = paymentMode === 'Efectivo' ? Number(cash) : paymentMode === 'Mixto' ? Number(cash || 0) : 0;
  const qrAmount = paymentMode === 'QR / transferencia' ? Number(qr) : paymentMode === 'Mixto' ? Number(qr || 0) : 0;
  const paid = roundCurrency(cashAmount + qrAmount);
  const balance = getBalance(total, paid);
  const add = (product: Product) => setCart(current => {
    const found = current.find(item => item.productId === product.id);
    return found ? current.map(item => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item) : [...current, { productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost }];
  });
  const setQty = (id: string, qty: number) => setCart(current => current.map(item => item.productId === id ? { ...item, qty } : item).filter(item => item.qty > 0));
  const submit = async () => {
    setError('');
    if (saving) return;
    const payments: Payment[] = [];
    if (paymentMode !== 'Pendiente' && paid <= 0) { setError('Indica el monto recibido o elige “Pendiente”.'); return; }
    if (cashAmount > 0) payments.push({ id: uid(), amount: cashAmount, method: 'Efectivo', date: new Date().toISOString() });
    if (qrAmount > 0) payments.push({ id: uid(), amount: qrAmount, method: 'QR / transferencia', date: new Date().toISOString() });
    if (paid > total) { setError('El monto recibido supera el total. Ajusta el efectivo o el QR.'); return; }
    if (!cart.length) { setError('Agrega al menos un plato.'); return; }
    setSaving(true);
    try {
      if (!await onSave(customer, cart, date, time, payments, note)) setError('No se pudo guardar el pedido. Revisa la conexión y vuelve a intentarlo.');
      else setCartOpen(false);
    } finally { setSaving(false); }
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
        <div className="customer-section"><label className="form-label">Cliente<select value={customer} onChange={event => setCustomer(event.target.value)}><option value="">Venta sin cliente</option>{customers.map(item => <option key={item.id} value={item.name}>{item.name}{item.phone ? ` · ${item.phone}` : ''}</option>)}</select></label>{newClient ? <div className="quick-client"><input aria-label="Nombre del cliente" placeholder="Nombre" value={clientName} onChange={event => setClientName(event.target.value)}/><input aria-label="Teléfono opcional" placeholder="Teléfono (opcional)" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)}/><div><button type="button" className="secondary" disabled={customerSaving} onClick={() => setNewClient(false)}>Cancelar</button><button type="button" className="primary" disabled={customerSaving || !clientName.trim()} onClick={() => { if (!clientName.trim() || customerSaving) return; setCustomerSaving(true); void onCustomer(clientName.trim(), phone.trim()).then(added => { if (added) { setCustomer(added.name); setClientName(''); setPhone(''); setNewClient(false); } }).finally(() => setCustomerSaving(false)); }}>{customerSaving ? 'Guardando…' : 'Guardar cliente'}</button></div></div> : <button type="button" className="add-client" onClick={() => setNewClient(true)}><Plus size={16}/>Cliente nuevo</button>}</div>
        <div className="delivery-fields delivery-schedule"><label className="form-label">Fecha de entrega<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label className="form-label">Hora <small>Opcional</small><input type="time" value={time} onChange={event => setTime(event.target.value)}/></label></div>
        <button type="button" className="disclosure" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span>Nota para la cocina <small>Opcional</small></span><ChevronDown className={advanced ? 'rotated' : ''} size={18}/></button>{advanced && <label className="form-label note-input">Notas<input value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. sin picante"/></label>}
        <section className="payment-section"><div className="section-label"><b>Pago</b><span>{paid ? `${money(paid)} recibido` : 'Puedes cobrar después'}</span></div><div className="payment-options">{(['Pendiente', 'Efectivo', 'QR / transferencia', 'Mixto'] as const).map(mode => <button key={mode} className={paymentMode === mode ? 'selected' : ''} onClick={() => { setPaymentMode(mode); setCash(mode === 'Efectivo' ? String(total) : ''); setQr(mode === 'QR / transferencia' ? String(total) : ''); setError(''); }}>{mode}</button>)}</div>
          {(paymentMode === 'Efectivo' || paymentMode === 'Mixto') && <label className="form-label payment-amount">Efectivo (Bs)<input type="number" min="0" step="0.01" max={total} value={cash} onChange={event => setCash(event.target.value)} placeholder={paymentMode === 'Efectivo' ? String(total.toFixed(2)) : '0.00'}/></label>}
          {(paymentMode === 'QR / transferencia' || paymentMode === 'Mixto') && <label className="form-label payment-amount">QR / transferencia (Bs)<input type="number" min="0" step="0.01" max={total} value={qr} onChange={event => setQr(event.target.value)} placeholder={paymentMode === 'QR / transferencia' ? String(total.toFixed(2)) : '0.00'}/></label>}
          <div className="payment-totals"><span>Total <b>{money(total)}</b></span><span>Pagado <b>{money(paid)}</b></span><span>Saldo <b>{money(balance)}</b></span></div>
        </section>
      </section></div>
      <footer className="checkout-footer"><div className="checkout-total"><span>Total del pedido</span><b>{money(total)}</b></div>{error && <p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={saving || !cart.length} onClick={() => void submit()}>{saving ? <><span className="spinner"/>Guardando…</> : <><Check size={18}/>Guardar pedido</>}</button></footer>
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
  const pendingPlatesInPeriod = getPendingPlateCount(data.orders.filter(order => order.status === 'Pendiente' && order.date >= days.from && order.date <= days.to));
  return <>
    <div className="page-title"><div><div className="eyebrow">TU HISTORIAL</div><h1>Pedidos y recibos</h1><p>Consulta entregas y comprobantes de cualquier fecha.</p></div><button className="primary" onClick={onNew}><Plus size={18}/>Nuevo pedido</button></div>
    <div className="history-tabs"><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ClipboardList size={17}/>Pedidos</button><button className={tab === 'receipts' ? 'active' : ''} onClick={() => setTab('receipts')}><Download size={17}/>Recibos</button></div>
    <div className="history-filters"><div className="date-shortcuts"><button onClick={() => setDate(offsetDate(date, -1))}>Ayer</button><button className={date === today() ? 'selected' : ''} onClick={() => setDate(today())}>Hoy</button><label className="date-select"><CalendarDays size={17}/><input aria-label="Elegir fecha" type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div><div className="segmented">{(['day', 'week', 'month'] as const).map(key => <button key={key} className={range === key ? 'selected' : ''} onClick={() => setRange(key)}>{key === 'day' ? 'Día' : key === 'week' ? 'Semana' : 'Mes'}</button>)}</div><label className="search"><Search size={18}/><input aria-label="Buscar pedido" placeholder="Buscar por cliente o plato" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <label className="payment-filter">Estado del pago<select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value)}><option>Todos</option><option>Pendiente</option><option>Parcial</option><option>Pagado</option></select></label>
    {tab === 'orders' && <><div className="pending-plate-summary"><b>{pendingPlatesInPeriod} {pendingPlatesInPeriod === 1 ? 'plato pendiente' : 'platos pendientes'}</b><span>En {data.orders.filter(order => order.status === 'Pendiente' && order.date >= days.from && order.date <= days.to).length} pedidos de este período</span></div><div className="filter-tabs">{['Todos', 'Pendiente', 'Entregado', 'Cancelado'].map(key => <button key={key} className={status === key ? 'selected' : ''} onClick={() => setStatus(key)}>{key === 'Pendiente' ? 'Pendientes' : key === 'Entregado' ? 'Entregados' : key === 'Cancelado' ? 'Cancelados' : key}<b>{data.orders.filter(order => order.date >= days.from && order.date <= days.to && (key === 'Todos' || order.status === key)).length}</b></button>)}</div><div className="orders-list">{orders.map(order => <OrderRow key={order.id} order={order} onOpen={() => onOpen(order.id)} onDone={() => onOpen(order.id)}/>)}{!orders.length && <div className="empty"><b>No hay pedidos en este período</b><p>Prueba con otra fecha o registra un pedido nuevo.</p><button className="secondary" onClick={onNew}><Plus size={17}/>Nuevo pedido</button></div>}</div></>}
    {tab === 'receipts' && <div className="receipt-list">{orders.map(order => <article className="receipt-row" key={order.id}><div className="receipt-icon"><Download size={19}/></div><div><b>{order.customer || 'Venta sin cliente'}</b><span>{order.date}{order.time ? ` · ${order.time}` : ''} · {order.items.length} {order.items.length === 1 ? 'plato' : 'platos'}</span></div><div className="receipt-amount"><b>{money(order.total)}</b><small>{getBalance(order.total, order.paid) ? `Saldo ${money(getBalance(order.total, order.paid))}` : 'Pagado'}</small></div><button className="secondary" onClick={() => onOpen(order.id)}>Abrir recibo</button></article>)}{!orders.length && <div className="empty"><b>No hay recibos para mostrar</b><p>Los comprobantes de los pedidos aparecerán aquí.</p></div>}</div>}
  </>;
}

function Money({ data, onExpense, onIncome, onEditExpense, onDeleteExpense, onEditIncome, onDeleteIncome, onSaveDeduction, onDeleteDeduction, onOpenOrder }: {
  data: Data; onExpense: () => void; onIncome: () => void; onEditExpense: (id: string) => void; onDeleteExpense: (id: string) => void;
  onEditIncome: (id: string) => void; onDeleteIncome: (id: string) => void;
  onSaveDeduction: (item: IncomeDeduction) => Promise<boolean>; onDeleteDeduction: (id: string) => Promise<boolean>;
  onOpenOrder: (id: string) => void;
}) {
  const [tab, setTab] = useState<'expenses' | 'income'>('expenses');
  const [date, setDate] = useState(today());
  const [range, setRange] = useState<'day' | 'yesterday' | 'week' | 'month' | 'custom'>('day');
  const [from, setFrom] = useState(today()); const [to, setTo] = useState(today());
  const [categoryFilter, setCategoryFilter] = useState(''); const [selectedIncome, setSelectedIncome] = useState<IncomeSummary | null>(null);
  const days = range === 'custom' ? { from, to } : getDateRange(range === 'yesterday' ? offsetDate(date, -1) : date, range === 'yesterday' ? 'day' : range);
  const expenses = data.expenses.filter(item => item.date >= days.from && item.date <= days.to);
  const summaries = getIncomeSummaries(data.incomes, data.orders, days.from, days.to);
  const incomeInPeriod = sumCurrency(summaries.map(row => row.periodAmount));
  const includedIncomeIds = new Set(summaries.map(row => row.incomeId));
  const deductionRows = data.incomeDeductions.filter(item => includedIncomeIds.has(item.incomeId) && item.date >= days.from && item.date <= days.to);
  const discounts = sumCurrency(deductionRows.map(item => item.amount));
  const available = sumCurrency(summaries.map(row => Math.max(0, row.periodAmount - sumCurrency(deductionRows.filter(item => item.incomeId === row.incomeId).map(item => item.amount)))));
  const spent = sumCurrency(expenses.map(item => item.amount));
  const grouped = getCategoryTotals(expenses);
  const visibleExpenses = categoryFilter ? expenses.filter(item => item.category === categoryFilter) : expenses;
  return <>
    <div className="page-title"><div><div className="eyebrow">CUENTAS CLARAS</div><h1>Dinero</h1><p>Los gastos generales y los ingresos se llevan por separado.</p></div><div className="money-actions"><button className="secondary" onClick={onIncome}><Plus size={17}/>Nuevo ingreso</button><button className="primary" onClick={onExpense}><Plus size={17}/>Nuevo gasto</button></div></div>
    <div className="history-tabs money-tabs"><button className={tab === 'expenses' ? 'active' : ''} onClick={() => { setTab('expenses'); setCategoryFilter(''); }}><Wallet size={17}/>Gastos</button><button className={tab === 'income' ? 'active' : ''} onClick={() => setTab('income')}><Download size={17}/>Ingresos</button></div>
    <div className="money-period"><div className="segmented">{(['day', 'yesterday', 'week', 'month', 'custom'] as const).map(key => <button key={key} className={range === key ? 'selected' : ''} onClick={() => setRange(key)}>{key === 'day' ? 'Hoy' : key === 'yesterday' ? 'Ayer' : key === 'week' ? 'Semana' : key === 'month' ? 'Mes' : 'Fechas'}</button>)}</div>{range === 'custom' ? <div className="custom-range"><label>Desde<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Hasta<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label></div> : <label className="date-select"><CalendarDays size={17}/><input aria-label="Fecha del resumen" type="date" value={date} onChange={event => setDate(event.target.value)}/></label>}</div>
    {tab === 'expenses' ? <>
      <section className="money-overview expense-overview"><div><span>Gastos del período</span><b>{money(spent)}</b><small>No se descuentan de los ingresos</small></div><div><span>Movimientos</span><b>{expenses.length}</b><small>Gastos registrados</small></div></section>
      <div className="section-head"><div><div className="eyebrow">POR CATEGORÍA</div><h2>Resumen de gastos</h2></div><button className="text-button" onClick={() => setCategoryFilter('')}>Ver todos</button></div>
      <div className="category-totals">{grouped.map(item => <button className={categoryFilter === item.category ? 'selected' : ''} key={item.category} onClick={() => setCategoryFilter(categoryFilter === item.category ? '' : item.category)}><span>{item.category}</span><b>{money(item.amount)}</b><small>{expenses.filter(expense => expense.category === item.category).length} gastos</small></button>)}</div>
      <div className="section-head"><div><div className="eyebrow">{categoryFilter || 'TODOS LOS GASTOS'}</div><h2>{categoryFilter ? `Gastos: ${categoryFilter}` : 'Movimientos'}</h2></div></div>
      <div className="movement-list">{[...visibleExpenses].sort((a,b) => b.date.localeCompare(a.date)).map(item => <article className="movement-row" key={item.id}><span className="movement-sign expense">−</span><div className="movement-copy"><b>{item.note || 'Gasto'}</b><span>{item.category} · {formatReadableDate(item.date)}{item.method ? ` · ${item.method}` : ''}</span></div><b className="movement-amount expense">− {money(item.amount)}</b><div className="row-actions"><button className="icon-button" onClick={() => onEditExpense(item.id)} aria-label="Editar gasto"><Settings size={17}/></button><button className="icon-button danger-icon" onClick={() => onDeleteExpense(item.id)} aria-label="Eliminar gasto"><Trash2 size={17}/></button></div></article>)}{!visibleExpenses.length && <div className="empty"><b>No hay gastos en este período</b><p>Registra un gasto para empezar el seguimiento.</p><button className="primary" onClick={onExpense}><Plus size={17}/>Nuevo gasto</button></div>}</div>
    </> : <>
      <section className="money-overview income-overview"><div><span>Dinero recibido</span><b>{money(incomeInPeriod)}</b><small>Pagos con fecha dentro del período</small></div><div><span>Descuentos vinculados</span><b>{money(discounts)}</b><small>Registrados en este período</small></div><div><span>Disponible de los ingresos</span><b>{money(available)}</b><small>No incluye gastos generales</small></div></section>
      <div className="income-help">Las ventas aparecen cuando se marcan entregadas. El importe refleja únicamente los pagos reales registrados; los saldos pendientes se muestran aparte.</div>
      <div className="section-head"><div><div className="eyebrow">INGRESOS</div><h2>Actividad por fecha de cobro</h2></div><button className="secondary" onClick={onIncome}><Plus size={16}/>Otro ingreso</button></div>
      <div className="income-list">{summaries.map(row => {
        const rowDeductions = data.incomeDeductions.filter(item => item.incomeId === row.incomeId);
        const periodDiscount = sumCurrency(rowDeductions.filter(item => item.date >= days.from && item.date <= days.to).map(item => item.amount));
        return <article className="income-row" key={row.id}><button className="income-row-main" onClick={() => setSelectedIncome(row)}><span className={`movement-sign ${row.source === 'sale' ? 'income' : 'manual'}`}>{row.source === 'sale' ? '+' : '•'}</span><span className="movement-copy"><b>{row.title}</b><span>{row.category} · {formatReadableDate(row.date)} · {row.source === 'sale' ? 'Venta entregada' : 'Ingreso manual'}</span></span><span className="income-row-amount"><b>{money(row.periodAmount)}</b>{row.source === 'sale' && <small>{row.balanceDue ? `Saldo del pedido ${money(row.balanceDue)}` : `Total vendido ${money(row.totalSold || 0)}`}</small>}</span></button>{periodDiscount > 0 && <small className="income-discount-note">Descuentos vinculados en este período: {money(periodDiscount)}</small>}</article>;
      })}{!summaries.length && <div className="empty"><b>No hay ingresos en este período</b><p>Solo se muestran pagos reales y ventas entregadas.</p><button className="primary" onClick={onIncome}><Plus size={17}/>Registrar ingreso</button></div>}</div>
    </>}
    {selectedIncome && <IncomeDetail income={selectedIncome} data={data} onClose={() => setSelectedIncome(null)} onSaveDiscount={onSaveDeduction} onDeleteDiscount={async id => { if (window.confirm('¿Eliminar este descuento vinculado?')) await onDeleteDeduction(id); }} onEdit={() => { setSelectedIncome(null); if (selectedIncome.source === 'manual') onEditIncome(selectedIncome.incomeId.slice('manual:'.length)); }} onDelete={() => { setSelectedIncome(null); if (selectedIncome.source === 'manual') onDeleteIncome(selectedIncome.incomeId.slice('manual:'.length)); }} onOpenOrder={() => { setSelectedIncome(null); if (selectedIncome.order) onOpenOrder(selectedIncome.order.id); }}/ >}
  </>;
}

function IncomeDetail({ income, data, onClose, onSaveDiscount, onDeleteDiscount, onEdit, onDelete, onOpenOrder }: { income: IncomeSummary; data: Data; onClose: () => void; onSaveDiscount: (item: IncomeDeduction) => Promise<boolean>; onDeleteDiscount: (id: string) => void; onEdit: () => void; onDelete: () => void; onOpenOrder: () => void }) {
  const [adding, setAdding] = useState(false); const [note, setNote] = useState(''); const [amount, setAmount] = useState(''); const [expenseId, setExpenseId] = useState(''); const [discountDate, setDiscountDate] = useState(today()); const [discountCategory, setDiscountCategory] = useState(''); const [editingDeduction, setEditingDeduction] = useState<IncomeDeduction | null>(null); const [saving, setSaving] = useState(false);
  const deductions = data.incomeDeductions.filter(item => item.incomeId === income.incomeId).sort((a,b) => b.date.localeCompare(a.date));
  const linkedExpenses = new Set(data.incomeDeductions.flatMap(item => item.expenseId ? [item.expenseId] : []));
  const linkableExpenses = data.expenses.filter(item => !linkedExpenses.has(item.id) || item.id === editingDeduction?.expenseId);
  const totalDeducted = sumCurrency(deductions.map(item => item.amount));
  const methods = income.payments.reduce((acc, payment) => { acc[payment.method] = sumCurrency([acc[payment.method] || 0, payment.amount]); return acc; }, {} as Record<string, number>);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal income-detail-modal" role="dialog" aria-modal="true"><header className="detail-header"><button className="back-button" onClick={onClose} aria-label="Volver"><ArrowLeft size={20}/></button><div><div className="eyebrow">DETALLE DEL INGRESO</div><h2>{income.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="detail-body"><div className="receipt-totals"><div><span>Recibido en período</span><b>{money(income.periodAmount)}</b></div><div><span>Total del ingreso</span><b>{money(income.amount)}</b></div>{income.order && <div className="income-sale-items"><b>Pedido · {formatReadableDate(income.order.date)}</b>{income.order.items.map((item, index) => <span key={`${income.order?.id}-${index}`}>{item.qty} × {item.name} · {money(item.price * item.qty)}</span>)}</div>}{income.totalSold !== undefined && <><div><span>Total vendido</span><b>{money(income.totalSold)}</b></div><div><span>Saldo del pedido</span><b>{money(income.balanceDue || 0)}</b></div></>}<div><span>Descuentos vinculados</span><b>{money(totalDeducted)}</b></div><div><span>Disponible</span><b>{money(getAvailableAmount(income, data.incomeDeductions))}</b></div></div><div className="payment-breakdown"><b>Pagos por forma</b><span>{Object.entries(methods).map(([method, amount]) => `${method}: ${money(amount)}`).join(' · ') || 'Sin cobros registrados'}</span>{income.payments.map(payment => <div className="payment-entry" key={payment.id}><span>{payment.method} · {formatReadableDate(localDate(payment.date))}</span><b>{money(payment.amount)}</b></div>)}</div><div className="section-head"><div><div className="eyebrow">DESCUENTOS ASOCIADOS</div><h3>Costos de este ingreso</h3></div><button className="secondary" onClick={() => { setEditingDeduction(null); setNote(''); setAmount(''); setExpenseId(''); setDiscountCategory(''); setDiscountDate(today()); setAdding(!adding); }}><Plus size={16}/>{adding ? 'Cerrar' : 'Registrar descuento'}</button></div>{adding && <form className="deduction-form" onSubmit={event => { event.preventDefault(); if (saving || !note.trim() || Number(amount) <= 0) return; const expense = data.expenses.find(item => item.id === expenseId); setSaving(true); void onSaveDiscount({ id: editingDeduction?.id || uid(), incomeId: income.incomeId, amount: Number(amount), note: note.trim(), date: discountDate, ...(discountCategory ? { category: discountCategory } : expense?.category ? { category: expense.category } : {}), ...(expenseId ? { expenseId } : {}) }).then(saved => { if (saved) { setAdding(false); setEditingDeduction(null); setNote(''); setAmount(''); setExpenseId(''); } }).finally(() => setSaving(false)); }}><label className="form-label">Detalle<input required value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. Compré ingredientes"/></label><div className="expense-category-date"><label className="form-label">Monto<input required type="number" min="0.01" max={getAvailableAmount(income, data.incomeDeductions) + (editingDeduction?.amount || 0)} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/></label><label className="form-label expense-date">Fecha<input type="date" value={discountDate} onChange={event => setDiscountDate(event.target.value)}/></label></div><label className="form-label">Categoría (opcional)<input value={discountCategory} onChange={event => setDiscountCategory(event.target.value)} placeholder="Ej. Ingredientes"/></label><label className="form-label">Vincular gasto general (opcional)<select value={expenseId} onChange={event => { const id = event.target.value; setExpenseId(id); const selected = data.expenses.find(item => item.id === id); if (selected) { setNote(selected.note); setAmount(String(selected.amount)); setDiscountDate(selected.date); setDiscountCategory(selected.category); } }}><option value="">Sin gasto asociado</option>{linkableExpenses.map(item => <option key={item.id} value={item.id}>{item.note} · {money(item.amount)} · {item.date}</option>)}</select></label><button className="primary" disabled={saving || !note.trim() || Number(amount) <= 0 || Number(amount) > getAvailableAmount(income, data.incomeDeductions) + (editingDeduction?.amount || 0)}>{saving ? 'Guardando…' : editingDeduction ? 'Guardar cambios' : 'Guardar descuento'}</button></form>}{deductions.map(item => <div className="income-deduction" key={item.id}><span><b>{item.note}</b><small>{item.category || 'Sin categoría'} · {formatReadableDate(item.date)}{item.expenseId ? ' · Gasto general vinculado' : ''}</small></span><b>{money(item.amount)}</b><button className="icon-button" onClick={() => { setEditingDeduction(item); setNote(item.note); setAmount(String(item.amount)); setExpenseId(item.expenseId || ''); setDiscountDate(item.date); setDiscountCategory(item.category || ''); setAdding(true); }} aria-label="Editar descuento"><Settings size={17}/></button><button className="icon-button danger-icon" onClick={() => onDeleteDiscount(item.id)} aria-label="Eliminar descuento"><Trash2 size={17}/></button></div>)}{!deductions.length && <p className="muted">Aún no hay costos o descuentos asociados.</p>}</div><footer className="detail-footer">{income.source === 'manual' ? <><button className="secondary" onClick={onEdit}>Editar ingreso</button><button className="danger-button" onClick={onDelete}>Eliminar ingreso</button></> : <button className="secondary" onClick={onOpenOrder}>Abrir pedido</button>}</footer></section></div>;
}

function IncomeModal({ categories, income, onCategory, onClose, onSave }: { categories: string[]; income?: Income; onCategory: (category: string) => Promise<boolean>; onClose: () => void; onSave: (income: Income) => Promise<boolean> }) {
  useBodyScrollLock(true);
  const [amount, setAmount] = useState(income ? String(income.amount) : '');
  const [cash, setCash] = useState(() => String(sumCurrency((income?.payments || []).filter(payment => payment.method === 'Efectivo').map(payment => payment.amount)) || (income?.method?.toLowerCase().includes('efectivo') ? income.amount : 0) || ''));
  const [qr, setQr] = useState(() => String(sumCurrency((income?.payments || []).filter(payment => payment.method === 'QR / transferencia').map(payment => payment.amount)) || (income?.method?.toLowerCase().includes('qr') ? income.amount : 0) || ''));
  const [mode, setMode] = useState<'Efectivo' | 'QR / transferencia' | 'Mixto'>(() => income?.payments?.some(payment => payment.method === 'Efectivo') && income.payments.some(payment => payment.method === 'QR / transferencia') ? 'Mixto' : income?.method?.toLowerCase().includes('qr') ? 'QR / transferencia' : 'Efectivo');
  const [category, setCategory] = useState(income?.category || categories[0] || 'Otros ingresos'); const [date, setDate] = useState(income?.date || today()); const [note, setNote] = useState(income?.note || '');
  const [newCategory, setNewCategory] = useState(''); const [busy, setBusy] = useState(false);
  const total = Number(amount); const cashValue = mode === 'Efectivo' ? total : mode === 'Mixto' ? Number(cash || 0) : 0; const qrValue = mode === 'QR / transferencia' ? total : mode === 'Mixto' ? Number(qr || 0) : 0; const paid = roundCurrency(cashValue + qrValue);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (busy || !Number.isFinite(total) || total <= 0 || paid !== roundCurrency(total) || !note.trim()) return; setBusy(true); try { const stamp = `${date}T12:00:00-04:00`; const payments: Payment[] = []; if (cashValue) payments.push({ id: income?.payments?.find(item => item.method === 'Efectivo')?.id || uid(), amount: cashValue, date: stamp, method: 'Efectivo' }); if (qrValue) payments.push({ id: income?.payments?.find(item => item.method === 'QR / transferencia')?.id || uid(), amount: qrValue, date: stamp, method: 'QR / transferencia' }); await onSave({ id: income?.id || uid(), amount: total, category, date, note: note.trim(), payments, method: mode }); } finally { setBusy(false); } };
  const createCategory = async () => { const value = newCategory.trim(); if (!value || busy || categories.includes(value)) return; setBusy(true); try { if (await onCategory(value)) { setCategory(value); setNewCategory(''); } } finally { setBusy(false); } };
  return <div className="modal-backdrop" role="presentation"><form className="modal expense-modal income-modal" role="dialog" aria-modal="true" onSubmit={event => void submit(event)}><button type="button" className="back-button modal-back" onClick={onClose} aria-label="Volver"><ArrowLeft size={20}/></button><div className="eyebrow">ENTRADA DE DINERO</div><h2>{income ? 'Editar ingreso' : 'Registrar un ingreso'}</h2><p>Registra solo dinero que ya recibiste.</p><label className="form-label expense-note-label">Detalle<input required value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. Venta de refrescos"/></label><label className="form-label amount-label">Monto recibido <span>Bs</span><input aria-label="Monto recibido en bolivianos" type="number" min="0.01" step="0.01" required value={amount} onChange={event => { setAmount(event.target.value); if (mode === 'Efectivo') setCash(event.target.value); if (mode === 'QR / transferencia') setQr(event.target.value); }} placeholder="0.00"/></label><div className="payment-options">{(['Efectivo', 'QR / transferencia', 'Mixto'] as const).map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{value}</button>)}</div>{mode === 'Mixto' && <div className="payment-split"><label className="form-label">Efectivo (Bs)<input type="number" min="0" step="0.01" value={cash} onChange={event => setCash(event.target.value)} placeholder="0.00"/></label><label className="form-label">QR / transferencia (Bs)<input type="number" min="0" step="0.01" value={qr} onChange={event => setQr(event.target.value)} placeholder="0.00"/></label><p className={paid === roundCurrency(total) ? 'success-note' : 'error'}>Distribución {money(paid)} de {money(total)}</p></div>}<div className="expense-category-date"><label className="form-label">Categoría<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label><label className="form-label expense-date">Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div>{newCategory !== '' ? <div className="category-add"><input aria-label="Nueva categoría" value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="Nueva categoría"/><button type="button" className="secondary" disabled={busy || !newCategory.trim()} onClick={() => void createCategory()}>Agregar</button></div> : <button type="button" className="add-client" onClick={() => setNewCategory(' ')}><Plus size={16}/>Crear categoría</button>}<button className="primary wide expense-submit" disabled={busy || !total || paid !== roundCurrency(total) || !note.trim()}>{busy ? 'Guardando…' : income ? 'Guardar cambios' : 'Guardar ingreso'}</button></form></div>;
}function ExpenseModal({ categories, expense, income, onCategory, onClose, onSave, onIncomeSave }: { categories: string[]; expense?: Expense; income: boolean; onCategory: (category: string) => Promise<boolean>; onClose: () => void; onSave: (expense: Expense) => Promise<void>; onIncomeSave: (amount: number, category: string, date: string, note: string) => Promise<boolean> }) {
  useBodyScrollLock(true);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category || categories[0] || 'Otros');
  const [date, setDate] = useState(expense?.date || today());
  const [note, setNote] = useState(expense?.note || '');
  const [method, setMethod] = useState(expense?.method || '');
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const parsedAmount = Number(amount);
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (busy || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !note.trim() && !income) return; setBusy(true); void (async () => { try { if (income) await onIncomeSave(parsedAmount, category, date, note.trim()); else await onSave({ id: expense?.id || uid(), amount: parsedAmount, category, date, note: note.trim(), ...(method ? { method } : {}) }); } finally { setBusy(false); } })(); };
  const addCategory = async () => { const value = newCategory.trim(); if (!value || categories.includes(value) || busy) return; setBusy(true); try { if (await onCategory(value)) { setCategory(value); setNewCategory(''); } } finally { setBusy(false); } };
  return <div className="modal-backdrop" role="presentation"><form className="modal expense-modal" role="dialog" aria-modal="true" onSubmit={submit}>
    <button type="button" className="back-button modal-back" onClick={onClose} aria-label="Volver"><ArrowLeft size={20}/></button><div className="eyebrow">{income ? 'ENTRADA DE DINERO' : 'SALIDA DE DINERO'}</div><h2>{income ? 'Registrar un ingreso' : expense ? 'Editar gasto' : 'Registrar un gasto'}</h2><p>{income ? 'Anota un ingreso que no venga de un pedido.' : 'Primero cuéntanos qué compraste o pagaste.'}</p>
    <label className="form-label expense-note-label">Detalle{!income && <input required value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. Compré pollo"/>}{income && <input value={note} onChange={event => setNote(event.target.value)} placeholder="Ej. Venta adicional"/>}</label>
    <label className="form-label amount-label">Monto <span>Bs</span><input aria-label="Monto en bolivianos" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/></label>
    <div className="expense-category-date"><label className="form-label">Categoría<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}{income && !categories.length && <option>Otro</option>}</select></label><label className="form-label expense-date">Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div>
    {!income && <>{newCategory !== '' ? <div className="category-add"><input aria-label="Nueva categoría" value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="Nombre de la categoría"/><button className="secondary" type="button" disabled={busy || !newCategory.trim()} onClick={() => void addCategory()}>{busy ? 'Guardando…' : 'Agregar'}</button></div> : <button type="button" className="add-client" onClick={() => setNewCategory(' ')}><Plus size={16}/>Crear categoría</button>}</>}
    {!income && <label className="form-label expense-payment">Forma de pago <small>Opcional</small><select value={method} onChange={event => setMethod(event.target.value)}><option value="">Sin especificar</option><option>Efectivo</option><option>QR / transferencia</option></select></label>}
    <button className="primary wide expense-submit" disabled={busy || !parsedAmount || parsedAmount <= 0 || !income && !note.trim()}>{busy ? 'Guardando…' : expense ? 'Guardar cambios' : income ? 'Guardar ingreso' : 'Guardar gasto'}</button>
  </form></div>;
}

function OrderDetail({ order, data, uid: ownerUid, onClose, onDone, onUpdate, onAddPayment, onCancel, onReceipt }: { order?: Order; data: Data; uid?: string; onClose: () => void; onDone: (id: string) => Promise<boolean>; onUpdate: (order: Order) => Promise<boolean>; onAddPayment: (id: string, amount: number, method: PaymentMethod) => Promise<boolean>; onCancel: (id: string) => Promise<void>; onReceipt: (order: Order) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Efectivo');
  const [customer, setCustomer] = useState(order?.customer || '');
  const [date, setDate] = useState(order?.date || today());
  const [time, setTime] = useState(order?.time || '');
  const [note, setNote] = useState(order?.note || '');
  const [items, setItems] = useState<Line[]>(order?.items || []);
  const [newProduct, setNewProduct] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!order) return; setCustomer(order.customer); setDate(order.date); setTime(order.time); setNote(order.note); setItems(order.items); setEditing(false); setAmount(''); }, [order?.id]);
  if (!order) return null;
    const total = sumCurrency(items.map(item => item.qty * item.price));
  const balance = getBalance(order.total, order.paid);
  const paymentSum = paymentTotals(order.payments || []);
  const saveEdit = async () => {
    if (saving || !items.length || total < order.paid) return;
    setSaving(true);
    try { if (await onUpdate({ ...order, customer: customer.trim(), date, time, note: note.trim(), items, total })) setEditing(false); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation"><section className="modal detail-modal" role="dialog" aria-modal="true">
    <header className="detail-header"><button className="back-button" onClick={onClose} aria-label="Volver al historial"><ArrowLeft size={21}/></button><div><div className="eyebrow">{editing ? 'EDITAR PEDIDO' : 'DETALLE DEL PEDIDO'}</div><h2>{editing ? 'Modificar pedido' : order.customer || 'Venta sin cliente'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></header>
    {editing ? <div className="detail-body"><label className="form-label">Cliente<input value={customer} onChange={event => setCustomer(event.target.value)}/></label><div className="delivery-fields delivery-schedule"><label className="form-label">Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label className="form-label">Hora<input type="time" value={time} onChange={event => setTime(event.target.value)}/></label></div><label className="form-label">Nota<input value={note} onChange={event => setNote(event.target.value)}/></label><div className="eyebrow detail-subhead">PLATOS DEL PEDIDO</div>{items.map((item, index) => <div className="cart-line" key={`${item.productId}:${index}`}><div className="cart-item-copy"><b>{item.name}</b><small>{money(item.price)} cada uno</small></div><div className="qty"><button type="button" onClick={() => setItems(current => current.map((line, i) => i === index ? { ...line, qty: line.qty - 1 } : line).filter(line => line.qty > 0))}><Minus size={16}/></button><b>{item.qty}</b><button type="button" onClick={() => setItems(current => current.map((line, i) => i === index ? { ...line, qty: line.qty + 1 } : line))}><Plus size={16}/></button></div><b>{money(item.qty * item.price)}</b><button type="button" className="remove-line" onClick={() => setItems(current => current.filter((_, i) => i !== index))} aria-label={`Eliminar ${item.name}`}><Trash2 size={17}/></button></div>)}<label className="form-label">Agregar plato<select value={newProduct} onChange={event => { const product = data.products.find(item => item.id === event.target.value); if (!product) return; const old = items.find(item => item.productId === product.id); setItems(old ? items.map(item => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item) : [...items, { productId: product.id, name: product.name, qty: 1, price: product.price, cost: product.cost }]); setNewProduct(''); }}><option value="">Seleccionar plato…</option>{data.products.filter(product => product.active).map(product => <option value={product.id} key={product.id}>{product.name} · {money(product.price)}</option>)}</select></label><div className="checkout-total"><span>Nuevo total</span><b>{money(total)}</b></div>{total < order.paid && <p className="error">El nuevo total no puede ser menor a lo ya pagado ({money(order.paid)}).</p>}<button className="primary wide" disabled={saving || !items.length || total < order.paid} onClick={() => void saveEdit()}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      : <><div className="detail-body"><div className="detail-date"><CalendarDays size={17}/>{formatReadableDate(order.date)}{order.time && <><span>·</span><Clock3 size={16}/>{order.time}</>}</div><div className="detail-items">{order.items.map((item, index) => <div className="detail-line" key={`${item.productId}:${index}`}><span>{item.qty} × {item.name}<small>{money(item.price)} cada uno</small></span><b>{money(item.qty * item.price)}</b></div>)}</div>{order.note && <p className="detail-note">{order.note}</p>}<div className="receipt-totals"><div><span>Total</span><b>{money(order.total)}</b></div><div><span>Pagado</span><b>{money(order.paid)}</b></div><div><span>Saldo</span><b>{money(balance)}</b></div></div><div className="payment-breakdown"><b>Pagos recibidos</b><span>Efectivo {money(paymentSum.Efectivo)} · QR {money(paymentSum['QR / transferencia'])}{paymentSum['Otro / sin detalle'] ? ` · Otros ${money(paymentSum['Otro / sin detalle'])}` : ''}</span>{(order.payments || []).map(payment => <div className="payment-entry" key={payment.id}><span>{payment.method} · {formatReadableDate(payment.date)}</span><b>{money(payment.amount)}</b></div>)}{!(order.payments || []).length && <small>{order.paid ? `Pago inicial · ${order.method}` : 'Aún no se registraron pagos.'}</small>}</div>
        {!editing && order.status !== 'Cancelado' && balance > 0 && <section className="add-payment"><div className="section-label"><b>Registrar abono</b><span>Saldo {money(balance)}</span></div><label className="form-label">Monto (Bs)<input type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/></label><label className="form-label">Forma de pago<select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}><option>Efectivo</option><option>QR / transferencia</option></select></label><button className="secondary wide" disabled={saving || !validPayment(order.total, order.paid, Number(amount))} onClick={() => { if (saving) return; setSaving(true); void onAddPayment(order.id, Number(amount), method).then(saved => { if (saved) setAmount(''); }).finally(() => setSaving(false)); }}>{saving ? 'Guardando…' : 'Guardar abono'}</button></section>}
      </div><footer className="detail-footer"><button className="secondary" disabled={saving} onClick={() => onReceipt(order)}><Download size={17}/>Compartir recibo</button><button className="secondary" disabled={saving} onClick={() => void downloadReceipt(order, data.business, data.businessLogoId, ownerUid, paperWidth())}><Download size={17}/>Descargar</button><button className="secondary" disabled={saving} onClick={() => void printReceipt(order, data.business, data.businessLogoId, ownerUid, paperWidth())}><Printer size={17}/>Imprimir</button>{order.status === 'Pendiente' && <button className="secondary" disabled={saving} onClick={() => setEditing(true)}>Editar</button>}{order.status === 'Pendiente' && <button className="primary" disabled={saving} onClick={() => { setSaving(true); void onDone(order.id).then(saved => { if (saved) onClose(); }).finally(() => setSaving(false)); }}>{saving ? 'Guardando…' : <><Check size={17}/>Entregado</>}</button>}{order.status === 'Pendiente' && <button className="danger-button" disabled={saving} onClick={() => { setSaving(true); void onCancel(order.id).finally(() => setSaving(false)); }}>Cancelar pedido</button>}</footer></>}
  </section></div>;
}

function paymentLabel(payments: Payment[], paid: number, total: number) {
  if (!paid || paid < total) return paid ? 'Parcial' : 'Pendiente';
  const methods = new Set(payments.map(payment => payment.method));
  return methods.size > 1 ? 'Mixto' : payments[0]?.method || 'Efectivo';
}

function localDate(value: string) {
  if (value.length === 10) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(date);
}

function formatReadableDate(value: string) {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/La_Paz' }).format(parsed);
}

function offsetDate(date: string, delta: number) {
  const parsed = new Date(`${date}T12:00:00-04:00`); parsed.setDate(parsed.getDate() + delta);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(parsed);
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
  printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
  printWindow.document.open(); printWindow.document.write(receiptMarkup(order, business, logo, width)); printWindow.document.close();
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
