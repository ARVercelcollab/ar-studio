import Head from 'next/head'
import Image from 'next/image'
import ButtonArrow from '../components/button'
import { plazasDelMes, textoPlazas } from '../lib/plazas'

const WA = 'https://wa.me/34613395533?text='
const waGeneral = WA + encodeURIComponent('Hola, me interesa el plan mensual de AR Studio. ¿Me contáis los siguientes pasos?')
const waStarter = WA + encodeURIComponent('Hola, me interesa el plan STARTER de AR Studio. ¿Me contáis los siguientes pasos?')
const waCreator = WA + encodeURIComponent('Hola, me interesa el plan CREATOR de AR Studio. ¿Me contáis los siguientes pasos para reservar mi plaza?')
const waPro = WA + encodeURIComponent('Hola, me interesa el plan PRO de AR Studio. ¿Me contáis los siguientes pasos?')
const mailto = 'mailto:arstudiospain@gmail.com?subject=' + encodeURIComponent('Plan mensual AR Studio') + '&body=' + encodeURIComponent('Hola, me interesa el plan (Starter / Creator / Pro) de AR Studio. ¿Me contáis los siguientes pasos?')

export default function PlanMensual({ plazas, mes }) {
  const badge = textoPlazas(plazas, mes)


  return (
    <>
      <Head>
        <title>Plan mensual | AR Studio, estudio de fotografía en Valencia</title>
        <meta name="description" content="El primer estudio de Valencia con acceso mensual para creadores y fotógrafos. Solo 10 plazas. Todo el material profesional incluido en una cuota mensual cerrada." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://studioar.es/planmensual" />

        <meta property="og:title" content="Plan mensual | AR Studio" />
        <meta property="og:description" content="Acceso fijo al estudio con todo el material profesional incluido, por una cuota mensual cerrada. Solo 10 plazas." />
        <meta property="og:url" content="https://studioar.es/planmensual" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://studioar.es/seo/meta-1200x630.jpg" />
        <meta property="og:site_name" content="AR Studio" />
        <meta property="og:locale" content="es_ES" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Plan mensual | AR Studio" />
        <meta name="twitter:description" content="Acceso fijo al estudio con todo el material profesional incluido. Solo 10 plazas." />
        <meta name="twitter:image" content="https://studioar.es/seo/twitter-1200x600.jpg" />

        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <main className="planmensual__master">

        {/* HERO */}
        <section className="planmensual__hero">
          <span className="planmensual__badge">{badge}</span>
          <h1>El primer estudio de Valencia con acceso mensual para creadores y fotógrafos.</h1>
          <div className="planmensual__hero_text">
            <p>Deja de pagar por horas sueltas. Deja de mirar el reloj mientras creas. Deja de improvisar el espacio donde construyes tu marca o trabajas con tus clientes.</p>
            <p>Acceso fijo al estudio, con todo el material profesional incluido, por una cuota mensual cerrada. Sin sorpresas, sin costes por hora, sin límites artificiales.</p>
          </div>
          <div className="planmensual__ctas">
            <ButtonArrow texto="VER PLANES" href="#planes" />
            <ButtonArrow texto="ESCRÍBENOS" href={waGeneral} />
          </div>
        </section>

        <div className="planmensual__strip">
          <span>89 m² · techo 3,5 m</span>
          <span>Todo el material incluido</span>
          <span>Cuota mensual cerrada</span>
        </div>

        {/* INTRO */}
        <section className="planmensual__intro">
          <h2>Un espacio pensado para lo que no se improvisa.</h2>
          <div className="planmensual__intro_text">
            <p>AR Studio Valencia abre <strong>por primera vez</strong> un número limitado de plazas de plan mensual, pensadas para quien produce con constancia: contenido de marca personal, fotografía con clientes, podcast y producción de producto.</p>
            <ul className="planmensual__lista">
              <li>Tu hueco fijo cada semana, sin negociar disponibilidad.</li>
              <li>Todo el equipo profesional incluido en la cuota.</li>
              <li>Solo un miembro usa el estudio a la vez: tu sesión es tuya.</li>
              <li>Estudio siempre limpio y preparado al llegar.</li>
            </ul>
          </div>
        </section>

        {/* ESPACIO */}
        <section className="planmensual__espacio" id="espacio">
          <Image className="planmensual__portada" src="/media/col2.jpg" alt="Interior y mobiliario de AR Studio en Valencia" loading="lazy" decoding="async" width={600} height={600} />
          <div className="planmensual__espacio_content">
            <span className="planmensual__label">El espacio</span>
            <h2>Luz natural.<br />Fondo neutro.<br />Minimalismo.</h2>
            <p>Un estudio profesional con luz natural y ciclorama blanco, diseñado para fotografía, vídeo, contenido de marca personal, podcast y producción de producto.</p>
            <dl className="planmensual__stats">
              <div><dt>89 m²</dt><dd>Superficie</dd></div>
              <div><dt>3,5 m</dt><dd>Altura de techo</dd></div>
              <div><dt>1</dt><dd>Miembro a la vez</dd></div>
              <div><dt>10</dt><dd>Plazas totales</dd></div>
            </dl>
          </div>
        </section>

        {/* MATERIAL */}
        <section className="planmensual__material">
          <span className="planmensual__label">Incluido en todos los planes</span>
          <h2>Todo el material,<br />sin coste adicional.</h2>
          <p className="planmensual__lead">Esto es lo que hace diferente a AR Studio. <strong>No alquilas solo un espacio:</strong> tienes acceso a todo el equipo profesional, sin coste adicional, en todos los planes.</p>

          <div className="planmensual__material_grid">
            <div>
              <h3>Iluminación</h3>
              <ul>
                <li>GODOX MS300 (×2)</li>
                <li>NANLITE Forza 150W</li>
                <li>GODOX X2T-S para Sony</li>
                <li>GODOX X2T-C para Canon</li>
                <li>Softbox GODOX (×2)</li>
                <li>Paraguas de luz</li>
              </ul>
            </div>
            <div>
              <h3>Kit de podcast</h3>
              <ul>
                <li>Micrófonos Rode (×2)</li>
                <li>Grabadora y tarjeta de sonido (×2)</li>
              </ul>
            </div>
            <div>
              <h3>Vídeo y captación</h3>
              <ul>
                <li>Proyector Bluetooth</li>
                <li>Teleprompter</li>
                <li>Trípode para cámara y móvil</li>
                <li>Arco de colores RGB con mando</li>
              </ul>
            </div>
            <div>
              <h3>Ciclorama y fondos</h3>
              <ul>
                <li>Ciclorama blanco profesional</li>
                <li>Fondos de color disponibles*</li>
              </ul>
            </div>
            <div>
              <h3>Mobiliario y atrezzo</h3>
              <ul>
                <li>Mesa blanca larga 220×115 cm</li>
                <li>Mesa blanca pequeña (×2)</li>
                <li>Sillas plegables (×15)</li>
                <li>Burro portátil con perchas</li>
                <li>Sillones nórdicos (×2)</li>
                <li>Espejo grande 180×180 cm</li>
                <li>Plantas reales</li>
                <li>Silla profesional de maquillador</li>
              </ul>
            </div>
            <div>
              <h3>Comodidades</h3>
              <ul>
                <li>Plancha a vapor para vestuario</li>
                <li>Cafetera y agua</li>
                <li>Aire acondicionado</li>
                <li>WiFi de alta velocidad</li>
                <li>Estudio siempre limpio y preparado</li>
              </ul>
            </div>
          </div>
          <p className="planmensual__nota">*Fondos de color: único coste extra, 20€ + IVA por metro pisado.</p>
        </section>

        {/* PLANES */}
        <section className="planmensual__planes" id="planes">
          <div className="planmensual__planes_head">
            <span className="planmensual__label">Plan mensual 2026</span>
            <h2>Los tres planes</h2>
            <p>Tres niveles de acceso pensados para distintos ritmos de trabajo. Desde el creador que produce una vez por semana hasta el fotógrafo profesional que trabaja el estudio cada día.</p>
          </div>

          <div className="planmensual__cards">

            <div className="planmensual__card">
              <h3>Starter</h3>
              <p className="planmensual__card_for">Para el creador que empieza a producir con constancia.</p>
              <p className="planmensual__price">149€<small>/mes</small></p>
              <p className="planmensual__hora">8 horas al mes · sale a 18,6€/hora</p>
              <ul>
                <li>1 sesión por semana de 2 horas</li>
                <li>Acceso de 14:00 a 20:00, L–V</li>
                <li>Todo el material profesional incluido</li>
                <li>Reserva con 72h de antelación</li>
              </ul>
              <p className="planmensual__ahorro">A tarifa normal: 392€/mes. <strong>Ahorras 243€ cada mes.</strong></p>
              <ButtonArrow texto="QUIERO STARTER" href={waStarter} />
              <p className="planmensual__plazas">6 plazas</p>
            </div>

            <div className="planmensual__card planmensual__card--destacada">
              <span className="planmensual__ribbon">El más elegido</span>
              <h3>Creator</h3>
              <p className="planmensual__card_for">Para el creador o fotógrafo que trabaja el estudio como parte de su negocio.</p>
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
              <p className="planmensual__plazas">3 plazas</p>
            </div>

            <div className="planmensual__card">
              <h3>Pro</h3>
              <p className="planmensual__card_for">Para el fotógrafo profesional que trabaja con clientes y necesita máxima flexibilidad.</p>
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
              <p className="planmensual__plazas">1 plaza</p>
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
                <tr><td>Precio por hora</td><td>18,6€</td><td className="destacada">15,6€</td><td>13,9€</td></tr>
                <tr><td>Franja horaria</td><td>14–20h</td><td className="destacada">14–20h</td><td>9–20h</td></tr>
                <tr><td>Acceso a mañanas</td><td>No</td><td className="destacada">No</td><td>Sí</td></tr>
                <tr><td>Sábado incluido</td><td>No</td><td className="destacada">No</td><td>1 al mes</td></tr>
                <tr><td>Antelación de reserva</td><td>72h</td><td className="destacada">48h</td><td>24h</td></tr>
                <tr><td>Material incluido</td><td>Todo</td><td className="destacada">Todo</td><td>Todo</td></tr>
                <tr><td>Plazas</td><td>6</td><td className="destacada">3</td><td>1</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* CONDICIONES */}
        <section className="planmensual__condiciones">
          <span className="planmensual__label">Claro y por escrito</span>
          <h2>Condiciones<br />del plan mensual</h2>
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
        </section>

        {/* CONTACTO */}
        <section className="planmensual__contacto" id="unirte">
          <span className="planmensual__badge">{badge}</span>
          <h2>Da el paso</h2>
          <div className="planmensual__contacto_text">
            <p>El plan mensual se abre por primera vez y con plazas muy limitadas para garantizar que cada miembro tenga <strong>disponibilidad real</strong> del estudio. Cuando se completen las 10 plazas, abrimos lista de espera.</p>
            <p><strong>Escríbenos indicando qué plan te interesa</strong> (Starter, Creator o Pro) y te contamos los siguientes pasos para reservar tu plaza.</p>
          </div>
          <div className="planmensual__canales">
            <a className="planmensual__canal planmensual__canal--destacado" href={waGeneral} target="_blank" rel="noopener noreferrer">
              <h3>WhatsApp</h3>
              <span>+34 613 39 55 33</span>
            </a>
            <a className="planmensual__canal" href={mailto}>
              <h3>Correo</h3>
              <span>arstudiospain@gmail.com</span>
            </a>
            <a className="planmensual__canal" href="https://www.instagram.com/studioar.es/" target="_blank" rel="noopener noreferrer">
              <h3>Instagram</h3>
              <span>@studioar.es</span>
            </a>
          </div>
        </section>

        <div className="button__cierre"><ButtonArrow texto="RESERVAR MI PLAZA" href={waGeneral} /></div>

      </main>

      <a className="planmensual__sticky" href={waGeneral} target="_blank" rel="noopener noreferrer">Reservar mi plaza</a>
    </>
  )
}

// Prerender estático que se regenera cada hora: así el mes del badge cambia
// solo, sin necesidad de volver a desplegar.
export async function getStaticProps() {
  const { plazas, mes } = plazasDelMes()
  return { props: { plazas, mes }, revalidate: 3600 }
}
