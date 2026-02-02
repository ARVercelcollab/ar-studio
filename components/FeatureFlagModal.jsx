import { useState, useEffect } from 'react';

export default function FeatureFlagModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [agentChatEnabled, setAgentChatEnabled] = useState(false);

  useEffect(() => {
    // Verificar si el flag está activo al cargar
    const isEnabled = localStorage.getItem('AGENT_CHAT') === 'true';
    setAgentChatEnabled(isEnabled);
  }, []);

  const handleToggle = (e) => {
    const newValue = e.target.checked;
    setAgentChatEnabled(newValue);
    localStorage.setItem('AGENT_CHAT', newValue.toString());

    // Disparar evento personalizado para que otros componentes se enteren
    window.dispatchEvent(new Event('agentChatToggled'));
  };

  const handleKeyPress = (e) => {
    // Ctrl+Shift+F para abrir el modal
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: '#333',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}
        title="Feature Flags (Ctrl+Shift+F)"
      >
        ⚙️
      </button>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => setIsOpen(false)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '30px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 10000,
          minWidth: '350px',
        }}
      >
        <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>
          Feature Flags
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              gap: '12px',
            }}
          >
            <input
              type="checkbox"
              checked={agentChatEnabled}
              onChange={handleToggle}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
              }}
            />
            <div>
              <div style={{ fontWeight: '500', fontSize: '16px' }}>
                Agent Chat
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Activa el chat flotante con IA de AR Studio
              </div>
            </div>
          </label>
        </div>

        <button
          onClick={() => setIsOpen(false)}
          style={{
            width: '100%',
            padding: '10px',
            background: '#000',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Cerrar
        </button>

        <div style={{ marginTop: '15px', fontSize: '11px', color: '#999', textAlign: 'center' }}>
          Atajo: Ctrl+Shift+F
        </div>
      </div>
    </>
  );
}
