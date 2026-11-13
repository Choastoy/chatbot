import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import { assinaturaValida, instagramNome, whatsappMarcarLida } from "../channels/meta.js";
import { getDb, persist } from "../db/store.js";
import { jaProcessado, receberMensagem } from "../services/conversation.js";

export const webhookRouter = Router();

type RawReq = Request & { rawBody?: Buffer };

// Verificação do webhook (mesmo endpoint para WhatsApp e Instagram)
webhookRouter.get("/webhook", (req: Request, res: Response) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.meta.webhookVerifyToken) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

webhookRouter.post("/webhook", (req: RawReq, res: Response) => {
  if (!assinaturaValida(req.rawBody, req.header("x-hub-signature-256"))) {
    res.sendStatus(401);
    return;
  }
  // A Meta exige 200 rápido; o processamento segue em segundo plano
  res.sendStatus(200);

  const body = req.body as { object?: string; entry?: any[] };
  try {
    if (body.object === "whatsapp_business_account") processarWhatsApp(body.entry ?? []);
    else if (body.object === "instagram" || body.object === "page") processarInstagram(body.entry ?? []);
  } catch (err) {
    console.error("Payload de webhook inesperado:", err);
  }
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function processarWhatsApp(entries: any[]) {
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const nomes = new Map<string, string>(
        (value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name ?? ""])
      );
      for (const m of value.messages ?? []) {
        if (jaProcessado(m.id)) continue;
        const texto = textoWhatsApp(m);
        if (!texto) continue;
        whatsappMarcarLida(m.id);
        receberMensagem({ canal: "whatsapp", contatoId: m.from, texto, nomePerfil: nomes.get(m.from) });
      }
    }
  }
}

function textoWhatsApp(m: any): string | null {
  switch (m.type) {
    case "text":
      return m.text?.body ?? null;
    case "button":
      return m.button?.text ?? null;
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "location":
      return `[cliente enviou uma localização: ${m.location?.latitude}, ${m.location?.longitude}]`;
    case "audio":
    case "image":
    case "video":
    case "sticker":
    case "document":
      return `[cliente enviou ${m.type === "audio" ? "um áudio" : m.type === "image" ? "uma imagem" : `um(a) ${m.type}`}${m[m.type]?.caption ? ` com legenda: "${m[m.type].caption}"` : ""}]`;
    case "reaction":
      return null;
    default:
      return null;
  }
}

function processarInstagram(entries: any[]) {
  for (const entry of entries) {
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      if (!m || m.is_echo || m.is_deleted) continue;
      if (jaProcessado(m.mid)) continue;
      let texto: string | null = m.text ?? null;
      if (!texto && m.attachments?.length) {
        const tipo = m.attachments[0].type;
        texto = tipo === "story_mention" ? "[cliente mencionou a casa em um story]" : `[cliente enviou ${tipo}]`;
      }
      if (m.reply_to?.story && texto) texto = `[resposta a um story] ${texto}`;
      if (!texto) continue;
      const senderId: string = ev.sender.id;
      receberMensagem({ canal: "instagram", contatoId: senderId, texto });
      // Nome do perfil em paralelo, sem atrasar nem reordenar mensagens
      const conhecido = getDb().clientes.some((c) => c.canal === "instagram" && c.contatoId === senderId && c.nome);
      if (!conhecido) {
        instagramNome(senderId).then((nome) => {
          const c = getDb().clientes.find((x) => x.canal === "instagram" && x.contatoId === senderId);
          if (c && !c.nome && nome) {
            c.nome = nome;
            persist();
          }
        });
      }
    }
  }
}
