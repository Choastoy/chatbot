import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { getDb } from "../db/store.js";
import type { Cliente, Conversa } from "../db/types.js";
import { resumoCliente, textoInformacoes } from "../services/domain.js";
import { agora, DIAS } from "../services/time.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { executarFerramenta, TOOLS } from "./tools.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const MAX_ITERACOES = 8;
const MSG_ERRO =
  "Opa, tive um probleminha técnico aqui. Pode repetir sua mensagem em instantes? Se preferir, chamo alguém da equipe.";

function carimboAgora(): string {
  const a = agora();
  const [y, m, d] = a.data.split("-");
  return `<agora>${DIAS[a.diaSemana]}, ${d}/${m}/${y} ${a.hora} (data ISO ${a.data})</agora>`;
}

/**
 * Contexto enviado UMA vez, na abertura da conversa. Fica fixo dali em diante
 * (histórico só cresce), o que mantém cache e raciocínio válidos.
 */
function contextoAbertura(conversa: Conversa, cliente: Cliente): string {
  const { negocio } = getDb();
  return [
    "<contexto_da_casa>",
    `Canal desta conversa: ${conversa.canal === "teste" ? "simulador interno (trate como WhatsApp)" : conversa.canal}`,
    `Tom de voz da casa: ${negocio.tomDeVoz}`,
    "",
    textoInformacoes(),
    "</contexto_da_casa>",
    "",
    "<perfil_do_cliente>",
    resumoCliente(cliente),
    "</perfil_do_cliente>",
    ...historicoRecente(conversa),
  ].join("\n");
}

/** Trecho recente do transcript (ex.: após a equipe devolver a conversa ao bot). */
function historicoRecente(conversa: Conversa): string[] {
  const linhas = conversa.transcript
    .filter((m) => m.de !== "sistema")
    .slice(-12, -1) // a última é a mensagem atual
    .map((m) => `${m.de === "cliente" ? "Cliente" : m.de === "humano" ? "Equipe" : "Atendente virtual"}: ${m.texto}`);
  if (!linhas.length) return [];
  return ["", "<historico_recente>", ...linhas, "</historico_recente>"];
}

/**
 * Processa uma mensagem do cliente e devolve o texto da resposta.
 * Retorna null quando a conversa foi transferida e não há texto a enviar.
 */
export async function responder(conversa: Conversa, cliente: Cliente, textoCliente: string): Promise<string> {
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (conversa.messages.length === 0) {
    conteudo.push({ type: "text", text: contextoAbertura(conversa, cliente) });
  }
  conteudo.push({ type: "text", text: `${carimboAgora()}\n${textoCliente}` });
  conversa.messages.push({ role: "user", content: conteudo });

  for (let i = 0; i < MAX_ITERACOES; i++) {
    let resp: Anthropic.Beta.BetaMessage;
    try {
      resp = await client.beta.messages.create({
        model: config.anthropic.model,
        max_tokens: 8000,
        system: [{ type: "text", text: SYSTEM_PROMPT }],
        tools: TOOLS,
        messages: conversa.messages,
        // Cache automático do prefixo (prompt + ferramentas + histórico)
        cache_control: { type: "ephemeral" },
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        output_config: { effort: config.anthropic.effort },
        // Se a resposta for recusada por um classificador de segurança, a API
        // refaz automaticamente em um modelo de fallback na mesma chamada.
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.error("Rate limit na API da Anthropic");
      else if (err instanceof Anthropic.APIError) console.error(`Erro da API ${err.status}:`, err.message);
      else console.error("Erro ao chamar a IA:", err);
      return MSG_ERRO;
    }

    if (resp.stop_reason === "refusal") {
      console.warn("Resposta recusada:", resp.stop_details);
      return "Desculpe, não consigo ajudar com isso por aqui. Posso te ajudar com reservas, cardápio ou informações da casa?";
    }

    // Blocos de tool_use incompletos (corte por max_tokens) não podem ficar no histórico
    const blocos =
      resp.stop_reason === "max_tokens" ? resp.content.filter((b) => b.type !== "tool_use") : resp.content;
    conversa.messages.push({ role: "assistant", content: blocos as Anthropic.Beta.BetaContentBlockParam[] });

    if (resp.stop_reason === "tool_use") {
      const chamadas = resp.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const chamada of chamadas) {
        try {
          const saida = await executarFerramenta(chamada.name, chamada.input as Record<string, unknown>, {
            canal: conversa.canal,
            cliente,
            conversa,
          });
          resultados.push({ type: "tool_result", tool_use_id: chamada.id, content: saida });
        } catch (err) {
          console.error(`Falha na ferramenta ${chamada.name}:`, err);
          resultados.push({
            type: "tool_result",
            tool_use_id: chamada.id,
            content: "Erro interno ao executar a ferramenta.",
            is_error: true,
          });
        }
      }
      // Todos os resultados em uma única mensagem
      conversa.messages.push({ role: "user", content: resultados });
      continue;
    }

    const texto = resp.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return texto || "Pode me contar um pouco mais? Quero te ajudar direitinho.";
  }

  return MSG_ERRO;
}
