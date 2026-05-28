import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),

  whatsapp: {
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    webhookVerifyToken: required("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  },

  groq: {
    apiKey: required("GROQ_API_KEY"),
    model: "llama-3.3-70b-versatile" as const,
  },

  google: {
    serviceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    keyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    keyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
    calendarId: required("GOOGLE_CALENDAR_ID"),
  },

  owner: {
    whatsappNumber: required("OWNER_WHATSAPP_NUMBER"),
  },

  sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS ?? "3600", 10),
};
