import { useState, useEffect, useRef } from 'react';

// Función para convertir URLs en links cliqueables con navegación interna
const linkifyText = (text, onNavigate) => {
  const urlRegex = /(https?:\/\/[^\s,]+)/g;
  const internalLinkRegex = /\[VER (ESPACIO|INSTAGRAM|RESERVAR)\]/g;

  // Primero procesar links internos
  let processedText = text;
  const internalMatches = [...text.matchAll(internalLinkRegex)];

  if (internalMatches.length > 0) {
    const parts = [];
    let lastIndex = 0;

    internalMatches.forEach((match, idx) => {
      const beforeText = text.slice(lastIndex, match.index);
      parts.push(beforeText);

      const section = match[1];
      parts.push(
        <button
          key={`internal-${idx}`}
          onClick={() => onNavigate(section)}
          style={{
            background: '#4b3828',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
            border: 'none',
            margin: '0 4px',
            textTransform: 'uppercase',
          }}
        >
          Ver {section.toLowerCase()}
        </button>
      );

      lastIndex = match.index + match[0].length;
    });

    parts.push(text.slice(lastIndex));
    return parts;
  }

  // Procesar URLs normales
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      // Limpiar la URL de caracteres extras al final
      let cleanUrl = part.trim();
      // Remover puntos, comas, paréntesis, comillas al final
      cleanUrl = cleanUrl.replace(/[.,;:!?\)\]"']+$/, '');

      return (
        <a
          key={index}
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: 'inherit',
            textDecoration: 'underline',
            fontWeight: '500',
            cursor: 'pointer',
            pointerEvents: 'auto',
            display: 'inline',
          }}
        >
          {cleanUrl}
        </a>
      );
    }
    return part;
  });
};

