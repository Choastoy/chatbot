import { config } from "../config.js";
import { getDb, persist } from "../db/store.js";
import type { Canal, Conversa } from "../db/types.js";
import { responder } from "../ai/agent.js";
import { enviarTexto, formatarParaCanal } from "../channels/meta.js";
import { obterOuCriarCliente } from "./domain.js";

/** Fila por conversa: mensagens do mesmo cliente são processadas em ordem. */
const filas = new Map<string, Promise<unknown>>();

export function chaveConversa(canal: Canal, contatoId: string) {
  return `${canal}:${contatoId}`;
}

function obterConversa(canal: Canal, contatoId: string, clienteId: string): Conversa {
  const db = getDb();
  const key = chaveConversa(canal, contatoId);
  const agoraIso = new Date().toISOString();
  let c = db.conversas[key];
  const expirada =
    c && Date.now() - new Date(c.ultimaAtividade).getTime() > config.conversationTtlHours * 3600_000;
  if (!c) {
    c = {
      key,
      canal,
      contatoId,
      clienteId,
      messages: [],
      transcript: [],
      modo: "bot",
      iniciadaEm: agoraIso,
      ultimaAtividade: agoraIso,
      ultimaMsgCliente: agoraIso,
      naoLidas: 0,
    };
    db.conversas[key] = c;
  } else if (expirada) {
    // Nova sessão para a IA (contexto atualizado); o transcript é mantido para o painel.
    c.messages = [];
    c.transcript.push({ de: "sistema", texto: "— nova conversa —", em: agoraIso });
    if (c.modo === "humano") c.modo = "bot";
  }
  return c;
}

/** Evita processar o mesmo evento duas vezes (a Meta reenvia webhooks). */
export function jaProcessado(messageId: string): boolean {
  const db = getDb();
  if (db.processedMessageIds.includes(messageId)) return true;
  db.processedMessageIds.push(messageId);
  if (db.processedMessageIds.length > 2000) db.processedMessageIds.splice(0, 1000);
  return false;
}

export interface MensagemEntrada {
  canal: Canal;
  contatoId: string;
  texto: string;
  nomePerfil?: string;
}

/** Ponto único de entrada de mensagens de clientes (WhatsApp, Instagram e simulador). */
export function receberMensagem(msg: MensagemEntrada): Promise<string | null> {
  const key = chaveConversa(msg.canal, msg.contatoId);
  const anterior = filas.get(key) ?? Promise.resolve();
  const atual = anterior.then(() => processar(msg)).catch((err) => {
    console.error("Erro ao processar mensagem:", err);
    return null;
  });
  filas.set(key, atual);
  atual.finally(() => {
    if (filas.get(key) === atual) filas.delete(key);
  });
  return atual;
}

async function processar(msg: MensagemEntrada): Promise<string | null> {
  const cliente = obterOuCriarCliente(msg.canal, msg.contatoId, msg.nomePerfil);
  const conversa = obterConversa(msg.canal, msg.contatoId, cliente.id);
  const agoraIso = new Date().toISOString();

  conversa.transcript.push({ de: "cliente", texto: msg.texto, em: agoraIso });
  conversa.ultimaAtividade = agoraIso;
  conversa.ultimaMsgCliente = agoraIso;
  cliente.ultimaInteracao = agoraIso;
  persist();

  // Equipe assumiu: o bot fica em silêncio e o painel mostra como não lida
  if (conversa.modo === "humano") {
    conversa.naoLidas++;
    persist();
    return null;
  }

  const resposta = formatarParaCanal(msg.canal, await responder(conversa, cliente, msg.texto));
  conversa.transcript.push({ de: "bot", texto: resposta, em: new Date().toISOString() });
  conversa.ultimaAtividade = new Date().toISOString();
  // Se a IA transferiu nesta resposta, sinaliza a conversa para a equipe
  if ((conversa.modo as Conversa["modo"]) === "humano") conversa.naoLidas++;
  persist();

  try {
    await enviarTexto(msg.canal, msg.contatoId, resposta);
  } catch (err) {
    console.error(`Falha ao enviar resposta (${msg.canal}):`, (err as Error).message);
  }
  return resposta;
}

/** Resposta manual da equipe pelo painel. */
export async function responderComoHumano(key: string, texto: string) {
  const conversa = getDb().conversas[key];
  if (!conversa) throw new Error("Conversa não encontrada");
  await enviarTexto(conversa.canal, conversa.contatoId, texto);
  conversa.transcript.push({ de: "humano", texto, em: new Date().toISOString() });
  conversa.modo = "humano";
  conversa.naoLidas = 0;
  conversa.ultimaAtividade = new Date().toISOString();
  persist();
}

/**
 * Devolve a conversa ao bot. A IA abre um contexto novo que inclui o trecho
 * recente do transcript (com o que a equipe falou), em vez de reescrever turnos antigos.
 */
export function devolverAoBot(key: string) {
  const conversa = getDb().conversas[key];
  if (!conversa) throw new Error("Conversa não encontrada");
  conversa.modo = "bot";
  conversa.naoLidas = 0;
  conversa.messages = [];
  conversa.transcript.push({ de: "sistema", texto: "Conversa devolvida ao bot", em: new Date().toISOString() });
  persist();
}
