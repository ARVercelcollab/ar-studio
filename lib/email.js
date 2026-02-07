import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envía un email de notificación cuando ocurre un error en el agente
 * @param {Object} errorDetails - Detalles del error
 * @param {string} errorDetails.errorType - Tipo de error (OpenAI API, Internal, etc.)
 * @param {string} errorDetails.errorMessage - Mensaje de error
 * @param {Object} errorDetails.requestData - Datos de la petición que causó el error
 * @param {string} errorDetails.timestamp - Timestamp del error
 */
export async function sendErrorNotification(errorDetails) {
  try {
    // Si no hay API key configurada, solo logear sin enviar email
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY no configurada. No se enviará email de notificación.');
      return;
    }

    const { errorType, errorMessage, requestData, timestamp } = errorDetails;

    // Formatear el último mensaje del usuario si existe
    const lastUserMessage = requestData?.messages?.find(msg => msg.role === 'user')?.content || 'No disponible';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">⚠️ Error en Agente AR Studio</h2>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Detalles del Error</h3>
          <p><strong>Tipo de Error:</strong> ${errorType}</p>
          <p><strong>Mensaje:</strong> ${errorMessage}</p>
          <p><strong>Fecha y Hora:</strong> ${timestamp}</p>
        </div>

        <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Último Mensaje del Usuario</h3>
          <p style="white-space: pre-wrap;">${lastUserMessage}</p>
        </div>

        ${requestData ? `
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Contexto Adicional</h3>
            <p><strong>Total de mensajes:</strong> ${requestData.messages?.length || 0}</p>
          </div>
        ` : ''}

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

        <p style="color: #666; font-size: 12px;">
          Esta es una notificación automática del sistema de monitoreo de AR Studio.
        </p>
      </div>
    `;

    const result = await resend.emails.send({
      from: 'open ai error <facturas@studioar.es>',
      to: 'angelcamacho1708@gmail.com',
      subject: `🚨 Error en Agente AR Studio - ${errorType}`,
      html: emailHtml,
    });

    console.log('Email de notificación enviado:', result);
    return result;
  } catch (emailError) {
    // Si falla el envío de email, solo logear el error sin interrumpir el flujo
    console.error('Error al enviar email de notificación:', emailError);
  }
}
