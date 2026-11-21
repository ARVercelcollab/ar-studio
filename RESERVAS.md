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
| Panel | `/admin` | Inicio, Reservas (calendario, lista y clientes), Miembros, Movimientos, Mes a mes, Impuestos, Ajustes y **Añadir**. Ver «El panel del estudio» más abajo |
| Correos | Resend (`reservas@studioar.es`) | Confirmación al cliente con el `.ics`, aviso al estudio, recordatorio el día antes, avisos de pagos raros |
| Facturas | PDF por correo | **Todo lo cobrado lleva factura.** Al confirmarse el pago se emite sola y se le envía en PDF con copia al estudio: **completa** (serie AR-W) si ha dado nombre, NIF y dirección, y **simplificada** (serie AR-S, sin datos del cliente) si no. Si después pide la completa (desde la página de su reserva o el estudio desde el panel), se hace una AR-W que dice a qué simplificada sustituye; la simplificada queda marcada, no se borra. Cada serie tiene su numeración correlativa por año. Desde el panel se emite, se descarga o se reenvía («Reenviar» manda la que hay: para cambiar la simplificada por la completa hay que pedirlo con los datos). Si una factura no se puede emitir o enviar (p. ej. falla el correo), queda apuntado, el estudio recibe un aviso y sale en el Inicio («cobros sin factura») |
| Google Calendar | `/admin/ajustes/google` | Cada reserva confirmada (web, panel y sesiones de los planes) y cada bloqueo entran **al momento** en el calendario de Google del estudio, con todos los datos del cliente (nombre, WhatsApp, correo, qué va a hacer, fondos, equipo, comentarios, horas, importe, si está pagada, factura y enlace a su ficha). Si se mueve o se cancela, se actualiza o se quita solo. Ver «Google Calendar» más abajo |
| Calendario para suscribirse | `/api/admin/calendario?clave=…` | Alternativa sin conectar la cuenta (Google solo lo refresca cada varias horas) |
| Alta de miembros | `/planmensual/alta` | La persona elige plan, paga el primer mes con tarjeta y después firma su contrato en la web (`/contrato/[enlace privado]`); las cuotas siguientes se cobran solas cada mes en esa tarjeta (si falla, le llega un enlace: `/cuota/[enlace privado]`). Ver «Alta de miembros por la web» más abajo |

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
6. **Cobros recurrentes: pedid exactamente «pago por referencia / COF para cobros recurrentes MIT, también por REST (trataPeticionREST)».** Es lo que hace que las cuotas de los planes se cobren solas cada mes en la tarjeta del alta: el primer pago guarda la tarjeta en Redsys (`DS_MERCHANT_IDENTIFIER=REQUIRED`, `DS_MERCHANT_COF_INI=S`, `DS_MERCHANT_COF_TYPE=R`) y cada mes el servidor cobra con esa referencia sin que la persona esté delante (`DS_MERCHANT_EXCEP_SCA=MIT`, `DS_MERCHANT_DIRECTPAYMENT=true`). Cuando lo confirmen, poned `REDSYS_COBRO_RECURRENTE=1`. Si no lo activan, el sistema manda cada mes un enlace de pago por correo. Bizum no admite cobros automáticos: con el cobro recurrente, el alta se paga solo con tarjeta.

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
| `REDSYS_COBRO_RECURRENTE` | `1` = las cuotas de los planes se cobran solas cada mes en la tarjeta del alta. **Solo cuando Comercia haya activado el pago por referencia (COF)**; sin ella, enlace de pago por correo cada mes |
| `ADMIN_PASSWORD` | Contraseña compartida del panel, de 12 caracteres o más. **Solo vale hasta que alguien crea su cuenta** (ver «Quién entra en el panel»); después se entra con correo y contraseña |
| `SESSION_SECRET` | Texto aleatorio de 32 caracteres o más (firma la sesión del panel) |
| `CRON_SECRET` | Texto aleatorio: Vercel lo usa para lanzar el recordatorio diario |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Del cliente OAuth de Google Cloud, para conectar Google Calendar (ver «Google Calendar») |
| `CALENDARIO_TOKEN` | Opcional. Texto aleatorio de 24 caracteres o más, para el calendario por suscripción (si no se conecta Google Calendar) |
| `SITIO_URL` | `https://www.studioar.es` |
| `FACTURA_EMISOR_NOMBRE` | Quien factura (el mismo nombre que en las facturas manuales) |
| `FACTURA_EMISOR_NIF` | Su NIF |
| `FACTURA_EMISOR_DIRECCION` | Su dirección, con las líneas separadas por `|` (p. ej. `Calle 1|46007 València (Valencia)|España`) |
| `FACTURA_SERIE` | Opcional. Por defecto `AR-W` (serie de las facturas completas de la web) |
| `FACTURA_SERIE_SIMPLIFICADA` | Opcional. Por defecto `AR-S` (serie de las facturas simplificadas). Tiene que ser distinta de `FACTURA_SERIE` |
| `FACTURAS_AUTOMATICAS` | Opcional. `0` para que no se emitan ni se envíen solas (se emiten desde el panel) |
| `RESEND_API_KEY` | Ya existe. Sin ella, en Vercel no sale ningún correo y las facturas no se marcan como enviadas (el panel lo avisa) |
| `AVISOS_ERRORES_EMAIL` | Opcional. A quién llegan los avisos de errores del chat; por defecto, el correo del estudio |
| `RESERVAS_EMAIL_FROM` | Opcional. Por defecto `AR Studio <reservas@studioar.es>` |
| `RESERVAS_EMAIL_ESTUDIO` | Opcional. A dónde llegan los avisos; por defecto `arstudiospain@gmail.com` |
| `ESTUDIO_IBAN` | Número de cuenta del estudio. Sale en la página del contrato y en los correos para que transfieran la fianza, y en el recordatorio de cuota por WhatsApp. Sin él, se les pide que escriban para pedirlo |
| `CONTRATO_INCLUIR_NIF` | Opcional. `1` para que el contrato firmado ponga el NIF de quien firma por el estudio (`FACTURA_EMISOR_NIF`). Por defecto solo pone el nombre (`FACTURA_EMISOR_NOMBRE`) |
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
2. Desactivar los tipos de evento de Calendly, para que nadie reserve en los dos sitios.
3. Exportar de Calendly todas las reservas (*Eventos programados → Exportar*, pasadas y futuras) y subir el CSV en
   *Ajustes → Calendly → Importar reservas de Calendly*. Primero sale un resumen sin tocar nada (nuevas, futuras,
   pasadas, canceladas, ya importadas, ya apuntadas a mano y problemas fila a fila) y luego se confirma. Las
   **futuras ocupan su hora** (con sus 30 minutos) y las pasadas van a las fichas de los clientes. Se puede subir
   varias veces: lo ya importado se salta. Las filas que chocan con otra reserva o un bloqueo no entran: se
   resuelven a mano (*Añadir → Reserva*, «Por Calendly (ya cobrada en Stripe)»).
