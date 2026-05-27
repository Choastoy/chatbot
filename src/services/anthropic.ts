import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { SYSTEM_PROMPT, TOOLS } from "../prompts/system.js";
import {
  checkAvailability,
  formatAvailabilityMessage,
} from "./calendar.js";
import { sendTextMessage } from "./whatsapp.js";
import type {
  ConversationSession,
  CheckCalendarArgs,
  EscalateToHumanArgs,
} from "../types/index.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function processMessage(
  session: ConversationSession,
  incomingText: string
): Promise<string> {
  session.messages.push({ role: "user", content: incomingText });

  let response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: TOOLS as unknown as Anthropic.Tool[],
    messages: session.messages,
  });

  // Agentic loop: keep processing until we have a final text response
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // Add assistant turn with all content blocks
    session.messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      let result: string;

      if (toolUse.name === "check_calendar_availability") {
        const args = toolUse.input as CheckCalendarArgs;
        try {
          const slots = await checkAvailability(args.start_date, args.end_date);
          result = formatAvailabilityMessage(slots);
        } catch (err) {
          console.error("Calendar check failed:", err);
          result =
            "Não foi possível verificar a disponibilidade no momento. Tente novamente em instantes.";
        }
      } else if (toolUse.name === "escalate_to_human") {
        const args = toolUse.input as EscalateToHumanArgs;
        result = await handleEscalation(session.phoneNumber, args);
        session.escalated = true;
      } else {
        result = "Ferramenta desconhecida.";
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    session.messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS as unknown as Anthropic.Tool[],
      messages: session.messages,
    });
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const reply = textBlock?.text ?? "Desculpe, não consegui processar sua mensagem.";

  session.messages.push({ role: "assistant", content: reply });

  return reply;
}

async function handleEscalation(
  clientPhone: string,
  args: EscalateToHumanArgs
): Promise<string> {
  const { lead_profile } = args;

  const notification = [
    "🔔 *Novo Lead Qualificado* 🔔",
    "",
    `📱 Cliente: ${clientPhone}`,
    `📅 Data desejada: ${lead_profile.desired_date}`,
    `🎉 Tipo de evento: ${lead_profile.event_type}`,
    `👥 Convidados: ${lead_profile.guest_count}`,
    "",
    `💬 Resumo: ${lead_profile.summary}`,
    "",
    "O cliente foi informado que um atendente entrará em contato em breve.",
  ].join("\n");

  try {
    await sendTextMessage(config.owner.whatsappNumber, notification);
  } catch (err) {
    console.error("Failed to notify owner:", err);
  }

  return "Lead escalado com sucesso. Notificação enviada ao time comercial.";
}