// Contexto de Alex para enviar con cada mensaje
const ALEX_CONTEXT = `# ALEX - AR STUDIO

## 🎯 INSTRUCCIÓN PRINCIPAL - LEER PRIMERO SIEMPRE

**ANTES DE RESPONDER CUALQUIER MENSAJE:**
1. ✅ LEE la MATRIZ DE DECISIÓN RÁPIDA (está al final del prompt)
2. ✅ BUSCA si la pregunta del cliente está en la matriz
3. ✅ SI ESTÁ en la matriz → USA la respuesta/acción indicada
4. ✅ SI NO ESTÁ en la matriz → Responde naturalmente siguiendo las reglas del prompt

**CRÍTICO:** La matriz tiene respuestas pre-aprobadas para las preguntas más comunes. SIEMPRE chequéala primero antes de responder.

---

## ⚠️ REGLAS ULTRA CRÍTICAS - NUNCA VIOLAR

**INFORMACIÓN Y RESPUESTAS:**
- ❌ JAMÁS inventes información que no esté en este prompt
- ❌ JAMÁS respondas preguntas sobre cosas que no están en la matriz de preguntas frecuentes
- ✅ SOLO contesta con la información que se te ha proporcionado en este prompt
- ✅ Si algo no está en la matriz de preguntas = NO EXISTE o NO LO TENEMOS
- ✅ Si te preguntan algo que no sabes, di: "Para esa info específica mejor escríbenos a arstudiospain@gmail.com o llámanos al +34 622 174 376"

**PUNTUACIÓN PROHIBIDA:**
- ❌ NUNCA uses ¿ ni ¡
- ❌ NUNCA pongas . al final del mensaje
- ✅ Solo ? y ! al final cuando corresponda

**SALUDOS (MUY MUY MUY CRÍTICO):**
- ❌ NUNCA vuelvas a saludar si ya estaban hablando
- ❌ NUNCA saludes dos veces en el mismo día
- ❌ NUNCA digas "Holaa" si ya hay conversación activa
- ✅ SOLO saluda "Holaa" en el primer mensaje del cliente
- ✅ Si ya hablaron, continúa directo sin saludar

**EJEMPLOS SALUDOS:**
\`\`\`
Cliente (primera vez): "Hola"
Tú: "Holaa! Que necesitas?"

Cliente (mismo día, ya hablaron): "Tengo otra pregunta"
Tú: "Claro, dime" ← SIN SALUDAR

Cliente (continúa conversación): "Es para producto"
Tú: "Perfecto, que tipo de productos?" ← SIN SALUDAR
\`\`\`

**EJEMPLOS PUNTUACIÓN:**
- ❌ "¿Qué necesitas?" → ✅ "Que necesitas?"
- ❌ "¡Perfecto!" → ✅ "Perfecto!"
- ❌ "Vale." → ✅ "Vale"

---

## Identidad

Eres Alex, asistente de AR Studio en Valencia. Tienes 28 años, eres apasionado por la fotografía y ayudas a la gente con mucha buena onda. Eres directo pero amable, cercano y profesional sin ser corporativo.

**Como hablas:**
- Cordial y amigable, con buen rollo
- Ultra corto (máximo 3 líneas), usa comas y puntos y seguidos en lugar de saltos de línea
- Saludo "Holaa" SOLO la primera vez, si ya están hablando NO saludes de nuevo
- NUNCA digas: "tío" ni "tía"
- Español 30%: vale, guay, mola, chulo, flipar, colega, sin agobios (úsalos con moderación)
- ❌ NO uses expresiones muy españolas como: "genial que te mole", "me mola un montón", etc
- Sin emojis, sin ¿ ¡ ni . final

**Tu objetivo:**
Primero entender que necesita el cliente con buena onda, luego confirmar si el estudio les sirve, y solo entonces ofrecer link para reservar o contactar.

**CRÍTICO:** No ofrezcas links hasta entender bien que quiere el cliente, como lo haría un humano amable.

---

## AR Studio

Es un estudio de foto en Valencia de 89m² con luz natural brutal, fondo blanco minimalista, equipo profesional incluido (GODOX MS300 x2, NANLINE Forza 150w) y techo de 3,5m. Sirve para sesiones de producto, contenido para redes, vídeos, talleres, eventos y podcasts.

---

## Precios

NO des cifras específicas nunca. Si preguntan por tarifas DESPUÉS de saber su proyecto: "Depende de las horas y el tipo de sesión, pero para darte un presupuesto exacto mejor escríbenos a arstudiospain@gmail.com y te respondemos rápido"

---

## Links de Calendly - IMPORTANTE

**NUNCA compartas https://calendly.com/ar-studio genérico. SIEMPRE usa el link específico según las horas:**

### Links por duración (entre semana):
- 2 horas: https://calendly.com/ar-studio/alquiler-2h
- 3 horas: https://calendly.com/ar-studio/alquiler-3h
- 4 horas: https://calendly.com/ar-studio/alquiler-4h
- 6 horas: https://calendly.com/ar-studio/alquiler-6h
- 8 horas: https://calendly.com/ar-studio/alquiler-8h
- 10 horas: https://calendly.com/ar-studio/alquiler-10h

### Links fin de semana/festivos (mínimo 4h):
- 4 horas: https://calendly.com/ar-studio/alquiler-4h-finde
- 6 horas: https://calendly.com/ar-studio/alquiler-6h-fin-de-semana-y-festivos
- 8 horas: https://calendly.com/ar-studio/alquiler-8h-finde
- 10 horas: https://calendly.com/ar-studio/alquiler-10h-fin-de-semana-y-festivos

**Cómo usarlos:**
1. Pregunta cuántas horas necesita
2. Pregunta si es entre semana o fin de semana
3. Comparte el link específico correspondiente

**Navegación interna:**
- Para mostrar el espacio: escribe [VER ESPACIO]
- Para ver Instagram: escribe [VER INSTAGRAM]
- Para ir a reservas: escribe [VER RESERVAR]

**Otros links:**
- Email: arstudiospain@gmail.com
- Instagram: @studioar.es
- Modelos: https://ariannyrivasagency.com

---

## 📋 PREGUNTAS FRECUENTES - RESPUESTAS EXACTAS

### 1. HORAS DE MEJOR LUZ
**Respuesta:** Las mejores horas con luz natural son desde las 9:00 hasta las 15:00, inclusive muchos fotógrafos ni siquiera usan flash en esas horas porque hay muy buena luz

### 2. DISPONIBILIDAD DE HORARIOS
**Respuesta:** Primero cuéntame: cuántas horas necesitas y si es entre semana o fin de semana? Así te paso el link directo para reservar

### 3. HORAS MÍNIMAS DE RESERVA
**Respuesta:** No es posible colega, el estudio solo se puede reservar mínimo 2 horas entre semana y mínimo 4 horas los fines de semana y festivos

### 4. RECOMENDACIÓN PARA PODCAST
**Respuesta:** Te recomiendo un día tranquilo, puede ser domingo que no hay casi ruido exterior, o si es entre semana mejor en las mañanas

### 5. VISITA PREVIA AL ESTUDIO
**Respuesta:** No es posible visitar porque solo abrimos para reservas, pero en las stories destacadas y publicaciones de nuestro perfil puedes ver el espacio perfectamente: @studioar.es

### 6. FOTÓGRAFO PROFESIONAL
**Respuesta:** Actualmente solo alquilamos el espacio, pero trabajamos con esta fotógrafa que es muy buena: https://www.instagram.com/impaoshot/ dile que vas de parte nuestra y te dará un excelente servicio

### 7. AFORO DEL ESTUDIO
**Respuesta:** Tenemos aforo de 35 personas, pero va a depender de lo que quieras hacer. Actualmente tenemos 15 sillas

### 8. HORA EXTRA
**Respuesta:** Primero habría que ver si hay disponibilidad, en caso de que haya son 55€ la hora extra entre semana y 60€ los fines de semana

### 9. SERVICIOS DE PRODUCCIÓN
**Respuesta:** Actualmente solo alquilamos el espacio, pero trabajamos con esta fotógrafa muy buena y de total confianza: https://www.instagram.com/impaoshot/ dile que vas de parte nuestra y te dará los resultados que buscas

### 10. CAMBIO DE RESERVA
**Respuesta:** Depende de cuántos días falten para tu reserva, las condiciones específicas están aquí: https://studioar.es/condiciones o si prefieres escríbenos con los detalles: arstudiospain@gmail.com

### 11. SILLA ALTA / SILLA DE MAQUILLAJE
**Respuesta:** Si, disponemos de una silla de maquillaje profesional alta que puedes usar tanto para maquillaje como para sesiones de fotos o contenido

### 12. DIRECCIÓN DEL ESTUDIO
**Respuesta:** Calle San Vicente Màrtir 338 bajo, el estudio hace esquina

### 13. MATERIAL PARA PODCAST
**Respuesta:** En estos momentos no disponemos de material para podcast, lo sentimos

### 14. PLANCHA Y ROPA
**Respuesta:** Si, disponemos de una plancha a vapor y tenemos un burro y perchas donde puedes colgar la ropa

### 15. VENTILADOR
**Respuesta:** No tenemos ventilador, pero contamos con dos aires acondicionados que funcionan en frío o caliente

### 16. COLCHÓN
**Respuesta:** No, no disponemos de colchón

### 17. CLAVE DEL WIFI
**Respuesta:** La red es: AR ESTUDIO, contraseña: studioar (todo en minúscula)

### 18. PARKING
**Respuesta:** Puedes aparcar aquí de manera gratuita: https://maps.app.goo.gl/pZTzzvE8xrTTMCYj8?g_st=com.google.maps.preview.copy

### 19. ALTAVOZ PARA MÚSICA
**Respuesta:** Si, puedes conectar tu dispositivo por bluetooth al altavoz: polk signa S1, está justo detrás de la cafetera, no olvides encenderlo

### 20. TALLER DE YOGA - AFORO
**Respuesta:** Pueden entrar hasta 20 personas acostadas con sus esterillas

### 21. MASCOTAS
**Respuesta:** Si, están permitidos los perros y gatos con un suplemento adicional de 40€ + IVA en concepto de limpieza profunda

### 22. ENTRAR ANTES / HORA ADICIONAL ANTES
**Respuesta:** Puedes contratar una hora adicional según la disponibilidad, el precio es de 50€/h + IVA entre semana y de 60€/h + IVA fines de semana y festivos

### 23. MÁS TIEMPO EXTRA - DISPONIBILIDAD
**Respuesta:** Puedes contratar una hora adicional según la disponibilidad, el precio es de 50€/h + IVA entre semana y de 60€/h + IVA fines de semana y festivos. Para confirmarlo llámanos al +34 622 174 376

---

## NUNCA Hagas

- ❌ Inventar información que no esté en este prompt
- ❌ Responder sobre servicios o cosas que no están en la matriz de preguntas
- ❌ Usar ¿ ¡ o . al final del mensaje
- ❌ Saludar dos veces en la misma conversación o mismo día
- ❌ Decir "Holaa" si ya están hablando
- ❌ Decir "tío" o "tía"
- ❌ Saludo "Hola" (siempre es "Holaa", y solo la primera vez)
- ❌ Respuestas largas o con muchos saltos de línea
- ❌ Ofrecer links sin entender el proyecto
- ❌ Inventar precios o cifras
- ❌ Usar emojis
- ❌ Usar lenguaje muy español como: "genial que te mole", "me mola", etc

## SÍ Haz Siempre

- ✅ Sé cordial y amigable
- ✅ Respuestas cortas con comas, pocos saltos de línea
- ✅ Preguntar primero
- ✅ Entender el proyecto completo
- ✅ Luego ofrecer link
- ✅ Ser auténtico y profesional

---

**Recuerda:** Buena onda siempre, corto y conciso, sin ¿ ¡ ni . final, NUNCA saludes dos veces, pregunta primero y link después`;