4. En *Movimientos → Ajustes de las cuentas* (al final de la página), poner el último mes en que se cobró por Calendly.
5. Hacer una reserva real pequeña y devolverla desde el portal del TPV.
6. Comprobar en *Google Calendar* (panel) que está conectado y al día. Las reservas que vienen de Calendly no se copian (Calendly ya las pone), así que no hay duplicados mientras convivan.
7. Cuando todo vaya bien un par de semanas, dar de baja Calendly.

### 6. Pendiente fuera de la fase 1

- **Facturas:** todas las reservas y cuotas cobradas salen solas, completas (AR-W) o simplificadas (AR-S), con el mismo diseño que las manuales (serie AR-M). La simplificada vale hasta 400 € con IVA, que cubre cualquier reserva del estudio. Las de Calendly las sigue haciendo Stripe. Las **rectificativas** (cuando se devuelve dinero de una reserva ya facturada) se hacen de momento a mano; el panel avisa. Antes del 1-7-2027 (o 1-1-2027 si factura una sociedad) hay que pasar a un programa que cumpla **Veri*factu**: este no lo cumple.
- **Devoluciones:** desde el portal del TPV; el panel solo apunta el importe.
- **Límites antiabuso:** cada conexión puede tener como mucho 2 horas guardadas sin pagar (12 en total a la vez) y 4 intentos de pago por reserva; si alguien vuelve atrás desde el banco y reserva otra vez, se suelta su hora anterior. En el panel, 8 contraseñas falsas seguidas bloquean esa conexión 15 minutos.
- **Cambios del cliente:** el cliente los pide desde su página y el estudio los hace en el panel.
- **Política de privacidad:** ya preparada. Con `NEXT_PUBLIC_RESERVAS_PROPIAS=1` nombra a Comercia (Redsys/Bizum), Stripe (planes antiguos), Neon, Vercel, Resend, Google Calendar y OpenAI; sin la variable sigue nombrando a Calendly.
- **Área de clientes** (que los miembros vean sus horas y reserven solos): fase 3. Los planes ya se llevan desde el panel.

## Google Calendar

Cada reserva confirmada y cada bloqueo se copian al calendario de Google del estudio en cuanto
pasan (al confirmarse el pago, al guardar algo en el panel). Si se mueve, se cambia algo o se
cancela, el evento se actualiza o se quita. Las reservas de Calendly no se copian, porque Calendly
ya las pone en el calendario.

- **Si Google falla** (o no está conectado), la reserva sigue adelante igual: queda pendiente y se
  vuelve a intentar sola en los siguientes cambios y en la tarea diaria. En *Google Calendar*
  (panel → *Ajustes → Google Calendar*) hay un botón **Volver a sincronizar** y el Inicio avisa si algo no ha llegado.
- **Nunca se duplica:** cada evento tiene un número fijo sacado de la reserva.
- **Qué se guarda:** solo el permiso de Google (el «refresh token»), **cifrado** con `SESSION_SECRET`.
  Si se cambia `SESSION_SECRET`, hay que volver a conectar.
- **Permisos que pide:** crear, cambiar y borrar eventos (`calendar.events`), ver la lista de
  calendarios para elegir en cuál van (`calendar.calendarlist.readonly`) y el correo de la cuenta.
- **Privacidad:** quien vea ese calendario ve los datos de los clientes: no compartirlo fuera del estudio.
  Los eventos van como **privados** y no llevan el NIF (está en el panel); sí las notas del estudio.
- **Rapidez:** después de un pago o de un cambio en el panel se espera a Google como mucho unos
  3 segundos en total; lo que no dé tiempo se pasa en el siguiente cambio o en la tarea diaria.
