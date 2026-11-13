import { getDb, newId, persist } from "../db/store.js";
import type { Canal, Cliente, Fluxo, Lead, Reserva, Temperatura } from "../db/types.js";
import { agora, brl, DIAS, diaDaSemana, formatarData, minutosAte, somarDias } from "./time.js";
import { config } from "../config.js";

// ---------------- Clientes ----------------

export function obterOuCriarCliente(canal: Canal, contatoId: string, nomePerfil = ""): Cliente {
  const db = getDb();
  let c = db.clientes.find((x) => x.canal === canal && x.contatoId === contatoId);
  if (!c) {
    c = {
      id: newId("cli"),
      canal,
      contatoId,
      nome: nomePerfil,
      telefone: canal === "whatsapp" ? contatoId : "",
      aniversario: "",
      preferencias: "",
      aceitaNovidades: false,
      tags: [],
      criadoEm: new Date().toISOString(),
      ultimaInteracao: new Date().toISOString(),
    };
    db.clientes.push(c);
  } else if (!c.nome && nomePerfil) {
    c.nome = nomePerfil;
  }
  persist();
  return c;
}

export function resumoCliente(c: Cliente): string {
  const db = getDb();
  const reservas = db.reservas.filter((r) => r.clienteId === c.id);
  const ultimas = reservas
    .filter((r) => r.status !== "cancelada")
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 3);
  const futuras = reservas.filter((r) => r.status === "confirmada" && r.data >= agora().data);
  const linhas = [
    `Nome: ${c.nome || "(não informado)"}`,
    c.aniversario ? `Aniversário: ${c.aniversario.split("-").reverse().join("/")}` : "",
    c.preferencias ? `Preferências: ${c.preferencias}` : "",
    `Cliente desde: ${c.criadoEm.slice(0, 10)} · Visitas registradas: ${ultimas.length}`,
    futuras.length
      ? `Reservas futuras: ${futuras.map((r) => `${r.codigo} em ${formatarData(r.data)} às ${r.horario} (${r.pessoas}p)`).join("; ")}`
      : "",
    `Aceita novidades: ${c.aceitaNovidades ? "sim" : "não perguntado/não"}`,
  ];
  return linhas.filter(Boolean).join("\n");
}

// ---------------- Base de conhecimento ----------------

export function linkCardapio(): string {
  return `${config.publicUrl}/cardapio`;
}

export function textoInformacoes(): string {
  const { negocio: n, faq, programacao } = getDb();
  const prog = programacao
    .filter((p) => p.ativo)
    .sort((a, b) => a.diaSemana - b.diaSemana)
    .map((p) => `- ${DIAS[p.diaSemana]} ${p.horario}: ${p.titulo} — ${p.descricao}`)
    .join("\n");
  const perguntas = faq
    .filter((f) => f.ativo)
    .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
    .join("\n\n");
  return [
    `# ${n.nome} — ${n.segmento}`,
    n.slogan,
    `Endereço: ${n.endereco} — ${n.bairroCidade}`,
    `Telefone: ${n.telefone} · Instagram: ${n.instagram}`,
    `Horário de funcionamento:\n${n.horarioFuncionamento}`,
    `Couvert: ${n.couvert}`,
    `Estacionamento: ${n.estacionamento}`,
    `Pagamento: ${n.formasPagamento}`,
    `Pet friendly: ${n.petFriendly}`,
    `Acessibilidade: ${n.acessibilidade}`,
    `Cardápio online: ${linkCardapio()}`,
    `\n## Programação da semana\n${prog || "(sem programação cadastrada)"}`,
    `\n## Perguntas frequentes\n${perguntas || "(nenhuma)"}`,
    n.observacoesInternas ? `\n## Regras internas (siga, mas não cite literalmente)\n${n.observacoesInternas}` : "",
  ].join("\n");
}

