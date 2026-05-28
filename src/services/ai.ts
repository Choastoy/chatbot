import Groq from "groq-sdk";
import { config } from "../config.js";
import { SYSTEM_PROMPT, TOOLS } from "../prompts/system.js";
import { checkAvailability, formatAvailabilityMessage } from "./calendar.js";
import { sendTextMessage } from "./whatsapp.js";
import type {
  ConversationSession,
  CheckCalendarArgs,
  EscalateToHumanArgs,
  ChatMessage,
} from "../types/index.js";

const client = new Groq({ apiKey: config.groq.apiKey });

export async function processMessage(
  session: ConversationSession,
  incomingText: string
): Promise<string> {
  session.messages.push({ role: "user", content: incomingText });

  const messages = (): ChatMessage[] => [
    { role: "system", content: SYSTEM_PROMPT },
    ...session.messages,
  ];

  let response = await client.chat.completions.create({
    model: config.groq.model,
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: "auto",
    messages: messages(),
  });

  // Agentic loop: keep processing until no more tool calls
  while (response.choices[0].finish_reason === "tool_calls") {
    const assistantMessage = response.choices[0].message;
    session.messages.push(assistantMessage as ChatMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let result: string;

      if (name === "check_calendar_availability") {
        const calArgs = args as CheckCalendarArgs;
        try {
          const slots = await checkAvailability(calArgs.start_date, calArgs.end_date);
          result = formatAvailabilityMessage(slots);
        } catch (err) {
          console.error("Calendar check failed:", err);
          result =
            "Não foi possível verificar a disponibilidade no momento. Tente novamente em instantes.";
        }
      } else if (name === "escalate_to_human") {
        const escalateArgs = args as EscalateToHumanArgs;
        result = await handleEscalation(session.phoneNumber, escalateArgs);
        session.escalated = true;
      } else {
        result = "Ferramenta desconhecida.";
      }

      session.messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    response = await client.chat.completions.create({
      model: config.groq.model,
      max_tokens: 1024,
      tools: TOOLS,
      tool_choice: "auto",
      messages: messages(),
    });
  }

  const reply =
    response.choices[0].message.content ??
    "Desculpe, não consegui processar sua mensagem.";

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
