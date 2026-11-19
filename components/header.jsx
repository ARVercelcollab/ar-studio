import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { URL_RESERVAR } from '../lib/enlaces';

export default function Header() {
  // En la página del plan mensual el enlace del menú baja directamente a los planes
  const { pathname } = useRouter()
  const hrefPlan = pathname === '/planmensual' ? '#planes' : '/planmensual'

  

  const abrirCalendly = () => {
    if (window.Calendly) {
      window.Calendly.initPopupWidget({
        url: 'https://calendly.com/ar-studio?hide_gdpr_banner=1&text_color=4b3828&primary_color=4b3828'
      })
    }
  }


  
  return (
    <header className="header__master">
      <Link href="/"><Image  width={400} height={50} className="header__logo" src="/assets/AR_Studio.svg" alt="AR Studio" /></Link>

      <nav className="header__nav">
        <Link href="/#espacio">ESPACIO</Link>
        <Link href={hrefPlan}>PLAN MENSUAL</Link>
        <a href={URL_RESERVAR}>RESERVAR</a>
      </nav>

      <div className="header__mobile">
        <a
            href={URL_RESERVAR}
            className="header__menu"
            aria-label="Menú"
          >
            <svg width="29" height="24" viewBox="0 0 100 80" fill="#4b3828">
              <rect width="100" height="4" />
              <rect y="70" width="100" height="4" />
            </svg>
          </a>

      </div>
    </header>
  );
}
