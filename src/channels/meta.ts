import axios from "axios";
import crypto from "crypto";
import { config } from "../config.js";
import type { Canal } from "../db/types.js";

const graph = () => `https://graph.facebook.com/${config.meta.graphVersion}`;

export function canalConfigurado(canal: Canal): boolean {
  if (canal === "whatsapp") return !!(config.whatsapp.phoneNumberId && config.whatsapp.accessToken);
  if (canal === "instagram") return !!(config.instagram.accountId && config.instagram.accessToken);
  return true;
}

/** Valida X-Hub-Signature-256 quando META_APP_SECRET estiver definido. */
export function assinaturaValida(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  if (!config.meta.appSecret) return true;
  if (!rawBody || !signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", config.meta.appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------- WhatsApp Cloud API ----------------

async function waPost(body: object) {
  if (!canalConfigurado("whatsapp")) throw new Error("WhatsApp não configurado");
  await axios.post(`${graph()}/${config.whatsapp.phoneNumberId}/messages`, body, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
  });
}

export async function whatsappTexto(to: string, body: string) {
  await waPost({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: true } });
}

/**
 * Envia template aprovado (necessário para iniciar conversa fora da janela de 24h).
 * Os parâmetros preenchem {{1}}, {{2}}... do corpo do template, na ordem.
 */
export async function whatsappTemplate(to: string, template: string, params: string[]) {
  await waPost({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: config.whatsapp.templateLanguage },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text: paramTemplate(text) })) }]
        : [],
    },
  });
}

/** Parâmetros de template não aceitam quebras de linha, tabs ou 4+ espaços seguidos. */
function paramTemplate(texto: string): string {
  return (texto || "-").replace(/\s*\n+\s*/g, " · ").replace(/\t/g, " ").replace(/ {4,}/g, "   ").trim();
}

export async function whatsappMarcarLida(messageId: string) {
  await waPost({ messaging_product: "whatsapp", status: "read", message_id: messageId }).catch(() => {});
}

// ---------------- Instagram Messaging API ----------------

export async function instagramTexto(recipientId: string, text: string, foraDaJanela = false) {
  if (!canalConfigurado("instagram")) throw new Error("Instagram não configurado");
  // Instagram limita mensagens a 1000 caracteres
  const partes = dividir(text, 1000);
  for (const parte of partes) {
    await axios.post(
      `${graph()}/${config.instagram.accountId}/messages`,
      {
        recipient: { id: recipientId },
        message: { text: parte },
        ...(foraDaJanela ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
      },
      { headers: { Authorization: `Bearer ${config.instagram.accessToken}` } }
    );
  }
}

/** Nome do perfil do Instagram (melhor esforço; requer permissão de perfil). */
export async function instagramNome(igsid: string): Promise<string> {
  if (!canalConfigurado("instagram")) return "";
  try {
    const { data } = await axios.get(`${graph()}/${igsid}`, {
      params: { fields: "name,username" },
      headers: { Authorization: `Bearer ${config.instagram.accessToken}` },
    });
    return data.name || (data.username ? `@${data.username}` : "");
  } catch {
    return "";
  }
}

function dividir(texto: string, max: number): string[] {
  if (texto.length <= max) return [texto];
  const out: string[] = [];
  let atual = "";
  for (const paragrafo of texto.split("\n")) {
    if ((atual + "\n" + paragrafo).length > max && atual) {
      out.push(atual);
      atual = paragrafo;
    } else {
      atual = atual ? `${atual}\n${paragrafo}` : paragrafo;
    }
  }
  if (atual) out.push(atual.slice(0, max));
  return out;
}

/** Envia texto no canal da conversa. No canal "teste" não envia nada. */
export async function enviarTexto(canal: Canal, contatoId: string, texto: string) {
  if (canal === "whatsapp") return whatsappTexto(contatoId, texto);
  if (canal === "instagram") return instagramTexto(contatoId, texto);
}

/** Converte *negrito* do WhatsApp para texto puro no Instagram. */
export function formatarParaCanal(canal: Canal, texto: string): string {
  if (canal === "instagram") return texto.replace(/\*(.+?)\*/g, "$1");
  return texto;
}
