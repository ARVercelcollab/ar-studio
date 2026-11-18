# Reservas propias de AR Studio (fase 1)

Sustituye a Calendly para el alquiler por horas: el cliente elige duración, día y hora en
`/reservar`, paga en el TPV de Comercia Global Payments (CaixaBank) y el dinero va directo a
la cuenta del banco. El estudio lo lleva todo desde `/admin`.

Mientras no se active, **la web sigue funcionando igual con Calendly**: los botones RESERVAR
apuntan a Calendly y `/reservar` redirige allí.

## Qué hay

| Parte | Dónde | Qué hace |
|---|---|---|
| Reservar | `/reservar` | Duración (2, 3, 4, 6, 8 y 10 h), calendario con los huecos libres, datos del cliente (las mismas preguntas que Calendly) y pago |
| Página de la reserva | `/reserva/[enlace privado]` | Estado, reintentar el pago, añadir al calendario, pedir un cambio o cancelación |
| Panel | `/admin` | Agenda, ficha de cada reserva, reservas a mano, mover, marcar pagada (Bizum, transferencia…), cancelar con la devolución que toca según las condiciones, bloqueos y festivos |
| Correos | Resend (`reservas@studioar.es`) | Confirmación al cliente con el `.ics`, aviso al estudio, recordatorio el día antes, avisos de pagos raros |
| Facturas | PDF por correo | Si el cliente pide factura, al confirmarse el pago se emite (serie AR-W, numeración correlativa) y se le envía en PDF con copia al estudio. Desde el panel se emite, se descarga o se reenvía |
| Calendario | `/api/admin/calendario?clave=…` | Todas las reservas para suscribirse desde Google Calendar |

Reglas copiadas de Calendly (se cambian en `lib/reservas/config.js`):

- Entre semana de 09:00 a 22:00; sábados, domingos y festivos igual, pero desde 4 horas y con precio de fin de semana.
- 30 minutos libres entre reservas, 10 horas de antelación mínima, huecos cada 30 minutos.
- La hora se guarda 20 minutos mientras el cliente paga; si no paga, se libera sola.
- Precios con IVA: 2 h 96,80 €; 3 h 145,20 €; 4 h 183,92 € (finde 227,48 €); 6 h 275,88 € (326,70 €); 8 h 338,80 € (416,24 €); 10 h 399,30 € (484 €).
- Política de cancelación de `/condiciones` (100 / 70 / 50 / 0 %).

Diferencia con Calendly: el 6 h de fin de semana empezaba a las 10:00 y ahora a las 09:00, como el resto.

## Probar en local

```bash
npm install
npm run dev
```

Sin configurar nada se usa una base de datos local (`.data/pglite`), el **TPV simulado**
(una página que imita al banco y no cobra) y los correos se guardan en `.data/correos/`.
El panel en local entra con la contraseña `estudio`. Pruebas automáticas: `npm test`.

Para probar contra el entorno de pruebas de Redsys, en `.env.local`:

```
PAGOS_PROVEEDOR=redsys
REDSYS_COMERCIO=999008881
REDSYS_TERMINAL=1
REDSYS_CLAVE=sq7HjrUOBfKmC576ILgskD5srU870gJ7
REDSYS_ENTORNO=pruebas
```

(Es el comercio de pruebas público de Redsys, no el del estudio. Tarjeta de pruebas
4548 8100 0000 0003, caducidad 12/49, CVV 123.)

## Puesta en marcha

### 1. Qué pedir a Comercia Global Payments

Comercia ofrece dos pasarelas y el código tiene las dos. Pregunta:

1. **¿Addon Payments o Redsys?** Según la que os den, `PAGOS_PROVEEDOR=addon` o `PAGOS_PROVEEDOR=redsys`.
2. **Datos de pruebas y de producción:**
   - Addon Payments: *Merchant ID*, *Account* (subcuenta) y *Shared Secret*.
   - Redsys: número de comercio (FUC), terminal y clave SHA-256.
3. **¿Incluye Bizum?** En Redsys se activa con `REDSYS_METODOS` (vacío = lo que tenga el TPV).
4. **URLs que puede que os pidan dar de alta:**
   - Redsys, URL de notificación: `https://www.studioar.es/api/pagos/redsys/notificacion`
   - Addon Payments, URL de respuesta: `https://www.studioar.es/api/pagos/addon/respuesta`
   - Las URL de vuelta (OK/KO) van en cada pago; no hay que configurarlas.
5. **Devoluciones:** se hacen desde su portal con el número de pedido que sale en el panel.

> Redsys está probado de principio a fin contra su entorno de pruebas público. Addon Payments
> está escrito según su especificación, pero falta un pago de prueba con las credenciales de
> pruebas de Comercia antes de usarlo en real.

### 2. Base de datos

En Vercel → proyecto → *Storage* → crear una base **Neon (Postgres)** y conectarla al proyecto.
Las tablas se crean solas la primera vez.

