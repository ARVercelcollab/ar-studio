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
]
