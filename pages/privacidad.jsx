import ButtonArrow from "../components/button"
import { RESERVAS_PROPIAS } from "../lib/enlaces"

export default function PoliticaPrivacidad() {
  return (
    <main>
      <section className="legal__master">
        <h1>Política de privacidad</h1>
        <h2>Protegemos tus datos personales con total transparencia y legalidad.</h2>

        <h2>1. Responsable del tratamiento</h2>
        <ul className="legal__lista">
          <li><strong>Nombre:</strong>Arianny Rivas</li>
          <li><strong>Correo electrónico:</strong> <a href="mailto:arstudiospain@gmail.com">arstudiospain@gmail.com</a></li>
          <li><strong>Teléfono:</strong> 661 85 56 12</li>
          <li><strong>Finalidad:</strong> Gestionar las reservas del estudio{RESERVAS_PROPIAS ? ', los planes mensuales (alta, contrato, cobros y fianza), los pagos y las facturas' : ''}, responder a consultas y garantizar el cumplimiento de nuestras condiciones de contratación.</li>
        </ul>


        <h2>2. Base legal para el tratamiento</h2>
        <ul className="legal__lista">
          <li>Consentimiento del usuario al realizar una reserva o contactar por correo.</li>
          <li>Cumplimiento de obligaciones legales o contractuales.</li>
          <li>Interés legítimo para mejorar la experiencia del usuario y proteger la seguridad del sitio.</li>
        </ul>

        <h2>3. Derechos del usuario</h2>
        <ul className="legal__lista">
          <li>Acceder, rectificar o suprimir sus datos personales.</li>
          <li>Solicitar la limitación del tratamiento.</li>
          <li>Oponerse al tratamiento de sus datos.</li>
          <li>Solicitar la portabilidad de sus datos.</li>
          <li>Presentar una reclamación ante la Agencia Española de Protección de Datos si considera que se ha vulnerado alguno de sus derechos.</li>
        </ul>

        <h2>4. Conservación de los datos</h2>
        <ul className="legal__lista">
          <li>Los datos se conservarán durante el tiempo necesario para cumplir con la finalidad para la que fueron recopilados.</li>
          <li>En el caso de obligaciones legales, se conservarán durante los plazos exigidos por la normativa fiscal o mercantil.</li>
          {RESERVAS_PROPIAS && <li>Las facturas y los datos de los pagos se guardan los años que exige la normativa fiscal y mercantil (en general, 6 años). Los contratos de los planes, mientras dure el plan y los plazos legales después.</li>}
        </ul>

        <h2>5. Destinatarios de los datos</h2>
        <ul className="legal__lista">
          {RESERVAS_PROPIAS ? (
            <>
              <li>No se cederán datos a terceros, salvo obligación legal. Para dar el servicio usamos estos proveedores, que tratan los datos solo por cuenta del estudio:</li>
              <li><strong>Pagos:</strong> Comercia Global Payments (TPV de Redsys y Bizum). Los datos de la tarjeta los introduces en la página del banco; el estudio nunca ve el número completo.</li>
              <li><strong>Planes que ya se cobraban antes:</strong> Stripe.</li>
              <li><strong>Base de datos:</strong> Neon, con los servidores en la Unión Europea (Frankfurt).</li>
              <li><strong>Alojamiento de la web:</strong> Vercel.</li>
              <li><strong>Correos (confirmaciones, facturas y contratos):</strong> Resend.</li>
              <li><strong>Calendario interno del estudio:</strong> Google Calendar.</li>
              <li><strong>Chat de la web:</strong> OpenAI.</li>
              <li>Algunos de estos proveedores pueden tratar datos fuera de la Unión Europea; en ese caso lo hacen con las garantías que exige el RGPD (cláusulas contractuales tipo o el Marco de Privacidad de Datos UE-EE. UU.).</li>
              <li>Todos los proveedores cumplen con la normativa vigente en protección de datos.</li>
            </>
          ) : (
            <>
              <li>No se cederán datos a terceros, salvo obligación legal o colaboración con proveedores de servicios esenciales como por ejemplo Calendly.</li>
              <li>Todos los proveedores cumplen con la normativa vigente en protección de datos.</li>
            </>
          )}
        </ul>

        <h2>6. Seguridad de los datos</h2>
        <ul className="legal__lista">
          <li>Aplicamos medidas técnicas y organizativas para garantizar la confidencialidad e integridad de los datos.</li>
          <li>Controlamos el acceso y el uso autorizado de la información recogida.</li>
        </ul>

        <div className="button__cierre">
          <ButtonArrow texto="VOLVER AL INICIO" href="/" />
        </div>
      </section>
    </main>
  )
}