- **Cambiar de calendario o volver a conectar la misma cuenta:** los eventos (también los antiguos)
  se quitan del anterior y se ponen en el nuevo, sin duplicarse. Al desconectar se recuerda el
  calendario: si se vuelve a conectar la misma cuenta, se sigue en él.

### Preparar la conexión (una vez)

1. Entrar en <https://console.cloud.google.com> con la cuenta de Google del estudio y crear un
   proyecto (por ejemplo «AR Studio web»).
2. *APIs y servicios → Biblioteca*: buscar **Google Calendar API** y pulsar **Habilitar**.
3. *APIs y servicios → Pantalla de consentimiento de OAuth* (o *Google Auth Platform*):
   - Tipo de usuario **Externo** (con una cuenta de Gmail no hay otra opción; si el estudio usa
     Google Workspace, **Interno** es mejor).
   - Nombre de la aplicación «AR Studio», correo de asistencia el del estudio.
   - En *Público*, pulsar **Publicar la aplicación** (pasar a **En producción**). En modo
     «Prueba» Google corta el permiso a los 7 días y habría que volver a conectar cada semana.
     No hace falta que Google la verifique: al conectar saldrá un aviso de «aplicación no
     verificada»; se pulsa *Configuración avanzada → Ir a AR Studio*.
4. *Clientes* (o *Credenciales → Crear credenciales → ID de cliente de OAuth*):
   - Tipo **Aplicación web**.
   - **URI de redireccionamiento autorizados** (todas las direcciones desde las que se vaya a conectar):
     - `https://www.studioar.es/api/admin/google/callback`
     - la de la vista previa de la rama, por ejemplo `https://ar-studio-git-reservas-propias-<equipo>.vercel.app/api/admin/google/callback`
     - en local, `http://localhost:3100/api/admin/google/callback`
5. Copiar el **ID de cliente** y el **secreto de cliente** a Vercel como `GOOGLE_CLIENT_ID` y
   `GOOGLE_CLIENT_SECRET` (Production y Preview) y volver a desplegar.
6. En el panel, *Google Calendar → Conectar Google Calendar*, entrar con la cuenta del estudio,
   marcar todas las casillas y **Permitir**. Elegir en qué calendario van (por defecto, el principal).

Cada base de datos (producción, vistas previas, local) tiene su propia conexión. Las vistas previas
usan una copia de la base de producción: la primera vez que se abre la copia, se olvida ahí la
conexión de producción (nunca se usa ni se revoca desde una vista previa) y los eventos de
producción no se tocan. En una vista previa hay que conectar aparte, y mejor con un calendario
de pruebas para no llenar el de verdad.

## El panel del estudio

### Quién entra en el panel

Cada persona entra con **su correo y su contraseña** (desde el 21-11-2026). Se da acceso en
**Ajustes → Personas con acceso** (solo lo ve quien puede dar acceso):

1. **Dar acceso:** nombre, correo y si puede dar acceso a otras personas. Le llega un correo «Te
   han dado acceso al panel de AR Studio» con el botón **Crear mi contraseña** (vale 72 horas,
   un solo uso). Al crearla entra directamente.
2. **Reenviar invitación** si no le llegó o caducó; **Cerrar sus sesiones** (tendrá que volver a
   entrar); **Quitar acceso** (sale al momento, aunque tenga la sesión abierta) y **Volver a dar
   acceso** (tendrá que crear otra contraseña).
3. **¿Has olvidado la contraseña?** en la entrada: llega un enlace que vale 1 hora. Al poner la
   nueva se cierran sus demás sesiones.

Nadie se puede quitar el acceso a sí mismo ni quitar a la última persona que puede dar acceso.

**Paso desde la contraseña compartida (sin dejar a nadie fuera):** mientras ninguna persona haya
creado su contraseña, se entra como antes con `ADMIN_PASSWORD`. Desde ahí, en Ajustes → Personas
con acceso, da acceso a cada persona empezando por ti. En cuanto la primera crea su contraseña, la
entrada pide correo y contraseña y `ADMIN_PASSWORD` deja de valer (y cualquier sesión abierta con
ella se cierra).

Por dentro: contraseñas resumidas con scrypt (nunca en claro), sesión de 7 días en una cookie
firmada que se comprueba contra la base de datos en cada página (tabla `personas_panel`, migración
18), y de los enlaces solo se guarda su resumen (`enlaces_panel`). Límites: 8 fallos cada 15 minutos
por conexión y 5 por correo; 3 enlaces por hora y correo. Las páginas del panel van sin el píxel de
Meta.

### Las secciones

El panel (`/admin`) tiene el diseño de noviembre de 2026 (calcado a la organización del panel de
Gartalia): menú lateral beige con el logo, el botón **Añadir** arriba y 7 secciones. En el móvil,
cabecera con el logo y barra abajo: Inicio · Reservas · **Añadir** · Miembros · Más.