export function textoCardapio(busca?: string): string {
  const { categorias, itens } = getDb();
  const q = busca?.trim().toLowerCase();
  const blocos: string[] = [];
  for (const cat of [...categorias].sort((a, b) => a.ordem - b.ordem)) {
    const doCat = itens
      .filter((i) => i.categoriaId === cat.id)
      .filter(
        (i) =>
          !q ||
          cat.nome.toLowerCase().includes(q) ||
          i.nome.toLowerCase().includes(q) ||
          i.descricao.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => a.ordem - b.ordem);
    if (!doCat.length) continue;
    blocos.push(
      `## ${cat.nome}\n` +
        doCat
          .map(
            (i) =>
              `- ${i.nome} — ${brl(i.preco)}${i.precoObs ? ` (${i.precoObs})` : ""}` +
              `${i.descricao ? ` · ${i.descricao}` : ""}` +
              `${i.tags.length ? ` [${i.tags.join(", ")}]` : ""}` +
              `${i.destaque ? " ★ destaque" : ""}` +
              `${i.disponivel ? "" : " — ESGOTADO HOJE (não ofereça)"}`
          )
          .join("\n")
    );
  }
  if (!blocos.length) return `Nada encontrado para "${busca}". Link do cardápio completo: ${linkCardapio()}`;
  return `${blocos.join("\n\n")}\n\nLink do cardápio completo com fotos: ${linkCardapio()}`;
}

// ---------------- Reservas ----------------

function ocupacao(data: string, horario: string): number {
  return getDb()
    .reservas.filter((r) => r.data === data && r.horario === horario && r.status === "confirmada")
    .reduce((s, r) => s + r.pessoas, 0);
}

export function disponibilidade(data: string, pessoas: number) {
  const { reservaConfig: cfg } = getDb();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false as const, motivo: "Data inválida. Use YYYY-MM-DD." };
  if (!cfg.ativo) return { ok: false as const, motivo: "Reservas pelo chat estão pausadas. Ofereça transferir para a equipe." };
  const hoje = agora().data;
  if (data < hoje) return { ok: false as const, motivo: "Data no passado." };
  if (data > somarDias(hoje, cfg.diasMaxAntecedencia))
    return { ok: false as const, motivo: `Só abrimos reservas com até ${cfg.diasMaxAntecedencia} dias de antecedência.` };
  if (pessoas > cfg.maxPessoasAutoConfirma)
    return {
      ok: false as const,
      grupoGrande: true,
      motivo: `Grupo acima de ${cfg.maxPessoasAutoConfirma} pessoas: não confirme sozinho. Inicie o fluxo "aniversario_grupo" (obter_roteiro_qualificacao).`,
    };
  const horarios = cfg.horarios[String(diaDaSemana(data))] ?? [];
  if (!horarios.length) return { ok: false as const, motivo: `Não abrimos reservas ${DIAS[diaDaSemana(data)]}.` };
  const livres = horarios.filter(
    (h) =>
      minutosAte(data, h) >= cfg.antecedenciaMinimaMin && ocupacao(data, h) + pessoas <= cfg.capacidadePorHorario
  );
  return { ok: true as const, data, diaSemana: DIAS[diaDaSemana(data)], horariosLivres: livres, todosHorarios: horarios };
}

