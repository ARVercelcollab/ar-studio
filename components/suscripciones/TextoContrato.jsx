// Texto del contrato de suscripción (el de contratoSecciones), para la web
export default function TextoContrato({ t, completo = false }) {
  return (
    <article className={`rsv-contrato${completo ? ' is-completo' : ''}`}>
      <h2>{t.titulo}</h2>
      <p className="rsv-contrato__sub">{t.subtitulo}</p>
      <p>{t.lugarFecha}</p>
      {t.partes.map((p) => (
        <div key={p.titulo} className="rsv-contrato__parte">
          <h3>{p.titulo}</h3>
          {p.texto && <p>{p.texto}</p>}
          {p.lineas && (
            <dl>
              {p.lineas.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
        </div>
      ))}
      <p>{t.intro}</p>
      {t.clausulas.map((c) => (
        <section key={c.titulo}>
          <h3>{c.titulo}</h3>
          {c.parrafos.map((p, i) => <p key={i}>{p}</p>)}
          {c.lista && <ul>{c.lista.map((x) => <li key={x}>{x}</li>)}</ul>}
        </section>
      ))}
      <p>{t.cierre}</p>
    </article>
  )
}
