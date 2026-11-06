import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import ButtonArrow from '../components/button'
import YoutubeCard from '../components/YoutubeCard'
import InstagramCard from '../components/InstagramCard'
import { POSTS_IG } from '../lib/instagram'
import { PLAZAS_LIBRES, PLAZAS_TOTALES, textoPlazasPlan } from '../lib/plazas'

const WA = 'https://wa.me/34613395533?text='
const wa = (texto) => WA + encodeURIComponent(texto)
const waGeneral = wa('Hola, quiero una plaza del plan mensual de AR Studio')
const waStarter = wa('Hola, quiero reservar la plaza del plan Starter de AR Studio.')
const waCreator = wa('Hola, quiero reservar la plaza del plan Creator de AR Studio.')
const waPro = wa('Hola, quiero reservar la plaza del plan Pro de AR Studio.')
const waGrabacion = wa('Hola, quiero información sobre la grabación con cámara profesional en AR Studio.')

// Marcas personales en el estudio (carrusel de fotos)
const FOTOS_SESIONES = [
  { src: '/media/sesion-lifestyle.jpg', pie: 'Contenido de marca personal', alt: 'Creadora leyendo una revista en el sillón de bouclé del estudio, con luz natural' },
  { src: '/media/sesion-beauty.jpg', pie: 'Contenido para profesionales beauty', alt: 'Profesional beauty creando contenido en el estudio' },
  { src: '/media/sesion-corporativa.jpg', pie: 'Imagen de marca para profesionales', alt: 'Retrato de una profesional sentada bajo el arco del estudio' },
  { src: '/media/sesion-editorial.jpg', pie: 'Contenido de moda', alt: 'Contenido de moda con gorra y muestras de tela sobre fondo blanco en AR Studio' },
]

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
  { titulo: 'Vídeo y podcast', items: ['Micrófonos Rode (×2)', 'Teleprompter', 'Trípode para cámara y móvil', 'Grabadora y tarjeta de sonido (×2)', 'Proyector Bluetooth', 'Arco de colores RGB con mando'] },
  { titulo: 'Iluminación', items: ['GODOX MS300 (×2)', 'NANLITE Forza 150W', 'Softbox GODOX (×2)', 'GODOX X2T-S para Sony', 'GODOX X2T-C para Canon', 'Paraguas de luz'] },
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

  // Reel que se está reproduciendo (código del post) o null; solo suena uno a la vez
  const [reelActivo, setReelActivo] = useState(null)
  const terminarReel = (code) => setReelActivo((actual) => (actual === code ? null : actual))

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
        <title>Plan mensual para creadores y marcas personales | AR Studio Valencia</title>
        <meta name="description" content="Tu marca personal no se construye en el salón de tu casa. Graba en un estudio profesional de 89 m² en Valencia con luz natural, luces profesionales y todo el material incluido, desde 129€/mes." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://studioar.es/planmensual" />

        <meta property="og:title" content="Tu marca personal no se construye en el salón de tu casa | AR Studio" />
        <meta property="og:description" content="Graba en un estudio profesional de 89 m² con luz natural, luces profesionales y todo el material incluido. Desde 129€/mes." />
        <meta property="og:url" content="https://studioar.es/planmensual" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://studioar.es/seo/meta-1200x630.jpg" />
        <meta property="og:site_name" content="AR Studio" />
        <meta property="og:locale" content="es_ES" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Tu marca personal no se construye en el salón de tu casa | AR Studio" />
        <meta name="twitter:description" content="Graba en un estudio profesional de 89 m² con luz natural y todo el material incluido, desde 129€/mes." />
        <meta name="twitter:image" content="https://studioar.es/seo/twitter-1200x600.jpg" />

        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <main className="planmensual__master">

        {/* HERO */}
        <section className="planmensual__hero">
          <h1>Tu marca personal no se construye <span className="planmensual__acento">en el salón de tu casa.</span></h1>
          <p className="planmensual__sub">Graba en un estudio profesional de 89 m² con luz natural, luces profesionales y todo el material incluido. Con tu móvil o, si quieres, con nuestra cámara profesional.</p>
          <div className="planmensual__ctas">
            <ButtonArrow texto="VER PLANES" href="#planes" />
          </div>
        </section>

        <div className="planmensual__strip">
          <span>Desde 129€/mes</span>
          <span>Todo el equipo incluido</span>
          <span>Sesiones de 4 a 8 horas</span>
        </div>

        {/* ESPACIO */}
        <section className="planmensual__espacio" id="espacio">
          {/* Pareja de fotos cuadradas del estudio. Para cambiarlas basta con sustituir los archivos en public/media */}
          <div className="planmensual__espacio_fotos">
            <Image className="planmensual__foto" src="/media/espacio-arco.jpg" alt="El arco con cojines, la planta y las cortinas con luz natural del estudio de AR Studio" loading="lazy" decoding="async" width={1080} height={1080} sizes="(max-width: 1400px) 47vw, 690px" />
            <Image className="planmensual__foto" src="/media/espacio-sillones.jpg" alt="Dos sillones de bouclé y mesa de madera frente a las cortinas del estudio" loading="lazy" decoding="async" width={1080} height={1080} sizes="(max-width: 1400px) 47vw, 690px" />
          </div>
          <div className="planmensual__espacio_content">
            <span className="planmensual__label">El espacio</span>
            <h2>Luz natural.<br />Fondo neutro.<br />Minimalismo.</h2>
            <p>89 m² con luz natural y ciclorama blanco, listos para grabar vídeos, reels, podcast y todo el contenido de tu marca personal.</p>
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
          <Image className="planmensual__foto planmensual__material_foto" src="/media/material-godox.jpg" alt="Foco Godox con softbox y silla de maquillaje sobre el fondo blanco del estudio" loading="lazy" decoding="async" width={900} height={900} sizes="(max-width: 900px) 100vw, 40vw" />
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

        {/* MARCAS PERSONALES */}
        <section className="planmensual__fotos">
          <span className="planmensual__label">Marca personal</span>
          <h2>Marcas personales<br />en el estudio.</h2>
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
          <p>Tu contenido del mes en una tarde, con todo esto incluido, desde 129€/mes.</p>
          <ButtonArrow texto="VER PLANES" href="#planes" />
        </div>

        {/* INSTAGRAM */}
        <section className="planmensual__ig">
          <span className="planmensual__label">Instagram</span>
          <h2>Lo que pasa<br />en el estudio.</h2>
          {/* Reels alojados en la web: se reproducen en la propia tarjeta al pulsar */}
          <div className="planmensual__slider" ref={igRef}>
            {POSTS_IG.map((p) => (
              <InstagramCard key={p.code} {...p} activo={reelActivo === p.code} onActivar={setReelActivo} onTerminar={terminarReel} />
            ))}
          </div>
          <div className="planmensual__slider_nav">
            <button className="planmensual__flecha" aria-label="Anterior" onClick={() => deslizar(igRef, -1)}>←</button>
            <button className="planmensual__flecha" aria-label="Siguiente" onClick={() => deslizar(igRef, 1)}>→</button>
          </div>
        </section>

        {/* YOUTUBE */}
        <section className="planmensual__yt">
          <span className="planmensual__label">YouTube</span>
          <h2>Grabado<br />en el estudio.</h2>
          <p className="planmensual__yt_prueba">Aquí graban Arianny Rivas, de AR Academy (más de 160.000 seguidores), y Carlos Correa (22.000). Estos vídeos salen de este mismo estudio.</p>
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
            <p>Elige según cuánto contenido grabas. En todos tienes el estudio para ti y todo el material incluido.</p>
          </div>

          <div className="planmensual__cards">

            <div className="planmensual__card">
              <h3>Starter</h3>
              <p className="planmensual__card_for">Para grabar tu contenido del mes en una sola sesión.</p>
              <p className="planmensual__price">129€<small>/mes</small></p>
              <p className="planmensual__hora">4 horas al mes · IVA incluido</p>
              <ul>
                <li>1 sesión de 4 horas al mes</li>
                <li>Acceso de 14:00 a 20:00, L–V</li>
                <li>Todo el material profesional incluido</li>
                <li>Reserva con 72h de antelación</li>
              </ul>
              <p className="planmensual__ahorro">Reservando por horas: 194€/mes. <strong>Ahorras 65€ cada mes.</strong></p>
              <ButtonArrow texto="QUIERO STARTER" href={waStarter} />
              <p className="planmensual__plazas">{textoPlazasPlan(PLAZAS_LIBRES.starter)}</p>
            </div>

            <div className="planmensual__card planmensual__card--destacada">
              <span className="planmensual__ribbon">Recomendado</span>
              <h3>Creator</h3>
              <p className="planmensual__card_for">Para grabar a cualquier hora y aprovechar la luz natural del día.</p>
              <p className="planmensual__price">199€<small>/mes</small></p>
              <p className="planmensual__hora">8 horas al mes · sale a 24,9€/hora · IVA incluido</p>
              <ul>
                <li><strong>Por solo 70€ más que Starter: el doble de horas y las mejores horas de luz natural, de 9:00 a 15:00</strong></li>
                <li>2 sesiones de 4 horas o 1 de 8 horas</li>
                <li>Reserva a cualquier hora, de 9:00 a 20:00, L–V</li>
                <li>Todo el material profesional incluido</li>
                <li>Reserva con 72h de antelación</li>
              </ul>
              <p className="planmensual__ahorro">Reservando por horas: 387€/mes. <strong>Ahorras 188€ cada mes.</strong></p>
              <ButtonArrow texto="QUIERO CREATOR" href={waCreator} />
              <p className="planmensual__plazas">{textoPlazasPlan(PLAZAS_LIBRES.creator)}</p>
            </div>

            <div className="planmensual__card">
              <h3>Pro</h3>
              <p className="planmensual__card_for">Para quien graba cada semana o prefiere jornadas completas.</p>
              <p className="planmensual__price">349€<small>/mes</small></p>
              <p className="planmensual__hora">16 horas al mes · sale a 21,8€/hora · IVA incluido</p>
              <ul>
                <li>Repártelas como quieras: 4 sesiones de 4 horas o 2 jornadas de 8 horas</li>
                <li>Reserva a cualquier hora, de 9:00 a 20:00, L–V</li>
                <li>Todo el material profesional incluido</li>
                <li>Reserva con 72h de antelación</li>
                <li>Prioridad máxima de reserva</li>
              </ul>
              <p className="planmensual__ahorro">Reservando por horas: 774€/mes. <strong>Ahorras 425€ cada mes.</strong></p>
              <ButtonArrow texto="QUIERO PRO" href={waPro} />
              <p className="planmensual__plazas">{textoPlazasPlan(PLAZAS_LIBRES.pro)}</p>
            </div>

          </div>

          <p className="planmensual__compromiso">3 meses de permanencia, porque una marca personal no se construye en uno.</p>

          {/* Extra opcional: grabación con cámara profesional */}
          <div className="planmensual__extra">
            <span className="planmensual__label">Opcional</span>
            <h3>Te grabamos con cámara profesional</h3>
            <p>Añádelo a tu sesión cuando quieras: grabamos tus vídeos y te pasamos todos los archivos por Drive para que los edites.</p>
            <p className="planmensual__extra_precio">50€/hora · mínimo 2 horas · IVA incluido · según disponibilidad</p>
            <ButtonArrow texto="QUIERO QUE ME GRABÉIS" href={waGrabacion} />
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
                <tr><td>Precio mensual (IVA incluido)</td><td>129€</td><td className="destacada">199€</td><td>349€</td></tr>
                <tr><td>Horas al mes</td><td>4h</td><td className="destacada">8h</td><td>16h</td></tr>
                <tr><td>Sesiones al mes</td><td>1</td><td className="destacada">1 o 2</td><td>De 2 a 4</td></tr>
                <tr><td>Duración de la sesión</td><td>4h</td><td className="destacada">4h u 8h</td><td>De 4h a 8h</td></tr>
                <tr><td>Franja horaria</td><td>14–20h</td><td className="destacada">9–20h</td><td>9–20h</td></tr>
                <tr><td>Luz natural de la mañana</td><td>No</td><td className="destacada">Sí</td><td>Sí</td></tr>
                <tr><td>Antelación de reserva</td><td>72h</td><td className="destacada">72h</td><td>72h</td></tr>
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
                  <li>Permanencia mínima de 3 meses, porque una marca personal no se construye en uno.</li>
                  <li>Pago mensual. Sin pagos por adelantado de varios meses.</li>
                </ul>
              </div>
              <div>
                <h3>Depósito de garantía</h3>
                <ul>
                  <li>100€ en todos los planes.</li>
                  <li>Reembolsable al finalizar si el espacio y el equipo quedan en buen estado.</li>
                  <li>La baja antes de los 3 meses implica la pérdida del depósito.</li>
                </ul>
              </div>
              <div>
                <h3>Uso del estudio</h3>
                <ul>
                  <li>Plan personal e intransferible. Puedes traer a tu equipo o a quien participe en tu contenido.</li>
                  <li>Solo un miembro usa el estudio a la vez: tu sesión es tuya.</li>
                  <li>Toda sesión se reserva por el sistema con al menos 72h de antelación.</li>
                  <li>Cancelación con menos de 48h: la sesión cuenta como usada.</li>
                </ul>
              </div>
              <div className="planmensual__cond_wide">
                <h3>Horas y sesiones</h3>
                <p>Las horas son de cada mes: <strong>si no las usas dentro del mes, se pierden</strong>. Así garantizamos disponibilidad real del estudio para todos los miembros. Según tu plan:</p>
                <div className="planmensual__excepciones">
                  <div>
                    <h4>Creator</h4>
                    <p>Puedes juntar tus 2 sesiones en <strong>un solo día</strong>: una única sesión de 8 horas en lugar de dos de 4 horas.</p>
                  </div>
                  <div>
                    <h4>Pro</h4>
                    <p>Reparte tus 16 horas como quieras, con un <strong>mínimo de 4 horas</strong> y un <strong>máximo de 8 horas</strong> por sesión.</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="planmensual__nota">Starter: de 14:00 a 20:00. Creator y Pro: de 9:00 a 20:00. Sábados y domingos no incluidos en ningún plan.</p>
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
