import { Router, type NextFunction, type Request, type Response } from "express";
import crypto from "crypto";
import { config } from "../config.js";
import { getDb, newId, persist } from "../db/store.js";
import type { DB, EtapaLead, ItemCardapio, StatusReserva } from "../db/types.js";
import { canalConfigurado } from "../channels/meta.js";
import { devolverAoBot, receberMensagem, responderComoHumano, chaveConversa } from "../services/conversation.js";
import { pontuarLead } from "../services/domain.js";
import { agora, somarDias } from "../services/time.js";

export const adminRouter = Router();

function auth(req: Request, res: Response, next: NextFunction) {
  const token = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(config.admin.token);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.status(401).json({ erro: "Não autorizado" });
}
adminRouter.use(auth);

const ok = (res: Response, data: unknown = { ok: true }) => res.json(data);
const notFound = (res: Response) => res.status(404).json({ erro: "Não encontrado" });

/** Copia apenas chaves conhecidas do objeto de destino (evita lixo no banco). */
function aplicar<T extends object>(alvo: T, patch: Record<string, unknown>, bloqueadas: string[] = ["id"]) {
  for (const [k, v] of Object.entries(patch)) {
    if (bloqueadas.includes(k) || !(k in alvo)) continue;
    const atual = (alvo as Record<string, unknown>)[k];
    if (typeof atual === "number") (alvo as Record<string, unknown>)[k] = Number(v);
    else if (typeof atual === "boolean") (alvo as Record<string, unknown>)[k] = Boolean(v);
    else (alvo as Record<string, unknown>)[k] = v;
  }
  return alvo;
}

// ---------------- Estado geral + métricas ----------------

adminRouter.get("/state", (_req, res) => {
  const db = getDb();
  const hoje = agora().data;
  const semana = somarDias(hoje, 7);
  const conversas = Object.values(db.conversas)
    .map((c) => {
      const cli = db.clientes.find((x) => x.id === c.clienteId);
      const ultima = c.transcript[c.transcript.length - 1];
      return {
        key: c.key,
        canal: c.canal,
        contatoId: c.contatoId,
        nome: cli?.nome ?? "",
        modo: c.modo,
        naoLidas: c.naoLidas,
        ultimaAtividade: c.ultimaAtividade,
        ultimaMsgCliente: c.ultimaMsgCliente,
        preview: ultima ? `${ultima.de === "cliente" ? "" : "↪ "}${ultima.texto}`.slice(0, 120) : "",
      };
    })
    .sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade));

  const msgsBot = Object.values(db.conversas).flatMap((c) => c.transcript.filter((m) => m.de === "bot"));
  const msgsHumano = Object.values(db.conversas).flatMap((c) => c.transcript.filter((m) => m.de === "humano"));
  const reservasAtivas = db.reservas.filter((r) => r.status !== "cancelada");

  ok(res, {
    negocio: db.negocio,
    faq: db.faq,
    programacao: db.programacao,
    categorias: db.categorias,
    itens: db.itens,
    reservaConfig: db.reservaConfig,
    reservas: db.reservas,
    clientes: db.clientes,
    leads: db.leads,
    fluxos: db.fluxos,
    automacoes: db.automacoes,
    envios: db.envios.slice(-200).reverse(),
    conversas,
    canais: {
      whatsapp: canalConfigurado("whatsapp"),
      instagram: canalConfigurado("instagram"),
      urlCardapio: `${config.publicUrl}/cardapio`,
      urlWebhook: `${config.publicUrl}/webhook`,
    },
    metricas: {
      conversasHoje: conversas.filter((c) => c.ultimaAtividade.slice(0, 10) === hoje).length,
      aguardandoHumano: conversas.filter((c) => c.modo === "humano").length,
      reservasHoje: reservasAtivas.filter((r) => r.data === hoje).length,
      pessoasHoje: reservasAtivas.filter((r) => r.data === hoje).reduce((s, r) => s + r.pessoas, 0),
      reservasSemana: reservasAtivas.filter((r) => r.data >= hoje && r.data <= semana).length,
      reservasPeloBot: db.reservas.filter((r) => r.canal !== "teste").length,
      leadsQuentes: db.leads.filter((l) => l.temperatura === "quente" && !["fechado", "perdido"].includes(l.etapa)).length,
      leadsAbertos: db.leads.filter((l) => !["fechado", "perdido"].includes(l.etapa)).length,
      clientes: db.clientes.length,
      optIn: db.clientes.filter((c) => c.aceitaNovidades).length,
      respostasBot: msgsBot.length,
      respostasHumano: msgsHumano.length,
      taxaAutomacao: msgsBot.length + msgsHumano.length ? Math.round((msgsBot.length / (msgsBot.length + msgsHumano.length)) * 100) : 0,
      automacoesEnviadas: db.envios.filter((e) => e.status === "enviado").length,
    },
  });
});

// ---------------- Base de conhecimento ----------------