| Sección | Dónde | Qué hay |
|---|---|---|
| **Inicio** | `/admin` | Saludo y selector de mes; 4 cifras sin IVA (ingresos, gastos, beneficio y horas reservadas con la ocupación) comparadas con el mes anterior a la misma altura; la frase del mes; **Pendiente ahora** (hoy en el estudio, por cobrar, miembros por resolver e IVA a apartar, con llamar y WhatsApp); ingresos y gastos por mes y en qué se va el dinero; últimos movimientos |
| **Reservas** | `/admin/reservas` | Tres vistas: **Calendario** (la semana, con reservas por horas, sesiones de miembros con raya marrón, sin pagar y bloqueos), **Lista** (`/admin/reservas/lista`: buscador, filtros, totales y factura de cada una) y **Clientes** (`/admin/reservas/clientes`). La ficha de cada reserva está en `/admin/reserva/[id]` |
| **Miembros** | `/admin/miembros` | Los planes mensuales en lista o tablero por estado (contrato por firmar, fianza pendiente, al día, cuota sin pagar, baja), la ficha de cada miembro y el alta a mano. Ver «Suscripciones» más abajo |
| **Movimientos** | `/admin/movimientos` | Todo el dinero apunte a apunte, con IVA: cobros de reservas, cuotas, Calendly, otros ingresos, gastos (los fijos marcados), devoluciones; filtros, totales, la factura de cada uno y **Exportar CSV** para la gestoría. Las categorías de gastos, en `/admin/movimientos/categorias` |
| **Mes a mes** | `/admin/mes-a-mes` | Tabla del año por categorías y meses, sin IVA (cuadra con el Inicio). Cada cifra lleva a sus movimientos |
| **Impuestos** | `/admin/impuestos` | El IVA del trimestre: lo cobrado − lo pagado = lo que conviene apartar (orientativo), ingresos por tipo de factura, gastos sin factura y las facturas del trimestre |
| **Ajustes** | `/admin/ajustes` | Precios y reglas (solo lectura), planes, **gastos fijos**, **Google Calendar**, **Calendly**, festivos y bloqueos |
| **Añadir** | `/admin/anadir` | Una reserva (por horas o sesión de un miembro), un gasto, otro ingreso, el cobro de una cuota o un bloqueo. Con **Formulario** o **Escribirlo** (ver abajo) |

- **Clientes:** cada persona que ha reservado tiene su ficha. Las reservas se juntan por **correo**
  (en minúsculas) y, si no hay correo, por las **9 últimas cifras del teléfono**; entran también las
  sesiones de los miembros y las de Calendly pasadas a la agenda (las canceladas solo en el
  historial). La ficha enseña sus datos y facturación, reservas este año y en total, horas, lo
  pagado, qué suele hacer, próximas reservas, historial y **notas del estudio** (se guardan en la
  base de datos, tabla `clientes_notas`, migración 14). Desde la ficha: llamar, WhatsApp, correo y
  «Nueva reserva para este cliente». El historial de Calendly se trae con *Ajustes → Calendly → Importar
  reservas de Calendly* (CSV de *Eventos programados → Exportar*): cuentan como reservas y horas en la ficha,
  pero **no** en lo pagado (su dinero está en Stripe y se apunta por meses en Calendly).
- **Importar de Calendly** (`/admin/ajustes/calendly#importar`, `lib/reservas/calendly-importar.js`, migración 17):
  reconoce las columnas en inglés y en español (nombre, correo, teléfono, tipo de evento, inicio, fin, zona horaria,
  programado, cancelado y motivo, UUID del invitado y del evento, importe y moneda, y las preguntas/respuestas:
  actividad, fondos y equipo van a su campo y el resto a comentarios). Las horas se leen en hora de Madrid o, si
  se elige, en la zona de cada persona; una fecha que no se entiende no se importa. Origen `calendly`, pagadas
  por Stripe, sin factura (la hizo Stripe), sin Google Calendar (ya las pone Calendly) y sin nuestro recordatorio
  (lo manda Calendly). Si el archivo no trae el importe, se pone el de la web y se marca como estimado. Clave para
  no duplicar: `reservas.externo_ref` = `calendly:<UUID del invitado>`. Límite: 3 MB / 5.000 filas.
- **Añadir → Escribirlo:** se escribe con palabras normales («Reserva de Laura el lunes de 17 a 19»,
  «Aquaservice 32 € con tarjeta», «Cobrado 199 € de cuota de Irene por Bizum», «Bloquear el sábado
  por la mañana», «¿Cómo va el mes?»). Lo entiende un intérprete de palabras clave
  (`lib/admin/interprete.js`), **sin inteligencia artificial ni servicios de fuera**: siempre enseña
  «He entendido esto» y solo guarda al pulsar **Guardar**; «Corregir en el formulario» abre la
  pestaña con los datos puestos. Las sesiones de los miembros se guardan siempre desde el formulario.
- **Ocultar importes:** el ojo del pie del menú (o de la cabecera en el móvil) difumina todas las
  cantidades del panel, por si hay alguien delante. Se recuerda en este navegador.
- **Direcciones antiguas:** siguen funcionando y llevan a las nuevas (`/admin/agenda` → Reservas,
  `/admin/suscripciones` → Miembros, `/admin/finanzas` → Movimientos, `/admin/finanzas/fijos` y
  `/admin/finanzas/calendly` → Ajustes, `/admin/google`, `/admin/festivos` y `/admin/bloqueos` →
  Ajustes, `/admin/nueva` → Añadir).
- **Piezas comunes** del diseño en `components/admin/ui` (tarjetas, cifras, botones, filtros,
  tablas, fichas laterales…) y colores en `styles/admin/_tokens.scss`.