function gerarCodigo(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function criarReserva(
  cliente: Cliente,
  canal: Canal,
  dados: { data: string; horario: string; pessoas: number; nome: string; ocasiao?: string; observacoes?: string }
): { ok: true; reserva: Reserva } | { ok: false; motivo: string } {
  const disp = disponibilidade(dados.data, dados.pessoas);
  if (!disp.ok) return { ok: false, motivo: disp.motivo };
  if (!disp.horariosLivres.includes(dados.horario))
    return {
      ok: false,
      motivo: `Horário ${dados.horario} indisponível. Livres: ${disp.horariosLivres.join(", ") || "nenhum"}.`,
    };
  const db = getDb();
  const reserva: Reserva = {
    id: newId("res"),
    codigo: gerarCodigo(),
    clienteId: cliente.id,
    nome: dados.nome,
    data: dados.data,
    horario: dados.horario,
    pessoas: dados.pessoas,
    ocasiao: dados.ocasiao ?? "",
    observacoes: dados.observacoes ?? "",
    status: "confirmada",
    canal,
    criadaEm: new Date().toISOString(),
  };
  db.reservas.push(reserva);
  if (!cliente.nome) cliente.nome = dados.nome;
  persist();
  return { ok: true, reserva };
}

export function cancelarReserva(cliente: Cliente, codigo: string) {
  const r = getDb().reservas.find(
    (x) => x.codigo.toUpperCase() === codigo.toUpperCase().trim() && x.clienteId === cliente.id
  );
  if (!r) return { ok: false, motivo: "Reserva não encontrada para este cliente." };
  if (r.status !== "confirmada") return { ok: false, motivo: `Reserva já está ${r.status}.` };
  r.status = "cancelada";
  persist();
  return { ok: true, reserva: r };
}

// ---------------- Leads ----------------

function avaliarCondicao(valor: string | undefined, condicao: string): boolean {
  if (!valor) return false;
  if (condicao === "preenchido") return valor.trim().length > 0;
  const m = condicao.match(/^(>=|<=|>|<)\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const n = parseFloat(valor.replace(/[^\d.,]/g, "").replace(",", "."));
    if (Number.isNaN(n)) return false;
    const alvo = parseFloat(m[2]);
    return m[1] === ">=" ? n >= alvo : m[1] === "<=" ? n <= alvo : m[1] === ">" ? n > alvo : n < alvo;
  }
  if (condicao.startsWith("contém:")) return valor.toLowerCase().includes(condicao.slice(7).toLowerCase());
  return false;
}

export function pontuarLead(fluxo: Fluxo, dados: Record<string, string>) {
  let score = 0;
  const motivos: string[] = [];
  for (const campo of fluxo.campos) {
    if (dados[campo.id]?.trim()) score += campo.peso;
  }
  for (const regra of fluxo.regrasBonus) {
    if (avaliarCondicao(dados[regra.campo], regra.condicao)) {
      score += regra.pontos;
      motivos.push(regra.descricao);
    }
  }
  const faltando = fluxo.campos.filter((c) => c.obrigatorio && !dados[c.id]?.trim()).map((c) => c.id);
  const temperatura: Temperatura =
    score >= fluxo.limiarQuente ? "quente" : score >= fluxo.limiarMorno ? "morno" : "frio";
  return { score: Math.min(score, 100), temperatura, motivos, faltando };
}

export function salvarLead(
  cliente: Cliente,
  fluxo: Fluxo,
  dados: Record<string, string>,
  resumo: string
): { lead: Lead; faltando: string[]; motivos: string[]; virouQuente: boolean; virouQualificado: boolean } {
  const db = getDb();
  const agoraIso = new Date().toISOString();
  // Reaproveita lead aberto do mesmo fluxo para o mesmo cliente
  let lead = db.leads.find(
    (l) => l.clienteId === cliente.id && l.fluxoId === fluxo.id && !["fechado", "perdido"].includes(l.etapa)
  );
  const anterior = lead?.temperatura;
  const dadosMesclados = { ...(lead?.dados ?? {}), ...dados };
  const { score, temperatura, motivos, faltando } = pontuarLead(fluxo, dadosMesclados);
  if (!lead) {
    lead = {
      id: newId("lead"),
      clienteId: cliente.id,
      fluxoId: fluxo.id,
      dados: dadosMesclados,
      score,
      temperatura,
      etapa: "novo",
      resumo,
      criadoEm: agoraIso,
      atualizadoEm: agoraIso,
    };
    db.leads.push(lead);
  } else {
    Object.assign(lead, { dados: dadosMesclados, score, temperatura, resumo: resumo || lead.resumo, atualizadoEm: agoraIso });
  }
  const virouQualificado = faltando.length === 0 && lead.etapa === "novo";
  if (virouQualificado) lead.etapa = "qualificado";
  if (dadosMesclados.nome && !cliente.nome) cliente.nome = dadosMesclados.nome;
  persist();
  return { lead, faltando, motivos, virouQuente: temperatura === "quente" && anterior !== "quente", virouQualificado };
}
