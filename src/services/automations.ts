import { getDb, newId, persist } from "../db/store.js";
import type { Automacao, AutomacaoId, Cliente, Envio } from "../db/types.js";
import { canalConfigurado, instagramTexto, whatsappTemplate, whatsappTexto } from "../channels/meta.js";
import { linkCardapio } from "./domain.js";
import { agora, DIAS, minutosAte, somarDias } from "./time.js";
import { chaveConversa } from "./conversation.js";

/**
 * Motor de automações de retenção. Roda a cada minuto e é idempotente:
 * cada disparo tem uma chave (ref) registrada em db.envios.
 *
 * Regras da Meta:
 * - WhatsApp: fora da janela de 24h desde a última mensagem do cliente, só
 *   é permitido enviar TEMPLATE aprovado. Configure o nome do template em cada
 *   automação; as variáveis {nome}, {bar}... viram parâmetros {{1}}, {{2}}... na ordem em que aparecem.
 * - Instagram: só dentro da janela de 24h (ou 7 dias com a tag HUMAN_AGENT, apenas para atendimento humano).
 */

const JANELA_MS = 24 * 3600_000;

function variaveis(cliente: Cliente, extra: Record<string, string> = {}): Record<string, string> {
  const { negocio, programacao } = getDb();
  const ativos = programacao.filter((p) => p.ativo).sort((a, b) => a.diaSemana - b.diaSemana);
  return {
    nome: cliente.nome?.split(" ")[0] || "tudo bem",
    bar: negocio.nome,
    link_avaliacao: negocio.linkAvaliacaoGoogle,
    link_cardapio: linkCardapio(),
    programacao: ativos.map((p) => `• ${DIAS[p.diaSemana]} ${p.horario} — ${p.titulo}`).join("\n"),
    programacao_curta: ativos.slice(0, 2).map((p) => `${p.titulo} (${DIAS[p.diaSemana]})`).join(" e "),
    ...extra,
  };
}

export function preencher(modelo: string, vars: Record<string, string>) {
  const usados: string[] = [];
  const texto = modelo.replace(/\{(\w+)\}/g, (_, k: string) => {
    usados.push(vars[k] ?? "");
    return vars[k] ?? "";
  });
  return { texto, parametros: usados };
}

function jaEnviado(automacaoId: AutomacaoId, ref: string) {
  return getDb().envios.some((e) => e.automacaoId === automacaoId && e.ref === ref && e.status === "enviado");
}

function registrar(e: Omit<Envio, "id" | "em">) {
  const db = getDb();
  db.envios.push({ ...e, id: newId("env"), em: new Date().toISOString() });
  if (db.envios.length > 5000) db.envios.splice(0, 1000);
  persist();
}

export async function enviarAutomacao(
  auto: Automacao,
  cliente: Cliente,
  ref: string,
  extra: Record<string, string> = {}
): Promise<Envio["status"]> {
  if (jaEnviado(auto.id, ref)) return "ignorado";
  const { texto, parametros } = preencher(auto.mensagem, variaveis(cliente, extra));
  const conversa = getDb().conversas[chaveConversa(cliente.canal, cliente.contatoId)];
  const dentroDaJanela = !!conversa && Date.now() - new Date(conversa.ultimaMsgCliente).getTime() < JANELA_MS;

  const falha = (detalhe: string): Envio["status"] => {
    registrar({ automacaoId: auto.id, clienteId: cliente.id, ref, status: "ignorado", detalhe });
    return "ignorado";
  };

  try {
    if (cliente.canal === "whatsapp") {
      if (!canalConfigurado("whatsapp")) return falha("WhatsApp não configurado");
      if (dentroDaJanela) await whatsappTexto(cliente.contatoId, texto);
      else if (auto.templateWhatsApp) await whatsappTemplate(cliente.contatoId, auto.templateWhatsApp, parametros);
      else return falha("Fora da janela de 24h e sem template configurado");
    } else if (cliente.canal === "instagram") {
      if (!canalConfigurado("instagram")) return falha("Instagram não configurado");
      if (!dentroDaJanela) return falha("Instagram: fora da janela de 24h");
      await instagramTexto(cliente.contatoId, texto);
    } else {
      return falha("Canal de teste");
    }
    if (conversa) {
      conversa.transcript.push({ de: "bot", texto: `[${auto.nome}] ${texto}`, em: new Date().toISOString() });
    }
    registrar({ automacaoId: auto.id, clienteId: cliente.id, ref, status: "enviado", detalhe: "" });
    return "enviado";
  } catch (err) {
    registrar({ automacaoId: auto.id, clienteId: cliente.id, ref, status: "falhou", detalhe: (err as Error).message });
    return "falhou";
  }
}

