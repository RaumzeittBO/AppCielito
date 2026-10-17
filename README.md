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
- Las fotos de platos y el logo se guardan como bytes `WebP`/`JPEG` en documentos separados de Firestore, bajo `users/{uid}/images/{imageId}`. El navegador reduce imágenes a un máximo de 640 × 640 px, apunta a menos de 80 KB y rechaza archivos sobre 200 KB. Productos y ajustes guardan solo el ID de referencia. La carga visual es diferida; se obtiene el documento de imagen al mostrar la miniatura, el catálogo, el logo o al imprimir un recibo. Los campos binarios se excluyen de los índices.
- Las reglas de imagen limitan acceso de lectura/escritura/borrado al UID propietario `4iftAGoQawabSz1EEpKufdPQccC2`, validan tipo, tamaño binario, dimensiones declaradas, tipo de imagen y campos permitidos. Security Rules no decodifica el contenido para comprobar la firma del archivo ni puede certificar que las dimensiones declaradas correspondan a sus píxeles; el navegador comprueba el archivo al seleccionarlo. Firestore sigue aplicando sus cuotas Spark de almacenamiento y lecturas/escrituras.
- Firebase Storage se conserva como adaptador preparado para una futura migración, pero esta versión no usa Storage ni requiere habilitar Blaze para sus imágenes.
- Los avisos en pantalla, el sonido y la lista de pedidos atrasados funcionan cuando se abre Cielito. Los recordatorios programados en segundo plano y los push no están activos: la Cloud Function `sendDeliveryReminders` sigue como código fuente sin desplegar y requiere Blaze. No se anuncia como servicio disponible.

Para desarrollo y Rules tests: `npm run test:rules`. Esto levanta emuladores locales y **no** despliega reglas.

Los avisos en pantalla y sonidos requieren que la app permanezca abierta. Los pedidos pendientes de días anteriores se muestran como atrasados al abrir la app. No se envían notificaciones en segundo plano hasta desplegar un backend de recordatorios.

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

Pendientes: desplegar las reglas e índices de Firestore actualizados, integración Bluetooth nativa, editar clientes/gastos, exportar respaldo completo y pruebas de interfaz end-to-end. No se han realizado pruebas manuales con cámara/galería de un celular, varios dispositivos, impresión física ni push real. Storage y Functions quedan fuera de uso mientras el proyecto esté en Spark.