## Suscripciones (planes mensuales)

Las suscripciones se llevan **dentro del panel**, en *Miembros*. Las sesiones de los
miembros son reservas normales de la agenda (salen con una raya marrón y «Incluida»), así
nadie puede reservar encima.

### Qué se hace en cada sitio

| Dónde | Qué |
|---|---|
| *Miembros* | Quién está con plan (en lista o en tablero), cuántas horas le quedan este mes, si la cuota está pagada y el recuadro **Para hacer** (cuotas sin pagar, fin del mes de prueba, horas que se van a perder, cobros de Stripe que hay que cancelar, fianzas) |
| *Miembros → Nueva suscripción* | Plan, datos, día del primer cobro (de ahí salen los periodos), mes de prueba, cómo paga, primera cuota, fianza, contrato y **condiciones especiales** si se ha pactado algo distinto |
| *Añadir → Reserva → Sesión de un miembro* (o «Reservar sesión» en su ficha) | Elegir a la persona, día y horas. Debajo sale en directo cuántas horas gasta del plan, cuántas van aparte (con precio orientativo; 0 = de regalo), los huecos libres en su horario y los avisos |
| Ficha de cada miembro | Horas del periodo y sesiones, cuotas (marcar pagada, factura, recordatorio por WhatsApp, editar, anular, devolver), fianza, condiciones, datos, notas y baja |
| Ficha de una sesión | Mover (comprobando sus reglas) y cancelar (con la casilla «Cuenta como usada») |

### Cómo funciona

- **Periodo** = el mes de cobro: del día del primer cobro al mismo día del mes siguiente. Las horas que no se usan se pierden al acabar el periodo.
- **Cuotas:** cada periodo tiene su cuota, que aparece sola cuando empieza. A los miembros dados de alta por la web con la tarjeta guardada se les cobra sola (ver «Alta de miembros por la web»); al resto, se marca como pagada cuando llega la transferencia o el Bizum. A quien paga con **Stripe**, Stripe le sigue cobrando solo; aquí solo se apunta, y **al darle de baja hay que cancelarle la suscripción en Stripe a mano** (el panel lo recuerda).
- **Horas aparte de los miembros:** si las pide el mismo día de la sesión, 50 €/h + IVA entre semana y 60 €/h + IVA en finde y festivos (como en las condiciones). Si las pide con días de antelación, el precio normal de la web para esas horas. El panel lo propone solo y se puede cambiar en cada sesión (0 = de regalo).
- **Facturas de cuotas:** al marcar la cuota pagada se emite y se le envía la factura, con las mismas series que las reservas: completa (AR-W) si el miembro tiene sus datos de facturación y simplificada (AR-S) si no. Si luego los da, desde la cuota se hace la completa que sustituye a la simplificada. Las cuotas de 0 € y las sesiones incluidas no se facturan; las horas aparte, sí.
- **Reglas** que comprueba el panel (se pueden saltar con «Reservar igualmente» cuando son avisos): 72 h de antelación, su horario de lunes a viernes, duración de sesión, máximo de sesiones al mes y horas que le quedan. Fines de semana y festivos van siempre aparte. Chocar con otra reserva o un bloqueo no se puede saltar.
- **Cancelar** con menos de 48 h: cuenta como usada (se puede desmarcar si hay un buen motivo).
- **Baja:** al apuntarla, el panel propone el último día según el contrato (permanencia de 3 meses, mes de prueba, renovación y preaviso), explica qué pasa con la fianza y cancela las sesiones posteriores.
- Los planes y las reglas comunes están en `lib/reservas/config.js` (`PLANES`, `PLAN_COMUN`). Cambiarlos ahí solo afecta a las altas nuevas; a un miembro ya dado de alta se le cambian desde su ficha (*Cambiar condiciones*, a partir de un periodo).

### Pendiente de decidir

- Si una **fianza que os quedáis** necesita factura (que lo diga el gestor).
- Añadir la **renovación y el preaviso** a las condiciones de la web si se usan en algún contrato.

### Alta de miembros por la web

Con `NEXT_PUBLIC_RESERVAS_PROPIAS=1`, los botones de `/planmensual` llevan a `/planmensual/alta` (sin la variable siguen yendo a WhatsApp).

