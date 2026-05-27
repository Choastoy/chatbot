import readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { SYSTEM_PROMPT, TOOLS } from "./src/prompts/system.js";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const messages: Anthropic.MessageParam[] = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n=== Couch AI — Teste Local ===");
console.log("Simulando conversa de WhatsApp (sem envio real)");
console.log("Digite 'sair' para encerrar\n");

async function chat(userInput: string): Promise<void> {
  messages.push({ role: "user", content: userInput });

  let response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: TOOLS as unknown as Anthropic.Tool[],
    messages,
  });

  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      let result: string;

      if (toolUse.name === "check_calendar_availability") {
        const args = toolUse.input as { start_date: string; end_date: string };
        // Mock calendar: weekends in June/July 2026 are booked, rest free
        const start = new Date(args.start_date);
        const end = new Date(args.end_date);
        const lines: string[] = ["Disponibilidade (mock):"];
        const cur = new Date(start);
        while (cur <= end) {
          const day = cur.getDay();
          const dateStr = cur.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
          const booked = (day === 6 && cur.getMonth() === 5) || (day === 0 && cur.getMonth() === 6);
          lines.push(`${booked ? "❌" : "✅"} ${dateStr}${booked ? " (reservado)" : " (disponível)"}`);
          cur.setDate(cur.getDate() + 1);
        }
        result = lines.join("\n");
        console.log(`\n[🔧 FERRAMENTA: check_calendar_availability]\n${result}\n`);
      } else if (toolUse.name === "escalate_to_human") {
        const args = toolUse.input as { lead_profile: { desired_date: string; event_type: string; guest_count: number; summary: string } };
        const lp = args.lead_profile;
        result = "Lead escalado com sucesso.";
        console.log(`\n[🚨 LEAD QUALIFICADO — notificando dono]`);
        console.log(`   Data: ${lp.desired_date}`);
        console.log(`   Evento: ${lp.event_type}`);
        console.log(`   Convidados: ${lp.guest_count}`);
        console.log(`   Resumo: ${lp.summary}\n`);
      } else {
        result = "Ferramenta desconhecida.";
      }

      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
    }

    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS as unknown as Anthropic.Tool[],
      messages,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const reply = textBlock?.text ?? "Sem resposta.";

  messages.push({ role: "assistant", content: reply });
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