**Importante:** la base de datos de **Producción** no debe compartirse con las vistas previas.
Al conectar Neon, marca solo *Production* para esa `DATABASE_URL` y usa una rama de Neon
distinta (o la opción de ramas para vistas previas) en *Preview*. Por si acaso, la base de
producción queda marcada y rechaza cualquier pago hecho con un TPV en modo pruebas.

### 3. Variables de entorno en Vercel

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | La pone Neon |
| `PAGOS_PROVEEDOR` | `addon` o `redsys` |
| `ADDON_COMERCIO`, `ADDON_CUENTA`, `ADDON_SECRETO`, `ADDON_ENTORNO` | Si es Addon Payments (`ADDON_ENTORNO` = `pruebas` o `real`) |
| `REDSYS_COMERCIO`, `REDSYS_TERMINAL`, `REDSYS_CLAVE`, `REDSYS_ENTORNO`, `REDSYS_METODOS` | Si es Redsys (`REDSYS_ENTORNO` = `pruebas` o `real`) |
| `ADMIN_PASSWORD` | Contraseña del panel |
| `SESSION_SECRET` | Texto aleatorio de 32 caracteres o más (firma la sesión del panel) |
| `CRON_SECRET` | Texto aleatorio: Vercel lo usa para lanzar el recordatorio diario |
| `CALENDARIO_TOKEN` | Texto aleatorio de 24 caracteres o más, para el calendario de Google |
| `SITIO_URL` | `https://www.studioar.es` |
| `FACTURA_EMISOR_NOMBRE` | Quien factura (el mismo nombre que en las facturas manuales) |
| `FACTURA_EMISOR_NIF` | Su NIF |
| `FACTURA_EMISOR_DIRECCION` | Su dirección, con las líneas separadas por `|` (p. ej. `Calle 1|46007 València (Valencia)|España`) |
| `FACTURA_SERIE` | Opcional. Por defecto `AR-W` (serie de las facturas de la web) |
| `FACTURAS_AUTOMATICAS` | Opcional. `0` para que no se envíen solas (se emiten desde el panel) |
| `RESEND_API_KEY` | Ya existe |
| `RESERVAS_EMAIL_FROM` | Opcional. Por defecto `AR Studio <reservas@studioar.es>` |
| `RESERVAS_EMAIL_ESTUDIO` | Opcional. A dónde llegan los avisos; por defecto `arstudiospain@gmail.com` |
| `NEXT_PUBLIC_RESERVAS_PROPIAS` | `1` para activar. **Solo en Producción y el día del cambio** |

Textos aleatorios: `openssl rand -base64 32`.

Los datos de quien factura van en variables y no en el código porque el repositorio es público.
El panel enseña arriba lo que falta por configurar.

Ojo: el plan gratuito de Vercel (Hobby) no permite uso comercial; si la cuenta está en Hobby,
conviene pasar a Pro.

### 4. Probar en una vista previa

Con las variables puestas en *Preview* y el TPV en modo **pruebas**, abrir la vista previa de la
rama, hacer una reserva y pagarla con la tarjeta de pruebas que dé Comercia. Comprobar que llega
el correo, que sale en el panel y que el pago aparece en el portal de pruebas de Comercia.

### 5. El día del cambio

1. Poner el TPV en **real** y `NEXT_PUBLIC_RESERVAS_PROPIAS=1` en Producción, y volver a desplegar.
2. Apuntar en el panel (*Nueva reserva*, marcada como pagada) las reservas futuras que haya en Calendly.
3. Desactivar los tipos de evento de Calendly ese mismo día, para que nadie reserve en los dos sitios.
4. Hacer una reserva real pequeña y devolverla desde el portal del TPV.
5. Suscribirse al calendario desde Google Calendar con el enlace que sale al final de la agenda del panel.
6. Cuando todo vaya bien un par de semanas, dar de baja Calendly.

### 6. Pendiente fuera de la fase 1

- **Facturas:** las de las reservas web salen solas (serie AR-W) con el mismo diseño que las manuales (serie AR-M). Que el gestor confirme la serie. Las **rectificativas** (cuando se devuelve dinero de una reserva ya facturada) se hacen de momento a mano; el panel avisa. Antes del 1-7-2027 (o 1-1-2027 si factura una sociedad) hay que pasar a un programa que cumpla **Veri*factu**: este no lo cumple.
- **Devoluciones:** desde el portal del TPV; el panel solo apunta el importe.
- **Límites antiabuso:** cada persona puede tener como mucho 2 horas guardadas sin pagar y 4 intentos de pago por reserva; los intentos de entrar en el panel están limitados.
- **Cambios del cliente:** el cliente los pide desde su página y el estudio los hace en el panel.
- **Política de privacidad:** menciona Calendly como proveedor; al activar, cambiarla por el TPV de Comercia, Neon (base de datos) y Resend (correos).
- **Planes mensuales y área de clientes:** fase 3.
