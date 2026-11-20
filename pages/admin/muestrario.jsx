// Muestrario de las piezas del panel nuevo (components/admin/ui), con datos inventados.
// Sirve para ver el armazón y cada pieza sin datos reales. En local se abre sin entrar;
// en Vercel pide la sesión del panel como cualquier otra pantalla.
import { useState } from 'react'
import Panel from '../../components/admin/Panel'
import {
  Tarjeta, Rejilla, Seccion, Cifra, Totales, Boton, BotonIcono, EnlaceFlecha, Conmutador, SelectorFlechas,
  Buscador, BarraFiltros, Campo, Chips, Chip, Tabla, Celda, Ficha, FichaBloque, FichaAcciones, Datos,
  Etiqueta, Punto, Contacto, Vacio, Aviso, NOMBRES_ICONOS, Icono,
} from '../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'

const FILAS = [
  { id: 1, fecha: '19 nov', concepto: 'Cuota Starter · mes 1', quien: 'Persona de ejemplo', cat: 'Cuotas de miembros', color: 'var(--g-teal)', factura: 'AR-S-2026-030', importe: '+129,00 €', entra: true },
  { id: 2, fecha: '15 nov', concepto: 'Aquaservice', quien: 'Proveedor de ejemplo', cat: 'Alarma y Aquaservice', color: 'var(--g-azul)', factura: null, importe: '−32,00 €', entra: false },
  { id: 3, fecha: '14 nov', concepto: 'Reserva: 2 h el 24 nov', quien: 'Cliente de ejemplo', cat: 'Reservas por horas', color: 'var(--g-ingresos)', factura: 'AR-W-2026-004', importe: '+96,80 €', entra: true },
]

