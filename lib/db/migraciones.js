// Cambios de la base de datos, en orden. Cada versión se aplica una sola vez
// (queda apuntada en la tabla "migraciones"). Para cambiar algo, añade una versión
// nueva al final: no edites las que ya están en producción.

export const MIGRACIONES = [
  {
    version: 1,
    nombre: 'reservas por horas, pagos, bloqueos y festivos',
    sql: `
      CREATE SEQUENCE pedido_seq;

      CREATE TABLE reservas (
        id serial PRIMARY KEY,
        codigo text NOT NULL UNIQUE,
        token text NOT NULL UNIQUE,
        origen text NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'manual', 'calendly')),
        estado text NOT NULL CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'caducada', 'conflicto')),
        pago_estado text NOT NULL DEFAULT 'pendiente' CHECK (pago_estado IN ('pendiente', 'pagado', 'reembolsado', 'reembolsado_parcial')),
        metodo_pago text,
        inicio timestamptz NOT NULL,
        fin timestamptz NOT NULL,
        bloqueo_hasta timestamptz NOT NULL,
        duracion_horas integer NOT NULL,
        tipo_dia text NOT NULL CHECK (tipo_dia IN ('laborable', 'finde')),
        precio_cent integer NOT NULL CHECK (precio_cent >= 0),
        nombre text NOT NULL,
        apellidos text NOT NULL DEFAULT '',
        email text NOT NULL,
        telefono text NOT NULL DEFAULT '',
        actividad text,
        fondos text,
        equipo jsonb NOT NULL DEFAULT '[]',
        factura jsonb,
        comentarios text,
        notas_internas text,
        expira_en timestamptz,
        pagado_en timestamptz,
        reembolso_cent integer,
        cancelada_en timestamptz,
        motivo_cancelacion text,
        recordatorio_enviado_en timestamptz,
        acepto_condiciones_en timestamptz,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK (fin > inicio),
        CHECK (bloqueo_hasta >= fin),
        -- La base de datos impide que dos reservas activas se pisen (incluido el margen)
        CONSTRAINT reservas_sin_solapes EXCLUDE USING gist (tstzrange(inicio, bloqueo_hasta, '[)') WITH &&)
          WHERE (estado IN ('pendiente', 'confirmada'))
      );
      CREATE INDEX reservas_inicio_idx ON reservas (inicio);
      CREATE INDEX reservas_estado_idx ON reservas (estado);

      CREATE TABLE pagos (
        id serial PRIMARY KEY,
        reserva_id integer NOT NULL REFERENCES reservas(id),
        proveedor text NOT NULL,
        pedido text NOT NULL UNIQUE,
        importe_cent integer NOT NULL CHECK (importe_cent > 0),
        estado text NOT NULL DEFAULT 'iniciado' CHECK (estado IN ('iniciado', 'pagado', 'fallido')),
        codigo_respuesta text,
        autorizacion text,
        datos jsonb,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX pagos_reserva_idx ON pagos (reserva_id);

      CREATE TABLE bloqueos (
        id serial PRIMARY KEY,
        inicio timestamptz NOT NULL,
        fin timestamptz NOT NULL,
        motivo text NOT NULL DEFAULT '',
        creado_en timestamptz NOT NULL DEFAULT now(),
        CHECK (fin > inicio)
      );
      CREATE INDEX bloqueos_inicio_idx ON bloqueos (inicio);

      -- Festivos: se cobran y se abren como un fin de semana
      CREATE TABLE festivos (
        fecha date PRIMARY KEY,
        nombre text NOT NULL
      );

      -- Historial de cada reserva (creada, pagada, cancelada, correos…)
      CREATE TABLE eventos (
        id serial PRIMARY KEY,
        reserva_id integer REFERENCES reservas(id),
        tipo text NOT NULL,
        detalle jsonb,
        creado_en timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX eventos_reserva_idx ON eventos (reserva_id);

      -- Festivos de València ciudad que caen entre semana. Sacados de prensa local
      -- (noviembre de 2026): COMPROBAR con el calendario laboral oficial (DOGV) y
      -- corregir desde el panel.
      INSERT INTO festivos (fecha, nombre) VALUES
        ('2026-12-08', 'Inmaculada Concepción'),
        ('2026-12-25', 'Navidad'),
        ('2027-01-01', 'Año Nuevo'),
        ('2027-01-06', 'Reyes'),
        ('2027-01-22', 'San Vicente Mártir (local)'),
        ('2027-03-19', 'San José'),
        ('2027-03-26', 'Viernes Santo'),
        ('2027-03-29', 'Lunes de Pascua'),
        ('2027-04-05', 'San Vicente Ferrer (local)'),
        ('2027-10-12', 'Fiesta Nacional'),
        ('2027-11-01', 'Todos los Santos'),
        ('2027-12-06', 'Día de la Constitución'),
        ('2027-12-08', 'Inmaculada Concepción');
    `,
  },
  {
    version: 2,
    nombre: 'facturas de las reservas',
    sql: `
      -- Una factura ordinaria por reserva, con numeración correlativa por serie y año.
      -- Se guarda una copia de todos los datos para poder regenerar el PDF idéntico.
      CREATE TABLE facturas (
        id serial PRIMARY KEY,
        reserva_id integer NOT NULL REFERENCES reservas(id),
        serie text NOT NULL,
        anio integer NOT NULL,
        numero integer NOT NULL,
        codigo text NOT NULL UNIQUE,
        fecha_emision date NOT NULL,
        fecha_servicio date NOT NULL,
        emisor jsonb NOT NULL,
        cliente jsonb NOT NULL,
        lineas jsonb NOT NULL,
        base_cent integer NOT NULL,
        iva_pct integer NOT NULL,
        iva_cent integer NOT NULL,
        total_cent integer NOT NULL,
        enviada_en timestamptz,
        enviada_a text,
        creado_en timestamptz NOT NULL DEFAULT now(),
        UNIQUE (serie, anio, numero)
      );
      CREATE UNIQUE INDEX facturas_una_por_reserva ON facturas (reserva_id);

      -- Ajustes de la base de datos (p. ej. si es la de producción)
      CREATE TABLE ajustes (
        clave text PRIMARY KEY,
        valor text NOT NULL,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      );

      -- Límites de intentos compartidos entre todas las instancias del servidor
      CREATE TABLE limites (
        clave text NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX limites_clave_idx ON limites (clave, creado_en);

      -- Huella (no la IP) de quien hace una reserva web, para limitar retenciones
      ALTER TABLE reservas ADD COLUMN huella text;
      CREATE INDEX reservas_huella_idx ON reservas (huella) WHERE huella IS NOT NULL;
    `,
  },
  {
    version: 3,
    nombre: 'duraciones con medias horas en las reservas del panel',
    sql: `
      ALTER TABLE reservas ALTER COLUMN duracion_horas TYPE numeric(5,2);
    `,
  },
  {
    version: 4,
    nombre: 'suscripciones: cuotas, sesiones del plan y facturas de cuotas',
    sql: `
      -- Suscripciones (planes mensuales). Las condiciones se copian del plan al dar de alta
      -- y se pueden cambiar (condiciones especiales): cambiar los precios de la web no toca
      -- a quien ya es miembro.
      CREATE TABLE suscripciones (
        id serial PRIMARY KEY,
        codigo text NOT NULL UNIQUE,                         -- 'SUS-XXXXXX'
        plan text NOT NULL CHECK (plan IN ('starter', 'creator', 'pro')),
        nombre text NOT NULL,
        apellidos text NOT NULL DEFAULT '',
        email text NOT NULL CHECK (email <> ''),
        telefono text NOT NULL DEFAULT '',
        factura jsonb,                                       -- {nombre, nif, direccion}; null = no la quiere
        cuota_cent integer NOT NULL CHECK (cuota_cent >= 0),
        horas_periodo numeric(5,2) NOT NULL CHECK (horas_periodo > 0 AND horas_periodo * 4 = trunc(horas_periodo * 4)),
        sesion_min_h numeric(5,2) NOT NULL CHECK (sesion_min_h > 0),
        sesion_max_h numeric(5,2) NOT NULL,
        duraciones_h jsonb CHECK (duraciones_h IS NULL OR jsonb_typeof(duraciones_h) = 'array'),  -- null = cualquiera entre min y max
        max_sesiones integer CHECK (max_sesiones > 0),       -- null = sin límite
        franja_desde text NOT NULL CHECK (franja_desde ~ '^[0-2][0-9]:[0-5][0-9]$'),
        franja_hasta text NOT NULL CHECK (franja_hasta ~ '^[0-2][0-9]:[0-5][0-9]$'),
        antelacion_h integer NOT NULL DEFAULT 72 CHECK (antelacion_h >= 0),
        aviso_cancelacion_h integer NOT NULL DEFAULT 48 CHECK (aviso_cancelacion_h >= 0),
        permanencia_meses integer NOT NULL DEFAULT 3 CHECK (permanencia_meses >= 0),
        renovacion_meses integer NOT NULL DEFAULT 1 CHECK (renovacion_meses >= 1),
        preaviso_dias integer NOT NULL DEFAULT 0 CHECK (preaviso_dias >= 0),
        mes_prueba boolean NOT NULL DEFAULT false,
        fecha_inicio date NOT NULL,                          -- día del primer cobro = ancla de los periodos
        ultimo_dia date,                                     -- último día INCLUIDO; null = sigue
        baja_avisada_en date,
        motivo_baja text,
        fianza_cent integer NOT NULL DEFAULT 10000 CHECK (fianza_cent >= 0),
        fianza_estado text NOT NULL DEFAULT 'pendiente'
          CHECK (fianza_estado IN ('sin_fianza', 'pendiente', 'cobrada', 'devuelta', 'retenida')),
        fianza_metodo text,
        fianza_cobrada_en date,
        fianza_devuelta_cent integer CHECK (fianza_devuelta_cent >= 0),   -- devuelta en parte si < fianza_cent
        fianza_resuelta_en date,
        fianza_nota text,
        metodo_habitual text,                                -- se propone al marcar cuotas
        cobro_externo text CHECK (cobro_externo IN ('stripe', 'comercia')),  -- cobra solo fuera del panel; null = a mano
        cobro_externo_ref text,                              -- p. ej. sub_… de Stripe
        contrato_url text,
        notas_internas text,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK (sesion_max_h >= sesion_min_h),
        CHECK (franja_hasta > franja_desde),
        CHECK (ultimo_dia IS NULL OR ultimo_dia >= fecha_inicio),
        CHECK (cobro_externo_ref IS NULL OR cobro_externo IS NOT NULL),
        CHECK ((fianza_estado IN ('cobrada', 'devuelta', 'retenida')) = (fianza_cobrada_en IS NOT NULL)),
        CHECK ((fianza_estado IN ('devuelta', 'retenida')) = (fianza_resuelta_en IS NOT NULL)),
        CHECK ((fianza_estado = 'devuelta') = (fianza_devuelta_cent IS NOT NULL)),
        CHECK (fianza_devuelta_cent IS NULL OR fianza_devuelta_cent <= fianza_cent)
      );
      CREATE INDEX suscripciones_email_idx ON suscripciones (lower(email));
      CREATE UNIQUE INDEX suscripciones_cobro_externo_idx ON suscripciones (cobro_externo, cobro_externo_ref)
        WHERE cobro_externo_ref IS NOT NULL;

      -- Una cuota por periodo (del día de cobro al mismo día del mes siguiente), con sus
      -- horas y su importe. Se crean según hacen falta.
      CREATE TABLE cuotas (
        id serial PRIMARY KEY,
        suscripcion_id integer NOT NULL REFERENCES suscripciones(id),
        periodo integer NOT NULL CHECK (periodo >= 1),
        desde date NOT NULL,
        hasta date NOT NULL,                                 -- EXCLUIDO: primer día del periodo siguiente
        horas numeric(5,2) NOT NULL CHECK (horas >= 0 AND horas * 4 = trunc(horas * 4)),
        importe_cent integer NOT NULL CHECK (importe_cent >= 0),
        estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'anulada', 'devuelta')),
        metodo_pago text CHECK (metodo_pago IN ('transferencia', 'bizum', 'efectivo', 'tarjeta', 'stripe', 'otro')),
        pagada_en date,
        referencia text,                                     -- texto libre (concepto de la transferencia, in_… …)
        enlace text,                                         -- https: recibo de Stripe, justificante en Drive
        proveedor text,                                      -- solo cobros automáticos: 'stripe', 'comercia'
        proveedor_ref text,                                  -- id del cobro en la pasarela
        nota text,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        UNIQUE (suscripcion_id, periodo),
        CHECK (hasta > desde),
        CHECK ((estado IN ('pagada', 'devuelta')) = (pagada_en IS NOT NULL)),
        CHECK (pagada_en IS NULL OR metodo_pago IS NOT NULL),
        CHECK (proveedor_ref IS NULL OR proveedor IS NOT NULL)
      );
      CREATE INDEX cuotas_pendientes_idx ON cuotas (desde) WHERE estado = 'pendiente';
      CREATE UNIQUE INDEX cuotas_cobro_unico_idx ON cuotas (proveedor, proveedor_ref) WHERE proveedor_ref IS NOT NULL;

      -- Las sesiones del plan son reservas normales (mismos solapes y 30 minutos de margen)
      ALTER TABLE reservas DROP CONSTRAINT reservas_origen_check;
      ALTER TABLE reservas ADD CONSTRAINT reservas_origen_check CHECK (origen IN ('web', 'manual', 'calendly', 'plan'));
      ALTER TABLE reservas ADD COLUMN suscripcion_id integer REFERENCES suscripciones(id);
      ALTER TABLE reservas ADD COLUMN horas_plan numeric(5,2);
      ALTER TABLE reservas ADD COLUMN cuenta_como_usada boolean NOT NULL DEFAULT false;
      ALTER TABLE reservas ADD CONSTRAINT reservas_plan_coherente CHECK (
        (origen = 'plan') = (suscripcion_id IS NOT NULL)
        AND (suscripcion_id IS NULL) = (horas_plan IS NULL)
        AND (horas_plan IS NULL OR (horas_plan >= 0 AND horas_plan <= duracion_horas AND horas_plan * 4 = trunc(horas_plan * 4)))
        AND (NOT cuenta_como_usada OR (suscripcion_id IS NOT NULL AND estado = 'cancelada'))
      );
      CREATE INDEX reservas_suscripcion_idx ON reservas (suscripcion_id, inicio) WHERE suscripcion_id IS NOT NULL;

      -- Facturas de una reserva o de una cuota (misma serie y numeración)
      ALTER TABLE facturas ALTER COLUMN reserva_id DROP NOT NULL;
      ALTER TABLE facturas ADD COLUMN cuota_id integer REFERENCES cuotas(id);
      ALTER TABLE facturas ADD CONSTRAINT facturas_de_reserva_o_cuota CHECK ((reserva_id IS NULL) <> (cuota_id IS NULL));
      CREATE UNIQUE INDEX facturas_una_por_cuota ON facturas (cuota_id) WHERE cuota_id IS NOT NULL;

      -- Historial también de las suscripciones, y quién hizo cada cosa
      ALTER TABLE eventos ADD COLUMN suscripcion_id integer REFERENCES suscripciones(id);
      ALTER TABLE eventos ADD COLUMN autor text;           -- 'panel' | 'web' | 'cliente' | 'sistema'; null = antiguo
      CREATE INDEX eventos_suscripcion_idx ON eventos (suscripcion_id) WHERE suscripcion_id IS NOT NULL;
    `,
  },
  {
    // Cada cuota guarda su plan: si se cambia de plan, las facturas de los meses de antes
    // siguen diciendo el plan que se pagó
    version: 5,
    nombre: 'cuotas: plan de cada periodo',
    sql: `
      ALTER TABLE cuotas ADD COLUMN plan text;
      UPDATE cuotas c SET plan = s.plan FROM suscripciones s WHERE s.id = c.suscripcion_id;
      ALTER TABLE cuotas ALTER COLUMN plan SET NOT NULL;
      ALTER TABLE cuotas ADD CONSTRAINT cuotas_plan_check CHECK (plan IN ('starter', 'creator', 'pro'));
    `,
  },
  {
    // Y las reglas de reserva de ese periodo (horario, duraciones, máximo de sesiones, antelación):
    // si se cambian las condiciones desde un periodo, los de antes siguen con las suyas
    version: 6,
    nombre: 'cuotas: reglas de cada periodo',
    sql: `
      ALTER TABLE cuotas ADD COLUMN reglas jsonb CHECK (reglas IS NULL OR jsonb_typeof(reglas) = 'object');
      UPDATE cuotas c SET reglas = jsonb_build_object(
          'sesionMinH', s.sesion_min_h, 'sesionMaxH', s.sesion_max_h, 'duracionesH', s.duraciones_h,
          'maxSesiones', s.max_sesiones, 'franjaDesde', s.franja_desde, 'franjaHasta', s.franja_hasta,
          'antelacionH', s.antelacion_h)
        FROM suscripciones s WHERE s.id = c.suscripcion_id;
    `,
  },
  {
    // Finanzas: gastos (fijos, variables y material), Calendly de cada mes, otros ingresos y
    // día de devolución de las cuotas. Solo categorías sembradas: nada de importes ni datos
    // personales (el repositorio es público).
    version: 7,
    nombre: 'finanzas: gastos, gastos fijos, Calendly del mes, otros ingresos y devolución de cuotas',
    sql: `
      -- Categorías de gasto, en los tres grupos del estudio. Solo nombres y valores que se proponen
      -- al apuntar (IVA, tipo de factura, retención): nada de importes ni proveedores.
      CREATE TABLE gasto_categorias (
        id serial PRIMARY KEY,
        clave text UNIQUE,                                   -- solo las sembradas; null = creada en el panel
        nombre text NOT NULL CHECK (btrim(nombre) <> '' AND length(nombre) <= 60),
        grupo text NOT NULL CHECK (grupo IN ('fijo', 'variable', 'material')),
        ayuda text CHECK (length(ayuda) <= 300),
        tipo_factura text NOT NULL DEFAULT 'nif' CHECK (tipo_factura IN ('nif', 'ticket', 'sin_iva', 'extranjero')),
        iva_pct integer CHECK (iva_pct IN (4, 10, 21)),
        retencion_pct integer NOT NULL DEFAULT 0 CHECK (retencion_pct IN (0, 7, 15, 19)),
        aviso_cada_meses integer CHECK (aviso_cada_meses IN (1, 2, 3)),   -- avisa si pasan esos meses sin nada; null = no avisa
        orden integer NOT NULL DEFAULT 500,
        activa boolean NOT NULL DEFAULT true,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CHECK ((tipo_factura IN ('nif', 'ticket')) = (iva_pct IS NOT NULL))
      );
      CREATE UNIQUE INDEX gasto_categorias_nombre_idx ON gasto_categorias (lower(btrim(nombre)));

      -- Gastos fijos: la plantilla de lo que se paga cada mes (o cada 2, 3, 6 o 12 meses).
      -- asegurarGastosFijos apunta sola una fila en "gastos" por cada mes que toca.
      CREATE TABLE gastos_fijos (
        id serial PRIMARY KEY,
        categoria_id integer NOT NULL REFERENCES gasto_categorias(id),
        concepto text NOT NULL CHECK (btrim(concepto) <> '' AND length(concepto) <= 120),
        proveedor text NOT NULL DEFAULT '' CHECK (length(proveedor) <= 80),
        importe_es text NOT NULL DEFAULT 'pagado' CHECK (importe_es IN ('pagado', 'base')),  -- cómo se leen sus importes
        tipo_factura text NOT NULL DEFAULT 'nif' CHECK (tipo_factura IN ('nif', 'ticket', 'sin_iva', 'extranjero')),
        iva_pct integer CHECK (iva_pct IN (4, 10, 21)),
        retencion_pct integer NOT NULL DEFAULT 0 CHECK (retencion_pct IN (0, 7, 15, 19)),
        metodo_pago text CHECK (metodo_pago IN ('domiciliacion', 'transferencia', 'tarjeta', 'bizum', 'efectivo', 'otro')),
        cada_meses integer NOT NULL DEFAULT 1 CHECK (cada_meses IN (1, 2, 3, 6, 12)),
        dia integer NOT NULL DEFAULT 1 CHECK (dia BETWEEN 1 AND 31),          -- si el mes es más corto, el último día
        desde_mes date NOT NULL CHECK (extract(day FROM desde_mes) = 1),
        hasta_mes date CHECK (hasta_mes IS NULL OR (extract(day FROM hasta_mes) = 1 AND hasta_mes >= desde_mes)),  -- último mes INCLUIDO
        nota text CHECK (length(nota) <= 500),
        version integer NOT NULL DEFAULT 1,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK ((tipo_factura IN ('nif', 'ticket')) = (iva_pct IS NOT NULL))
      );

      -- Importe de cada fijo por tramos: vale el tramo con el desde_mes más reciente que no pase del mes.
      -- Siempre hay uno en el desde_mes del fijo. El importe se lee según importe_es del fijo.
      CREATE TABLE gastos_fijos_importes (
        fijo_id integer NOT NULL REFERENCES gastos_fijos(id) ON DELETE CASCADE,
        desde_mes date NOT NULL CHECK (extract(day FROM desde_mes) = 1),
        importe_cent integer NOT NULL CHECK (importe_cent > 0 AND importe_cent <= 100000000),
        creado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (fijo_id, desde_mes)
      );

      -- Lo cobrado por Calendly (Stripe) cada mes, copiado del informe de Stripe. Solo las reservas de
      -- Calendly: las cuotas, las horas aparte y las fianzas que cobra Stripe ya están en el panel.
      CREATE TABLE calendly_meses (
        mes date PRIMARY KEY CHECK (extract(day FROM mes) = 1),
        cobrado_cent integer NOT NULL CHECK (cobrado_cent >= 0 AND cobrado_cent <= 100000000),   -- con IVA
        devuelto_cent integer NOT NULL DEFAULT 0 CHECK (devuelto_cent >= 0 AND devuelto_cent <= 100000000),
        enlace text CHECK (enlace IS NULL OR (enlace ~ '^https://' AND length(enlace) <= 500)),
        nota text CHECK (length(nota) <= 500),
        version integer NOT NULL DEFAULT 1,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      );

      -- Otros ingresos que no pasan por el panel: fondos y equipo cobrados el día, facturas hechas a
      -- mano (AR-M) y otros. Importes siempre en positivo; una devolución va con sentido 'devolucion'.
      CREATE TABLE ingresos_manuales (
        id serial PRIMARY KEY,
        tipo text NOT NULL CHECK (tipo IN ('extras', 'factura_manual', 'otro')),
        sentido text NOT NULL DEFAULT 'cobro' CHECK (sentido IN ('cobro', 'devolucion')),
        fecha date NOT NULL,                                 -- día del cobro o de la devolución
        concepto text NOT NULL CHECK (btrim(concepto) <> '' AND length(concepto) <= 160),
        total_cent integer NOT NULL CHECK (total_cent > 0 AND total_cent <= 100000000),   -- con IVA
        iva_pct integer CHECK (iva_pct IN (0, 4, 10, 21)),   -- null = IVA escrito a mano
        iva_cent integer NOT NULL CHECK (iva_cent >= 0 AND iva_cent < total_cent),
        reserva_id integer REFERENCES reservas(id),
        factura_ref text CHECK (length(factura_ref) <= 40),
        cliente_nombre text CHECK (length(cliente_nombre) <= 120),
        cliente_nif text CHECK (length(cliente_nif) <= 20),
        metodo_pago text CHECK (metodo_pago IN ('transferencia', 'bizum', 'efectivo', 'tarjeta', 'stripe', 'otro')),
        enlace text CHECK (enlace IS NULL OR (enlace ~ '^https://' AND length(enlace) <= 500)),
        nota text CHECK (length(nota) <= 500),
        clave text UNIQUE,                                   -- evita apuntarlo dos veces con un doble toque
        version integer NOT NULL DEFAULT 1,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK (iva_pct IS DISTINCT FROM 0 OR iva_cent = 0),
        CHECK (tipo <> 'factura_manual' OR sentido <> 'cobro' OR btrim(coalesce(factura_ref, '')) <> '')
      );
      CREATE INDEX ingresos_manuales_fecha_idx ON ingresos_manuales (fecha);
      CREATE INDEX ingresos_manuales_reserva_idx ON ingresos_manuales (reserva_id) WHERE reserva_id IS NOT NULL;
      CREATE UNIQUE INDEX ingresos_manuales_factura_idx ON ingresos_manuales (upper(btrim(factura_ref)))
        WHERE tipo = 'factura_manual' AND sentido = 'cobro';

      -- Todos los gastos: los apuntados a mano, los de cada mes de un fijo y la comisión de Stripe de
      -- un mes de Calendly. total = lo que se paga al proveedor = base + IVA - retención (exacto).
      CREATE TABLE gastos (
        id serial PRIMARY KEY,
        fecha date NOT NULL,                                 -- de la factura o del cargo
        categoria_id integer NOT NULL REFERENCES gasto_categorias(id),
        concepto text NOT NULL CHECK (btrim(concepto) <> '' AND length(concepto) <= 120),
        proveedor text NOT NULL DEFAULT '' CHECK (length(proveedor) <= 80),
        num_factura text CHECK (length(num_factura) <= 60),
        tipo_factura text NOT NULL DEFAULT 'nif' CHECK (tipo_factura IN ('nif', 'ticket', 'sin_iva', 'extranjero')),
        total_cent integer NOT NULL CHECK (total_cent > 0 AND total_cent <= 100000000),
        base_cent integer NOT NULL CHECK (base_cent > 0),
        iva_pct integer CHECK (iva_pct IN (4, 10, 21)),      -- null = sin IVA o IVA escrito a mano
        iva_cent integer NOT NULL DEFAULT 0 CHECK (iva_cent >= 0),
        retencion_pct integer NOT NULL DEFAULT 0 CHECK (retencion_pct IN (0, 7, 15, 19)),
        retencion_cent integer NOT NULL DEFAULT 0 CHECK (retencion_cent >= 0),
        metodo_pago text CHECK (metodo_pago IN ('domiciliacion', 'transferencia', 'tarjeta', 'bizum', 'efectivo', 'otro')),
        enlace text CHECK (enlace IS NULL OR (enlace ~ '^https://' AND length(enlace) <= 500)),   -- factura en Drive
        nota text CHECK (length(nota) <= 500),
        fijo_id integer REFERENCES gastos_fijos(id) ON DELETE CASCADE,
        mes date,                                            -- solo los fijos: mes al que corresponde (día 1)
        editado boolean NOT NULL DEFAULT false,              -- fijo cambiado a mano ese mes: los cambios de importe no lo pisan
        calendly_mes date UNIQUE REFERENCES calendly_meses(mes) ON DELETE CASCADE,   -- comisión de Stripe de ese mes
        estado text NOT NULL DEFAULT 'apuntado' CHECK (estado IN ('apuntado', 'anulado')),  -- anulado = ese mes no se paga
        clave text UNIQUE,
        version integer NOT NULL DEFAULT 1,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT gastos_un_mes_por_fijo UNIQUE (fijo_id, mes),
        CHECK (base_cent + iva_cent - retencion_cent = total_cent),
        CHECK (retencion_pct > 0 OR retencion_cent = 0),
        CHECK (tipo_factura IN ('nif', 'ticket') OR (iva_cent = 0 AND iva_pct IS NULL)),
        CHECK ((fijo_id IS NULL) = (mes IS NULL)),
        CHECK (mes IS NULL OR (extract(day FROM mes) = 1 AND fecha >= mes AND fecha < (mes + interval '1 month')::date)),
        CHECK (fijo_id IS NULL OR calendly_mes IS NULL),
        CHECK (fijo_id IS NOT NULL OR (estado = 'apuntado' AND NOT editado))
      );
      CREATE INDEX gastos_fecha_idx ON gastos (fecha);
      CREATE INDEX gastos_categoria_idx ON gastos (categoria_id, fecha DESC);

      -- Día en que se devolvió una cuota (la devolución resta ese mes). Las ya devueltas toman la fecha
      -- de Madrid de su evento 'cuota_devuelta' o, si no lo hay, la de su último cambio; nunca antes del pago.
      ALTER TABLE cuotas ADD COLUMN devuelta_en date;
      UPDATE cuotas c SET devuelta_en = greatest(c.pagada_en, coalesce(
          (SELECT max((e.creado_en AT TIME ZONE 'Europe/Madrid')::date) FROM eventos e
            WHERE e.suscripcion_id = c.suscripcion_id AND e.tipo = 'cuota_devuelta'
              AND e.detalle->>'periodo' = c.periodo::text),
          (c.actualizado_en AT TIME ZONE 'Europe/Madrid')::date))
        WHERE c.estado = 'devuelta';
      ALTER TABLE cuotas ADD CONSTRAINT cuotas_devuelta_en_check
        CHECK ((estado = 'devuelta') = (devuelta_en IS NOT NULL) AND (devuelta_en IS NULL OR devuelta_en >= pagada_en));

      -- Para leer rápido los cobros y las devoluciones de un periodo
      CREATE INDEX reservas_pagado_en_idx ON reservas (pagado_en) WHERE pagado_en IS NOT NULL;
      CREATE INDEX reservas_cancelada_en_idx ON reservas (cancelada_en) WHERE reembolso_cent > 0;
      CREATE INDEX cuotas_pagada_en_idx ON cuotas (pagada_en) WHERE pagada_en IS NOT NULL;
      CREATE INDEX cuotas_devuelta_en_idx ON cuotas (devuelta_en) WHERE devuelta_en IS NOT NULL;
      CREATE INDEX facturas_fecha_emision_idx ON facturas (fecha_emision);

      -- Categorías de partida. IVA, tipo de factura y retención son solo lo que se propone:
      -- en cada gasto se pone lo que diga su factura.
      INSERT INTO gasto_categorias (clave, nombre, grupo, ayuda, tipo_factura, iva_pct, retencion_pct, aviso_cada_meses, orden) VALUES
        ('alquiler', 'Alquiler del local', 'fijo', 'Lleva IVA (21 %) si el casero lo factura. Si os aplica retención del 19 % (modelo 115), márcala.', 'nif', 21, 0, NULL, 10),
        ('alarma', 'Alarma', 'fijo', NULL, 'nif', 21, 0, NULL, 20),
        ('internet', 'Internet y teléfono', 'fijo', NULL, 'nif', 21, 0, NULL, 30),
        ('seguro', 'Seguro', 'fijo', 'Los seguros no llevan IVA.', 'sin_iva', NULL, 0, NULL, 40),
        ('gestoria', 'Gestoría', 'fijo', 'Si os factura una persona autónoma (no una empresa), puede llevar una retención del 15 %.', 'nif', 21, 0, NULL, 50),
        ('programas', 'Programas y suscripciones', 'fijo', 'Apps, dominio, web, almacenamiento… Si la empresa es de fuera de España, elige «Empresa de fuera de España».', 'nif', 21, 0, NULL, 70),
        ('luz', 'Luz', 'variable', 'El recibo de la luz es una factura: si lleva el NIF de la titular, su IVA se descuenta.', 'nif', 21, 0, 1, 110),
        ('agua', 'Agua', 'variable', 'El agua lleva un 10 %. Si la factura trae otros conceptos con otro IVA, escribe a mano el IVA total que pone.', 'nif', 10, 0, 2, 120),
        ('aquaservice', 'Aquaservice (agua en garrafas)', 'variable', 'Si la factura mezcla el agua (10 %) y el alquiler del dispensador (21 %), escribe a mano el IVA total que pone.', 'nif', 10, 0, 1, 130),
        ('limpieza', 'Limpieza y productos', 'variable', NULL, 'nif', 21, 0, NULL, 140),
        ('reparaciones', 'Reparaciones y mantenimiento', 'variable', NULL, 'nif', 21, 0, NULL, 150),
        ('comisiones', 'Comisiones del banco y de cobro', 'variable', 'TPV, Stripe y banco. Las del banco no llevan IVA; si la factura es de una empresa de fuera de España, márcalo así.', 'sin_iva', NULL, 0, NULL, 160),
        ('publicidad', 'Publicidad', 'variable', NULL, 'nif', 21, 0, NULL, 170),
        ('otros', 'Otros gastos', 'variable', NULL, 'nif', 21, 0, NULL, 190),
        ('fondos', 'Fondos', 'material', 'Papel, vinilos, telas…', 'nif', 21, 0, NULL, 210),
        ('material', 'Material del estudio', 'material', 'Atrezo, consumibles y cosas pequeñas.', 'nif', 21, 0, NULL, 220),
        ('equipo', 'Equipo (focos, cámaras, trípodes…)', 'material', 'Apúntalo entero el mes en que se paga; la gestoría decide si lo reparte en varios años (amortización).', 'nif', 21, 0, NULL, 230);
    `,
  },
  {
    // Todas las reservas y cuotas cobradas llevan factura: completa (con nombre, NIF y
    // dirección) o simplificada (sin datos del cliente, serie aparte). Si después piden la
    // completa, se emite una que sustituye a la simplificada; esta queda marcada, no se borra.
    version: 8,
    nombre: 'facturas simplificadas y facturas completas que las sustituyen',
    sql: `
      ALTER TABLE facturas ADD COLUMN tipo text NOT NULL DEFAULT 'completa' CHECK (tipo IN ('completa', 'simplificada'));
      -- La completa guarda a cuál sustituye (id para la base y código y fecha para el PDF)
      ALTER TABLE facturas ADD COLUMN sustituye_id integer REFERENCES facturas(id);
      ALTER TABLE facturas ADD COLUMN sustituye jsonb;
      -- La simplificada sustituida guarda cuándo y por cuál
      ALTER TABLE facturas ADD COLUMN sustituida_en timestamptz;
      ALTER TABLE facturas ADD COLUMN sustituida_por text;
      ALTER TABLE facturas ADD CONSTRAINT facturas_sustituye_check
        CHECK ((sustituye_id IS NULL) = (sustituye IS NULL) AND (sustituye_id IS NULL OR tipo = 'completa'));
      ALTER TABLE facturas ADD CONSTRAINT facturas_sustituida_check
        CHECK ((sustituida_en IS NULL) = (sustituida_por IS NULL) AND (sustituida_en IS NULL OR tipo = 'simplificada'));
      CREATE UNIQUE INDEX facturas_sustituye_una_vez ON facturas (sustituye_id) WHERE sustituye_id IS NOT NULL;

      -- Nunca dos facturas vigentes de la misma reserva o cuota
      DROP INDEX facturas_una_por_reserva;
      DROP INDEX facturas_una_por_cuota;
      CREATE UNIQUE INDEX facturas_vigente_por_reserva ON facturas (reserva_id) WHERE reserva_id IS NOT NULL AND sustituida_en IS NULL;
      CREATE UNIQUE INDEX facturas_vigente_por_cuota ON facturas (cuota_id) WHERE cuota_id IS NOT NULL AND sustituida_en IS NULL;

      -- El alquiler del local no lleva retención salvo que el casero la aplique (las bases que
      -- ya tenían la versión 7 la proponían del 19 %)
      UPDATE gasto_categorias
         SET retencion_pct = 0, ayuda = 'Lleva IVA (21 %) si el casero lo factura. Si os aplica retención del 19 % (modelo 115), márcala.'
       WHERE clave = 'alquiler' AND retencion_pct = 19;
    `,
  },
  {
    // Google Calendar: cada reserva confirmada y cada bloqueo se copian al calendario de
    // Google del estudio. Un disparador marca la fila como «pendiente» cuando cambia algo
    // que sale en el evento (y sube gcal_version), así ningún cambio se queda sin pasar
    // aunque una ruta se olvide de avisar. Lo que se borra de verdad (bloqueos) deja una
    // nota en gcal_borrar para quitar su evento.
    version: 9,
    nombre: 'sincronización con Google Calendar',
    sql: `
      ALTER TABLE reservas ADD COLUMN gcal_evento_id text;
      ALTER TABLE reservas ADD COLUMN gcal_estado text NOT NULL DEFAULT 'pendiente' CHECK (gcal_estado IN ('pendiente', 'ok', 'error'));
      ALTER TABLE reservas ADD COLUMN gcal_version integer NOT NULL DEFAULT 0;
      ALTER TABLE reservas ADD COLUMN gcal_intentos integer NOT NULL DEFAULT 0;
      ALTER TABLE reservas ADD COLUMN gcal_error text;
      ALTER TABLE reservas ADD COLUMN gcal_sincronizado_en timestamptz;
      CREATE INDEX reservas_gcal_idx ON reservas (gcal_estado) WHERE gcal_estado <> 'ok';

      ALTER TABLE bloqueos ADD COLUMN gcal_evento_id text;
      ALTER TABLE bloqueos ADD COLUMN gcal_estado text NOT NULL DEFAULT 'pendiente' CHECK (gcal_estado IN ('pendiente', 'ok', 'error'));
      ALTER TABLE bloqueos ADD COLUMN gcal_version integer NOT NULL DEFAULT 0;
      ALTER TABLE bloqueos ADD COLUMN gcal_intentos integer NOT NULL DEFAULT 0;
      ALTER TABLE bloqueos ADD COLUMN gcal_error text;
      ALTER TABLE bloqueos ADD COLUMN gcal_sincronizado_en timestamptz;

      -- Eventos de Google que hay que quitar (de filas borradas o de un calendario anterior)
      CREATE TABLE gcal_borrar (
        id serial PRIMARY KEY,
        evento_id text,
        tipo text,
        ref integer,
        calendario text,
        intentos integer NOT NULL DEFAULT 0,
        creado_en timestamptz NOT NULL DEFAULT now(),
        CHECK (evento_id IS NOT NULL OR (tipo IS NOT NULL AND ref IS NOT NULL))
      );

      CREATE FUNCTION gcal_marcar_reserva() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          NEW.gcal_estado := 'pendiente';
          NEW.gcal_version := 1;
          NEW.gcal_intentos := 0;
        ELSIF ROW(OLD.codigo, OLD.origen, OLD.estado, OLD.pago_estado, OLD.metodo_pago, OLD.inicio, OLD.fin,
                  OLD.duracion_horas, OLD.precio_cent, OLD.nombre, OLD.apellidos, OLD.email, OLD.telefono,
                  OLD.actividad, OLD.fondos, OLD.equipo, OLD.factura, OLD.comentarios, OLD.notas_internas,
                  OLD.reembolso_cent, OLD.suscripcion_id, OLD.horas_plan, OLD.cuenta_como_usada)
              IS DISTINCT FROM
              ROW(NEW.codigo, NEW.origen, NEW.estado, NEW.pago_estado, NEW.metodo_pago, NEW.inicio, NEW.fin,
                  NEW.duracion_horas, NEW.precio_cent, NEW.nombre, NEW.apellidos, NEW.email, NEW.telefono,
                  NEW.actividad, NEW.fondos, NEW.equipo, NEW.factura, NEW.comentarios, NEW.notas_internas,
                  NEW.reembolso_cent, NEW.suscripcion_id, NEW.horas_plan, NEW.cuenta_como_usada) THEN
          NEW.gcal_estado := 'pendiente';
          NEW.gcal_version := OLD.gcal_version + 1;
          NEW.gcal_intentos := 0;
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER reservas_gcal BEFORE INSERT OR UPDATE ON reservas
        FOR EACH ROW EXECUTE FUNCTION gcal_marcar_reserva();

      CREATE FUNCTION gcal_marcar_bloqueo() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          NEW.gcal_estado := 'pendiente';
          NEW.gcal_version := 1;
          NEW.gcal_intentos := 0;
        ELSIF ROW(OLD.inicio, OLD.fin, OLD.motivo) IS DISTINCT FROM ROW(NEW.inicio, NEW.fin, NEW.motivo) THEN
          NEW.gcal_estado := 'pendiente';
          NEW.gcal_version := OLD.gcal_version + 1;
          NEW.gcal_intentos := 0;
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER bloqueos_gcal BEFORE INSERT OR UPDATE ON bloqueos
        FOR EACH ROW EXECUTE FUNCTION gcal_marcar_bloqueo();

      CREATE FUNCTION gcal_bloqueo_borrado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.gcal_evento_id IS NOT NULL OR OLD.gcal_estado <> 'ok' THEN
          INSERT INTO gcal_borrar (evento_id, tipo, ref) VALUES (OLD.gcal_evento_id, 'bloqueo', OLD.id);
        END IF;
        RETURN OLD;
      END
      $$;
      CREATE TRIGGER bloqueos_gcal_borrado AFTER DELETE ON bloqueos
        FOR EACH ROW EXECUTE FUNCTION gcal_bloqueo_borrado();

      -- Lo que ya pasó no se manda a Google al conectar (solo lo de la última semana en adelante)
      UPDATE reservas SET gcal_estado = 'ok' WHERE fin < now() - interval '7 days' OR estado NOT IN ('confirmada', 'conflicto') OR origen = 'calendly';
      UPDATE bloqueos SET gcal_estado = 'ok' WHERE fin < now() - interval '7 days';
    `,
  },
  {
    // Alta de miembros por la web: se paga el primer mes por el TPV, se crea la suscripción
    // y la persona firma su contrato en la web (/contrato/<token>). Las cuotas siguientes se
    // pagan con un enlace que llega por correo al empezar cada periodo.
    version: 10,
    nombre: 'alta de miembros por la web, contratos firmados y pago de cuotas por enlace',
    sql: `
      ALTER TABLE suscripciones ADD COLUMN origen text NOT NULL DEFAULT 'panel' CHECK (origen IN ('panel', 'web'));
      -- true = al empezar cada periodo se le manda por correo un enlace para pagar la cuota por el TPV
      ALTER TABLE suscripciones ADD COLUMN cobro_enlace boolean NOT NULL DEFAULT false;
      -- null = sin contrato en la web (p. ej. firmado en papel); 'pendiente' | 'firmado'
      ALTER TABLE suscripciones ADD COLUMN contrato_estado text CHECK (contrato_estado IN ('pendiente', 'firmado'));

      -- Lo que deja la persona antes de pagar (aún no es miembro)
      CREATE TABLE altas (
        id serial PRIMARY KEY,
        token text NOT NULL UNIQUE,                          -- también es el del contrato
        plan text NOT NULL CHECK (plan IN ('starter', 'creator', 'pro')),
        nombre text NOT NULL,
        apellidos text NOT NULL DEFAULT '',
        email text NOT NULL CHECK (email <> ''),
        telefono text NOT NULL DEFAULT '',
        importe_cent integer NOT NULL CHECK (importe_cent > 0),
        estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'fallida')),
        acepta_en timestamptz NOT NULL,                      -- cuándo marcó «He leído las condiciones…»
        contrato_version text NOT NULL,                      -- versión del modelo que tenía delante
        huella text,                                         -- resumen cifrado de su IP (la IP no se guarda)
        suscripcion_id integer UNIQUE REFERENCES suscripciones(id),
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK ((estado = 'pagada') = (suscripcion_id IS NOT NULL))
      );

      -- Pagos por el TPV del alta o de una cuota (mismo contador de pedidos que las reservas:
      -- el banco no admite dos pedidos con el mismo número)
      CREATE TABLE pagos_suscripcion (
        id serial PRIMARY KEY,
        alta_id integer REFERENCES altas(id),
        cuota_id integer REFERENCES cuotas(id),
        proveedor text NOT NULL,
        pedido text NOT NULL UNIQUE,
        importe_cent integer NOT NULL CHECK (importe_cent > 0),
        estado text NOT NULL DEFAULT 'iniciado' CHECK (estado IN ('iniciado', 'pagado', 'fallido')),
        codigo_respuesta text,
        autorizacion text,
        datos jsonb,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK ((alta_id IS NULL) <> (cuota_id IS NULL))
      );
      CREATE INDEX pagos_suscripcion_alta_idx ON pagos_suscripcion (alta_id) WHERE alta_id IS NOT NULL;
      CREATE INDEX pagos_suscripcion_cuota_idx ON pagos_suscripcion (cuota_id) WHERE cuota_id IS NOT NULL;

      -- Enlace para pagar una cuota por el TPV y cuándo se mandó por correo
      ALTER TABLE cuotas ADD COLUMN pago_token text UNIQUE;
      ALTER TABLE cuotas ADD COLUMN aviso_pago_en timestamptz;

      -- Contrato de cada suscripción, firmado en la web
      CREATE TABLE contratos (
        id serial PRIMARY KEY,
        suscripcion_id integer NOT NULL UNIQUE REFERENCES suscripciones(id),
        token text NOT NULL UNIQUE,
        version text NOT NULL,                               -- versión del texto (CONTRATO_VERSION)
        estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'firmado')),
        datos jsonb,                                         -- {nombre, apellidos, documento, direccion, telefono, email}
        firma_png text,                                      -- la firma dibujada (PNG en base64)
        firmado_en timestamptz,
        huella text,                                         -- resumen cifrado de la IP al firmar
        pdf text,                                            -- el PDF firmado (base64)
        enviado_en timestamptz,                              -- cuándo se mandó el enlace para firmar
        recordado_en timestamptz,                            -- recordatorio a las 48 h
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CHECK ((estado = 'firmado') = (firmado_en IS NOT NULL)),
        CHECK (estado <> 'firmado' OR (datos IS NOT NULL AND firma_png IS NOT NULL AND pdf IS NOT NULL))
      );
      CREATE INDEX contratos_pendientes_idx ON contratos (creado_en) WHERE estado = 'pendiente';
    `,
  },
  {
    version: 11,
    nombre: 'cobro mensual automático con la tarjeta guardada (Redsys COF)',
    sql: `
      -- true = cada cuota se cobra sola en la tarjeta guardada (cobro recurrente de Redsys)
      ALTER TABLE suscripciones ADD COLUMN cobro_auto boolean NOT NULL DEFAULT false;
      -- La tarjeta guardada: la referencia que da Redsys (no es el número de la tarjeta),
      -- el id de la primera operación, los 4 últimos dígitos y la caducidad (AAMM)
      ALTER TABLE suscripciones ADD COLUMN tarjeta_ref text;
      ALTER TABLE suscripciones ADD COLUMN tarjeta_cof_txnid text;
      ALTER TABLE suscripciones ADD COLUMN tarjeta_ultimos text;
      ALTER TABLE suscripciones ADD COLUMN tarjeta_caduca text CHECK (tarjeta_caduca ~ '^[0-9]{4}$');
      ALTER TABLE suscripciones ADD COLUMN tarjeta_proveedor text;
      ALTER TABLE suscripciones ADD COLUMN tarjeta_guardada_en timestamptz;
      ALTER TABLE suscripciones ADD CONSTRAINT cobro_auto_con_tarjeta CHECK (NOT cobro_auto OR tarjeta_ref IS NOT NULL);

      -- Estado del cobro automático de cada cuota:
      --   cobrando  = se está cobrando ahora (nadie más puede cobrarla)
      --   rechazado = el banco la rechazó; se reintenta el día cobro_proximo
      --   agotado   = rechazada en todos los intentos: la paga con el enlace o el estudio a mano
      --   revisar   = no sabemos si se cobró (sin respuesta del banco): mirarlo en el portal del TPV
      ALTER TABLE cuotas ADD COLUMN cobro_estado text CHECK (cobro_estado IN ('cobrando', 'rechazado', 'agotado', 'revisar'));
      ALTER TABLE cuotas ADD COLUMN cobro_intentos integer NOT NULL DEFAULT 0;
      ALTER TABLE cuotas ADD COLUMN cobro_proximo date;
      ALTER TABLE cuotas ADD COLUMN cobro_error text;
      ALTER TABLE cuotas ADD COLUMN cobro_iniciado_en timestamptz;

      -- redireccion = la persona paga en la página del banco; mit = cobro automático del servidor
      ALTER TABLE pagos_suscripcion ADD COLUMN tipo text NOT NULL DEFAULT 'redireccion' CHECK (tipo IN ('redireccion', 'mit'));
      -- true = en este pago se pidió guardar la tarjeta para los cobros siguientes
      ALTER TABLE pagos_suscripcion ADD COLUMN guarda_tarjeta boolean NOT NULL DEFAULT false;
      -- Nunca dos cobros automáticos a la vez (ni uno ya cobrado) de la misma cuota
      CREATE UNIQUE INDEX pagos_mit_uno_idx ON pagos_suscripcion (cuota_id) WHERE tipo = 'mit' AND estado IN ('iniciado', 'pagado');
    `,
  },
  {
    version: 12,
    nombre: 'alta duplicada y plazo de la fianza',
    sql: `
      -- Un alta pagada con el mismo correo que una suscripción activa: no crea otra, queda
      -- «duplicada» (el estudio devuelve el pago) y apunta a la suscripción que ya había
      ALTER TABLE altas DROP CONSTRAINT IF EXISTS altas_estado_check;
      ALTER TABLE altas ADD CONSTRAINT altas_estado_check CHECK (estado IN ('pendiente', 'pagada', 'fallida', 'duplicada'));
      ALTER TABLE altas ADD COLUMN duplicada_de integer REFERENCES suscripciones(id);

      -- Último día para transferir la fianza (7 días desde la firma del contrato)
      ALTER TABLE suscripciones ADD COLUMN fianza_limite date;
    `,
  },
  {
    version: 13,
    nombre: 'Google Calendar: una sola sincronización por fila y cambio de plan',
    sql: `
      -- Quién está pasando la fila a Google ahora mismo (para que dos procesos a la vez no se
      -- pisen y dejen eventos sueltos). Caduca sola al minuto por si un proceso se corta.
      ALTER TABLE reservas ADD COLUMN gcal_tomado_por text;
      ALTER TABLE reservas ADD COLUMN gcal_tomado_en timestamptz;
      ALTER TABLE bloqueos ADD COLUMN gcal_tomado_por text;
      ALTER TABLE bloqueos ADD COLUMN gcal_tomado_en timestamptz;

      -- Cambiar el plan de una suscripción cambia el título de sus sesiones en el calendario
      CREATE FUNCTION gcal_plan_cambiado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.plan IS DISTINCT FROM OLD.plan THEN
          UPDATE reservas SET gcal_estado = 'pendiente', gcal_version = gcal_version + 1, gcal_intentos = 0
           WHERE suscripcion_id = NEW.id AND fin > now();
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER suscripciones_gcal_plan AFTER UPDATE ON suscripciones
        FOR EACH ROW EXECUTE FUNCTION gcal_plan_cambiado();
    `,
  },
  {
    version: 14,
    nombre: 'Clientes: notas del estudio sobre cada cliente',
    sql: `
      -- No hay tabla de clientes: un cliente es el conjunto de sus reservas, juntadas por correo
      -- (o por teléfono si no hay correo). Lo único que se guarda aparte son las notas del estudio,
      -- con esa misma clave ('e:correo' o 't:600123456'; ver lib/reservas/clientes.js).
      CREATE TABLE clientes_notas (
        clave text PRIMARY KEY CHECK (clave ~ '^(e:.+|t:[0-9]{6,9})$'),
        notas text NOT NULL CHECK (length(notas) <= 4000),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      -- Para juntar las reservas de cada cliente sin recorrer toda la tabla
      CREATE INDEX reservas_email_min_idx ON reservas (lower(btrim(email)));
    `,
  },
]
