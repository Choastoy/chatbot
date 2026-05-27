import axios from "axios";
import { config } from "../config.js";

const BASE_URL = "https://graph.facebook.com/v21.0";

export async function sendTextMessage(
  to: string,
  body: string
): Promise<void> {
  await axios.post(
    `${BASE_URL}/${config.whatsapp.phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  await axios.post(
    `${BASE_URL}/${config.whatsapp.phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
    {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
}
