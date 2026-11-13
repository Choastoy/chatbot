import type Anthropic from "@anthropic-ai/sdk";
import { getDb, persist } from "../db/store.js";
import type { Canal, Cliente, Conversa } from "../db/types.js";
import {
  cancelarReserva,
  criarReserva,
  disponibilidade,
  salvarLead,
  textoCardapio,
  textoInformacoes,
} from "../services/domain.js";
import { formatarData } from "../services/time.js";
import { notificarEquipe } from "../services/notify.js";

/**
 * Ferramentas disponíveis ao atendente. A lista é fixa (não muda entre
 * requisições) para manter o cache e o histórico válidos.
 */
export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "consultar_cardapio",
    description:
      "Retorna o cardápio atualizado com preços, tags (vegano, picante...), destaques e itens esgotados, mais o link do cardápio online. Chame antes de citar qualquer item ou preço. Use 'busca' para filtrar por categoria, ingrediente ou tag; omita para o cardápio inteiro.",
    input_schema: {
      type: "object",
      properties: { busca: { type: "string", description: "Termo opcional: 'drinks', 'vegano', 'torresmo'..." } },
    },
  },
  {
    name: "consultar_informacoes",
    description:
      "Retorna a versão mais recente da base de conhecimento da casa: horários, endereço, couvert, estacionamento, pagamento, programação da semana e perguntas frequentes. Use quando a resposta não estiver no contexto inicial ou o cliente questionar uma informação.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "verificar_disponibilidade",
    description:
      "Verifica horários livres para reserva em uma data para um número de pessoas. Obrigatório antes de oferecer horários ou criar reserva.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato YYYY-MM-DD" },
        pessoas: { type: "integer", description: "Número de pessoas" },
      },
      required: ["data", "pessoas"],
    },
  },
  {
    name: "criar_reserva",
    description:
      "Cria e confirma a reserva. Só chame depois de verificar_disponibilidade e de o cliente escolher o horário e informar o nome.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "YYYY-MM-DD" },
        horario: { type: "string", description: "HH:MM, exatamente um dos horários livres retornados" },
        pessoas: { type: "integer" },
        nome: { type: "string", description: "Nome para a reserva" },
        ocasiao: { type: "string", description: "Aniversário, encontro, trabalho... (opcional)" },
        observacoes: { type: "string", description: "Preferências: varanda, cadeirinha, bolo... (opcional)" },
      },
      required: ["data", "horario", "pessoas", "nome"],
    },
  },
  {
    name: "cancelar_reserva",
    description: "Cancela uma reserva do próprio cliente pelo código.",
    input_schema: {
      type: "object",
      properties: { codigo: { type: "string", description: "Código de 5 caracteres da reserva" } },
      required: ["codigo"],
    },
  },
  {
    name: "atualizar_perfil_cliente",
    description:
      "Salva dados do cliente para atendimento personalizado e automações (aniversário, novidades). Envie só os campos que o cliente informou.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        aniversario: { type: "string", description: "DD/MM" },
        preferencias: { type: "string", description: "Ex.: 'vegetariano, prefere varanda'" },
        aceita_novidades: { type: "boolean", description: "Aceitou receber programação e novidades" },
      },
    },
  },
  {
    name: "obter_roteiro_qualificacao",
    description:
      "Sem argumentos: lista os fluxos de qualificação ativos e quando usar cada um. Com fluxo_id: retorna o roteiro completo (campos a coletar, objetivo, mensagem final).",
    input_schema: {
      type: "object",
      properties: { fluxo_id: { type: "string" } },
    },
  },
  {
    name: "registrar_lead",
    description:
      "Registra ou atualiza um lead de um fluxo de qualificação com os dados coletados até agora. Retorna score, temperatura, campos faltantes e a próxima ação.",
    input_schema: {
      type: "object",
      properties: {
        fluxo_id: { type: "string" },
        dados: {
          type: "object",
          description: "Campos coletados, usando os ids do roteiro como chave. Valores em texto.",
          additionalProperties: { type: "string" },
        },
        resumo: { type: "string", description: "Resumo de 1 a 2 frases para a equipe comercial" },
      },
      required: ["fluxo_id", "dados", "resumo"],
    },
  },
  {
    name: "transferir_para_humano",
    description:
      "Passa a conversa para a equipe. O bot para de responder até a equipe devolver a conversa. Use nos casos descritos nas instruções.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", enum: ["pedido_cliente", "reclamacao", "lead_quente", "alergia", "nao_resolvido", "outro"] },
        resumo: { type: "string", description: "O que o cliente precisa, em 1 a 2 frases" },
      },
      required: ["motivo", "resumo"],
    },
  },
];

export interface ToolContext {
  canal: Canal;
  cliente: Cliente;
  conversa: Conversa;
}

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown) => (typeof v === "number" ? Math.round(v) : parseInt(String(v ?? ""), 10));