adminRouter.put("/negocio", (req, res) => {
  aplicar(getDb().negocio, req.body ?? {}, []);
  persist();
  ok(res, getDb().negocio);
});

function substituirLista<K extends "faq" | "programacao" | "fluxos">(chave: K, prefixo: string) {
  adminRouter.put(`/${chave}`, (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ erro: "Esperado um array" });
    const db = getDb();
    (db[chave] as unknown[]) = (req.body as Array<Record<string, unknown>>).map((x) => ({
      ...x,
      id: (x.id as string) || newId(prefixo),
    }));
    persist();
    ok(res, db[chave]);
  });
}
substituirLista("faq", "faq");
substituirLista("programacao", "pg");
substituirLista("fluxos", "fluxo");

adminRouter.post("/fluxos/simular", (req, res) => {
  const { fluxo, dados } = req.body ?? {};
  if (!fluxo) return res.status(400).json({ erro: "fluxo obrigatório" });
  ok(res, pontuarLead(fluxo, dados ?? {}));
});

// ---------------- Cardápio ----------------

adminRouter.post("/itens", (req, res) => {
  const db = getDb();
  const b = req.body ?? {};
  if (!b.nome || !b.categoriaId) return res.status(400).json({ erro: "nome e categoria são obrigatórios" });
  const item: ItemCardapio = {
    id: newId("it"),
    categoriaId: b.categoriaId,
    nome: String(b.nome),
    descricao: String(b.descricao ?? ""),
    preco: Number(b.preco ?? 0),
    precoObs: String(b.precoObs ?? ""),
    tags: Array.isArray(b.tags) ? b.tags : [],
    disponivel: b.disponivel ?? true,
    destaque: !!b.destaque,
    ordem: Math.max(0, ...db.itens.filter((i) => i.categoriaId === b.categoriaId).map((i) => i.ordem)) + 1,
  };
  db.itens.push(item);
  persist();
  ok(res, item);
});

adminRouter.patch("/itens/:id", (req, res) => {
  const item = getDb().itens.find((i) => i.id === req.params.id);
  if (!item) return notFound(res);
  const patch = { ...req.body };
  if (patch.tags && !Array.isArray(patch.tags)) delete patch.tags;
  aplicar(item, patch);
  if (Array.isArray(req.body?.tags)) item.tags = req.body.tags;
  persist();
  ok(res, item);
});

adminRouter.delete("/itens/:id", (req, res) => {
  const db = getDb();
  const i = db.itens.findIndex((x) => x.id === req.params.id);
  if (i < 0) return notFound(res);
  db.itens.splice(i, 1);
  persist();
  ok(res);
});

/** Ações em massa: marcar disponível/esgotado, reajustar preço por %. */
adminRouter.post("/itens/lote", (req, res) => {
  const { ids, acao, valor } = req.body ?? {};
  if (!Array.isArray(ids)) return res.status(400).json({ erro: "ids obrigatório" });
  for (const item of getDb().itens.filter((i) => ids.includes(i.id))) {
    if (acao === "disponivel") item.disponivel = true;
    else if (acao === "esgotado") item.disponivel = false;
    else if (acao === "reajuste") item.preco = Math.round(item.preco * (1 + Number(valor) / 100) * 10) / 10;
    else if (acao === "excluir") item.categoriaId = "__excluir__";
  }
  const db = getDb();
  db.itens = db.itens.filter((i) => i.categoriaId !== "__excluir__");
  persist();
  ok(res);
});

adminRouter.post("/itens/reordenar", (req, res) => {
  const ids: string[] = req.body?.ids ?? [];
  const db = getDb();
  ids.forEach((id, idx) => {
    const it = db.itens.find((i) => i.id === id);
    if (it) {
      it.ordem = idx + 1;
      if (req.body?.categoriaId) it.categoriaId = req.body.categoriaId;
    }
  });
  persist();
  ok(res);
});

adminRouter.post("/categorias", (req, res) => {
  const db = getDb();
  if (!req.body?.nome) return res.status(400).json({ erro: "nome obrigatório" });
  const cat = {
    id: newId("cat"),
    nome: String(req.body.nome),
    descricao: String(req.body.descricao ?? ""),
    ordem: Math.max(0, ...db.categorias.map((c) => c.ordem)) + 1,
  };
  db.categorias.push(cat);
  persist();
  ok(res, cat);
});

adminRouter.patch("/categorias/:id", (req, res) => {
  const cat = getDb().categorias.find((c) => c.id === req.params.id);
  if (!cat) return notFound(res);
  aplicar(cat, req.body ?? {});
  persist();
  ok(res, cat);
});

adminRouter.delete("/categorias/:id", (req, res) => {
  const db = getDb();
  if (db.itens.some((i) => i.categoriaId === req.params.id))
    return res.status(400).json({ erro: "Mova ou exclua os itens da categoria antes." });
  db.categorias = db.categorias.filter((c) => c.id !== req.params.id);
  persist();
  ok(res);
});

