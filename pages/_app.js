import '../styles/style.scss'
import '../styles/reservas.scss'
import '../styles/miembros.scss'
import '../styles/admin.scss'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Header from '../components/header.jsx';
import Footer from '../components/footer.jsx';
import CookieConsent from '../components/CookieConsent.jsx';
// Chat desactivado de momento: import ChatWidget from '../components/ChatWidget.jsx';


export default function MyApp({ Component, pageProps }) {
  // El panel del estudio y el TPV de pruebas van sin la cabecera ni el pie de la web
  const { pathname } = useRouter()
  if (pathname.startsWith('/admin') || pathname === '/pago-simulado') return <Component {...pageProps} />

  return (
    <>
    <Head>
        <link
          href="https://assets.calendly.com/assets/external/widget.css"
          rel="stylesheet"
        />
        <script
          src="https://assets.calendly.com/assets/external/widget.js"
          type="text/javascript"
          async
        ></script>
    </Head>
      <Header />
      <CookieConsent />
      <Component {...pageProps} />
      <Footer></Footer>
      {/* <ChatWidget /> — desactivado de momento */}
    </>
  )
}
