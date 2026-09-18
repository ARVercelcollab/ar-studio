// Publicaciones de @studioar.es que se muestran en la página del plan mensual.
// La miniatura de cada una vive en public/media/ig/<code>.jpg (portada del reel o primera foto).
// `pos` ajusta el encuadre al recortar la portada vertical del reel a 4:5.
export const POSTS_IG = [
  { code: 'DFIH97zIp6u', tipo: 'reel', titulo: 'Sesión de fotos en el estudio', pos: 'center' },
  { code: 'DF2m4ksIvAm', tipo: 'reel', titulo: 'Yoga & brunch con @carlaexposito', pos: 'center' },
  { code: 'DEiIzfGoIfO', tipo: 'reel', titulo: 'Fotos corporativas para @montesanohills', pos: 'center' },
  { code: 'C92SN_mIcdF', tipo: 'reel', titulo: 'Contenido para @divinasb_', pos: 'center 30%' },
  { code: 'DDPtXSHotvd', tipo: 'reel', titulo: 'Tus ideas en nuestro espacio', pos: 'center' },
  { code: 'DG3Z8khNTac', tipo: 'foto', titulo: 'Fotos para @dra_alexandra_murillo', pos: 'center' },
  { code: 'DDebU-CIxTi', tipo: 'reel', titulo: 'Un día soleado en AR Studio', pos: 'center 60%' },
]

export const urlPost = (code) => `https://www.instagram.com/p/${code}/`