function horaChegou(horario: string, hora: string) {
  return !!horario && hora >= horario;
}

export async function rodarAutomacoes(): Promise<void> {
  const db = getDb();
  const { data: hoje, hora, diaSemana, mmdd } = agora();
  const cliente = (id: string) => db.clientes.find((c) => c.id === id);
  const auto = (id: AutomacaoId) => db.automacoes.find((a) => a.id === id && a.ativo);

  // 1. Lembrete de reserva X horas antes
  const lembrete = auto("lembrete_reserva");
  if (lembrete) {
    const janelaMin = (lembrete.horasAntes ?? 3) * 60;
    for (const r of db.reservas.filter((x) => x.status === "confirmada" && x.data >= hoje)) {
      const faltam = minutosAte(r.data, r.horario);
      const c = cliente(r.clienteId);
      // Não lembra reservas feitas há menos de 1h do horário
      const criadaHaMin = (Date.now() - new Date(r.criadaEm).getTime()) / 60000;
      if (c && faltam > 0 && faltam <= janelaMin && criadaHaMin > 30) {
        await enviarAutomacao(lembrete, c, r.id, {
          horario: r.horario,
          pessoas: String(r.pessoas),
          codigo: r.codigo,
          nome: (r.nome || c.nome).split(" ")[0],
        });
      }
    }
  }

  // 2. Avaliação no Google no dia seguinte à visita
  const avaliacao = auto("avaliacao_google");
  if (avaliacao && horaChegou(avaliacao.horario, hora)) {
    const ontem = somarDias(hoje, -1);
    for (const r of db.reservas.filter((x) => x.data === ontem && ["confirmada", "concluida"].includes(x.status))) {
      const c = cliente(r.clienteId);
      if (c) await enviarAutomacao(avaliacao, c, r.id);
    }
  }

  // 3. Aniversário
  const aniversario = auto("aniversario");
  if (aniversario && horaChegou(aniversario.horario, hora)) {
    for (const c of db.clientes.filter((x) => x.aniversario === mmdd)) {
      await enviarAutomacao(aniversario, c, `${hoje.slice(0, 4)}`);
    }
  }

  // 4. Programação semanal (apenas para quem aceitou novidades)
  const semanal = auto("programacao_semanal");
  if (semanal && semanal.diaSemana === diaSemana && horaChegou(semanal.horario, hora)) {
    for (const c of db.clientes.filter((x) => x.aceitaNovidades)) {
      await enviarAutomacao(semanal, c, hoje);
    }
  }

  // 5. Reativação de clientes sumidos (apenas quem aceitou novidades)
  const reativacao = auto("reativacao");
  if (reativacao && horaChegou(reativacao.horario, hora)) {
    const limite = somarDias(hoje, -(reativacao.diasSemVisita ?? 45));
    for (const c of db.clientes.filter((x) => x.aceitaNovidades && x.ultimaInteracao.slice(0, 10) <= limite)) {
      const jaRecebeuRecente = db.envios.some(
        (e) => e.automacaoId === "reativacao" && e.clienteId === c.id && e.em.slice(0, 10) > limite
      );
      if (!jaRecebeuRecente) await enviarAutomacao(reativacao, c, hoje);
    }
  }

  // Marca como concluídas as reservas de dias passados
  for (const r of db.reservas.filter((x) => x.status === "confirmada" && x.data < hoje)) {
    r.status = "concluida";
    persist();
  }
}

export function iniciarAgendador() {
  let rodando = false;
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await rodarAutomacoes();
    } catch (err) {
      console.error("Erro nas automações:", err);
    } finally {
      rodando = false;
    }
  };
  setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
}
