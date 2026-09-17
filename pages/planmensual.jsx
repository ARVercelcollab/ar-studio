import Head from 'next/head'
import Image from 'next/image'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import ButtonArrow from '../components/button'
import YoutubeCard from '../components/YoutubeCard'
import { PLAZAS_LIBRES, PLAZAS_TOTALES, textoPlazasPlan } from '../lib/plazas'

const WA = 'https://wa.me/34613395533?text='
const wa = (texto) => WA + encodeURIComponent(texto)
const waGeneral = wa('Hola, quiero una plaza del plan mensual')
const waStarter = wa('Hola, quiero reservar la plaza del plan Starter de AR Studio.')
const waCreator = wa('Hola, quiero reservar la plaza del plan Creator de AR Studio.')
const waPro = wa('Hola, quiero reservar la plaza del plan Pro de AR Studio.')

// Sesiones hechas en el estudio (carrusel de fotos)
const FOTOS_SESIONES = [
  { src: '/media/sesion-editorial.jpg', pie: 'Editorial de moda', alt: 'Editorial de moda con modelo, gorra y muestras de tela sobre fondo blanco en AR Studio' },
  { src: '/media/retrato-luz-natural.jpg', pie: 'Retrato con luz natural', alt: 'Retrato premamá con luz natural junto a la ventana de AR Studio' },
  { src: '/media/sesion-corporativa.jpg', pie: 'Fotos corporativas para clientes', alt: 'Retrato corporativo de una profesional sentada bajo el arco del estudio' },
  { src: '/media/col4.jpg', pie: 'Fotografía de producto', alt: 'Fotografía de producto deportivo con modelo en AR Studio' },
  { src: '/media/sesion-beauty.jpg', pie: 'Sesión beauty', alt: 'Sesión de cejas de una profesional beauty en el estudio' },
  { src: '/media/col3.jpg', pie: 'Talleres y eventos', alt: 'Taller de yoga con varias personas en el estudio' },
]

// Publicaciones públicas de @studioar.es que se incrustan al final (prueba viva)
const POSTS_IG = ['DFIH97zIp6u', 'DF2m4ksIvAm', 'DEiIzfGoIfO', 'C92SN_mIcdF', 'DDPtXSHotvd', 'DG3Z8khNTac', 'DDebU-CIxTi']
const HTML_IG = POSTS_IG.map((code) => {
  const url = `https://www.instagram.com/p/${code}/`
  return `<div class="planmensual__ig_item"><blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"><a href="${url}" target="_blank" rel="noopener noreferrer">Ver esta publicación en Instagram</a></blockquote></div>`
}).join('')
// Objeto con identidad fija: si se creara en cada render, React volvería a escribir el HTML y borraría los iframes
const HTML_IG_PROP = { __html: HTML_IG }

// Vídeos grabados en el estudio (YouTube). "inicio" es el segundo en el que arranca.
const VIDEOS_YT = [
  { id: 'oXrZwDEh2Q4', inicio: 0, autor: 'Arianny Rivas', titulo: 'Si quieres modelar para Zara, primero necesitas ver esta clase' },
  { id: 'M5yvR_AKbUo', inicio: 7, autor: 'Arianny Rivas', titulo: 'Errores que te hacen perder un casting (y cómo evitarlos)' },
  { id: 'T2HYZRgie4Q', inicio: 95, autor: 'Carlos Correa', titulo: 'El negocio online nº1 en 2025 (aunque empieces desde cero)' },
  { id: 'pGJ-HgohR-8', inicio: 0, autor: 'Arianny Rivas', titulo: 'Reprogramar tu mente también es parte del modelaje' },
  { id: 'MpedQPQ9k-c', inicio: 6, autor: 'Carlos Correa', titulo: 'Cómo vender (cualquier cosa) con tu marca personal' },
  { id: 'U9Gn1jmGw3A', inicio: 7, autor: 'Arianny Rivas', titulo: 'Tutorial: aprende a posar como una modelo profesional en 5 minutos' },
  { id: 'wLG1lFQOxz0', inicio: 0, autor: 'Arianny Rivas', titulo: 'Ep. 2: Djabu Balde, modelo, actriz, madre y empresaria. ¿Se puede tener todo?' },
  { id: 'VDL-ba8TzuA', inicio: 0, autor: 'Carlos Correa', titulo: 'El error que hará que tu curso online venda 0€' },
]

