# Configuración de Notificaciones de Email para Errores del Agente

Este documento explica cómo configurar las notificaciones por email cuando ocurren errores en el agente de chat de AR Studio.

## Pasos para Configurar Resend

### 1. Crear una cuenta en Resend

1. Ve a [resend.com](https://resend.com)
2. Regístrate con tu email
3. Confirma tu email

### 2. Obtener tu API Key

1. Una vez dentro del dashboard de Resend, ve a la sección "API Keys"
2. Haz clic en "Create API Key"
3. Dale un nombre (ejemplo: "AR Studio Production")
4. Copia la API key generada

### 3. Configurar Variables de Entorno

#### Desarrollo Local (.env.local)

Agrega la siguiente variable a tu archivo `.env.local`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Producción (Vercel)

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega una nueva variable:
   - Name: `RESEND_API_KEY`
   - Value: Tu API key de Resend
   - Environment: Production (y también Development si quieres probar)

### 4. Configurar Dominio (Opcional pero Recomendado)

Por defecto, Resend usa `onboarding@resend.dev` como remitente. Para usar tu propio dominio:

1. En Resend, ve a "Domains"
2. Haz clic en "Add Domain"
3. Ingresa tu dominio (ejemplo: `studioar.es`)
4. Sigue las instrucciones para agregar los registros DNS
5. Una vez verificado, actualiza el archivo `/lib/email.js`:
   ```javascript
   from: 'AR Studio <notificaciones@studioar.es>',
   ```

## Cómo Funciona

El sistema de notificaciones detecta automáticamente dos tipos de errores:

1. **Errores de la API de OpenAI**: Cuando OpenAI devuelve un error (problemas con la key, límite de rate, etc.)
2. **Errores Internos del Servidor**: Cualquier error no esperado en el código

Cuando ocurre un error, recibirás un email en `angelcamacho1708@gmail.com` con:
- Tipo de error
- Mensaje de error detallado
- Último mensaje del usuario
- Timestamp del error
- Contexto adicional

## Cambiar el Email de Destino

Para cambiar el email que recibe las notificaciones, edita el archivo `/lib/email.js` línea 57:

```javascript
to: 'tu-nuevo-email@example.com',
```

## Deshabilitar Notificaciones

Si por alguna razón quieres deshabilitar las notificaciones temporalmente:

1. En Vercel, elimina o comenta la variable de entorno `RESEND_API_KEY`
2. El sistema automáticamente detectará que no está configurada y no intentará enviar emails

## Límites del Plan Gratuito de Resend

- 100 emails por día
- 3,000 emails por mes

Esto debería ser más que suficiente para notificaciones de errores. Si necesitas más, puedes actualizar al plan Pro.

## Pruebas

Para probar que las notificaciones funcionan:

1. Temporalmente, modifica tu `OPENAI_API_KEY` en `.env.local` con un valor inválido
2. Abre la aplicación y envía un mensaje en el chat
3. Deberías recibir un email de notificación de error en unos segundos
4. Restaura tu `OPENAI_API_KEY` correcta después de la prueba

## Soporte

Si tienes problemas:
- Revisa los logs de Vercel (Dashboard → Deployments → [tu deployment] → Functions)
- Revisa los logs de Resend (Dashboard → Logs)
- Verifica que todas las variables de entorno estén correctamente configuradas
