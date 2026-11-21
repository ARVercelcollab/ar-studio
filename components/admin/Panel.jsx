// Armazón del panel del estudio: menú lateral beige (ordenador), cabecera y barra inferior (móvil),
// «Ocultar importes» para todo el panel y la cabecera de cada pantalla (título, subtítulo y acciones).
//   <Panel titulo="Movimientos" sub="Todo lo que entra y sale, apunte a apunte." acciones={<Boton …/>}>…</Panel>
// ocultoInicial: lo que diga la cookie adm_ocultar en getServerSideProps (ocultoEnCookie), para que no
// parpadeen las cifras al cargar. Sin él, se lee la cookie en el navegador.
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icono from './ui/Icono'
import Logo from './ui/Logo'
import { ImportesOcultos, ControlImportes, COOKIE_OCULTAR } from './ui/Importes'

// [ruta, texto, icono, clave del contador]
export const MENU = [
  ['/admin', 'Inicio', 'casa'],
  ['/admin/reservas', 'Reservas', 'cal', 'reservasHoy'],
  ['/admin/miembros', 'Miembros', 'gente', 'miembros'],
  ['/admin/movimientos', 'Movimientos', 'movs'],
  ['/admin/mes-a-mes', 'Mes a mes', 'meses'],
  ['/admin/impuestos', 'Impuestos', 'pct'],
  ['/admin/ajustes', 'Ajustes', 'ajustes'],
]
const EN_BARRA = ['/admin', '/admin/reservas', '/admin/miembros']