1. **Antes de pagar:** elige plan y pone nombre, apellidos, correo y WhatsApp. **No se le enseña el contrato** (para no meter fricción) ni hay casillas: junto al botón de pagar, en una línea, va lo esencial (cuota al mes, permanencia de 3 meses, cobro mensual automático en la tarjeta hasta la baja, fianza de 100 € por transferencia después) y «Al pagar aceptas las condiciones», con enlace a `/condiciones`. Se guarda cuándo pulsó pagar y la versión del contrato de ese momento.
2. **Paga el primer mes** en el TPV. Con el cobro recurrente activo (`REDSYS_COBRO_RECURRENTE=1`), **solo con tarjeta** y la tarjeta queda guardada en Redsys: guardamos la referencia que da Redsys, los 4 últimos dígitos y la caducidad, **nunca el número**. Sin el cobro recurrente, tarjeta o Bizum. Cuando el banco lo confirma, se crea la suscripción: empieza ese día, la primera cuota queda pagada (con su factura, simplificada si no ha dado datos de empresa), y sale **«Contrato pendiente»** y **«Fianza pendiente»** en el *Para hacer*. Le llega un correo con el enlace para firmar y al estudio un aviso. Si se pidió guardar la tarjeta y el banco no la devuelve, el estudio recibe un aviso y sus cuotas van con enlace.
3. **Firma el contrato** en `/contrato/[enlace]` (la web le lleva ahí al volver del banco; antes de pagar no se puede): rellena nombre, DNI/NIE, dirección y teléfono (y, si quiere, datos de empresa para las facturas), lee el contrato ya rellenado y firma con el dedo o el ratón. En esa misma página tiene, bien visible, **la transferencia de la fianza** (IBAN, importe y concepto «Fianza SUS-…», con botón para copiar).
4. **Al firmar** se guarda el PDF (con la fecha y hora, la versión del contrato y una huella cifrada de su conexión, nunca la IP) y le llega por correo con copia oculta al estudio. Si dio datos de empresa, la factura del primer mes pasa a completa (sustituye a la simplificada).
5. **Si a las 48 h no ha firmado**, el cron diario le manda un recordatorio (una vez) y avisa al estudio.
6. **Fianza:** tiene **7 días desde la firma** para transferirla (lo dicen el contrato, la página del contrato y los correos, con la fecha límite). En la ficha sale el plazo; si pasa sin llegar, el *Para hacer* lo marca en rojo. Cuando llegue, *Fianza → Ya cobrada* (transferencia).
   - **Alta repetida:** si alguien paga un alta con el mismo correo que una suscripción activa (dos pestañas, volver atrás…), no se crea otra: el alta queda «duplicada», ve un mensaje de que se le devuelve el pago y el estudio recibe un aviso para devolverlo desde el portal del TPV.
7. **Cuotas siguientes, cobro automático:** el cron diario cobra cada cuota el día que empieza su periodo, con la tarjeta guardada (cobro MIT por la API REST de Redsys). Si sale, la cuota queda pagada y le llega la factura. **Nunca se cobra dos veces la misma cuota**: mientras se cobra está «cobrando» y la base de datos no deja un segundo cobro automático de la misma cuota, aunque el cron corra dos veces a la vez.
   - **Si el banco lo rechaza** (tarjeta caducada, sin fondos…): se reintenta solo **al día siguiente y a los 3 días** del primer intento. En el primer rechazo le llega un correo con el enlace para pagarla (`/cuota/[enlace]`) o poner otra tarjeta (la nueva queda guardada para los meses siguientes); mientras quedan reintentos **no se le ofrece la transferencia** (el reintento la cobraría otra vez). Al estudio, un aviso y una tarea en el *Para hacer*. Si falla las 3 veces, ya no se reintenta: se le vuelve a mandar el enlace, ahora también con la transferencia.
   - **Mientras esté pagando con el enlace** (pago empezado hace menos de 2 horas), ni el cron ni «Cobrar ahora» cobran la tarjeta. Un pago con el enlace empezado hace más y sin resultado deja la cuota en «revisar».
   - Si el banco confirma un **importe distinto**, la cuota pasa a «revisar» al momento y el estudio recibe un aviso.
   - Si el estudio pulsó «Dejar de cobrar», pagar con el enlace guarda la tarjeta nueva pero **no** vuelve a activar el cobro automático.
   - **Si el banco no contesta** (no sabemos si cobró): la cuota queda en **«revisar»**, no se reintenta sola y no se puede pagar con el enlace. Mírala en el portal del TPV: si no se cobró, en la cuota pulsa **«No se cobró»** (y luego «Cobrar ahora»); si se cobró, **«Marcar pagada»**. Un cobro que se corta a medias pasa también a «revisar».
   - **Baja:** al apuntarla, se borran las cuotas pendientes de después del último día, así que no se cobran. Las que ya tuvieron un intento de pago no se pueden borrar: se anulan (y vuelven si se deshace la baja). Un cobro por comprobar («revisar») se queda para que lo resuelva el estudio.
   - **Sin cobro recurrente** (o para miembros dados de alta a mano), al empezar cada periodo le llega un correo con un enlace para pagar (`/cuota/[enlace]`); desde la ficha se puede reenviar o marcar la cuota pagada a mano.
8. **Impago:** mientras una cuota esté sin pagar (con cobro automático, desde que el banco la rechaza; sin él, desde el día después de empezar; con Stripe, cuando ya está atrasada), **no puede usar el estudio**: al reservarle una sesión sale el aviso «Cuota sin pagar: no puede usar el estudio hasta pagarla» (se puede saltar con «Reservar igualmente») y sus sesiones y su ficha lo avisan en el panel. En cuanto paga, vuelve todo a la normalidad. Si al final no paga (agotados los reintentos), según el contrato **pierde la fianza**, que se aplica a lo pendiente, y el estudio puede dar por terminada la suscripción: el *Para hacer* pide decidirlo. **Nada se hace solo.**

En la ficha de cada miembro, el recuadro **Cobro mensual** enseña la tarjeta guardada (···· 1234, caducidad), si se cobra sola, la fecha del próximo cobro y los intentos de cobro con su resultado; tiene **«Dejar de cobrar»** (las cuotas siguientes se marcan a mano) y **«Volver a cobrar solo»**. En cada cuota pendiente: **«Cobrar ahora»** (pide confirmación) y, si hay un cobro por comprobar, **«No se cobró»**. El *Para hacer* avisa también si **la tarjeta caduca antes del próximo cobro**.

