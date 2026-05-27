import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import { handleIncomingMessage } from "../handlers/message.js";
import type {
  WhatsAppWebhookPayload,
  WhatsAppTextMessage,
} from "../types/index.js";

export const webhookRouter = Router();

// GET: webhook verification challenge from Meta
webhookRouter.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.whatsapp.webhookVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST: incoming messages from WhatsApp
webhookRouter.post("/webhook", (req: Request, res: Response) => {
  // Always acknowledge immediately — Meta requires 200 within 5 seconds
  res.sendStatus(200);

  const payload = req.body as WhatsAppWebhookPayload;

  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages;
      if (!messages?.length) continue;

      for (const message of messages) {
        if (!isTextMessage(message)) continue;

        handleIncomingMessage(message.from, message.id, message.text.body).catch(
          (err) => console.error("Unhandled error in message handler:", err)
        );
      }
    }
  }
});

function isTextMessage(msg: unknown): msg is WhatsAppTextMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as WhatsAppTextMessage).type === "text" &&
    typeof (msg as WhatsAppTextMessage).text?.body === "string"
  );
}
