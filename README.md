# Cielito

Aplicación web/PWA para pedidos, entregas, clientes y cuentas de una cocina familiar. Interfaz en español, importes en Bs y zona horaria `America/La_Paz`.

## Desarrollo local

Requiere Node.js 20.19+ o 22.12+. Ejecuta `npm install`, luego `npm run dev`. `.env` contiene la configuración web del proyecto Firebase `appcielito`; es pública por diseño y está excluida de Git. `.env.example` enumera las variables requeridas.

Con Firebase configurado, el acceso requiere Authentication. Sin configuración Firebase, la aplicación conserva los datos en el almacenamiento local del navegador. Al entrar como propietaria, Cielito sincroniza productos, clientes, pedidos, gastos, ingresos, categorías y negocio en documentos separados bajo `users/{uid}`. La migración desde el formato local anterior usa IDs estables para no duplicar registros. Firestore conserva caché local cifrada por IndexedDB bajo la gestión del navegador; cierra sesión en dispositivos compartidos.

## Firebase `appcielito`

El proyecto está seleccionado en `.firebaserc`. UID propietario configurado en reglas y cliente: `4iftAGoQawabSz1EEpKufdPQccC2`.

### Estado comprobado

- Authentication se integra con correo/contraseña y persistencia local del SDK. La cuenta propietaria ya fue creada por el usuario; el cliente además rechaza UID distintos.
- Firestore Rules e índices se desplegaron a `appcielito`. Las reglas limitan el acceso al UID propietario y validan los campos de pedidos, productos, clientes y movimientos.
- Las reglas de Firestore y Storage pasan pruebas contra Firebase Emulator (`npm run test:rules`).
- La sincronización Firestore usa documentos por registro, escucha cambios remotos y migra registros locales con IDs deterministas.
- Storage no está inicializado. Firebase CLI devolvió que debe pulsarse **Get started** en Firebase Console → Storage. Hasta ese paso, Storage y sus reglas no están activos. Al iniciar Storage, elige el bucket predeterminado `appcielito.firebasestorage.app` y región; luego ejecuta `firebase deploy --only storage --project appcielito`.
- FCM web cliente y service worker están preparados. Para habilitar este dispositivo: Firebase Console → Project settings → Cloud Messaging → generar Web Push certificate key pair; copia la clave pública a `VITE_FIREBASE_VAPID_KEY` en `.env` local y Vercel. Luego inicia sesión y usa Más → Configuración → Activar avisos en este dispositivo. El navegador debe conceder permiso.
- Cloud Function `sendDeliveryReminders` está preparada para comprobar pedidos cada minuto en `America/La_Paz`, avisar 15 minutos antes y a la hora, y usar marcadores idempotentes. Firebase rechazó el despliegue porque `appcielito` no está en el plan Blaze. No se activó facturación ni se desplegó la función. Tras revisar y habilitar Blaze en Firebase Console → Usage and billing, despliega con `firebase deploy --only functions --project appcielito`. Cloud Scheduler y Functions pueden generar cargos; revisa precios antes de activar.

Para desarrollo y Rules tests: `npm run test:rules`. Esto levanta emuladores locales y **no** despliega reglas.

Las notificaciones en pantalla del navegador requieren que la app permanezca abierta. Los push dependen de VAPID, permiso de dispositivo y despliegue Functions. El backend omite las alertas antiguas si una reserva se crea tarde; los pedidos cancelados o entregados se ignoran. En iPhone, instala la PWA en pantalla de inicio y concede permiso desde ella.

La impresión desde web abre el diálogo de impresión; desde allí se puede elegir Guardar como PDF. Bluetooth ESC/POS Classic requiere una app Android/plugin nativo y todavía no está implementado.

## Vercel

Importa `RaumzeittBO/AppCielito` en Vercel. Framework: **Vite**. Build command: `npm run build`. Output directory: `dist`. Install command: `npm install`. Root directory: `./`.

Variables de entorno (Production, Preview y Development según corresponda):

| Nombre | Visibilidad | Valor |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Pública | Configuración web de `appcielito` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Pública | `appcielito.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Pública | `appcielito` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Pública | `appcielito.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Pública | `622582613718` |
| `VITE_FIREBASE_APP_ID` | Pública | ID de la aplicación web proporcionado |
| `VITE_FIREBASE_VAPID_KEY` | Pública; completar para FCM | Clave pública Web Push generada en Firebase |

No agregues contraseñas, claves privadas ni cuentas de servicio al cliente web ni a variables `VITE_*`. En Firebase Authentication → Settings → Authorized domains, agrega el dominio `*.vercel.app` específico que Vercel asigne (por ejemplo `nombre-proyecto.vercel.app`) y el dominio personalizado si se usa. `localhost` se autoriza para desarrollo.

## GitHub

Repositorio remoto configurado: `https://github.com/RaumzeittBO/AppCielito`, rama `main`. No se versiona `.env`.

## Alcance

Implementados: inicio con Firebase Auth, catálogo de platos, flujo de venta/pedido con instantáneas de precios, edición de pedidos, pagos parciales acumulados, cancelación conservando historial, clientes, gastos, ingresos adicionales, categorías de gastos, saldos, exportación CSV de pedidos/clientes/movimientos, comprobante imprimible/Save as PDF, compartir texto por WhatsApp, PWA, sincronización y reglas seguras.

Pendientes: inicializar Storage y desplegar sus reglas, autorizar VAPID y dispositivos, activar Blaze y desplegar Functions, probar FCM real en dispositivos autorizados, integración Bluetooth nativa, editar clientes/gastos, exportar respaldo completo y pruebas de interfaz end-to-end. No se han realizado pruebas con impresora física ni con push real.