export async function executarFerramenta(nome: string, input: Input, ctx: ToolContext): Promise<string> {
  const db = getDb();
  switch (nome) {
    case "consultar_cardapio":
      return textoCardapio(str(input.busca) || undefined);

    case "consultar_informacoes":
      return textoInformacoes();

    case "verificar_disponibilidade": {
      const pessoas = int(input.pessoas);
      if (!pessoas || pessoas < 1) return "Erro: informe o número de pessoas.";
      const r = disponibilidade(str(input.data), pessoas);
      if (!r.ok) return `Indisponível: ${r.motivo}`;
      return r.horariosLivres.length
        ? `${formatarData(r.data)}: horários livres para ${pessoas} pessoas: ${r.horariosLivres.join(", ")}.`
        : `${formatarData(r.data)}: todos os horários (${r.todosHorarios.join(", ")}) estão lotados para ${pessoas} pessoas. Sugira outra data.`;
    }

    case "criar_reserva": {
      const res = criarReserva(ctx.cliente, ctx.canal, {
        data: str(input.data),
        horario: str(input.horario),
        pessoas: int(input.pessoas),
        nome: str(input.nome),
        ocasiao: str(input.ocasiao),
        observacoes: str(input.observacoes),
      });
      if (!res.ok) return `Não foi possível reservar: ${res.motivo}`;
      const r = res.reserva;
      const tol = db.reservaConfig.toleranciaAtrasoMin;
      return `Reserva confirmada. Código ${r.codigo} · ${formatarData(r.data)} às ${r.horario} · ${r.pessoas} pessoas · nome ${r.nome}${r.ocasiao ? ` · ${r.ocasiao}` : ""}. Tolerância de atraso: ${tol} minutos. O cliente receberá lembrete automático no dia.`;
    }

    case "cancelar_reserva": {
      const r = cancelarReserva(ctx.cliente, str(input.codigo));
      return r.ok ? `Reserva ${r.reserva!.codigo} cancelada.` : `Erro: ${r.motivo}`;
    }

    case "atualizar_perfil_cliente": {
      const c = ctx.cliente;
      const salvos: string[] = [];
      if (str(input.nome)) {
        c.nome = str(input.nome);
        salvos.push("nome");
      }
      const aniv = str(input.aniversario).match(/^(\d{1,2})\/(\d{1,2})/);
      if (aniv) {
        c.aniversario = `${aniv[2].padStart(2, "0")}-${aniv[1].padStart(2, "0")}`;
        salvos.push("aniversário");
      }
      if (str(input.preferencias)) {
        c.preferencias = str(input.preferencias);
        salvos.push("preferências");
      }
      if (typeof input.aceita_novidades === "boolean") {
        c.aceitaNovidades = input.aceita_novidades;
        salvos.push("novidades");
      }
      persist();
      return salvos.length ? `Perfil atualizado: ${salvos.join(", ")}.` : "Nada para atualizar.";
    }

    case "obter_roteiro_qualificacao": {
      const ativos = db.fluxos.filter((f) => f.ativo);
      const id = str(input.fluxo_id);
      if (!id) {
        return ativos.length
          ? "Fluxos ativos:\n" + ativos.map((f) => `- ${f.id}: ${f.nome}. Use quando: ${f.gatilho}`).join("\n")
          : "Nenhum fluxo ativo. Transfira para humano se for evento ou grupo.";
      }
      const f = ativos.find((x) => x.id === id);
      if (!f) return `Fluxo "${id}" não existe ou está inativo. Ativos: ${ativos.map((x) => x.id).join(", ")}`;
      return [
        `Fluxo ${f.id} — ${f.nome}`,
        `Objetivo: ${f.objetivo}`,
        `Campos a coletar (um por vez, obrigatórios primeiro):`,
        ...f.campos.map((c) => `- ${c.id}${c.obrigatorio ? " (obrigatório)" : ""}: ${c.pergunta}`),
        `Mensagem final ao concluir: "${f.mensagemFinal}"`,
      ].join("\n");
    }

    case "registrar_lead": {
      const f = db.fluxos.find((x) => x.id === str(input.fluxo_id) && x.ativo);
      if (!f) return "Erro: fluxo inválido. Chame obter_roteiro_qualificacao.";
      const dadosBrutos = (input.dados ?? {}) as Record<string, unknown>;
      const dados = Object.fromEntries(
        Object.entries(dadosBrutos).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v)
      );
      const { lead, faltando, motivos, virouQuente, virouQualificado } = salvarLead(ctx.cliente, f, dados, str(input.resumo));
      let proxima: string;
      if (faltando.length) {
        proxima = `Continue coletando: ${faltando.join(", ")}.`;
      } else if (lead.temperatura === "quente" && f.transferirSeQuente) {
        proxima = `Lead quente. Envie a mensagem final do fluxo e chame transferir_para_humano com motivo lead_quente.`;
      } else {
        proxima = `Qualificação completa. Envie a mensagem final do fluxo; a equipe dará continuidade.`;
      }
      if (virouQuente || virouQualificado) {
        notificarEquipe(
          `🔥 Lead ${lead.temperatura.toUpperCase()} (${lead.score} pts) — ${f.nome}\n` +
            `Cliente: ${ctx.cliente.nome || "-"} · ${ctx.canal} ${ctx.cliente.contatoId}\n` +
            Object.entries(lead.dados).map(([k, v]) => `• ${k}: ${v}`).join("\n") +
            `\n📝 ${lead.resumo}`
        ).catch(() => {});
      }
      return `Lead ${lead.id} salvo. Score ${lead.score}/100 · ${lead.temperatura}${motivos.length ? ` (${motivos.join("; ")})` : ""}. ${proxima}`;
    }

    case "transferir_para_humano": {
      ctx.conversa.modo = "humano";
      ctx.conversa.transcript.push({
        de: "sistema",
        texto: `Transferido para humano (${str(input.motivo)}): ${str(input.resumo)}`,
        em: new Date().toISOString(),
      });
      persist();
      notificarEquipe(
        `🙋 Atendimento humano solicitado (${str(input.motivo)})\n` +
          `Cliente: ${ctx.cliente.nome || "-"} · ${ctx.canal} ${ctx.cliente.contatoId}\n📝 ${str(input.resumo)}\n` +
          `Responda pelo painel: Conversas.`
      ).catch(() => {});
      return "Transferido. A equipe foi notificada. Despeça-se avisando que alguém da equipe continua o atendimento por aqui.";
    }

    default:
      return `Ferramenta desconhecida: ${nome}`;
  }
}
