// A dónde lleva el botón RESERVAR de la web.
// Con NEXT_PUBLIC_RESERVAS_PROPIAS=1 va a /reservar (reservas propias con el TPV);
// sin ella, a Calendly como hasta ahora.
export const RESERVAS_PROPIAS = process.env.NEXT_PUBLIC_RESERVAS_PROPIAS === '1'
export const URL_CALENDLY = 'https://calendly.com/ar-studio'
export const URL_RESERVAR = RESERVAS_PROPIAS ? '/reservar' : URL_CALENDLY