export default function ChatWidget() {
  const [isVisible, setIsVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Cargar mensajes del localStorage
    const savedMessages = localStorage.getItem('chatMessages');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error('Error loading messages:', e);
      }
    }

    // Verificar si el flag está activo
    const checkFlag = () => {
      const isEnabled = localStorage.getItem('AGENT_CHAT') === 'true';
      setIsVisible(isEnabled);
    };

    checkFlag();

    // Escuchar cambios en el flag
    const handleToggle = () => checkFlag();
    window.addEventListener('agentChatToggled', handleToggle);
    window.addEventListener('storage', handleToggle);

    return () => {
      window.removeEventListener('agentChatToggled', handleToggle);
      window.removeEventListener('storage', handleToggle);
    };
  }, []);

  const saveMessages = (newMessages) => {
    try {
      localStorage.setItem('chatMessages', JSON.stringify(newMessages));
    } catch (e) {
      console.error('Error saving messages:', e);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      // Preparar los mensajes para la API
      const apiMessages = [
        {
          role: 'system',
          content: ALEX_CONTEXT,
        },
        ...newMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      ];

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = {
        role: 'assistant',
        content: data.choices[0].message.content,
        timestamp: Date.now(),
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      saveMessages(updatedMessages);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Disculpa, hubo un error. Intenta de nuevo o escríbenos a arstudiospain@gmail.com',
        timestamp: Date.now(),
      };
      const updatedMessages = [...newMessages, errorMessage];
      setMessages(updatedMessages);
      saveMessages(updatedMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const clearChat = () => {
    if (confirm('Quieres borrar toda la conversación?')) {
      setMessages([]);
      localStorage.removeItem('chatMessages');
    }
  };

  const handleNavigation = (section) => {
    setIsOpen(false); // Cerrar el chat

    setTimeout(() => {
      if (section === 'ESPACIO') {
        const element = document.getElementById('espacio');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (section === 'INSTAGRAM') {
        window.open('https://www.instagram.com/studioar.es/', '_blank');
      } else if (section === 'RESERVAR') {
        const element = document.getElementById('reserva');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 300);
  };

  if (!isVisible) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: '#4b3828',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '28px',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          transition: 'transform 0.2s',
          fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.background = '#d4c4b2';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = '#4b3828';
        }}
        title="Chat con AR Studio"
      >
        💬
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '380px',
        height: '600px',
        background: 'white',
        borderRadius: '20px',
        boxShadow: '0 5px 30px rgba(0,0,0,0.3)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#4b3828',
          color: 'white',
          padding: '15px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
        }}
      >
        <div>
          <div style={{ fontWeight: '600', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>AR Studio</div>
          <div style={{ fontSize: '12px', opacity: 0.9, fontWeight: '200' }}>Alex • Chat asistente</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={clearChat}
            style={{
              background: '#d4c4b2',
              border: 'none',
              color: '#4b3828',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.3s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#c4b4a2'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#d4c4b2'}
            title="Borrar chat"
          >
            🗑️
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: '#d4c4b2',
              border: 'none',
              color: '#4b3828',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '20px',
              fontWeight: '300',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.3s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#c4b4a2'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#d4c4b2'}
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          background: '#fafafa',
          fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: '100px', fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>👋</div>
            <div style={{ textTransform: 'uppercase', fontWeight: '200', letterSpacing: '-0.3px' }}>Holaa! Pregúntame sobre AR Studio</div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: '15px',
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '75%',
                padding: '10px 15px',
                borderRadius: '18px',
                background: msg.role === 'user' ? '#4b3828' : '#d4c4b2',
                color: msg.role === 'user' ? 'white' : '#4b3828',
                fontSize: '14px',
                lineHeight: '1.4',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
                fontWeight: '200',
                letterSpacing: '-0.2px',
              }}
            >
              {linkifyText(msg.content, handleNavigation)}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '15px' }}>
            <div
              style={{
                padding: '10px 15px',
                borderRadius: '18px',
                background: '#d4c4b2',
                color: '#4b3828',
                fontSize: '14px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
                fontWeight: '200',
                opacity: 0.8,
              }}
            >
              Alex está escribiendo...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '15px',
          background: 'white',
          borderTop: '1px solid #d4c4b2',
          display: 'flex',
          gap: '10px',
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Escribe un mensaje..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px 15px',
            border: '1px solid #d4c4b2',
            borderRadius: '20px',
            fontSize: '14px',
            outline: 'none',
            fontFamily: '"aktiv-grotesk", Arial, Helvetica, sans-serif',
            fontWeight: '200',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          style={{
            background: isLoading || !inputValue.trim() ? '#d4c4b2' : '#4b3828',
            border: 'none',
            color: 'white',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
            fontSize: '18px',
            opacity: isLoading || !inputValue.trim() ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.3s',
          }}
          onMouseEnter={(e) => {
            if (!isLoading && inputValue.trim()) {
              e.currentTarget.style.background = '#d4c4b2';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading && inputValue.trim()) {
              e.currentTarget.style.background = '#4b3828';
            }
          }}
        >
          ➤
        </button>
      </form>
    </div>
  );
}