// Material incluido: 5 categorías, 3 ítems visibles y el resto desplegable
const MATERIAL = [
  { titulo: 'Iluminación', items: ['GODOX MS300 (×2)', 'NANLITE Forza 150W', 'Softbox GODOX (×2)', 'GODOX X2T-S para Sony', 'GODOX X2T-C para Canon', 'Paraguas de luz'] },
  { titulo: 'Vídeo y podcast', items: ['Micrófonos Rode (×2)', 'Teleprompter', 'Trípode para cámara y móvil', 'Grabadora y tarjeta de sonido (×2)', 'Proyector Bluetooth', 'Arco de colores RGB con mando'] },
  { titulo: 'Ciclorama y fondos', items: ['Ciclorama blanco profesional', 'Fondos de color disponibles*', 'Luz natural todo el año'] },
  { titulo: 'Mobiliario y atrezzo', items: ['Mesa blanca larga 220×115 cm', 'Sillones nórdicos (×2)', 'Espejo grande 180×180 cm', 'Mesa blanca pequeña (×2)', 'Sillas plegables (×15)', 'Burro portátil con perchas', 'Plantas reales', 'Silla profesional de maquillador'] },
  { titulo: 'Comodidades', items: ['Aire acondicionado', 'WiFi de alta velocidad', 'Cafetera y agua', 'Plancha a vapor para vestuario', 'Estudio siempre limpio y preparado'] },
]

