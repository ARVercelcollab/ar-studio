// Cambiar un gasto (o el mes de un gasto fijo)
import Link from 'next/link'
import { useRouter } from 'next/router'
import Panel from '../../../../components/admin/Panel'
import { SubmenuFinanzas, FormularioGasto, useAccion, Mensaje } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { fichaGasto, datosFormularioGasto, listarCategorias } from '../../../../lib/finanzas/servicio'
import { textoMes, euros } from '../../../../lib/finanzas/calculos'
import { fechaMadrid } from '../../../../lib/reservas/tiempo'

const aTexto = (cent) => (cent === null || cent === undefined ? '' : (cent / 100).toFixed(2).replace('.', ','))

export default function FichaGasto({ ficha, datos, hoy }) {
  const router = useRouter()
  const g = ficha.gasto
  const [estado, ejecutar] = useAccion()
  const url = `/api/admin/finanzas/gastos/${g.id}`
  const volver = `/admin/finanzas/gastos?p=${(g.mes || g.fecha).slice(0, 7)}`
  const inicial = {
    categoriaId: g.categoriaId, importeEs: 'pagado', importe: aTexto(g.totalCent), fecha: g.fecha, concepto: g.concepto, proveedor: g.proveedor,
    numFactura: g.numFactura, tipoFactura: g.tipoFactura, ivaPct: g.ivaPct ?? (['nif', 'ticket'].includes(g.tipoFactura) ? 'mano' : 21),
    iva: g.ivaPct ? '' : aTexto(g.ivaCent), retencionPct: g.retencionPct, metodoPago: g.metodoPago || '', enlace: g.enlace || '', nota: g.nota,
  }
  const titulo = g.fijoId ? `${g.concepto} · ${textoMes(g.mes.slice(0, 7))} (gasto fijo)` : 'Cambiar gasto'
  return (
    <Panel titulo={titulo} acciones={<Link href={volver} className="adm-boton adm-boton--claro">← Gastos</Link>}>
      <SubmenuFinanzas />
      {ficha.trimestrePasado && <div className="adm-avisos">Es de un trimestre ya pasado: si la gestoría ya lo presentó, avisadla del cambio.</div>}
      {ficha.esComisionCalendly ? (
        <div className="adm-caja">
          <p>Son las comisiones de Stripe de {textoMes(g.calendlyMes.slice(0, 7))} ({euros(g.totalCent, { decimales: true })}): se cambian en Facturación → <Link href={`/admin/finanzas/calendly?mes=${g.calendlyMes.slice(0, 7)}`} className="adm-enlace">Calendly</Link>.</p>
        </div>
      ) : g.estado === 'anulado' ? (
        <div className="adm-caja">
          <p>Este mes no se paga.</p>
          <Mensaje estado={estado} />
          <p style={{ marginTop: 10 }}><button type="button" className="adm-boton" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'recuperar_mes', version: g.version })}>Volver a contarlo</button></p>
        </div>
      ) : (
        <>
          <FormularioGasto key={`${g.id}-${g.version}`} datos={datos} hoy={hoy} inicial={inicial} gasto={g} fijo={ficha.fijo} volver={volver} />
          <div className="adm-caja">
            <Mensaje estado={estado} />
            <div className="adm-acciones">
              {g.fijoId ? (
                <>
                  <button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'anular_mes', version: g.version })}>Este mes no se paga</button>
                  {g.editado && <button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'como_el_fijo', version: g.version })}>Volver al importe del gasto fijo</button>}
                </>
              ) : (
                <button type="button" className="adm-boton adm-boton--peligro" disabled={estado.enviando} onClick={() => {
                  if (window.confirm('¿Borrar este gasto?')) ejecutar(url, { accion: 'borrar', version: g.version }, { despues: () => router.push(`${volver}&ok=borrado`) })
                }}>Borrar gasto</button>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  if (!/^\d+$/.test(String(ctx.params.id))) return { notFound: true }
  const hoy = fechaMadrid(new Date())
  let ficha
  try {
    ficha = await fichaGasto(ctx.params.id, { hoy })
  } catch (e) {
    if (e.estadoHttp === 404) return { notFound: true }
    throw e
  }
  const datos = await datosFormularioGasto()
  // Si su categoría está oculta, se enseña igualmente para poder corregir el gasto
  if (!datos.categorias.some((c) => c.id === ficha.gasto.categoriaId)) {
    const todas = await listarCategorias({ todas: true })
    const c = todas.find((x) => x.id === ficha.gasto.categoriaId)
    if (c) datos.categorias = [...datos.categorias, c]
  }
  return { props: JSON.parse(JSON.stringify({ ficha, datos, hoy })) }
}