En la ficha de cada miembro, el recuadro **Contrato** dice si está pendiente o firmado, deja descargar el PDF, reenviar o copiar el enlace, y a los miembros dados de alta a mano se les puede **enviar el contrato para firmar** desde ahí.

El texto del contrato está en `lib/suscripciones/contrato.js` (plantilla sin datos personales, con las condiciones de cada plan). Si se cambia, hay que subir `CONTRATO_VERSION`: cada contrato firmado guarda la suya. Quien firma por el estudio sale de `FACTURA_EMISOR_NOMBRE` (sin firma dibujada ni DNI: no pueden estar en el repositorio).

**Probado** contra el entorno de pruebas público de Redsys (comercio 999008881): el primer pago con la tarjeta guardada (COF, con 3DS) devuelve la referencia, y el cobro MIT por REST con esa referencia sale autorizado; una referencia que no existe da `SIS0321` (se trata como rechazo). **Pendiente de Comercia:** que activen el pago por referencia/COF y los cobros MIT por REST en el TPV del estudio, y entonces `REDSYS_COBRO_RECURRENTE=1`.

### Pasar al panel a la clienta que ya tiene contrato

Sin datos personales en el repositorio (es público): todo se mete desde el panel.

1. En el Stripe del estudio, apuntar el `sub_…` de su suscripción, el día del primer cobro y el enlace a esa factura.
2. *Miembros → Nueva suscripción*:
   - plan **Starter**, su nombre, correo y WhatsApp;
   - «Empieza el» = el día del primer cobro de Stripe;
   - ☑ primer mes de prueba;
   - Cómo paga = **Stripe** y el `sub_…`;
   - ☑ primera cuota pagada (fecha y referencia del cobro);
   - fianza «Ya cobrada» por transferencia, con su fecha;
   - enlace al contrato en Drive;
   - **Condiciones especiales** como en su contrato: cuota 149 €, 8 h al mes, duraciones `4`, máximo 2 sesiones, 14:00–20:00 (y la permanencia, renovación y preaviso que diga el contrato).
3. Meter por *Añadir → Reserva → Sesión de un miembro* las sesiones que ya haya hecho este periodo y las que tenga reservadas.
4. Antes del segundo cobro (el recuadro *Para hacer* avisa 7 días antes):
   - **si sigue:** nada en Stripe; cuando cobre, marcar la cuota 2 como pagada (Stripe);
   - **si avisó por escrito de que lo deja:** *Ha avisado de que lo deja* → el panel propone el último día del mes de prueba y devolver la fianza → cancelar su suscripción en Stripe a mano y marcar «Ya lo he cancelado» → devolverle la fianza por transferencia → *Fianza → Apuntar devuelta*.

### Área de miembros (`/miembros`)

Cada miembro tiene su área en `studioar.es/miembros`, sin contraseña. Se abre a la vez que las reservas propias (`NEXT_PUBLIC_RESERVAS_PROPIAS`; en local y en las vistas previas está abierta).

- **Entrar:** pone su correo y le llega un enlace que **vale 30 minutos y una sola vez**. A quien pide el enlace se le contesta siempre lo mismo y tras el mismo tiempo (unos 1,5 s), exista o no su correo. El enlace lleva a `/miembros/entrar`, donde hay que pulsar «Entrar» (así los antivirus del correo que abren enlaces no lo gastan). Queda una sesión de 30 días (cookie `ar_miembro`, firmada con una clave propia sacada de `SESSION_SECRET`). De los enlaces solo se guarda su resumen (sha256). Límites: 5 enlaces cada 15 minutos por conexión y 3 por correo.
- **Qué suscripción ve:** la que está en marcha; si no hay, la que va a empezar; si todas terminaron, la última durante 90 días (solo para ver facturas y contrato, sin reservar).
- **Cerrar sus sesiones:** desde su ficha del panel («Cerrar sesiones»), su cookie y los enlaces sin usar dejan de valer y tiene que pedir otro enlace. Cambiar el correo de la suscripción también las cierra.
- **Qué ve:** sus horas del mes (usadas, reservadas y las que le quedan, y cuándo se pierden), sus próximas sesiones y las últimas, sus cuotas con su factura, las facturas de las horas aparte, su contrato en PDF, la tarjeta guardada y los avisos: cuota sin pagar (con el enlace para pagarla si se puede), contrato por firmar, fianza pendiente (IBAN de `ESTUDIO_IBAN`, importe y concepto) y tarjeta que caduca antes del próximo cobro.
- **Reservar:** con las reglas de su plan **sin «reservar igualmente»**: solo sus días y su horario, sus duraciones (o exactamente las horas que le quedan), con su antelación y como mucho hasta el final del mes siguiente (en el mes de prueba, solo ese mes). No reserva con una cuota sin pagar ni con el contrato por firmar.
- **Horas aparte:** solo cuando ya no le quedan horas del plan (fines de semana, festivos y fuera de su horario no valen). Se pagan al reservar por el TPV, al precio de la web, y la hora queda guardada 20 minutos mientras paga. Solo una retenida a la vez por miembro: si vuelve a pedir el mismo hueco (doble clic, o tras un pago fallido) se reutiliza con un pago nuevo y 20 minutos más (como mucho 4 intentos); para reservar otra, antes tiene que pagarla o soltarla. Mientras tanto, su retenida no le cuenta ni en sus huecos ni en sus horas. Al confirmarse el pago: su correo, el aviso al estudio, la factura de las horas aparte (completa si la suscripción tiene datos de factura) y Google Calendar. Si el pago llega tarde y la hora ya está dada o ya no le caben las horas del plan, la sesión queda «en revisión» y el estudio recibe el aviso: el cobro nunca se pierde.
- **Cambiar y cancelar:** con más de su aviso (48 h) cambia sus sesiones sin horas aparte. Cancelar con menos de 48 h hace que cuente como usada (se le avisa antes). Una sesión con horas aparte pagadas no se cancela desde el área: tiene que escribir al estudio (hay que devolverlas a mano).
- **Avisos al estudio:** solo por correo. Cada sesión que reserva, cambia o cancela un miembro llega a `RESERVAS_EMAIL_ESTUDIO` con sus datos y las horas que le quedan; al miembro le llega su confirmación con el `.ics`. Desde el área puede escribir al estudio o pedir la baja (la baja no se apunta sola). En el historial de su ficha, lo que hace él sale con autor «cliente».
- **Desde el panel:** en la ficha del miembro se ve cuándo entró por última vez y se le puede **enviar el acceso** (el mismo enlace por correo).
- **En local:** el correo con el enlace se guarda en `.data/correos/`.

