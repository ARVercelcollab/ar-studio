import Head from 'next/head'
import ButtonArrow from '../components/button';
import { useState } from 'react';
import { useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import Image from 'next/image';




export default function Home() {  const [verMas, setVerMas] = useState(false)
  const [scriptCargado, setScriptCargado] = useState(false)

  // Para el inline, solo necesitas que el script esté cargado
  const [inlineActivo, setInlineActivo] = useState(false)

  useEffect(() => {
    setInlineActivo(true) // activa render en cliente, necesario para evitar hidratación rota
  }, [])

  const abrirCalendly = () => {
    if (!scriptCargado) {
      const script = document.createElement('script')
      script.src = 'https://assets.calendly.com/assets/external/widget.js'
      script.async = true
      script.onload = () => {
        setScriptCargado(true)
        if (window.Calendly) {
          window.Calendly.initPopupWidget({
            url: 'https://calendly.com/ar-studio?hide_gdpr_banner=1&text_color=4b3828&primary_color=4b3828'
          })
        }
      }
      document.body.appendChild(script)
    } else {
      if (window.Calendly) {
        window.Calendly.initPopupWidget({
          url: 'https://calendly.com/ar-studio?hide_gdpr_banner=1&text_color=4b3828&primary_color=4b3828'
        })
      }
    }
  }



    const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])



  return (
    <>
      <Head>
        <title>AR Studio | Estudio de fotografía con luz natural en Valencia</title>
        <meta name="description" content="Estudio fotográfico de alquiler en Valencia. Luz natural preciosa y ambiente aesthetic. Reserva online en nuestra web." />
        <meta name="keywords" content="estudio fotografía Valencia, ciclorama blanco, alquiler estudio fotográfico, grabación en estudio, espacio creativo, luz natural, alquilar estudio en Valencia, que estudio alquilar en Valencia, estudio fotografia cruz cubierta, estudio fotografia Malilla" />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Andrés Ortega Montoya" />
        <meta name="creator" content="Andrés Ortega Montoya" />
        <meta name="publisher" content="Andrés Ortega Montoya" />
        <meta name="revisit-after" content="1 days" />
        <meta name="language" content="es" />
        <meta name="content-language" content="es" />
        <meta name="theme-color" content="#594538" />

        {/* Canonical */}
        <link rel="canonical" href="https://studioar.es/" />

        {/* Open Graph */}
        <meta property="og:title" content="AR Studio | Estudio de fotografía en Valencia" />
        <meta property="og:description" content="Alquila un espacio versátil y luminoso en Valencia para fotografía, vídeo, talleres y contenido visual. Con ciclorama blanco y equipo profesional." />
        <meta property="og:url" content="https://studioar.es/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://studioar.es/seo/meta-1200x630.jpg" />
        <meta property="og:site_name" content="AR Studio" />
        <meta property="og:locale" content="es_ES" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AR Studio | Estudio de fotografía en Valencia" />
        <meta name="twitter:description" content="Reserva tu sesión en un estudio profesional con ciclorama blanco y luz natural. Ideal para fotografía, contenido y grabaciones." />
        <meta name="twitter:image" content="https://studioar.es/seo/twitter-1200x600.jpg" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Viewport */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* JSON-LD estructurado */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              "name": "AR Studio",
              "description": "Alquiler por horas de nuestro estudio de fotografía en Valencia con luz natural y ciclorama blanco.",
              "url": "https://studioar.es",
              "image": "https://studioar.es/seo/meta-1200x630.jpg",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Valencia",
                "addressRegion": "Valencia",
                "postalCode": "46007",
                "streetAddress": "C/ de Sant Vicent Màrtir, 338, Jesús"
              },
              "telephone": "+34661855612",
              "priceRange": "€€"
            })
          }}
        />
      </Head>


      <main>

        <section className="hero__master">

          <video className="hero__video_desktop" autoPlay muted loop playsInline>
            <source src="/media/arstudio-1920.mp4" type="video/mp4" />
            Tu navegador no soporta el vídeo.
          </video>

          <video className="hero__video_mobile" autoPlay muted loop playsInline>
            <source src="/media/arstudio-1080.mp4" type="video/mp4" />
            Tu navegador no soporta el vídeo.
          </video>

          <ButtonArrow texto="RESERVAR" onClick={abrirCalendly} />

        </section>



        <section className="info__master">

          <div className="info__title">
            <h1>Un espacio pensado para lo que no se improvisa.</h1>

            <div className="buttons">
              <ButtonArrow texto="RESERVAR" onClick={abrirCalendly} />
              <ButtonArrow texto="VER ESPACIO" href="#espacio" variant="light" />
            </div>
          </div>

          <div className="info__text">

            <p><strong>Ubicado en Valencia</strong>, es el lugar perfecto para la creación de contenido, grabación de vídeos, talleres y eventos.</p>

            <p>Con una luz natural que resalta cada detalle, un fondo neutro y un mobiliario minimalista, AR Studio te ofrece el ambiente ideal para hacer que tus ideas encajen perfectamente.</p>

            <p>Diseñado para que tú puedas enfocarte en lo que más importa: <strong>tu proyecto</strong>.</p>

          </div>

        </section>


        <section className="datos__master">

          <Image className="datos__portada" src="/media/studio-2.jpg" alt="el estudio de Arianny Rivas en Valencia cuenta con un fondo blanco y numerosos equipos para la iluminación profesional" loading="lazy" decoding="async" width={400} height={400}></Image>

          <div className="datos__content">

            <h2>Luz natural.<br></br>Fondo neutro.<br></br>Minimalismo.</h2>

            <div className="datos__map">

              <Image className="map" src="/media/mapa2.jpg" alt="mapa del estudio de Arianny Rivas. Todo el espacio medido y explicado para que el cliente pueda comprenderlo antes de ir" loading="lazy" decoding="async" width={300} height={300}></Image>


                 <dl className={`datos__list ${verMas ? 'abierto' : 'reducido'}`}>
            {/* Primeros 5 elementos siempre visibles */}
            <dt className="datos__bold" id="espacio">ESPACIO</dt><dd className="datos__normal">89 m2</dd>
            <dt className="datos__bold">TECHO</dt><dd className="datos__normal">3,5 m</dd>
            {/* <dt className="datos__bold">CICLORAMA</dt><dd className="datos__normal">4×3 m</dd> */}
            <dt className="datos__bold">EQUIPO ILUMINACIÓN</dt>
            <dd className="datos__normal">GODOX MS300 (x2)<br />NANLINE Forza 150w</dd>
            <dt className="datos__bold">ACCESORIOS ILUMINACIÓN</dt>
            <dd className="datos__normal">GODOX X2T-S Sony<br />GODOX X2T-C Canon<br />Softbox GODOX (x2)<br />Paraguas</dd>

            {/* Resto: ocultos si verMas = false */}
            {verMas && (
              <>
                <dt className="datos__bold">KIT PODCAST</dt>
                <dd className="datos__normal">Micrófonos Rode, soportes, grabadora y tarjeta de sonido / 2 unidades</dd>
                <dt className="datos__bold">PROYECTOR BLUETOOTH</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">TELEPROMPTER</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">TRÍPODE</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">MESA BLANCA LARGA</dt><dd className="datos__normal">220×115 cm</dd>
                <dt className="datos__bold">MESA BLANCA PEQUEÑA</dt><dd className="datos__normal">x2</dd>
                <dt className="datos__bold">SILLAS PLEGABLES</dt><dd className="datos__normal">x28</dd>
                <dt className="datos__bold">BURRO PORTÁTIL</dt><dd className="datos__normal">y perchas</dd>
                <dt className="datos__bold">SILLONES NÓRDICOS</dt><dd className="datos__normal">x2</dd>
                <dt className="datos__bold">ESPEJO</dt><dd className="datos__normal">180×180 cm</dd>
                <dt className="datos__bold">PLANTAS REALES</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">SILLA PROFESIONAL DE MAQUILLADOR</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">PLANCHA A VAPOR</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">ARCO DE COLORES</dt><dd className="datos__normal">con mando</dd>
                <dt className="datos__bold">CAFETERA</dt><dd className="datos__normal"></dd>
                <dt className="datos__bold">WIFI</dt><dd className="datos__normal"></dd>
              </>
            )}

                       <button className="datos__vermas" onClick={() => setVerMas(!verMas)}>
            {verMas ? 'Ver menos' : 'Ver más'}
          </button>
          </dl>




            </div>

 

          </div>

        </section>




        <section className="instagram__master">

          <h2>Un espacio<br></br>multifuncional.</h2>

          <div className="instagram__grid">

            <Image className="datos__portada" src="/media/col5.jpg" alt="Ciclorama y focos Godox en Studio AR en Valencia" loading="lazy" decoding="async" width={600} height={600}></Image>

            <Image className="datos__portada" src="/media/col2.jpg" alt="Interior y mobiliario de Studio AR en Valencia" loading="lazy" decoding="async" width={600} height={600}></Image>

            <Image className="datos__portada" src="/media/col3.jpg" alt="Actividad de yoga en el espacio de AR Studio" loading="lazy" decoding="async" width={600} height={600}></Image>

            <Image className="datos__portada" src="/media/col4.jpg" alt="Modelo posando para venta de producto deportivo" loading="lazy" decoding="async" width={600} height={600}></Image>

          </div>

         

        </section>




        <section className="reservas__master">
          <div className="reservas__title">
            <h2>Agenda abierta.<br />Espacio preparado.</h2>
            <p id="reserva">Puedes leer las condiciones de nuestros servicios aquí:</p>
            <ButtonArrow texto="CONDICIONES" href="/condiciones" />
          </div>

          {/* El script se carga solo si mostramos inline */}
          {inlineActivo && (
            <>
              <Script
                src="https://assets.calendly.com/assets/external/widget.js"
                strategy="afterInteractive"
              />
              <div
                className="calendly-inline-widget"
                data-url="https://calendly.com/ar-studio"
              />
            </>
          )}
        </section>

        <div className="dudas__master">
          <h3>¿Tienes alguna duda?</h3>
          <ButtonArrow texto="CORREO" href="mailto:arstudiospain@gmail.com"></ButtonArrow>

        </div>




        <section className="detalles__master">

          <h2>Detalles que completan<br></br>la experiencia</h2>

          <Link href="https://ariannyrivasagency.com"><div className="detalles__cubo">
            <h3>Modelos<br></br>disponibles</h3>
            <Image className="detalles__logo" src="/assets/AR_Agency_vert.svg" alt="AR Agency logo for contract models across AR Studio" width={400} height={100} />
            <p>Perfiles diversos y preparados, disponibles para potenciar tus producciones. Profesionales con experiencia y presencia.</p>
          </div></Link>
        </section>


        <div className="button__cierre"><ButtonArrow texto="RESERVAR" onClick={abrirCalendly} /></div>


      </main>
    </>
  )
}