export function rutaActiva(href, pathname) {
  if (href === '/admin') return pathname === '/admin'
  if (href === '/admin/reservas') return pathname.startsWith('/admin/reservas') || pathname.startsWith('/admin/reserva/') || pathname === '/admin/nueva'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Contadores del menú: se guardan entre pantallas para que no parpadeen al navegar
let contadoresGuardados = null

function useContadores() {
  const [c, setC] = useState(contadoresGuardados)
  useEffect(() => {
    let vivo = true
    fetch('/api/admin/contadores', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        contadoresGuardados = d
        setC(d)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])
  return c || {}
}

function textoContador(clave, n) {
  if (!n) return null
  if (clave === 'reservasHoy') return `${n} hoy`
  return String(n)
}

function Contador({ clave, valor }) {
  const t = textoContador(clave, valor)
  if (!t) return null
  return <span className={`adm-menu__contador${clave === 'miembros' ? ' es-aviso' : ''}`}>{t}</span>
}

function leerCookieOculto() {
  if (typeof document === 'undefined') return false
  return new RegExp(`(?:^|;\\s*)${COOKIE_OCULTAR}=1(?:;|$)`).test(document.cookie)
}

function HojaMas({ pathname, oculto, alternar, onCerrar }) {
  const caja = useRef(null)
  useEffect(() => {
    const antes = document.activeElement
    document.documentElement.classList.add('adm-con-capa')
    caja.current?.querySelector('a, button')?.focus()
    const tecla = (e) => {
      if (e.key === 'Escape') onCerrar()
      if (e.key !== 'Tab' || !caja.current) return
      const f = [...caja.current.querySelectorAll('a, button')]
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.documentElement.classList.remove('adm-con-capa')
      if (antes && antes.isConnected && antes.focus) antes.focus()
    }
  }, [onCerrar])
  return (
    <>
      <div className="ui-capa-fondo" onClick={onCerrar} aria-hidden="true" />
      <div ref={caja} className="adm-hoja" role="dialog" aria-modal="true" aria-label="Más secciones">
        <div className="adm-hoja__asa" aria-hidden="true" />
        {MENU.filter(([href]) => !EN_BARRA.includes(href)).map(([href, texto, icono]) => (
          <Link key={href} href={href} onClick={onCerrar} aria-current={rutaActiva(href, pathname) ? 'page' : undefined}>
            <Icono nombre={icono} />{texto}
          </Link>
        ))}
        <button type="button" onClick={() => { alternar(); onCerrar() }}>
          <Icono nombre={oculto ? 'ojoNo' : 'ojo'} />{oculto ? 'Enseñar importes' : 'Ocultar importes'}
        </button>
        <form method="POST" action="/api/admin/logout">
          <button type="submit"><Icono nombre="salir" />Salir del panel</button>
        </form>
      </div>
    </>
  )
}

// clase: una clase más en la raíz, para que una página ajuste solo su propio diseño
// sinCabecera: la pantalla pinta su propia cabecera (título y acciones)
export default function Panel({ titulo, sub, children, acciones, clase, ocultoInicial, sinCabecera = false }) {
  const { pathname } = useRouter()
  const contadores = useContadores()
  const [oculto, setOculto] = useState(Boolean(ocultoInicial))
  const [mas, setMas] = useState(false)

  useEffect(() => {
    if (ocultoInicial === undefined) setOculto(leerCookieOculto())
  }, [ocultoInicial])

  const alternar = useCallback(() => {
    setOculto((antes) => {
      const nuevo = !antes
      document.cookie = `${COOKIE_OCULTAR}=${nuevo ? '1' : '0'}; path=/admin; max-age=31536000; samesite=lax`
      return nuevo
    })
  }, [])
  const control = useMemo(() => ({ oculto, alternar }), [oculto, alternar])
  const cerrarMas = useCallback(() => setMas(false), [])
  const masActivo = MENU.some(([href]) => !EN_BARRA.includes(href) && rutaActiva(href, pathname))

  const ojo = (cl) => (
    <button type="button" className={cl} onClick={alternar} aria-pressed={oculto} aria-label={oculto ? 'Enseñar importes' : 'Ocultar importes'} title={oculto ? 'Enseñar importes' : 'Ocultar importes'}>
      <Icono nombre={oculto ? 'ojoNo' : 'ojo'} />
    </button>
  )

  return (
    <>
      <Head>
        <title>{`${titulo} · AR Studio`}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>
      <ControlImportes.Provider value={control}>
        <ImportesOcultos.Provider value={oculto}>
          <div className={['adm', 'adm-app', oculto ? 'is-ocultos' : '', clase].filter(Boolean).join(' ')}>
            <a href="#contenido" className="adm-saltar">Saltar al contenido</a>

            {/* Ordenador: menú lateral */}
            <aside className="adm-lateral" aria-label="Menú del panel">
              <Link href="/admin" className="adm-lateral__marca" aria-label="AR Studio · Inicio del panel">
                <Logo ancho={132} />
              </Link>
              <Link href="/admin/anadir" className="adm-lateral__anadir" aria-current={pathname === '/admin/anadir' ? 'page' : undefined}>
                <Icono nombre="mas" />Añadir
              </Link>
              <nav className="adm-menu" aria-label="Secciones">
                {MENU.map(([href, texto, icono, clave]) => (
                  <Link key={href} href={href} aria-current={rutaActiva(href, pathname) ? 'page' : undefined}>
                    <Icono nombre={icono} /><span>{texto}</span>
                    {clave && <Contador clave={clave} valor={contadores[clave]} />}
                  </Link>
                ))}
              </nav>
              <div className="adm-lateral__pie">
                <div className="adm-perfil">
                  <span className="adm-perfil__avatar" aria-hidden="true">AR</span>
                  <span className="adm-perfil__texto"><b>Estudio</b><span>Lo ve todo</span></span>
                  {ojo('adm-boton-ojo')}
                  <form method="POST" action="/api/admin/logout">
                    <button type="submit" className="adm-boton-ojo" aria-label="Salir del panel" title="Salir del panel"><Icono nombre="salir" /></button>
                  </form>
                </div>
              </div>
            </aside>

            {/* Móvil: cabecera */}
            <header className="adm-cab-movil">
              <Link href="/admin" className="adm-cab-movil__marca" aria-label="AR Studio · Inicio del panel"><Logo ancho={104} /></Link>
              {ojo('adm-boton-ojo')}
            </header>

            <main id="contenido" className="adm__cuerpo adm-contenido">
              {!sinCabecera && (
                <div className="adm__cabecera">
                  <div className="adm__titulos">
                    <h1>{titulo}</h1>
                    {sub && <p>{sub}</p>}
                  </div>
                  {acciones && <div className="adm__acciones">{acciones}</div>}
                </div>
              )}
              {children}
            </main>

            {/* Móvil: barra inferior */}
            <nav className="adm-barra-inf" aria-label="Menú del móvil">
              <Link href="/admin" aria-current={rutaActiva('/admin', pathname) ? 'page' : undefined}><Icono nombre="casa" />Inicio</Link>
              <Link href="/admin/reservas" aria-current={rutaActiva('/admin/reservas', pathname) ? 'page' : undefined}><Icono nombre="cal" />Reservas</Link>
              <Link href="/admin/anadir" className="adm-barra-inf__anadir" aria-current={pathname === '/admin/anadir' ? 'page' : undefined}>
                <span className="adm-barra-inf__circulo"><Icono nombre="mas" /></span>Añadir
              </Link>
              <Link href="/admin/miembros" aria-current={rutaActiva('/admin/miembros', pathname) ? 'page' : undefined}>
                <Icono nombre="gente" />Miembros
                {contadores.miembros > 0 && <span className="adm-barra-inf__punto" aria-label={`${contadores.miembros} por resolver`} />}
              </Link>
              <button type="button" onClick={() => setMas(true)} aria-haspopup="dialog" aria-expanded={mas} aria-current={masActivo ? 'page' : undefined}>
                <Icono nombre="menu" />Más
              </button>
            </nav>
            {mas && <HojaMas pathname={pathname} oculto={oculto} alternar={alternar} onCerrar={cerrarMas} />}
          </div>
        </ImportesOcultos.Provider>
      </ControlImportes.Provider>
    </>
  )
}
