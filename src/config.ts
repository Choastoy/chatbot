import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return val;
}

const opt = (name: string) => process.env[name] || undefined;

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  /** URL pública do servidor (usada para montar o link do cardápio). */
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  dataFile: process.env.DATA_FILE ?? "./data/db.json",
  timezone: "America/Sao_Paulo",

  admin: {
    token: required("ADMIN_TOKEN"),
  },

  meta: {
    /** App secret do app da Meta — valida a assinatura X-Hub-Signature-256 dos webhooks. */
    appSecret: opt("META_APP_SECRET"),
    webhookVerifyToken: required("META_WEBHOOK_VERIFY_TOKEN"),
    graphVersion: process.env.META_GRAPH_VERSION ?? "v21.0",
  },

  whatsapp: {
    phoneNumberId: opt("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: opt("WHATSAPP_ACCESS_TOKEN"),
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "pt_BR",
  },

  instagram: {
    /** ID da conta profissional do Instagram (IG User ID) conectada à página. */
    accountId: opt("INSTAGRAM_ACCOUNT_ID"),
    /** Page access token com instagram_manage_messages. */
    accessToken: opt("INSTAGRAM_ACCESS_TOKEN"),
  },

  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    /** low | medium | high — atendimento por chat funciona bem em "low". */
    effort: (process.env.ANTHROPIC_EFFORT ?? "low") as "low" | "medium" | "high",
  },

  owner: {
    /** WhatsApp do dono/gerente que recebe leads quentes e transferências. */
    whatsappNumber: opt("OWNER_WHATSAPP_NUMBER"),
  },

  /** Após este tempo sem mensagens, a próxima mensagem abre uma conversa nova. */
  conversationTtlHours: parseInt(process.env.CONVERSATION_TTL_HOURS ?? "12", 10),
};
