// API endpoint para chat con OpenAI - AR Studio
import { sendErrorNotification } from '../../lib/email';
import { checkRateLimit, getClientIP } from '../../lib/rateLimit';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 10 requests per minute per IP
  const clientIP = getClientIP(req);
  const rateLimitResult = checkRateLimit(clientIP, 10, 60000);

  if (!rateLimitResult.success) {
    const waitTime = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: waitTime,
    });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API Error:', error);

      // Enviar notificación por email
      await sendErrorNotification({
        errorType: 'OpenAI API Error',
        errorMessage: error.error?.message || JSON.stringify(error),
        requestData: { messages },
        timestamp: new Date().toISOString(),
      });

      return res.status(response.status).json({ error: 'OpenAI API error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Chat API Error:', error);

    // Enviar notificación por email
    await sendErrorNotification({
      errorType: 'Internal Server Error',
      errorMessage: error.message || String(error),
      requestData: { messages: req.body?.messages },
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({ error: 'Internal server error' });
  }
}
