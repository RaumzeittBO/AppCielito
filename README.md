# Cielito

Aplicación web/PWA para registrar pedidos, entregas, clientes y gastos de una cocina familiar. Interfaz en español y zona horaria `America/La_Paz`.

## Desarrollo local

1. Instala Node.js 20.19+ o 22.12+.
2. Ejecuta `npm install` y `npm run dev`.
3. La configuración web del proyecto Firebase `appcielito` está en `.env` local y `.env.example`. Esta configuración del SDK web es pública por diseño; la seguridad depende de Authentication y reglas.

Sin iniciar sesión, la app guarda sus datos en el almacenamiento local de ese navegador. Al habilitar Firebase Authentication e iniciar sesión, habilita la ruta de sincronización Firestore. La persistencia local no sustituye una copia de seguridad.

## Firebase: configuración manual pendiente

Se seleccionó únicamente el proyecto `appcielito` en `.firebaserc`. Los recursos de Firebase no se activan desde estos archivos.

1. En Firebase Console, activa **Authentication → Correo electrónico/contraseña** y crea la cuenta de la propietaria.
2. Copia el UID de esa cuenta. En `firestore.rules` y `storage.rules`, reemplaza `__OWNER_UID__` por ese UID literal. Despliega las reglas con `firebase deploy --only firestore:rules,storage` (requiere Firebase CLI y permisos en el proyecto).
3. Crea la base de datos de Cloud Firestore y el bucket de Storage desde la consola si aún no existen. El bucket requiere que Storage esté habilitado.
4. Añade a los dominios autorizados de Authentication el dominio de Vercel asignado y el dominio propio si se usa. Para desarrollo local, autoriza `localhost`.
5. La configuración inicial bloquea el acceso hasta cambiar el UID; no publiques reglas permisivas.

La sincronización actual escribe registros por usuario en `users/{uid}/records`. Las reglas dan acceso solamente al UID fijado. Storage queda protegido de la misma forma aunque la subida de logo aún no está implementada.

### Notificaciones

La PWA incluye manifest y service worker con caché de recursos y apertura de la app al pulsar una notificación. El permiso de notificaciones es solo del navegador; todavía no hay envío push ni tareas backend programadas. No se afirma que los recordatorios externos estén activos. Para prepararlos hace falta:

- En Project settings → Cloud Messaging, generar una **Web Push certificate key pair (VAPID)** y colocar la clave pública en `VITE_FIREBASE_VAPID_KEY` (no inventar una).
- Activar Cloud Messaging y desplegar un service worker Firebase Messaging que reciba mensajes push.
- Implementar y desplegar Cloud Functions autenticadas para crear, reprogramar y cancelar recordatorios, con idempotencia y zona horaria `America/La_Paz`. Las tareas programadas pueden requerir plan Blaze y facturación habilitada; comprobar en la consola antes de activarlas.
- En iPhone, instalar la PWA en la pantalla de inicio y conceder permiso desde ella. Android requiere navegador compatible y permiso.

El aviso/sonido local depende de que la app esté abierta y de las restricciones de reproducción del navegador. La impresión de navegador usa el diálogo estándar. Impresoras ESC/POS Bluetooth Classic requieren una app Android/puente nativo; no se simula una conexión Bluetooth.

## Vercel

Importa `RaumzeittBo/AppCielito` desde GitHub. Framework: **Vite** (Vercel puede detectarlo como Other/Vite). Build command: `npm run build`. Output directory: `dist`. Install command: `npm install`. Root directory: `./`.

Variables en Project Settings → Environment Variables (Production, Preview y Development según corresponda):

| Nombre | Visibilidad | Valor |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Pública para el navegador | Configuración entregada para `appcielito` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Pública | `appcielito.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Pública | `appcielito` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Pública | `appcielito.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Pública | `622582613718` |
| `VITE_FIREBASE_APP_ID` | Pública | ID de aplicación web entregado |
| `VITE_FIREBASE_VAPID_KEY` | Pública, solo si se activa FCM | Clave pública generada en Firebase |

No configures contraseñas, claves privadas, credenciales de cuenta de servicio ni secretos administrativos como variables `VITE_*`; cualquier `VITE_*` termina incluido en el cliente. El UID propietario se fija en las reglas antes de desplegarlas, no es un secreto. No hay variables privadas backend en esta etapa.

## GitHub

El remoto esperado es `https://github.com/RaumzeittBo/AppCielito`. Mantén `.env` fuera de Git; solo `.env.example` debe versionarse. Configura reglas Firebase para el UID propietario antes de usar datos reales.

## Estado y límites actuales

Implementados: pedidos con snapshots de precio/costo, abonos, clientes rápidos, productos, gastos, resúmenes básicos, vista de preparación, búsqueda de pedidos, PWA base, configuración Firebase web, reglas y rutas de hosting. La conexión Bluetooth nativa, recibo PDF, edición completa/historial de estados, exportación CSV, recordatorios push backend y pruebas automatizadas quedan pendientes. Revisa que esta primera versión cubre la operación esencial antes de usarla como único registro.