export default function PlanMensual() {
  const [verTodo, setVerTodo] = useState(false)
  const fotosRef = useRef(null)
  const igRef = useRef(null)
  const ytRef = useRef(null)
  const deslizar = (ref, dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })

  // Si embed.js ya estaba cargado (navegación interna), procesar los embeds al montar
  useEffect(() => {
    if (window.instgrm?.Embeds) window.instgrm.Embeds.process()
  }, [])

  // Botón fijo contextual: oculto en el hero, "Ver planes" hasta llegar a los planes,
  // oculto mientras la franja, los planes o el cierre están en pantalla, "Solicitar plaza" después.
  const [fijo, setFijo] = useState('oculto')
  useEffect(() => {
    const hero = document.querySelector('.planmensual__hero')
    const planes = document.querySelector('.planmensual__planes')
    const cierre = document.querySelector('.planmensual__contacto')
    const banda = document.querySelector('.planmensual__banda')
    if (!hero || !planes || !cierre || !banda || !('IntersectionObserver' in window)) return
    const visible = { hero: true, planes: false, cierre: false, banda: false }
    const aplicar = () => {
      if (visible.hero || visible.planes || visible.cierre || visible.banda) return setFijo('oculto')
      // Se mira en vivo si los planes quedaron arriba, no un valor cacheado
      setFijo(planes.getBoundingClientRect().top < 0 ? 'solicitar' : 'planes')
    }
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.target === hero) visible.hero = e.isIntersecting
        if (e.target === cierre) visible.cierre = e.isIntersecting
        if (e.target === banda) visible.banda = e.isIntersecting
        if (e.target === planes) visible.planes = e.isIntersecting
      }
      aplicar()
    }, { rootMargin: '-15% 0px -15% 0px' })
    io.observe(hero)
    io.observe(planes)
    io.observe(cierre)
    io.observe(banda)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <Head>
        <title>Plan mensual | AR Studio, estudio de fotografía en Valencia</title>
        <meta name="description" content="Crea contenido para tu marca y trabaja con clientes en un estudio profesional de Valencia por 13,90€/hora. Acceso fijo, todo el material incluido, cuota mensual cerrada." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://studioar.es/planmensual" />

        <meta property="og:title" content="Plan mensual | AR Studio" />
        <meta property="og:description" content="Tu estudio fijo en Valencia por una cuota cerrada al mes: luz natural, ciclorama y todo el equipo profesional incluido. Plazas limitadas." />
        <meta property="og:url" content="https://studioar.es/planmensual" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://studioar.es/seo/meta-1200x630.jpg" />
        <meta property="og:site_name" content="AR Studio" />
        <meta property="og:locale" content="es_ES" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Plan mensual | AR Studio" />
        <meta name="twitter:description" content="Tu estudio fijo en Valencia por una cuota cerrada al mes. Todo el equipo incluido. Plazas limitadas." />
        <meta name="twitter:image" content="https://studioar.es/seo/twitter-1200x600.jpg" />

        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <main className="planmensual__master">

        {/* HERO */}
        <section className="planmensual__hero">
          <h1>Crea contenido para tu marca y trabaja con clientes en un espacio profesional <span className="planmensual__acento">por 13,90€/hora.</span></h1>
          <p className="planmensual__sub">Deja de pagar más por horas sueltas. Acceso fijo al estudio, con todo el material profesional incluido, por una cuota mensual cerrada.</p>
          <div className="planmensual__ctas">
            <ButtonArrow texto="VER PLANES" href="#planes" />
          </div>
        </section>

        <div className="planmensual__strip">
          <span>Desde 149€/mes</span>
          <span>Todo el equipo incluido</span>
          <span>Tu hueco fijo semanal</span>
        </div>

        {/* ESPACIO */}
        <section className="planmensual__espacio" id="espacio">
          {/* Foto ancha del estudio montado. Para cambiarla basta con sustituir public/media/espacio-montado.jpg */}
          <Image className="planmensual__foto planmensual__foto--ancha" src="/media/espacio-montado.jpg" alt="El estudio de AR Studio montado: sillones, mesa de madera, plantas y el banco con cojines bajo el arco de luz" loading="lazy" decoding="async" width={1600} height={1067} sizes="(max-width: 1400px) 94vw, 1400px" />
          <div className="planmensual__espacio_content">
            <span className="planmensual__label">El espacio</span>
            <h2>Luz natural.<br />Fondo neutro.<br />Minimalismo.</h2>
            <p>89 m² con luz natural y ciclorama blanco, listos para fotografía, vídeo, contenido de marca personal, podcast y sesiones con clientes.</p>
            <dl className="planmensual__stats">
              <div><dt>89 m²</dt><dd>Superficie</dd></div>
              <div><dt>3,5 m</dt><dd>Altura de techo</dd></div>
              <div><dt>1</dt><dd>Miembro a la vez</dd></div>
              <div><dt>{PLAZAS_TOTALES}</dt><dd>Plazas totales</dd></div>
            </dl>
          </div>
        </section>

        {/* MATERIAL */}
        <section className="planmensual__material">
          <Image className="planmensual__foto planmensual__material_foto" src="/media/col5.jpg" alt="Focos Godox con softbox montados en el estudio" loading="lazy" decoding="async" width={900} height={900} sizes="(max-width: 900px) 100vw, 40vw" />
          <div className="planmensual__material_content">
            <span className="planmensual__label">Incluido en todos los planes</span>
            <h2>Todo el material,<br />sin coste adicional.</h2>
            <p className="planmensual__lead">No alquilas solo un espacio: tienes acceso a todo el equipo profesional, sin coste adicional, en todos los planes.</p>

            <div className={`planmensual__material_grid ${verTodo ? 'abierto' : ''}`}>
              {MATERIAL.map((cat) => (
                <div key={cat.titulo}>
                  <h3>{cat.titulo}</h3>
                  <ul>
                    {(verTodo ? cat.items : cat.items.slice(0, 3)).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="planmensual__material_ctas">
              <ButtonArrow texto="VER PLANES" href="#planes" />
              <button className="planmensual__vertodo" onClick={() => setVerTodo(!verTodo)}>
                {verTodo ? 'Ver menos' : 'Ver todo el material'}
              </button>
            </div>
            <p className="planmensual__nota">*Fondos de color: único coste extra, 20€ + IVA por metro pisado.</p>
          </div>
        </section>

        {/* SESIONES DE FOTOS */}
        <section className="planmensual__fotos">
          <span className="planmensual__label">Fotografías</span>
          <h2>Sesiones de fotos<br />en el estudio.</h2>
          <div className="planmensual__slider planmensual__fotos_grid" ref={fotosRef}>
            {FOTOS_SESIONES.map((f) => (
              <figure key={f.src}>
                <Image className="planmensual__foto planmensual__foto--vertical" src={f.src} alt={f.alt} loading="lazy" decoding="async" width={720} height={900} sizes="(max-width: 700px) 84vw, 330px" />
                <figcaption>{f.pie}</figcaption>
              </figure>
            ))}
          </div>
          <div className="planmensual__slider_nav">
            <button className="planmensual__flecha" aria-label="Anterior" onClick={() => deslizar(fotosRef, -1)}>←</button>
            <button className="planmensual__flecha" aria-label="Siguiente" onClick={() => deslizar(fotosRef, 1)}>→</button>
          </div>
        </section>

        <div className="planmensual__banda">
          <p>Tu hueco fijo cada semana, con todo esto incluido, desde 149€/mes.</p>
          <ButtonArrow texto="VER PLANES" href="#planes" />
        </div>

        {/* INSTAGRAM */}
        <section className="planmensual__ig">
          <span className="planmensual__label">Instagram</span>
          <h2>Lo que pasa<br />en el estudio.</h2>
          {/* embed.js de Instagram reemplaza estos nodos por iframes; se inyectan como HTML
              opaco para que React no intente reconciliarlos (si no, rompe al re-renderizar) */}
          <div className="planmensual__slider planmensual__ig_grid" ref={igRef} dangerouslySetInnerHTML={HTML_IG_PROP} />
          <div className="planmensual__slider_nav">
            <button className="planmensual__flecha" aria-label="Anterior" onClick={() => deslizar(igRef, -1)}>←</button>
            <button className="planmensual__flecha" aria-label="Siguiente" onClick={() => deslizar(igRef, 1)}>→</button>
          </div>
          <Script
            src="https://www.instagram.com/embed.js"
            strategy="lazyOnload"
            onLoad={() => window.instgrm?.Embeds?.process()}
          />
        </section>

        {/* YOUTUBE */}
        <section className="planmensual__yt">
          <span className="planmensual__label">YouTube</span>
          <h2>Grabado<br />en el estudio.</h2>
          <div className="planmensual__slider planmensual__yt_grid" ref={ytRef}>
            {VIDEOS_YT.map((v) => (
              <YoutubeCard key={v.id} {...v} />
            ))}
          </div>
          <div className="planmensual__slider_nav">
            <button className="planmensual__flecha" aria-label="Anterior" onClick={() => deslizar(ytRef, -1)}>←</button>
            <button className="planmensual__flecha" aria-label="Siguiente" onClick={() => deslizar(ytRef, 1)}>→</button>
          </div>
        </section>

        {/* PLANES */}
        <section className="planmensual__planes" id="planes">
          <div className="planmensual__planes_head">
            <span className="planmensual__label">Plan mensual 2026</span>
            <h2>Los tres planes</h2>
            <p>Tres niveles de acceso pensados para distintos ritmos de trabajo. Desde quien produce una vez por semana hasta el profesional que trabaja el estudio cada día.</p>
          </div>

          <div className="planmensual__cards">

            <div className="planmensual__card">
              <h3>Starter</h3>
              <p className="planmensual__card_for">Para empezar a crear contenido con constancia.</p>
              <p className="planmensual__price">149€<small>/mes</small></p>
              <p className="planmensual__hora">8 horas al mes</p>
              <ul>
                <li>1 sesión por semana de 2 horas</li>
                <li>Acceso de 14:00 a 20:00, L–V</li>
                <li>Todo el material profesional incluido</li>
                <li>Reserva con 72h de antelación</li>
              </ul>
              <p className="planmensual__ahorro">A tarifa normal: 392€/mes. <strong>Ahorras 243€ cada mes.</strong></p>
              <ButtonArrow texto="QUIERO STARTER" href={waStarter} />
              <p className="planmensual__plazas">{textoPlazasPlan(PLAZAS_LIBRES.starter)}</p>
            </div>

            <div className="planmensual__card planmensual__card--destacada">
              <span className="planmensual__ribbon">Recomendado</span>
              <h3>Creator</h3>
              <p className="planmensual__card_for">Para quien graba y atiende clientes cada semana.</p>
              <p className="planmensual__price">249€<small>/mes</small></p>
              <p className="planmensual__hora">16 horas al mes · sale a 15,6€/hora</p>
              <ul>
                <li><strong>El doble de horas que Starter por solo 100€ más</strong></li>
                <li>2 sesiones por semana de 2 horas</li>
                <li>Acceso de 14:00 a 20:00, L–V</li>
                <li>Todo el material profesional incluido</li>
                <li>Reserva con solo 48h de antelación</li>
              </ul>
              <p className="planmensual__ahorro">A tarifa normal: 784€/mes. <strong>Ahorras 535€ cada mes.</strong></p>
              <ButtonArrow texto="QUIERO CREATOR" href={waCreator} />
              <p className="planmensual__plazas">{textoPlazasPlan(PLAZAS_LIBRES.creator)}</p>
            </div>

            <div className="planmensual__card">
              <h3>Pro</h3>
              <p className="planmensual__card_for">Para el profesional que vive del estudio y necesita máxima flexibilidad.</p>
              <p className="planmensual__price">499€<small>/mes</small></p>
              <p className="planmensual__hora">36 horas al mes · sale a 13,9€/hora</p>
              <ul>
                <li>3 sesiones por semana de 3 horas</li>
                <li>Acceso completo de 9:00 a 20:00, L–V</li>
                <li>1 sábado al mes incluido</li>
                <li>Reserva con solo 24h de antelación</li>
                <li>Prioridad máxima de reserva</li>
              </ul>
              <p className="planmensual__ahorro">A tarifa normal: más de 1.760€/mes. <strong>Ahorras más de 1.250€.</strong></p>
              <ButtonArrow texto="QUIERO PRO" href={waPro} />
              <p className="planmensual__plazas">{textoPlazasPlan(PLAZAS_LIBRES.pro)}</p>
            </div>

          </div>
        </section>

        {/* COMPARATIVA */}
        <section className="planmensual__compara">
          <span className="planmensual__label">Comparativa</span>
          <h2>Los tres planes,<br />frente a frente</h2>
          <div className="planmensual__tabla_scroll">
            <table className="planmensual__tabla">
              <thead>
                <tr>
                  <th></th>
                  <th>Starter</th>
                  <th className="destacada">Creator</th>
                  <th>Pro</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Precio mensual</td><td>149€</td><td className="destacada">249€</td><td>499€</td></tr>
                <tr><td>Sesiones por semana</td><td>1</td><td className="destacada">2</td><td>3</td></tr>
                <tr><td>Horas por sesión</td><td>2h</td><td className="destacada">2h</td><td>3h</td></tr>
                <tr><td>Horas al mes</td><td>8h</td><td className="destacada">16h</td><td>36h</td></tr>
                <tr><td>Franja horaria</td><td>14–20h</td><td className="destacada">14–20h</td><td>9–20h</td></tr>
                <tr><td>Acceso a mañanas</td><td>No</td><td className="destacada">No</td><td>Sí</td></tr>
                <tr><td>Sábado incluido</td><td>No</td><td className="destacada">No</td><td>1 al mes</td></tr>
                <tr><td>Antelación de reserva</td><td>72h</td><td className="destacada">48h</td><td>24h</td></tr>
                <tr><td>Material incluido</td><td>Todo</td><td className="destacada">Todo</td><td>Todo</td></tr>
                <tr><td>Plazas libres</td><td>{PLAZAS_LIBRES.starter}</td><td className="destacada">{PLAZAS_LIBRES.creator}</td><td>{PLAZAS_LIBRES.pro}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* CIERRE */}
        <section className="planmensual__contacto" id="unirte">
          <h2>Da el paso</h2>
          <p>Escríbenos por WhatsApp indicando qué plan te interesa y te contamos los siguientes pasos para reservar tu plaza.</p>
          <div className="planmensual__cierre_cta">
            <ButtonArrow texto="SOLICITAR PLAZA" href={waGeneral} />
          </div>
        </section>

        {/* CONDICIONES (plegadas, después del cierre) */}
        <section className="planmensual__condiciones">
          <details>
            <summary>Condiciones completas del plan mensual</summary>
            <div className="planmensual__cond_grid">
              <div>
                <h3>Compromiso y pago</h3>
                <ul>
                  <li>Permanencia mínima de 3 meses.</li>
                  <li>Pago mensual. Sin pagos por adelantado de varios meses.</li>
                </ul>
              </div>
              <div>
                <h3>Depósito de garantía</h3>
                <ul>
                  <li>Starter y Creator: 100€. Pro: 150€.</li>
                  <li>Reembolsable al finalizar si el espacio y el equipo quedan en buen estado.</li>
                  <li>La baja antes de los 3 meses implica la pérdida del depósito.</li>
                </ul>
              </div>
              <div>
                <h3>Uso del estudio</h3>
                <ul>
                  <li>Plan personal e intransferible. Puedes traer clientes o modelos a tus sesiones.</li>
                  <li>Solo un miembro usa el estudio a la vez: tu sesión es tuya.</li>
                  <li>Toda sesión se reserva por el sistema con la antelación de tu plan.</li>
                  <li>Cancelación con menos de 24h: la sesión cuenta como usada.</li>
                </ul>
              </div>
              <div className="planmensual__cond_wide">
                <h3>Horas y sesiones</h3>
                <p>Las horas de cada semana <strong>no son acumulables</strong>: si no las usas dentro de la semana, se pierden. Así garantizamos disponibilidad real del estudio para todos los miembros. Con dos excepciones según tu plan:</p>
                <div className="planmensual__excepciones">
                  <div>
                    <h4>Creator</h4>
                    <p>Puedes juntar tus 2 sesiones de la semana en <strong>un solo día</strong>: tus 4 horas semanales en una única sesión de 4h, en lugar de dos sesiones de 2h en días distintos.</p>
                  </div>
                  <div>
                    <h4>Pro</h4>
                    <p>Las horas que no uses durante la semana de tu sábado mensual puedes gastarlas <strong>ese mismo sábado</strong>, con un <strong>mínimo de 4 horas</strong> y un <strong>máximo de 9 horas</strong> en el día (tu asignación semanal completa).</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="planmensual__nota">La franja de mañana (9–14h) es exclusiva del plan Pro. Sábados disponibles a tarifa normal (mínimo 4h), salvo el sábado mensual del plan Pro. Domingos no incluidos.</p>
          </details>
        </section>

      </main>

      {fijo === 'solicitar' ? (
        <a className="planmensual__sticky visible" href={waGeneral} target="_blank" rel="noopener noreferrer">Solicitar plaza</a>
      ) : (
        <a className={`planmensual__sticky ${fijo === 'planes' ? 'visible' : ''}`} href="#planes">Ver planes</a>
      )}
    </>
  )
}
