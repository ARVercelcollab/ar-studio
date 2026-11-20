import { Html, Head, Main, NextScript } from 'next/document'

// El área de miembros (/miembros/*) va sin el píxel de Meta: el enlace para entrar lleva un
// código en la dirección y el píxel manda la dirección completa a Facebook.
const sinPixel = (pagina = '') => pagina === '/miembros' || pagina.startsWith('/miembros/')

export default function Document(props) {
  const pixel = !sinPixel(props.__NEXT_DATA__?.page)
  return (
    <Html>
      <Head>
        <link
          href="https://assets.calendly.com/assets/external/widget.css"
          rel="stylesheet"
        />
        {/* Meta Pixel Code */}
        {pixel && (<>
        <script
          dangerouslySetInnerHTML={{
            __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '2192299064919513');
fbq('track', 'PageView');
fbq('track', 'InitiateCheckout');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=2192299064919513&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        </>)}
        {/* End Meta Pixel Code */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
