import readline from "readline";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { SYSTEM_PROMPT, TOOLS } from "./src/prompts/system.js";
import type { ChatMessage, CheckCalendarArgs, EscalateToHumanArgs } from "./src/types/index.js";

dotenv.config();

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const sessionMessages: ChatMessage[] = [];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("\n=== Couch AI — Teste Local (Groq / Llama 3.3 70B) ===");
console.log("Simulando conversa de WhatsApp (sem envio real)");
console.log("Digite 'sair' para encerrar\n");

async function chat(userInput: string): Promise<void> {
  sessionMessages.push({ role: "user", content: userInput });

  const messages = (): ChatMessage[] => [
    { role: "system", content: SYSTEM_PROMPT },
    ...sessionMessages,
  ];

  let response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: "auto",
    messages: messages(),
  });

  while (response.choices[0].finish_reason === "tool_calls") {
    const assistantMessage = response.choices[0].message;
    sessionMessages.push(assistantMessage as ChatMessage);

    for (const toolCall of assistantMessage.tool_calls ?? []) {
      const args = JSON.parse(toolCall.function.arguments);
      let result: string;

      if (toolCall.function.name === "check_calendar_availability") {
        const { start_date, end_date } = args as CheckCalendarArgs;
        // Mock calendar: sábados de junho e domingos de julho 2026 reservados
        const cur = new Date(start_date);
        const end = new Date(end_date);
        const lines = ["Disponibilidade (mock):"];
        while (cur <= end) {
          const day = cur.getDay();
          const dateStr = cur.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
          const booked = (day === 6 && cur.getMonth() === 5) || (day === 0 && cur.getMonth() === 6);
          lines.push(`${booked ? "❌" : "✅"} ${dateStr}${booked ? " (reservado)" : ""}`);
          cur.setDate(cur.getDate() + 1);
        }
        result = lines.join("\n");
        console.log(`\n[🔧 check_calendar_availability]\n${result}\n`);
      } else if (toolCall.function.name === "escalate_to_human") {
        const { lead_profile } = args as EscalateToHumanArgs;
        result = "Lead escalado com sucesso.";
        console.log("\n[🚨 LEAD QUALIFICADO — notificaria o dono via WhatsApp]");
        console.log(`   Data: ${lead_profile.desired_date}`);
        console.log(`   Evento: ${lead_profile.event_type}`);
        console.log(`   Convidados: ${lead_profile.guest_count}`);
        console.log(`   Resumo: ${lead_profile.summary}\n`);
      } else {
        result = "Ferramenta desconhecida.";
      }

      sessionMessages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }

    response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      tools: TOOLS,
      tool_choice: "auto",
      messages: messages(),
    });
  }

  const reply = response.choices[0].message.content ?? "Sem resposta.";
  sessionMessages.push({ role: "assistant", content: reply });
  console.log(`\nBot: ${reply}\n`);
}

function prompt(): void {
  rl.question("Você: ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === "sair") {
      console.log("Encerrando.");
      rl.close();
      return;
    }
    try {
      await chat(trimmed);
    } catch (err) {
      console.error("Erro:", err);
    }
    prompt();
  });
}

prompt();
