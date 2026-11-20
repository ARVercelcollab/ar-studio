import ButtonArrow from "../components/button"
import { RESERVAS_PROPIAS } from "../lib/enlaces"

export default function PoliticaCookies() {
  return (
    <main>
      <section className="legal__master">
        <h1>Política de cookies</h1>
        <h2>Este sitio web utiliza cookies propias y de terceros para mejorar la experiencia del usuario.</h2>

        <h2>1. ¿Qué son las cookies?</h2>
        <ul className="legal__lista">
          <li>Las cookies son pequeños archivos de texto que los sitios web instalan en el dispositivo del usuario al navegar por sus páginas.</li>
          <li>Sirven para almacenar información sobre las visitas, mejorar la navegación y personalizar la experiencia del usuario.</li>
        </ul>

        <h2>2. Tipos de cookies utilizadas</h2>
        <ul className="legal__lista">
          <li><strong>Cookies técnicas:</strong> necesarias para el funcionamiento básico del sitio.</li>
          {RESERVAS_PROPIAS && <li><strong>Área de miembros:</strong> si eres miembro y entras en tu área, guardamos la cookie técnica <em>ar_miembro</em> durante 30 días para mantener tu sesión abierta. Solo sirve para saber que eres tú; se borra al pulsar «Salir» o al caducar. Es necesaria para el área, así que no pide consentimiento.</li>}
          <li><strong>Cookies de análisis:</strong> nos permiten conocer cómo interactúan los usuarios con el sitio para mejorar sus contenidos y estructura. Utilizamos Google Search Console y Vercel Analytics.</li>
        </ul>

        <h2>3. Cookies de terceros</h2>
        <ul className="legal__lista">
          <li>Este sitio puede utilizar servicios de terceros que recopilan información con fines estadísticos, como Google Search Console y herramientas de análisis proporcionadas por Vercel.</li>
          <li>{RESERVAS_PROPIAS ? 'Aparte de la cookie técnica del área de miembros, AR Studio no recopila datos personales directamente a través de cookies.' : 'AR Studio no recopila datos personales directamente a través de cookies.'}</li>
        </ul>

        <h2>4. Cómo desactivar las cookies</h2>
        <ul className="legal__lista">
          <li>El usuario puede configurar su navegador para aceptar, bloquear o eliminar las cookies instaladas.</li>
          <li>La desactivación de cookies puede afectar al correcto funcionamiento del sitio.</li>
          <li>Consulta la ayuda de tu navegador para gestionar las preferencias de cookies.</li>
        </ul>

        <h2>5. Consentimiento</h2>
        <ul className="legal__lista">
          <li>Al continuar navegando en este sitio, aceptas el uso de cookies según lo descrito en esta política.</li>
          <li>Te mostramos un aviso claro y accesible al respecto en tu primera visita.</li>
        </ul>

        <div className="button__cierre">
          <ButtonArrow texto="VOLVER AL INICIO" href="/" />
        </div>
      </section>
    </main>
  )
}
