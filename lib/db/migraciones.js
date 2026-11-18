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
]
