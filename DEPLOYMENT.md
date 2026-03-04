# AR Studio - Deployment Instructions

## Environment Variables Required

Before deploying to production, you must configure these environment variables in your hosting platform (Vercel/Netlify/etc.):

### Required Variables

1. **OPENAI_API_KEY**
   - Your OpenAI API key for the chatbot
   - Get it from: https://platform.openai.com/api-keys
   - Example: `sk-proj-xxxxxxxxxxxxx`

2. **RESEND_API_KEY**
   - Your Resend API key for email notifications
   - Get it from: https://resend.com/api-keys
   - Example: `re_xxxxxxxxxxxxx`

## Vercel Deployment

1. Go to your project settings in Vercel
2. Navigate to "Environment Variables"
3. Add both variables above
4. Deploy or redeploy your application

## Local Development

1. Copy `.env.example` to `.env.local`
2. Fill in your actual API keys
3. Run `npm run dev`

**IMPORTANT**: Never commit `.env.local` to git. It's already in `.gitignore`.