adminRouter.post("/categorias/reordenar", (req, res) => {
  const ids: string[] = req.body?.ids ?? [];
  ids.forEach((id, idx) => {
    const c = getDb().categorias.find((x) => x.id === id);
    if (c) c.ordem = idx + 1;
  });
  persist();
  ok(res);
});

// ---------------- Reservas ----------------

adminRouter.put("/reserva-config", (req, res) => {
  const cfg = getDb().reservaConfig;
  const { horarios, ...resto } = req.body ?? {};
  aplicar(cfg, resto);
  if (horarios && typeof horarios === "object") cfg.horarios = horarios;
  persist();
  ok(res, cfg);
});

adminRouter.patch("/reservas/:id", (req, res) => {
  const r = getDb().reservas.find((x) => x.id === req.params.id);
  if (!r) return notFound(res);
  const status = req.body?.status as StatusReserva | undefined;
  if (status && ["confirmada", "cancelada", "concluida", "nao_compareceu"].includes(status)) r.status = status;
  aplicar(r, { ...req.body, status: r.status }, ["id", "codigo", "clienteId", "canal", "criadaEm"]);
  persist();
  ok(res, r);
});

// ---------------- Leads e clientes ----------------

adminRouter.patch("/leads/:id", (req, res) => {
  const l = getDb().leads.find((x) => x.id === req.params.id);
  if (!l) return notFound(res);
  const etapa = req.body?.etapa as EtapaLead | undefined;
  if (etapa && ["novo", "qualificado", "proposta", "fechado", "perdido"].includes(etapa)) l.etapa = etapa;
  if (typeof req.body?.resumo === "string") l.resumo = req.body.resumo;
  l.atualizadoEm = new Date().toISOString();
  persist();
  ok(res, l);
});

adminRouter.patch("/clientes/:id", (req, res) => {
  const c = getDb().clientes.find((x) => x.id === req.params.id);
  if (!c) return notFound(res);
  aplicar(c, req.body ?? {}, ["id", "canal", "contatoId", "criadoEm"]);
  if (Array.isArray(req.body?.tags)) c.tags = req.body.tags;
  persist();
  ok(res, c);
});

// ---------------- Automações ----------------

adminRouter.put("/automacoes/:id", (req, res) => {
  const a = getDb().automacoes.find((x) => x.id === req.params.id);
  if (!a) return notFound(res);
  aplicar(a, req.body ?? {});
  for (const k of ["diaSemana", "horasAntes", "diasSemVisita"] as const) {
    if (req.body?.[k] !== undefined) a[k] = Number(req.body[k]);
  }
  persist();
  ok(res, a);
});

// ---------------- Conversas ----------------

adminRouter.get("/conversas/:key", (req, res) => {
  const c = getDb().conversas[req.params.key];
  if (!c) return notFound(res);
  c.naoLidas = 0;
  persist();
  const cliente = getDb().clientes.find((x) => x.id === c.clienteId);
  ok(res, { key: c.key, canal: c.canal, modo: c.modo, transcript: c.transcript, cliente, ultimaMsgCliente: c.ultimaMsgCliente });
});

adminRouter.post("/conversas/:key/responder", async (req, res) => {
  try {
    await responderComoHumano(req.params.key, String(req.body?.texto ?? ""));
    ok(res);
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

adminRouter.post("/conversas/:key/assumir", (req, res) => {
  const c = getDb().conversas[req.params.key];
  if (!c) return notFound(res);
  c.modo = "humano";
  c.transcript.push({ de: "sistema", texto: "Equipe assumiu a conversa", em: new Date().toISOString() });
  persist();
  ok(res);
});

adminRouter.post("/conversas/:key/devolver", (req, res) => {
  try {
    devolverAoBot(req.params.key);
    ok(res);
  } catch {
    notFound(res);
  }
});

// ---------------- Simulador ----------------

adminRouter.post("/simulador", async (req, res) => {
  const sessao = String(req.body?.sessao ?? "padrao");
  const texto = String(req.body?.texto ?? "").trim();
  if (!texto) return res.status(400).json({ erro: "texto obrigatório" });
  const resposta = await receberMensagem({ canal: "teste", contatoId: sessao, texto, nomePerfil: "" });
  const conversa = getDb().conversas[chaveConversa("teste", sessao)];
  ok(res, { resposta, modo: conversa?.modo ?? "bot" });
});

adminRouter.delete("/simulador/:sessao", (req, res) => {
  const db: DB = getDb();
  const key = chaveConversa("teste", req.params.sessao);
  const conversa = db.conversas[key];
  if (conversa) {
    delete db.conversas[key];
    db.reservas = db.reservas.filter((r) => r.clienteId !== conversa.clienteId);
    db.leads = db.leads.filter((l) => l.clienteId !== conversa.clienteId);
    db.clientes = db.clientes.filter((c) => c.id !== conversa.clienteId);
    persist();
  }
  ok(res);
});
