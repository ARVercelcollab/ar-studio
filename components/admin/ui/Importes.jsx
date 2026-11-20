// «Ocultar importes»: lo lleva el armazón (Panel) para todo el panel y se recuerda en la cookie adm_ocultar.
// - useImportesOcultos() → true si hay que esconder las cantidades (para textos con euros)
// - useAlternarImportes() → { oculto, alternar } (para un botón propio, si alguna pantalla lo quiere)
// - En CSS, cualquier elemento con la clase ui-imp se difumina cuando están ocultos.
// El contexto ImportesOcultos es el mismo de graficas.jsx (useEuros lo lee), así todo va a la vez.
import { createContext, useContext } from 'react'
import { ImportesOcultos } from '../graficas'

export const ControlImportes = createContext({ oculto: false, alternar: () => {} })

export function useImportesOcultos() {
  return useContext(ImportesOcultos)
}

export function useAlternarImportes() {
  return useContext(ControlImportes)
}

export const COOKIE_OCULTAR = 'adm_ocultar'

// En getServerSideProps: const oculto = ocultoEnCookie(ctx.req) → pásalo a <Panel ocultoInicial={oculto}>
export function ocultoEnCookie(req) {
  return /(?:^|;\s*)adm_ocultar=1(?:;|$)/.test(req?.headers?.cookie || '')
}

export { ImportesOcultos }