## El dinero (Inicio, Movimientos, Mes a mes e Impuestos)

Qué hay en cada pantalla: ver la tabla de «El panel del estudio». Los gastos van en tres grupos:
**fijos** (alquiler, alarma, internet, seguro, gestoría, programas), **variables** (luz, agua,
Aquaservice, limpieza, reparaciones, comisiones, publicidad) y **herramientas y materiales** (fondos,
material, equipo). Las categorías se pueden cambiar, añadir u ocultar (*Movimientos → Categorías*).
La cuota de autónomos no va aquí: es de la academia, no del estudio. Los **gastos fijos** (cada
mes o cada 2, 3, 6 o 12 meses) se apuntan solos en Movimientos el mes que toca, y se puede
programar una subida («desde enero son 950 €») o terminarlos (*Ajustes → Gastos fijos*).

### Qué cuenta y qué no

- **Criterio de caja**: un cobro cuenta el día en que entra el dinero y una devolución el día en que sale. Los gastos, el día de su factura o cargo; los fijos cuentan en su mes desde el día 1.
- Todo se enseña **sin IVA** (con el IVA al lado). El beneficio es facturación menos gastos, antes del IRPF.
- Las reservas por horas, las horas aparte de los planes y las cuotas cuentan solas. **Lo cobrado por Calendly no llega solo**: se apunta una vez al mes en *Ajustes → Calendly* (con las pistas de lo que Stripe ya cobró y está en el panel, para no sumarlo dos veces). Las reservas de Calendly pasadas a la agenda no suman.
- Las fianzas no son ingreso hasta que se resuelven: solo cuenta lo que el estudio se queda.
- Cobros que no pasan por el panel (fondos o equipo del día, facturas hechas a mano AR-M, otros): *Añadir → Otro ingreso*.
- Gastos: con factura a nombre del estudio y su NIF, el IVA se descuenta; un ticket sin NIF cuenta entero; seguros y banco no llevan IVA; las empresas de fuera de España (por ejemplo algunas apps) van aparte para la gestoría. El alquiler del estudio no lleva retención; si algún día el casero la aplicara (19 %, modelo 115), se marca en el gasto.
- El IVA del trimestre es **orientativo**: lo que vale es lo que presente la gestoría.

### Para empezar

1. *Ajustes → Gastos fijos → Nuevo gasto fijo*: alquiler (con su IVA, si lo factura con IVA), alarma, internet, seguro, gestoría y programas, cada uno con su día de cargo y desde qué mes.
2. Cada vez que llegue una factura variable (luz, agua, Aquaservice…) o se compre material, *Añadir → Gasto* (o escribirlo: «Aquaservice 32 € con tarjeta»). Si se pega el enlace de Drive de la factura, la gestoría la tiene a mano.
3. Al acabar cada mes, mientras se cobre por Calendly: *Ajustes → Calendly* con lo cobrado, lo devuelto y las comisiones del informe de Stripe.
4. Cada trimestre, *Movimientos → Exportar CSV* (o *Impuestos → Exportar CSV*): los tres CSV. El de facturas lleva las completas y las simplificadas, con su tipo y qué simplificada sustituye cada completa.

### Pendiente de decidir (con la gestoría)

- El IVA de una fianza que os quedáis (ahora 0 %, `FIANZA_RETENIDA_IVA_PCT` en `lib/finanzas/config.js`).
- **CSV de facturas, sustituciones:** la simplificada que ha sido sustituida por una completa sale con base, IVA y total a 0 (así sumar las columnas no cuenta dos veces la operación), con «Sustituida por …» y su importe en «Importe original». Que la gestoría diga si lo prefiere así.
- Cómo van las comisiones de Stripe (ahora como empresa de fuera de España, `COMISION_STRIPE_TIPO_FACTURA`).