export default function Muestrario() {
  const [vista, setVista] = useState('lista')
  const [q, setQ] = useState('')
  const [ficha, setFicha] = useState(null)
  return (
    <Panel titulo="Muestrario" sub="Las piezas del panel nuevo, con datos inventados." acciones={<><Boton variante="secundario" icono="bajar">Exportar CSV</Boton><Boton icono="mas">Añadir</Boton></>}>
      <Aviso tono="info" titulo="Solo para el equipo.">Esta pantalla no sale en el menú: enseña cómo se ven las piezas.</Aviso>

      <Rejilla columnas="cifras">
        <Cifra nombre="Ingresos" valor="5.633 €" importe delta={{ texto: '2.643 € más que a estas alturas de octubre', tono: 'bien', direccion: 'sube' }} />
        <Cifra nombre="Gastos" valor="871 €" importe delta={{ texto: '91 € menos que a estas alturas de octubre', tono: 'bien', direccion: 'baja' }} />
        <Cifra nombre="Beneficio" valor="+4.762 €" importe destacada delta={{ texto: '2.734 € mejor que a estas alturas de octubre', tono: 'bien', direccion: 'sube' }} />
        <Cifra nombre="Horas reservadas" valor="109 h" sufijo="· 42 % ocupado" href="/admin/reservas" />
      </Rejilla>

      <Seccion titulo="Pendiente ahora" derecha="A día de hoy">
        <Rejilla columnas={3}>
          <Tarjeta titulo="Hoy en el estudio" nota="Viernes 20 de noviembre" pie={<EnlaceFlecha href="/admin/reservas">Ver las reservas</EnlaceFlecha>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>09:30 Persona de ejemplo</b><br /><span className="ui-t3">4 h · sesión del plan</span></div>
              <Contacto telefono="600000000" nombre="Persona de ejemplo" />
            </div>
          </Tarjeta>
          <Tarjeta tono="aviso" titulo="Por cobrar" nota="2 cobros sin hacer">
            <Etiqueta tono="mal">No puede usar el estudio</Etiqueta>
          </Tarjeta>
          <Tarjeta titulo="Vacía">
            <Vacio compacto icono="ok" tono="bien" texto="Nada pendiente." />
          </Tarjeta>
        </Rejilla>
      </Seccion>

      <Seccion titulo="Filtros y tabla">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Conmutador valor={vista} onCambio={setVista} opciones={[{ valor: 'calendario', texto: 'Calendario', icono: 'cal' }, { valor: 'lista', texto: 'Lista', icono: 'lista' }, { valor: 'clientes', texto: 'Clientes', icono: 'persona' }]} />
          <SelectorFlechas texto="Noviembre 2026" anterior={() => {}} siguiente={null} etiqueta="Mes" />
          <SelectorFlechas texto="4.º trimestre 2026" sub="oct – dic" anterior={() => {}} siguiente={() => {}} etiqueta="Trimestre" />
        </div>
        <Buscador valor={q} onCambio={setQ} placeholder="Buscar: Aquaservice, Laura, AR-W-2026-004, 96,80…" />
        <BarraFiltros columnas={3}>
          <Campo etiqueta="Mes"><select className="ui-control" defaultValue="11"><option value="11">Noviembre 2026</option></select></Campo>
          <Campo etiqueta="Tipo"><select className="ui-control" defaultValue=""><option value="">Todo</option></select></Campo>
          <Campo etiqueta="Factura"><select className="ui-control" defaultValue=""><option value="">Con y sin factura</option></select></Campo>
        </BarraFiltros>
        <Chips><Chip onQuitar={() => {}}>Noviembre 2026</Chip><Chip>Sin quitar</Chip></Chips>
        <Totales items={[{ nombre: 'Movimientos', valor: '44' }, { nombre: 'Entra', valor: '6.815,38 €', tono: 'bien', importe: true }, { nombre: 'Sale', valor: '1.044,48 €', importe: true }, { nombre: 'Diferencia', valor: '+5.770,90 €', tono: 'bien', importe: true }]} />
        <Tabla lista titulo="Movimientos de ejemplo" columnas={[{ texto: 'Fecha' }, { texto: 'Concepto' }, { texto: 'Categoría' }, { texto: 'Factura' }, { texto: 'Importe', der: true }]}>
          {FILAS.map((f) => (
            <tr key={f.id} className="ui-fila" onClick={() => setFicha(f)}>
              <td className="m-fecha">{f.fecha}</td>
              <td className="m-principal"><Celda principal={f.concepto} sub={f.quien} /></td>
              <td className="m-fila"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Punto color={f.color} />{f.cat}</span></td>
              <td className="m-fila">{f.factura ? <Etiqueta tono="borde">{f.factura}</Etiqueta> : <Etiqueta tono="aviso">Sin factura</Etiqueta>}</td>
              <td className={`der m-derecha ui-num ui-imp${f.entra ? ' ui-bien' : ''}`}>{f.importe}</td>
            </tr>
          ))}
        </Tabla>
      </Seccion>

      <Seccion titulo="Etiquetas, botones e iconos">
        <Tarjeta>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Etiqueta tono="bien" punto>Pagada</Etiqueta><Etiqueta tono="mal" punto>Rechazada</Etiqueta><Etiqueta tono="aviso" punto>Sin firmar</Etiqueta>
            <Etiqueta tono="marron">Miembro</Etiqueta><Etiqueta tono="borde">AR-S-2026-001</Etiqueta><Etiqueta tono="info">Calendly</Etiqueta><Etiqueta>Repite</Etiqueta>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <Boton icono="mas">Principal</Boton><Boton variante="secundario">Secundario</Boton><Boton variante="texto">Texto</Boton>
            <Boton variante="peligro">Cancelar reserva</Boton><Boton tam="peq" variante="secundario">Pequeño</Boton><Boton disabled>Desactivado</Boton>
            <BotonIcono icono="x" etiqueta="Cerrar" /><Contacto telefono="600000000" email="ejemplo@ejemplo.es" nombre="Ejemplo" conCorreo />
          </div>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, color: 'var(--marron)' }}>
            {NOMBRES_ICONOS.map((n) => <span key={n} title={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--texto-3)' }}><Icono nombre={n} />{n}</span>)}
          </p>
        </Tarjeta>
        <div style={{ marginTop: 14 }}>
          <Aviso tono="aviso" titulo="Es una cuenta orientativa.">Sirve para saber cuánto conviene apartar.</Aviso>
          <Aviso tono="mal" titulo="Cuota sin pagar:">no puede usar el estudio hasta pagarla.</Aviso>
          <Aviso tono="marron">En noviembre, de momento, han entrado 5.633 € y han salido 871 €.</Aviso>
        </div>
        <Tarjeta tabla titulo="Tarjeta con tabla" nota="Sin márgenes dentro"><Vacio texto="No hay nada en esta vista." accion={<Boton variante="secundario" tam="peq">Quitar filtros</Boton>} /></Tarjeta>
      </Seccion>

      <Ficha abierta={!!ficha} titulo={ficha?.concepto} sub={ficha ? `${ficha.fecha} · ${ficha.quien}` : ''} onCerrar={() => setFicha(null)}>
        <FichaBloque titulo="Datos">
          <Datos filas={[['Categoría', ficha?.cat], ['Factura', ficha?.factura || 'Sin factura'], ['Importe', ficha?.importe]]} />
          <FichaAcciones><Boton tam="peq">Editar</Boton><Boton tam="peq" variante="secundario">Reenviar factura</Boton></FichaAcciones>
        </FichaBloque>
        <FichaBloque titulo="Historial"><p className="ui-t3">Apuntado el 19 nov.</p></FichaBloque>
      </Ficha>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  if (process.env.NODE_ENV === 'production') {
    const redir = redirigirSiNoAdmin(ctx)
    if (redir) return redir
  }
  return { props: {} }
}
