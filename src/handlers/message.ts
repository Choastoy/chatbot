import { getOrCreateSession, saveSession } from "../services/session.js";
import { processMessage } from "../services/ai.js";
import { sendTextMessage, markMessageAsRead } from "../services/whatsapp.js";

export async function handleIncomingMessage(
  phoneNumber: string,
  messageId: string,
  text: string
): Promise<void> {
  // Mark as read immediately so the user sees the double blue check
  markMessageAsRead(messageId).catch(() => {});

  const session = getOrCreateSession(phoneNumber);

  // Don't respond if already escalated — human takes over from here
  if (session.escalated) {
    return;
  }

  let reply: string;
  try {
    reply = await processMessage(session, text);
  } catch (err) {
    console.error("Error processing message:", err);
    reply =
      "Desculpe, tive um problema técnico momentâneo. Por favor, tente novamente em instantes.";
  }

  saveSession(session);
  await sendTextMessage(phoneNumber, reply);
}
