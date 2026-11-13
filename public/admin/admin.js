/* Painel couch_ai — SPA sem dependências */
(() => {
  "use strict";

  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const TAGS = ["vegano", "vegetariano", "sem glúten", "sem lactose", "picante", "novo", "chef", "para dividir"];
  const ETAPAS = [
    ["novo", "Novo"],
    ["qualificado", "Qualificado"],
    ["proposta", "Proposta"],
    ["fechado", "Fechado"],
    ["perdido", "Perdido"],
  ];
  const PAGES = [
    ["painel", "Painel"],
    ["conversas", "Conversas"],
    ["cardapio", "Cardápio"],
    ["reservas", "Reservas"],
    ["leads", "Leads"],
    ["clientes", "Clientes"],
    ["conhecimento", "Base de conhecimento"],
    ["fluxos", "Fluxos de qualificação"],
    ["automacoes", "Automações"],
    ["simulador", "Simulador"],
  ];

  const S = {
    token: safeGet("couch_token"),
    state: null,
    page: (location.hash.slice(1) || "painel").split("/")[0],
    conv: null,
    convData: null,
    sel: new Set(),
    busca: "",
    kbTab: "negocio",
    sim: { sessao: safeGet("couch_sim") || `sim-${Math.random().toString(36).slice(2, 8)}`, msgs: [], loading: false },
    resvDia: null,
    cliBusca: "",
  };
  safeSet("couch_sim", S.sim.sessao);

  const root = document.getElementById("root");
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pad = (n) => String(n).padStart(2, "0");
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtData = (iso) => { const [y, m, d] = iso.split("-"); return `${DIAS[new Date(+y, m - 1, +d).getDay()].slice(0, 3)} ${d}/${m}`; };
  const fmtHora = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const canalChip = (c) => `<span class="chip ${c === "whatsapp" ? "ok" : c === "instagram" ? "info" : ""}">${c === "whatsapp" ? "WhatsApp" : c === "instagram" ? "Instagram" : "Teste"}</span>`;
  const tempChip = (t) => `<span class="chip ${t === "quente" ? "solid" : t === "morno" ? "warn" : ""}">${t}</span>`;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

  // ---------------- API ----------------
  async function api(path, opts = {}) {
    const r = await fetch(`/api/admin${path}`, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${S.token}` },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401) { S.token = null; safeSet("couch_token", null); render(); throw new Error("Sessão expirada"); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.erro || `Erro ${r.status}`);
    return data;
  }
  async function refresh() { S.state = await api("/state"); }
  async function salvar(path, method, body, msg = "Salvo") {
    try {
      const out = await api(path, { method, body });
      toast(msg);
      await refresh();
      return out;
    } catch (e) { toast(e.message, true); throw e; }
  }

  let toastT;
  function toast(msg, err = false) {
    const t = document.getElementById("toast");
    t.textContent = (err ? "⚠ " : "✓ ") + msg;
    t.className = `saved show${err ? " err" : ""}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = "saved"), 1800);
  }

  // ---------------- Shell ----------------
  function render() {
    if (!S.token) return renderLogin();
    if (!S.state) { root.innerHTML = `<div class="login"><span class="muted">Carregando…</span></div>`; return; }
    const st = S.state;
    const aguardando = st.conversas.filter((c) => c.modo === "humano").length;
    const quentes = st.metricas.leadsQuentes;
    const idx = Math.max(0, PAGES.findIndex(([k]) => k === S.page));
    root.innerHTML = `
      <div class="mobile-top"><a class="logo" href="#painel">couch_<b>ai</b></a>
        <button class="btn sm" id="menuBtn" aria-label="Abrir menu">Menu</button></div>
      <div class="app" id="app">
        <aside class="side">
          <a class="logo" href="#painel">couch_<b>ai</b></a>
          <nav class="nav">${PAGES.map(([k, l], i) => `<a href="#${k}" class="${k === S.page ? "on" : ""}"><span class="n">${pad(i + 1)}</span>${l}
            ${k === "conversas" && aguardando ? `<span class="pill">${aguardando}</span>` : ""}
            ${k === "leads" && quentes ? `<span class="pill">${quentes}</span>` : ""}</a>`).join("")}</nav>
          <div class="side-foot">
            <span><i class="dot ${st.canais.whatsapp ? "on" : ""}"></i>WhatsApp ${st.canais.whatsapp ? "conectado" : "não configurado"}</span>
            <span><i class="dot ${st.canais.instagram ? "on" : ""}"></i>Instagram ${st.canais.instagram ? "conectado" : "não configurado"}</span>
            <a href="${esc(st.canais.urlCardapio)}" target="_blank" class="arrow-link">ver cardápio público →</a>
            <a href="#" id="sair" class="faint">sair</a>
          </div>
        </aside>
        <main class="main" id="main">${pageHtml(idx)}</main>
      </div>`;
    $("#menuBtn")?.addEventListener("click", () => $("#app").classList.toggle("menu-open"));
    $(".side").addEventListener("click", (e) => { if (e.target.closest("a")) $("#app").classList.remove("menu-open"); });
    $("#sair").addEventListener("click", (e) => { e.preventDefault(); S.token = null; safeSet("couch_token", null); render(); });
    PAGE_BIND[S.page]?.();
  }

  function head(idx, title, desc, actions = "") {
    return `<div class="page-head"><div><span class="outline-num" aria-hidden="true">${pad(idx + 1)}</span>
      <h1 class="headline">${title}</h1>${desc ? `<p>${desc}</p>` : ""}</div><div class="actions">${actions}</div></div>`;
  }

  function pageHtml(idx) {
    const fn = PAGE_HTML[S.page] || PAGE_HTML.painel;
    return fn(idx);
  }

  function renderLogin() {
    root.innerHTML = `<div class="login"><form class="card accent" id="loginForm">
      <span class="logo">couch_<b>ai</b></span>
      <h1 class="headline">Seu atendimento, <span class="hl">no automático</span>.</h1>
      <p class="muted">Entre com o token de administrador (ADMIN_TOKEN).</p>
      <label class="field"><span>Token</span><input class="input" type="password" name="token" autocomplete="current-password" required /></label>
      <button class="btn primary" style="width:100%;margin-top:16px">Entrar →</button>
      <p id="loginErr" style="color:var(--danger)"></p></form></div>`;
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      S.token = new FormData(e.target).get("token");
      try { await refresh(); safeSet("couch_token", S.token); render(); }
      catch { $("#loginErr") && ($("#loginErr").textContent = "Token inválido."); }
    });
  }

  // ---------------- Páginas: HTML ----------------
  const PAGE_HTML = {
    painel(idx) {
      const m = S.state.metricas;
      const hoje = hojeISO();
      const reservasHoje = S.state.reservas.filter((r) => r.data === hoje && r.status === "confirmada").sort((a, b) => a.horario.localeCompare(b.horario));
      const quentes = S.state.leads.filter((l) => l.temperatura === "quente" && !["fechado", "perdido"].includes(l.etapa));
      const humanos = S.state.conversas.filter((c) => c.modo === "humano");
      return head(idx, `Bom atendimento, <span class="hl">hoje</span>.`, "Visão geral do que a IA resolveu e do que precisa da sua equipe.") + `
        <div class="grid g4">
          ${kpi(m.reservasHoje, "reservas hoje", true)}${kpi(m.pessoasHoje, "pessoas esperadas hoje")}
          ${kpi(m.reservasSemana, "reservas nos próximos 7 dias")}${kpi(m.leadsQuentes, "leads quentes abertos", m.leadsQuentes > 0)}
          ${kpi(m.conversasHoje, "conversas hoje")}${kpi(`${m.taxaAutomacao}%`, "respostas feitas pela IA")}
          ${kpi(m.optIn, `clientes aceitam novidades (de ${m.clientes})`)}${kpi(m.automacoesEnviadas, "mensagens automáticas enviadas")}
        </div>
        <div class="grid g3" style="margin-top:14px">
          <div class="card"><h2>Precisa de você</h2>${humanos.length ? humanos.map((c) => `<a href="#conversas/${encodeURIComponent(c.key)}" class="conv" style="text-decoration:none;color:inherit">
              <div class="conv-top"><b>${esc(c.nome || c.contatoId)}</b>${canalChip(c.canal)}</div><div class="conv-prev">${esc(c.preview)}</div></a>`).join("") : `<p class="muted">Nenhuma conversa aguardando a equipe. 🎉</p>`}</div>
          <div class="card"><h2>Reservas de hoje</h2>${reservasHoje.length ? `<table class="t"><tbody>${reservasHoje.map((r) => `<tr><td class="num"><b>${r.horario}</b></td><td>${esc(r.nome)}</td><td class="num">${r.pessoas}p</td><td>${r.ocasiao ? `<span class="chip warn">${esc(r.ocasiao)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">Sem reservas confirmadas para hoje.</p>`}</div>
          <div class="card"><h2>Leads quentes</h2>${quentes.length ? quentes.map((l) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(nomeCliente(l.clienteId))}</b> · <span class="hl num">${l.score} pts</span><br><small class="muted">${esc(nomeFluxo(l.fluxoId))} — ${esc(l.resumo)}</small></div>`).join("") : `<p class="muted">Nenhum lead quente aberto.</p>`}</div>
        </div>
        <div class="card" style="margin-top:14px"><h2>Conexões</h2>
          <div class="grid g2">
            <div class="field"><span>URL do webhook (WhatsApp e Instagram)</span><input class="input" readonly value="${esc(S.state.canais.urlWebhook)}" onclick="this.select()"/></div>
            <div class="field"><span>Link do cardápio (enviado pela IA)</span><input class="input" readonly value="${esc(S.state.canais.urlCardapio)}" onclick="this.select()"/></div>
          </div></div>`;
    },

    conversas(idx) {
      const lista = S.state.conversas.filter((c) => c.canal !== "teste");
      return head(idx, "Conversas", "Acompanhe o que a IA está respondendo. Assuma quando quiser — o bot pausa até você devolver.") + `
        <div class="inbox ${S.conv ? "has-thread" : ""}">
          <div class="card inbox-list">${lista.length ? lista.map((c) => `<div class="conv ${S.conv === c.key ? "on" : ""}" data-key="${esc(c.key)}">
            <div class="conv-top"><b>${esc(c.nome || c.contatoId)}</b>${c.modo === "humano" ? `<span class="chip warn">equipe</span>` : ""}${c.naoLidas ? `<span class="chip solid">${c.naoLidas}</span>` : ""}${canalChip(c.canal)}</div>
            <div class="conv-prev">${esc(c.preview)}</div><small class="faint">${fmtHora(c.ultimaAtividade)}</small></div>`).join("") : `<div class="empty">Ainda não há conversas. Teste no <a href="#simulador" class="arrow-link">Simulador</a>.</div>`}</div>
          <div class="card thread">${S.convData ? threadHtml(S.convData) : `<div class="empty" style="margin:auto;border:0">Selecione uma conversa.</div>`}</div>
        </div>`;
    },

    cardapio(idx) {
      const st = S.state;
      const q = norm(S.busca);
      const cats = [...st.categorias].sort((a, b) => a.ordem - b.ordem);
      const esgotados = st.itens.filter((i) => !i.disponivel).length;
      return head(idx, `Cardápio <span class="hl">vivo</span>.`, "Edite preço direto na linha, marque esgotado com um toque e arraste para reordenar. A IA e o cardápio público atualizam na hora.",
        `<a class="btn ghost" href="/cardapio" target="_blank">Ver público ↗</a><button class="btn" data-act="nova-cat">+ Categoria</button><button class="btn primary" data-act="novo-item">+ Item</button>`) + `
        <div class="menu-toolbar">
          <input class="input" id="busca" type="search" placeholder="Buscar item…" value="${esc(S.busca)}" />
          <span class="chip ${esgotados ? "danger" : "ok"}">${esgotados} esgotado${esgotados === 1 ? "" : "s"}</span>
          <span class="chip">${st.itens.length} itens</span>
          ${esgotados ? `<button class="btn sm" data-act="reabrir-tudo">Marcar tudo disponível</button>` : ""}
        </div>
        ${S.sel.size ? `<div class="bulkbar"><b>${S.sel.size} selecionado(s)</b>
          <button class="btn sm" data-bulk="esgotado">Esgotar</button><button class="btn sm" data-bulk="disponivel">Disponibilizar</button>
          <button class="btn sm" data-bulk="reajuste">Reajustar %</button><button class="btn sm danger" data-bulk="excluir">Excluir</button>
          <button class="btn sm ghost" data-bulk="limpar">Limpar seleção</button></div>` : ""}
        ${cats.map((c, ci) => {
          const itens = st.itens.filter((i) => i.categoriaId === c.id && (!q || norm(`${i.nome} ${i.descricao} ${i.tags.join(" ")}`).includes(q))).sort((a, b) => a.ordem - b.ordem);
          if (q && !itens.length) return "";
          return `<section class="cat-block" data-cat="${c.id}">
            <div class="cat-title"><span class="outline-num">${pad(ci + 1)}</span>
              <input value="${esc(c.nome)}" data-cat-nome="${c.id}" aria-label="Nome da categoria" />
              <button class="icon-btn" data-cat-up="${c.id}" title="Subir categoria" ${ci === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-cat-down="${c.id}" title="Descer categoria" ${ci === cats.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon-btn" data-cat-del="${c.id}" title="Excluir categoria">✕</button></div>
            <div class="rows" data-rows="${c.id}">${itens.length ? itens.map(rowHtml).join("") : `<div class="row" style="display:block;color:var(--muted)">Categoria vazia — <a href="#" class="arrow-link" data-add-in="${c.id}">adicionar item</a></div>`}</div>
          </section>`;
        }).join("")}`;
    },

    reservas(idx) {
      const st = S.state;
      const cfg = st.reservaConfig;
      const hoje = hojeISO();
      const dia = S.resvDia || hoje;
      const doDia = st.reservas.filter((r) => r.data === dia).sort((a, b) => a.horario.localeCompare(b.horario));
      const proximos = Array.from({ length: 10 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
      const ocup = (d, h) => st.reservas.filter((r) => r.data === d && r.horario === h && r.status === "confirmada").reduce((s, r) => s + r.pessoas, 0);
      const dow = new Date(dia + "T12:00").getDay();
      const slots = cfg.horarios[dow] || [];
      return head(idx, `Reservas que se <span class="hl">confirmam sozinhas</span>.`, "A IA confere disponibilidade e confirma 24h por dia. Aqui você acompanha e ajusta as regras.") + `
        <div class="tabs">${proximos.map((d) => { const n = st.reservas.filter((r) => r.data === d && r.status === "confirmada").length; return `<button data-dia="${d}" class="${d === dia ? "on" : ""}">${d === hoje ? "Hoje" : fmtData(d)}${n ? ` · ${n}` : ""}</button>`; }).join("")}
          <input type="date" class="input" style="width:auto;min-height:36px;padding:4px 10px" id="diaPick" value="${dia}" /></div>
        ${slots.length ? `<div class="grid g4" style="margin-bottom:14px">${slots.map((h) => { const o = ocup(dia, h); const pct = Math.min(100, Math.round((o / cfg.capacidadePorHorario) * 100)); return `<div class="card"><div class="kpi"><span class="v num">${h}</span><span class="l">${o}/${cfg.capacidadePorHorario} lugares</span></div><div style="height:6px;background:var(--surface-3);border-radius:9px;margin-top:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 90 ? "var(--danger)" : "var(--accent)"}"></div></div></div>`; }).join("")}</div>` : `<p class="muted">Sem horários de reserva neste dia da semana.</p>`}
        <div class="card"><h2>${fmtData(dia)} · ${doDia.filter((r) => r.status === "confirmada").length} reservas</h2>
          ${doDia.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Hora</th><th>Nome</th><th>Pessoas</th><th>Ocasião / obs.</th><th>Canal</th><th>Código</th><th>Status</th></tr></thead><tbody>
          ${doDia.map((r) => `<tr><td class="num"><b>${r.horario}</b></td><td>${esc(r.nome)}</td><td class="num">${r.pessoas}</td><td>${r.ocasiao ? `<span class="chip warn">${esc(r.ocasiao)}</span> ` : ""}<span class="muted">${esc(r.observacoes)}</span></td><td>${canalChip(r.canal)}</td><td class="num">${r.codigo}</td>
            <td><select class="input" style="min-height:34px;padding:4px 8px" data-resv="${r.id}">${["confirmada", "concluida", "nao_compareceu", "cancelada"].map((s) => `<option value="${s}" ${s === r.status ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("")}</select></td></tr>`).join("")}
          </tbody></table></div>` : `<p class="muted">Nenhuma reserva neste dia.</p>`}</div>
        <form class="card" id="cfgForm" style="margin-top:14px"><h2>Regras de reserva</h2>
          <div class="grid g4">
            <label class="field"><span>Reservas pela IA</span><label class="switch"><input type="checkbox" name="ativo" ${cfg.ativo ? "checked" : ""}><span></span></label></label>
            <label class="field"><span>Lugares por horário</span><input class="input" type="number" min="1" name="capacidadePorHorario" value="${cfg.capacidadePorHorario}"></label>
            <label class="field"><span>Máx. pessoas sem aprovação</span><input class="input" type="number" min="1" name="maxPessoasAutoConfirma" value="${cfg.maxPessoasAutoConfirma}"><small>Acima disso vira lead de grupo</small></label>
            <label class="field"><span>Antecedência mínima (min)</span><input class="input" type="number" min="0" name="antecedenciaMinimaMin" value="${cfg.antecedenciaMinimaMin}"></label>
            <label class="field"><span>Tolerância de atraso (min)</span><input class="input" type="number" min="0" name="toleranciaAtrasoMin" value="${cfg.toleranciaAtrasoMin}"></label>
            <label class="field"><span>Abrir agenda com até (dias)</span><input class="input" type="number" min="1" name="diasMaxAntecedencia" value="${cfg.diasMaxAntecedencia}"></label>
          </div>
          <h2 style="margin-top:20px">Horários de entrada por dia</h2>
          <div class="grid g4">${DIAS.map((d, i) => `<label class="field"><span>${d}</span><input class="input" name="h${i}" placeholder="fechado" value="${esc((cfg.horarios[i] || []).join(", "))}"></label>`).join("")}</div>
          <div class="actions" style="margin-top:16px"><button class="btn primary">Salvar regras</button><small class="faint">Separe horários com vírgula: 18:00, 19:30, 21:00</small></div>
        </form>`;
    },

    leads(idx) {
      const st = S.state;
      return head(idx, `Leads <span class="hl">qualificados</span>.`, "Eventos, grupos e catering qualificados pela IA, com score automático. Arraste os cards entre as etapas.") + `
        <div class="kanban">${ETAPAS.map(([k, l]) => { const ls = st.leads.filter((x) => x.etapa === k).sort((a, b) => b.score - a.score); return `<div class="col" data-etapa="${k}"><div class="col-head"><span>${l}</span><span class="chip">${ls.length}</span></div>
          ${ls.map((x) => `<div class="lead" draggable="true" data-lead="${x.id}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(nomeCliente(x.clienteId))}</b><span>${S.state.clientes.find((c) => c.id === x.clienteId)?.canal === "teste" ? `<span class="chip">teste</span> ` : ""}${tempChip(x.temperatura)}</span></div>
            <small>${esc(nomeFluxo(x.fluxoId))}</small><div><span class="score hl">${x.score}</span><small> pts</small></div><small>${esc(x.resumo).slice(0, 110)}</small></div>`).join("")}</div>`; }).join("")}</div>`;
    },

    clientes(idx) {
      const q = norm(S.cliBusca);
      const lista = S.state.clientes.filter((c) => c.canal !== "teste" && (!q || norm(`${c.nome} ${c.contatoId} ${c.preferencias} ${c.tags.join(" ")}`).includes(q))).sort((a, b) => b.ultimaInteracao.localeCompare(a.ultimaInteracao));
      return head(idx, `O cliente <span class="hl">volta</span>.`, "Base construída automaticamente pelas conversas: aniversário, preferências e consentimento para novidades.",
        `<input class="input" id="cliBusca" type="search" placeholder="Buscar cliente…" value="${esc(S.cliBusca)}" style="width:240px">`) + `
        <div class="card table-wrap">${lista.length ? `<table class="t"><thead><tr><th>Nome</th><th>Canal</th><th>Aniversário</th><th>Preferências</th><th>Novidades</th><th>Reservas</th><th>Última interação</th><th></th></tr></thead><tbody>
          ${lista.map((c) => `<tr><td><b>${esc(c.nome || "—")}</b><br><small class="faint">${esc(c.contatoId)}</small></td><td>${canalChip(c.canal)}</td>
            <td class="num">${c.aniversario ? c.aniversario.split("-").reverse().join("/") : "—"}</td><td class="muted">${esc(c.preferencias || "—")}</td>
            <td>${c.aceitaNovidades ? `<span class="chip ok">sim</span>` : `<span class="chip">não</span>`}</td>
            <td class="num">${S.state.reservas.filter((r) => r.clienteId === c.id && r.status !== "cancelada").length}</td>
            <td class="faint">${fmtHora(c.ultimaInteracao)}</td><td><button class="btn sm" data-cli="${c.id}">Editar</button></td></tr>`).join("")}
        </tbody></table>` : `<div class="empty">Nenhum cliente ainda.</div>`}</div>`;
    },

    conhecimento(idx) {
      const tabs = [["negocio", "Informações da casa"], ["faq", "Perguntas frequentes"], ["programacao", "Programação"]];
      return head(idx, `Fim do <span class="hl">"qual o horário?"</span>`, "Tudo o que a IA sabe sobre a casa. Atualize aqui e as respostas mudam na hora.") +
        `<div class="tabs">${tabs.map(([k, l]) => `<button data-kb="${k}" class="${S.kbTab === k ? "on" : ""}">${l}</button>`).join("")}</div>` +
        (S.kbTab === "negocio" ? kbNegocio() : S.kbTab === "faq" ? kbFaq() : kbProg());
    },

    fluxos(idx) {
      return head(idx, `Fluxos que <span class="hl">qualificam</span>.`, "Defina o que a IA deve perguntar, quanto vale cada resposta e quando um lead vira quente e vai para a sua equipe.",
        `<button class="btn primary" data-act="novo-fluxo">+ Fluxo</button>`) +
        `<div class="card accent" style="margin-bottom:14px"><h2>Como funciona</h2><div class="steps">
          <div class="step"><span class="outline-num">01</span><div><b>Gatilho</b><br><span class="muted">A IA reconhece a intenção (ex.: aniversário com 25 pessoas) e abre o roteiro do fluxo.</span></div></div>
          <div class="step"><span class="outline-num">02</span><div><b>Coleta conversacional</b><br><span class="muted">Uma pergunta por vez, obrigatórias primeiro, entregando valor entre as perguntas.</span></div></div>
          <div class="step"><span class="outline-num">03</span><div><b>Score automático</b><br><span class="muted">Cada campo soma pontos + regras de bônus. Acima do limiar "quente", a IA transfere e você recebe alerta no WhatsApp.</span></div></div></div></div>
        ${S.state.fluxos.map((f, i) => fluxoHtml(f, i)).join("")}`;
    },

    automacoes(idx) {
      const env = S.state.envios.slice(0, 30);
      return head(idx, `Trabalham enquanto <span class="hl">você dorme</span>.`, "Mensagens de retenção disparadas no horário certo. No WhatsApp, fora da janela de 24h, só templates aprovados pela Meta podem ser enviados.") +
        `<div class="grid g2">${S.state.automacoes.map(autoHtml).join("")}</div>
        <div class="card" style="margin-top:14px"><h2>Últimos envios</h2>${env.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Quando</th><th>Automação</th><th>Cliente</th><th>Status</th><th>Detalhe</th></tr></thead><tbody>
          ${env.map((e) => `<tr><td class="faint">${fmtHora(e.em)}</td><td>${esc(S.state.automacoes.find((a) => a.id === e.automacaoId)?.nome || e.automacaoId)}</td><td>${esc(nomeCliente(e.clienteId))}</td>
          <td><span class="chip ${e.status === "enviado" ? "ok" : e.status === "falhou" ? "danger" : ""}">${e.status}</span></td><td class="muted">${esc(e.detalhe)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nenhum envio ainda.</p>`}</div>`;
    },

    simulador(idx) {
      const sugestoes = ["Oi! Vocês abrem hoje?", "Qual o valor do couvert?", "Tem opção vegana?", "Tem mesa pra 6 sábado?", "Quero comemorar meu aniversário com 25 amigos", "Vocês fazem catering para empresa?", "Quero falar com um atendente"];
      return head(idx, "Simulador", "Converse com a IA como se fosse um cliente. Reservas e leads criados aqui ficam marcados como teste.",
        `<button class="btn" data-act="sim-reset">Nova conversa</button>`) + `
        <div class="sim"><div class="phone"><div class="msgs" id="simMsgs">${simMsgsHtml()}</div>
          <form class="composer" id="simForm"><textarea class="input" name="t" placeholder="Escreva como cliente…" rows="1" required></textarea><button class="btn primary" ${S.sim.loading ? "disabled" : ""}>Enviar</button></form></div>
          <div class="card"><h2>Experimente</h2><div style="display:flex;flex-wrap:wrap;gap:8px">${sugestoes.map((s) => `<button class="btn sm" data-sug="${esc(s)}">${esc(s)}</button>`).join("")}</div>
          <p class="muted" style="font-size:14px;margin-top:18px">Dica: altere um preço no Cardápio ou marque um item como esgotado e pergunte de novo — a IA responde com a informação nova.</p></div></div>`;
    },
  };

  function kpi(v, l, hl = false) { return `<div class="card kpi"><span class="v ${hl ? "hl" : ""}">${esc(v)}</span><span class="l">${esc(l)}</span></div>`; }
  function nomeCliente(id) { const c = S.state.clientes.find((x) => x.id === id); return c ? c.nome || c.contatoId : "—"; }
  function nomeFluxo(id) { return S.state.fluxos.find((f) => f.id === id)?.nome || id; }

  function rowHtml(i) {
    return `<div class="row ${i.disponivel ? "" : "off"}" data-item="${i.id}" draggable="false">
      <span class="handle" title="Arraste para reordenar" aria-hidden="true">⋮⋮</span>
      <input type="checkbox" class="chk" data-sel="${i.id}" ${S.sel.has(i.id) ? "checked" : ""} aria-label="Selecionar ${esc(i.nome)}">
      <div class="row-main" data-edit="${i.id}" style="cursor:pointer"><div class="row-name">${esc(i.nome)}${i.disponivel ? "" : `<span class="chip danger">esgotado</span>`}${i.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
        <div class="row-desc">${esc(i.descricao) || "<span class='faint'>sem descrição</span>"}</div></div>
      <label class="price"><span>R$</span><input inputmode="decimal" value="${Number(i.preco).toFixed(2).replace(".", ",")}" data-preco="${i.id}" aria-label="Preço de ${esc(i.nome)}"></label>
      <label class="switch" title="Disponível"><input type="checkbox" data-disp="${i.id}" ${i.disponivel ? "checked" : ""} aria-label="Disponível"><span></span></label>
      <button class="star ${i.destaque ? "on" : ""}" data-star="${i.id}" title="Destaque" aria-pressed="${i.destaque}">★</button>
      <button class="icon-btn" data-edit="${i.id}" title="Editar" aria-label="Editar ${esc(i.nome)}">✎</button></div>`;
  }

  function threadHtml(c) {
    const cli = c.cliente || {};
    const janelaAberta = Date.now() - new Date(c.ultimaMsgCliente).getTime() < 24 * 3600e3;
    return `<div class="thread-head"><button class="btn sm ghost" data-act="voltar-lista">←</button><b>${esc(cli.nome || c.key.split(":")[1])}</b>${canalChip(c.canal)}
        ${c.modo === "humano" ? `<span class="chip warn">equipe atendendo</span><button class="btn sm" data-act="devolver">Devolver ao bot</button>` : `<span class="chip ok">IA atendendo</span><button class="btn sm" data-act="assumir">Assumir</button>`}</div>
      <div class="msgs" id="threadMsgs">${c.transcript.map((m) => m.de === "sistema" ? `<div class="sys">${esc(m.texto)}</div>` : `<div class="bubble ${m.de}">${esc(m.texto)}<span class="meta">${m.de === "humano" ? "equipe · " : m.de === "bot" ? "IA · " : ""}${fmtHora(m.em)}</span></div>`).join("")}</div>
      <form class="composer" id="replyForm"><textarea class="input" name="t" placeholder="${janelaAberta ? "Responder como equipe (o bot pausa)…" : "Janela de 24h fechada — o cliente precisa mandar mensagem antes"}" ${janelaAberta || c.canal === "teste" ? "" : "disabled"}></textarea><button class="btn primary" ${janelaAberta ? "" : "disabled"}>Enviar</button></form>`;
  }

  function kbNegocio() {
    const n = S.state.negocio;
    const f = (k, l, area = false, hint = "") => `<label class="field"><span>${l}</span>${area ? `<textarea class="input" name="${k}">${esc(n[k])}</textarea>` : `<input class="input" name="${k}" value="${esc(n[k])}">`}${hint ? `<small>${hint}</small>` : ""}</label>`;
    return `<form class="card" id="negForm"><div class="grid g2">
      ${f("nome", "Nome da casa")}${f("segmento", "Segmento", false, "Ex.: bar com música ao vivo")}
      ${f("slogan", "Slogan")}${f("instagram", "Instagram")}
      ${f("endereco", "Endereço")}${f("bairroCidade", "Bairro · Cidade")}
      ${f("telefone", "Telefone / WhatsApp")}${f("linkAvaliacaoGoogle", "Link de avaliação no Google", false, "Usado na automação do dia seguinte")}
      ${f("horarioFuncionamento", "Horário de funcionamento", true)}${f("couvert", "Couvert", true)}
      ${f("estacionamento", "Estacionamento", true)}${f("formasPagamento", "Formas de pagamento", true)}
      ${f("petFriendly", "Pet friendly")}${f("acessibilidade", "Acessibilidade")}
      ${f("tomDeVoz", "Tom de voz da IA", true, "Como a casa fala com o cliente")}${f("observacoesInternas", "Regras internas para a IA", true, "A IA segue, mas não repete literalmente ao cliente")}
    </div><div class="actions" style="margin-top:16px"><button class="btn primary">Salvar informações</button></div></form>`;
  }
  function kbFaq() {
    return `<div class="grid" id="faqList">${S.state.faq.map((q, i) => `<div class="card" data-faq="${i}"><div class="grid" style="grid-template-columns:1fr auto;align-items:start">
      <label class="field"><span>Pergunta</span><input class="input" data-k="pergunta" value="${esc(q.pergunta)}"></label>
      <label class="switch" title="Ativa" style="margin-top:26px"><input type="checkbox" data-k="ativo" ${q.ativo ? "checked" : ""}><span></span></label></div>
      <label class="field" style="margin-top:10px"><span>Resposta</span><textarea class="input" data-k="resposta">${esc(q.resposta)}</textarea></label>
      <div style="text-align:right;margin-top:8px"><button class="btn sm danger" data-faq-del="${i}">Remover</button></div></div>`).join("")}</div>
      <div class="actions" style="margin-top:14px"><button class="btn" data-act="faq-add">+ Pergunta</button><button class="btn primary" data-act="faq-save">Salvar perguntas</button></div>`;
  }
  function kbProg() {
    return `<div class="grid" id="progList">${S.state.programacao.map((p, i) => `<div class="card" data-prog="${i}"><div class="grid g4">
      <label class="field"><span>Dia</span><select class="input" data-k="diaSemana">${DIAS.map((d, j) => `<option value="${j}" ${j === p.diaSemana ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label class="field"><span>Horário</span><input class="input" data-k="horario" value="${esc(p.horario)}"></label>
      <label class="field"><span>Título</span><input class="input" data-k="titulo" value="${esc(p.titulo)}"></label>
      <label class="field"><span>Ativo</span><label class="switch"><input type="checkbox" data-k="ativo" ${p.ativo ? "checked" : ""}><span></span></label></label></div>
      <label class="field" style="margin-top:10px"><span>Descrição</span><input class="input" data-k="descricao" value="${esc(p.descricao)}"></label>
      <div style="text-align:right;margin-top:8px"><button class="btn sm danger" data-prog-del="${i}">Remover</button></div></div>`).join("")}</div>
      <div class="actions" style="margin-top:14px"><button class="btn" data-act="prog-add">+ Evento</button><button class="btn primary" data-act="prog-save">Salvar programação</button></div>`;
  }

  function fluxoHtml(f, i) {
    const max = f.campos.reduce((s, c) => s + Number(c.peso || 0), 0) + f.regrasBonus.reduce((s, r) => s + Number(r.pontos || 0), 0);
    return `<form class="card" data-fluxo="${i}" style="margin-bottom:14px">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap"><span class="outline-num" style="font-size:40px;--stroke:2px">${pad(i + 1)}</span>
        <input class="input" name="nome" value="${esc(f.nome)}" style="flex:1;min-width:200px;font-weight:800;font-size:18px">
        <span class="chip">id: ${esc(f.id)}</span><label class="switch" title="Ativo"><input type="checkbox" name="ativo" ${f.ativo ? "checked" : ""}><span></span></label></div>
      <div class="grid g2">
        <label class="field"><span>Gatilho — quando a IA deve usar</span><textarea class="input" name="gatilho">${esc(f.gatilho)}</textarea></label>
        <label class="field"><span>Objetivo de conversão</span><textarea class="input" name="objetivo">${esc(f.objetivo)}</textarea></label></div>
      <h2 style="margin-top:18px">Campos a coletar</h2>
      <div class="flow-field faint" style="font-size:12px"><span>id</span><span>pergunta / descrição</span><span>pontos</span><span>obrigatório</span><span></span></div>
      ${f.campos.map((c, j) => `<div class="flow-field" data-campo="${j}"><input class="input" data-k="id" value="${esc(c.id)}"><input class="input" data-k="pergunta" value="${esc(c.pergunta)}"><input class="input" type="number" data-k="peso" value="${c.peso}"><label class="switch"><input type="checkbox" data-k="obrigatorio" ${c.obrigatorio ? "checked" : ""}><span></span></label><button type="button" class="icon-btn" data-del-campo="${j}">✕</button></div>`).join("")}
      <button type="button" class="btn sm" data-add-campo>+ Campo</button>
      <h2 style="margin-top:18px">Regras de bônus</h2>
      <div class="flow-rule faint" style="font-size:12px"><span>campo</span><span>condição</span><span>pontos</span><span>descrição</span><span></span></div>
      ${f.regrasBonus.map((r, j) => `<div class="flow-rule" data-regra="${j}"><input class="input" data-k="campo" value="${esc(r.campo)}"><input class="input" data-k="condicao" value="${esc(r.condicao)}" placeholder=">=20 · contém:sim · preenchido"><input class="input" type="number" data-k="pontos" value="${r.pontos}"><input class="input" data-k="descricao" value="${esc(r.descricao)}"><button type="button" class="icon-btn" data-del-regra="${j}">✕</button></div>`).join("")}
      <button type="button" class="btn sm" data-add-regra>+ Regra</button>
      <div class="grid g4" style="margin-top:18px">
        <label class="field"><span>Morno a partir de</span><input class="input" type="number" name="limiarMorno" value="${f.limiarMorno}"></label>
        <label class="field"><span>Quente a partir de</span><input class="input" type="number" name="limiarQuente" value="${f.limiarQuente}"></label>
        <label class="field"><span>Pontuação máxima</span><input class="input" readonly value="${max}"></label>
        <label class="field"><span>Transferir se quente</span><label class="switch"><input type="checkbox" name="transferirSeQuente" ${f.transferirSeQuente ? "checked" : ""}><span></span></label></label></div>
      <label class="field" style="margin-top:12px"><span>Mensagem final da IA</span><textarea class="input" name="mensagemFinal">${esc(f.mensagemFinal)}</textarea></label>
      <div class="actions" style="margin-top:14px;justify-content:space-between"><button type="button" class="btn sm danger" data-del-fluxo>Excluir fluxo</button><button class="btn primary">Salvar fluxo</button></div></form>`;
  }

  function autoHtml(a) {
    const extra = a.id === "lembrete_reserva"
      ? `<label class="field"><span>Horas antes</span><input class="input" type="number" min="1" name="horasAntes" value="${a.horasAntes ?? 3}"></label>`
      : a.id === "programacao_semanal"
      ? `<label class="field"><span>Dia</span><select class="input" name="diaSemana">${DIAS.map((d, j) => `<option value="${j}" ${j === a.diaSemana ? "selected" : ""}>${d}</option>`).join("")}</select></label>`
      : a.id === "reativacao"
      ? `<label class="field"><span>Dias sem visita</span><input class="input" type="number" min="7" name="diasSemVisita" value="${a.diasSemVisita ?? 45}"></label>` : "";
    const vars = a.id === "lembrete_reserva" ? "{nome} {bar} {horario} {pessoas} {codigo}" : "{nome} {bar} {link_avaliacao} {link_cardapio} {programacao} {programacao_curta}";
    return `<form class="card ${a.ativo ? "accent" : ""}" data-auto="${a.id}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><b style="font-size:18px">${esc(a.nome)}</b><p class="muted" style="margin:4px 0 0;font-size:14px">${esc(a.descricao)}</p></div>
      <label class="switch"><input type="checkbox" name="ativo" ${a.ativo ? "checked" : ""}><span></span></label></div>
      <label class="field" style="margin-top:14px"><span>Mensagem</span><textarea class="input" name="mensagem" rows="4">${esc(a.mensagem)}</textarea><small>Variáveis: ${vars}</small></label>
      <div class="grid g2" style="margin-top:10px">${a.id !== "lembrete_reserva" ? `<label class="field"><span>Horário de envio</span><input class="input" type="time" name="horario" value="${esc(a.horario)}"></label>` : ""}${extra}
        <label class="field"><span>Template WhatsApp</span><input class="input" name="templateWhatsApp" value="${esc(a.templateWhatsApp)}" placeholder="nome_do_template"><small>Obrigatório fora da janela de 24h</small></label></div>
      <div class="actions" style="margin-top:12px;justify-content:flex-end"><button class="btn primary sm">Salvar</button></div></form>`;
  }

  function simMsgsHtml() {
    if (!S.sim.msgs.length) return `<div class="sys">Comece a conversa como se fosse um cliente no WhatsApp.</div>`;
    return S.sim.msgs.map((m) => `<div class="bubble ${m.de}">${esc(m.texto)}</div>`).join("") + (S.sim.loading ? `<div class="typing">digitando…</div>` : "");
  }

  // ---------------- Modais ----------------
  function modal(html, onSubmit) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<form class="modal" role="dialog" aria-modal="true">${html}</form>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
    bg.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await onSubmit(new FormData(e.target), e.target); close(); render(); } catch {}
    });
    bg.querySelector("input,textarea,select")?.focus();
    return bg;
  }

  function itemModal(item, categoriaId) {
    const it = item || { nome: "", descricao: "", preco: "", precoObs: "", tags: [], disponivel: true, destaque: false, categoriaId: categoriaId || S.state.categorias[0]?.id };
    modal(`<h3>${item ? "Editar item" : "Novo item"}</h3><div class="grid">
      <label class="field"><span>Nome</span><input class="input" name="nome" required value="${esc(it.nome)}"></label>
      <label class="field"><span>Descrição</span><textarea class="input" name="descricao">${esc(it.descricao)}</textarea></label>
      <div class="grid g2"><label class="field"><span>Preço (R$)</span><input class="input" name="preco" inputmode="decimal" required value="${it.preco === "" ? "" : Number(it.preco).toFixed(2).replace(".", ",")}"></label>
      <label class="field"><span>Obs. de preço</span><input class="input" name="precoObs" placeholder="Meia porção R$ 25" value="${esc(it.precoObs)}"></label></div>
      <label class="field"><span>Categoria</span><select class="input" name="categoriaId">${S.state.categorias.map((c) => `<option value="${c.id}" ${c.id === it.categoriaId ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
      <div class="field"><span>Tags</span><div class="tag-picker">${[...new Set([...TAGS, ...it.tags])].map((t) => `<label><input type="checkbox" name="tags" value="${esc(t)}" ${it.tags.includes(t) ? "checked" : ""}><span class="chip">${esc(t)}</span></label>`).join("")}</div></div>
      <div class="grid g2"><label class="field"><span>Disponível</span><label class="switch"><input type="checkbox" name="disponivel" ${it.disponivel ? "checked" : ""}><span></span></label></label>
      <label class="field"><span>Destaque ★</span><label class="switch"><input type="checkbox" name="destaque" ${it.destaque ? "checked" : ""}><span></span></label></label></div></div>
      <div class="foot">${item ? `<button type="button" class="btn danger" id="delItem" style="margin-right:auto">Excluir</button>` : ""}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Salvar</button></div>`,
      async (fd) => {
        const body = { nome: fd.get("nome"), descricao: fd.get("descricao"), preco: parsePreco(fd.get("preco")), precoObs: fd.get("precoObs"), categoriaId: fd.get("categoriaId"), tags: fd.getAll("tags"), disponivel: fd.has("disponivel"), destaque: fd.has("destaque") };
        if (item) await salvar(`/itens/${item.id}`, "PATCH", body);
        else await salvar("/itens", "POST", body, "Item criado");
      });
    document.getElementById("delItem")?.addEventListener("click", async () => {
      if (!confirm(`Excluir "${item.nome}"?`)) return;
      await salvar(`/itens/${item.id}`, "DELETE", undefined, "Item excluído");
      document.querySelector(".modal-bg")?.remove();
      render();
    });
  }

  function parsePreco(v) { const n = parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }

  // ---------------- Páginas: eventos ----------------
  const PAGE_BIND = {
    conversas() {
      $$(".conv[data-key]").forEach((el) => el.addEventListener("click", () => abrirConversa(el.dataset.key)));
      const msgs = $("#threadMsgs");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
      $("[data-act=voltar-lista]")?.addEventListener("click", () => { S.conv = null; S.convData = null; location.hash = "conversas"; });
      $("[data-act=assumir]")?.addEventListener("click", async () => { await salvar(`/conversas/${encodeURIComponent(S.conv)}/assumir`, "POST", {}, "Você assumiu a conversa"); abrirConversa(S.conv); });
      $("[data-act=devolver]")?.addEventListener("click", async () => { await salvar(`/conversas/${encodeURIComponent(S.conv)}/devolver`, "POST", {}, "Conversa devolvida à IA"); abrirConversa(S.conv); });
      $("#replyForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const t = e.target.t.value.trim();
        if (!t) return;
        await salvar(`/conversas/${encodeURIComponent(S.conv)}/responder`, "POST", { texto: t }, "Enviado");
        abrirConversa(S.conv);
      });
      $("#replyForm textarea")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });
    },

    cardapio() {
      const main = $("#main");
      $("#busca").addEventListener("input", (e) => { S.busca = e.target.value; const pos = e.target.selectionStart; render(); const b = $("#busca"); b.focus(); b.setSelectionRange(pos, pos); });
      main.addEventListener("click", async (e) => {
        const t = e.target.closest("button,a,[data-edit]");
        if (!t) return;
        const d = t.dataset;
        if (d.act === "novo-item") itemModal(null);
        else if (d.addIn) { e.preventDefault(); itemModal(null, d.addIn); }
        else if (d.act === "nova-cat") modal(`<h3>Nova categoria</h3><label class="field"><span>Nome</span><input class="input" name="nome" required></label><label class="field" style="margin-top:10px"><span>Descrição (opcional)</span><input class="input" name="descricao"></label><div class="foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div>`, (fd) => salvar("/categorias", "POST", { nome: fd.get("nome"), descricao: fd.get("descricao") }, "Categoria criada"));
        else if (d.act === "reabrir-tudo") { await salvar("/itens/lote", "POST", { ids: S.state.itens.filter((i) => !i.disponivel).map((i) => i.id), acao: "disponivel" }, "Tudo disponível"); render(); }
        else if (d.edit) itemModal(S.state.itens.find((i) => i.id === d.edit));
        else if (d.star) { const it = S.state.itens.find((i) => i.id === d.star); await salvar(`/itens/${it.id}`, "PATCH", { destaque: !it.destaque }, it.destaque ? "Destaque removido" : "Destacado ★"); render(); }
        else if (d.catUp || d.catDown) {
          const ids = [...S.state.categorias].sort((a, b) => a.ordem - b.ordem).map((c) => c.id);
          const id = d.catUp || d.catDown; const i = ids.indexOf(id); const j = d.catUp ? i - 1 : i + 1;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          await salvar("/categorias/reordenar", "POST", { ids }, "Ordem salva"); render();
        } else if (d.catDel) { if (confirm("Excluir esta categoria? (precisa estar vazia)")) { await salvar(`/categorias/${d.catDel}`, "DELETE", undefined, "Categoria excluída").catch(() => {}); render(); } }
        else if (d.bulk) {
          const ids = [...S.sel];
          if (d.bulk === "limpar") { S.sel.clear(); return render(); }
          let valor;
          if (d.bulk === "reajuste") { valor = prompt("Reajuste em % (ex.: 10 ou -5):"); if (valor === null || isNaN(parseFloat(valor))) return; }
          if (d.bulk === "excluir" && !confirm(`Excluir ${ids.length} item(ns)?`)) return;
          await salvar("/itens/lote", "POST", { ids, acao: d.bulk, valor: parseFloat(valor) }, "Atualizado");
          if (d.bulk === "excluir") S.sel.clear();
          render();
        }
      });
      main.addEventListener("change", async (e) => {
        const d = e.target.dataset;
        if (d.sel) { e.target.checked ? S.sel.add(d.sel) : S.sel.delete(d.sel); render(); }
        else if (d.disp) { await salvar(`/itens/${d.disp}`, "PATCH", { disponivel: e.target.checked }, e.target.checked ? "Disponível" : "Marcado como esgotado"); render(); }
        else if (d.preco) { await salvar(`/itens/${d.preco}`, "PATCH", { preco: parsePreco(e.target.value) }, "Preço atualizado"); e.target.value = parsePreco(e.target.value).toFixed(2).replace(".", ","); }
        else if (d.catNome) await salvar(`/categorias/${d.catNome}`, "PATCH", { nome: e.target.value }, "Categoria renomeada");
      });
      main.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.target.dataset.preco || e.target.dataset.catNome)) e.target.blur(); });
      bindDragRows();
    },

    reservas() {
      $$("[data-dia]").forEach((b) => b.addEventListener("click", () => { S.resvDia = b.dataset.dia; render(); }));
      $("#diaPick").addEventListener("change", (e) => { S.resvDia = e.target.value; render(); });
      $$("[data-resv]").forEach((s) => s.addEventListener("change", async () => { await salvar(`/reservas/${s.dataset.resv}`, "PATCH", { status: s.value }, "Status atualizado"); render(); }));
      $("#cfgForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const horarios = {};
        DIAS.forEach((_, i) => { horarios[i] = String(fd.get(`h${i}`) || "").split(/[,;\s]+/).map((h) => h.trim()).filter((h) => /^\d{1,2}:\d{2}$/.test(h)).map((h) => h.padStart(5, "0")); });
        await salvar("/reserva-config", "PUT", {
          ativo: fd.has("ativo"), horarios,
          ...Object.fromEntries(["capacidadePorHorario", "maxPessoasAutoConfirma", "antecedenciaMinimaMin", "toleranciaAtrasoMin", "diasMaxAntecedencia"].map((k) => [k, Number(fd.get(k))])),
        }, "Regras salvas");
        render();
      });
    },

    leads() {
      let drag = null;
      $$(".lead").forEach((el) => {
        el.addEventListener("dragstart", () => { drag = el.dataset.lead; el.style.opacity = ".4"; });
        el.addEventListener("dragend", () => (el.style.opacity = ""));
        el.addEventListener("click", () => leadModal(S.state.leads.find((l) => l.id === el.dataset.lead)));
      });
      $$(".col").forEach((col) => {
        col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
        col.addEventListener("dragleave", () => col.classList.remove("over"));
        col.addEventListener("drop", async (e) => { e.preventDefault(); col.classList.remove("over"); if (!drag) return; await salvar(`/leads/${drag}`, "PATCH", { etapa: col.dataset.etapa }, "Etapa atualizada"); render(); });
      });
    },

    clientes() {
      $("#cliBusca")?.addEventListener("input", (e) => { S.cliBusca = e.target.value; const p = e.target.selectionStart; render(); const b = $("#cliBusca"); b.focus(); b.setSelectionRange(p, p); });
      $$("[data-cli]").forEach((b) => b.addEventListener("click", () => {
        const c = S.state.clientes.find((x) => x.id === b.dataset.cli);
        modal(`<h3>${esc(c.nome || c.contatoId)}</h3><div class="grid">
          <label class="field"><span>Nome</span><input class="input" name="nome" value="${esc(c.nome)}"></label>
          <label class="field"><span>Aniversário (DD/MM)</span><input class="input" name="aniversario" value="${c.aniversario ? c.aniversario.split("-").reverse().join("/") : ""}" placeholder="25/12"></label>
          <label class="field"><span>Preferências</span><textarea class="input" name="preferencias">${esc(c.preferencias)}</textarea></label>
          <label class="field"><span>Tags (vírgula)</span><input class="input" name="tags" value="${esc(c.tags.join(", "))}"></label>
          <label class="field"><span>Aceita novidades</span><label class="switch"><input type="checkbox" name="aceitaNovidades" ${c.aceitaNovidades ? "checked" : ""}><span></span></label></label></div>
          <div class="foot"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Salvar</button></div>`,
          (fd) => { const a = String(fd.get("aniversario") || "").match(/^(\d{1,2})\/(\d{1,2})$/); return salvar(`/clientes/${c.id}`, "PATCH", { nome: fd.get("nome"), preferencias: fd.get("preferencias"), aniversario: a ? `${a[2].padStart(2, "0")}-${a[1].padStart(2, "0")}` : "", tags: String(fd.get("tags")).split(",").map((t) => t.trim()).filter(Boolean), aceitaNovidades: fd.has("aceitaNovidades") }); });
      }));
    },

    conhecimento() {
      $$("[data-kb]").forEach((b) => b.addEventListener("click", () => { S.kbTab = b.dataset.kb; render(); }));
      $("#negForm")?.addEventListener("submit", async (e) => { e.preventDefault(); await salvar("/negocio", "PUT", Object.fromEntries(new FormData(e.target)), "Informações salvas"); render(); });
      const coletar = (sel) => $$(sel).map((card) => { const o = {}; $$("[data-k]", card).forEach((i) => (o[i.dataset.k] = i.type === "checkbox" ? i.checked : i.dataset.k === "diaSemana" ? Number(i.value) : i.value)); return o; });
      $("[data-act=faq-add]")?.addEventListener("click", () => { S.state.faq = [...coletarFaq(), { id: "", pergunta: "", resposta: "", ativo: true }]; render(); });
      $("[data-act=faq-save]")?.addEventListener("click", async () => { await salvar("/faq", "PUT", coletarFaq(), "Perguntas salvas"); render(); });
      $$("[data-faq-del]").forEach((b) => b.addEventListener("click", () => { const l = coletarFaq(); l.splice(+b.dataset.faqDel, 1); S.state.faq = l; render(); }));
      $("[data-act=prog-add]")?.addEventListener("click", () => { S.state.programacao = [...coletarProg(), { id: "", diaSemana: 5, horario: "20h", titulo: "", descricao: "", ativo: true }]; render(); });
      $("[data-act=prog-save]")?.addEventListener("click", async () => { await salvar("/programacao", "PUT", coletarProg(), "Programação salva"); render(); });
      $$("[data-prog-del]").forEach((b) => b.addEventListener("click", () => { const l = coletarProg(); l.splice(+b.dataset.progDel, 1); S.state.programacao = l; render(); }));
      function coletarFaq() { return coletar("[data-faq]").map((o, i) => ({ ...o, id: S.state.faq[i]?.id || "" })); }
      function coletarProg() { return coletar("[data-prog]").map((o, i) => ({ ...o, id: S.state.programacao[i]?.id || "" })); }
    },

    fluxos() {
      const ler = (form) => {
        const fd = new FormData(form);
        const i = +form.dataset.fluxo;
        return {
          ...S.state.fluxos[i],
          nome: fd.get("nome"), ativo: fd.has("ativo"), gatilho: fd.get("gatilho"), objetivo: fd.get("objetivo"),
          limiarMorno: Number(fd.get("limiarMorno")), limiarQuente: Number(fd.get("limiarQuente")),
          transferirSeQuente: fd.has("transferirSeQuente"), mensagemFinal: fd.get("mensagemFinal"),
          campos: $$("[data-campo]", form).map((r) => ({ id: $("[data-k=id]", r).value.trim().replace(/\s+/g, "_"), pergunta: $("[data-k=pergunta]", r).value, peso: Number($("[data-k=peso]", r).value), obrigatorio: $("[data-k=obrigatorio]", r).checked })),
          regrasBonus: $$("[data-regra]", form).map((r) => ({ campo: $("[data-k=campo]", r).value.trim(), condicao: $("[data-k=condicao]", r).value.trim(), pontos: Number($("[data-k=pontos]", r).value), descricao: $("[data-k=descricao]", r).value })),
        };
      };
      const todos = () => $$("form[data-fluxo]").map(ler);
      $$("form[data-fluxo]").forEach((form) => {
        const i = +form.dataset.fluxo;
        form.addEventListener("submit", async (e) => { e.preventDefault(); await salvar("/fluxos", "PUT", todos(), "Fluxo salvo"); render(); });
        form.addEventListener("click", (e) => {
          const t = e.target.closest("button"); if (!t) return;
          const f = ler(form);
          if (t.hasAttribute("data-add-campo")) f.campos.push({ id: "", pergunta: "", peso: 10, obrigatorio: false });
          else if (t.dataset.delCampo) f.campos.splice(+t.dataset.delCampo, 1);
          else if (t.hasAttribute("data-add-regra")) f.regrasBonus.push({ campo: "", condicao: "preenchido", pontos: 10, descricao: "" });
          else if (t.dataset.delRegra) f.regrasBonus.splice(+t.dataset.delRegra, 1);
          else if (t.hasAttribute("data-del-fluxo")) { if (!confirm("Excluir este fluxo?")) return; const l = todos(); l.splice(i, 1); salvar("/fluxos", "PUT", l, "Fluxo excluído").then(render); return; }
          else return;
          const l = todos(); l[i] = f; S.state.fluxos = l; render();
        });
      });
      $("[data-act=novo-fluxo]")?.addEventListener("click", () => {
        S.state.fluxos = [...todos(), { id: `fluxo_${Date.now().toString(36)}`, nome: "Novo fluxo", ativo: false, gatilho: "", objetivo: "", campos: [{ id: "nome", pergunta: "Nome", peso: 10, obrigatorio: true }], regrasBonus: [], limiarMorno: 40, limiarQuente: 70, mensagemFinal: "", transferirSeQuente: true }];
        render(); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      });
    },

    automacoes() {
      $$("form[data-auto]").forEach((form) => form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const body = Object.fromEntries(fd);
        body.ativo = fd.has("ativo");
        await salvar(`/automacoes/${form.dataset.auto}`, "PUT", body, "Automação salva");
        render();
      }));
      $$("form[data-auto] input[name=ativo]").forEach((sw) => sw.addEventListener("change", () => sw.form.requestSubmit()));
    },

    simulador() {
      const box = $("#simMsgs"); box.scrollTop = box.scrollHeight;
      const enviar = async (texto) => {
        if (!texto || S.sim.loading) return;
        S.sim.msgs.push({ de: "cliente", texto }); S.sim.loading = true; render();
        try {
          const r = await api("/simulador", { method: "POST", body: { sessao: S.sim.sessao, texto } });
          if (r.resposta) S.sim.msgs.push({ de: "bot", texto: r.resposta });
          if (r.modo === "humano") S.sim.msgs.push({ de: "humano", texto: "[conversa transferida para a equipe — veja em Conversas]" });
        } catch (e) { S.sim.msgs.push({ de: "humano", texto: `Erro: ${e.message}` }); }
        S.sim.loading = false; await refresh(); render(); $("#simForm textarea")?.focus();
      };
      $("#simForm").addEventListener("submit", (e) => { e.preventDefault(); const t = e.target.t.value.trim(); e.target.t.value = ""; enviar(t); });
      $("#simForm textarea").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });
      $$("[data-sug]").forEach((b) => b.addEventListener("click", () => enviar(b.dataset.sug)));
      $("[data-act=sim-reset]").addEventListener("click", async () => {
        await api(`/simulador/${encodeURIComponent(S.sim.sessao)}`, { method: "DELETE" });
        S.sim = { sessao: `sim-${Math.random().toString(36).slice(2, 8)}`, msgs: [], loading: false };
        safeSet("couch_sim", S.sim.sessao); await refresh(); render();
      });
    },
  };

  function leadModal(l) {
    const c = S.state.clientes.find((x) => x.id === l.clienteId) || {};
    const conv = S.state.conversas.find((x) => x.key === `${c.canal}:${c.contatoId}`);
    modal(`<h3>${esc(c.nome || c.contatoId || "Lead")}</h3>
      <p>${tempChip(l.temperatura)} <span class="hl num" style="font-weight:800">${l.score} pts</span> · <span class="muted">${esc(nomeFluxo(l.fluxoId))}</span></p>
      <table class="t"><tbody>${Object.entries(l.dados).map(([k, v]) => `<tr><td class="faint">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
      <label class="field" style="margin-top:14px"><span>Resumo</span><textarea class="input" name="resumo">${esc(l.resumo)}</textarea></label>
      <label class="field" style="margin-top:10px"><span>Etapa</span><select class="input" name="etapa">${ETAPAS.map(([k, n]) => `<option value="${k}" ${k === l.etapa ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="foot">${conv ? `<a class="btn ghost" href="#conversas/${encodeURIComponent(conv.key)}" data-close style="margin-right:auto">Abrir conversa</a>` : ""}<button type="button" class="btn ghost" data-close>Fechar</button><button class="btn primary">Salvar</button></div>`,
      (fd) => salvar(`/leads/${l.id}`, "PATCH", { etapa: fd.get("etapa"), resumo: fd.get("resumo") }));
  }

  async function abrirConversa(key) {
    S.conv = key;
    if (location.hash !== `#conversas/${encodeURIComponent(key)}`) history.replaceState(null, "", `#conversas/${encodeURIComponent(key)}`);
    try { S.convData = await api(`/conversas/${encodeURIComponent(key)}`); } catch { S.convData = null; }
    render();
  }

  // Arrastar para reordenar itens (mouse e toque, pelo ícone ⋮⋮)
  function bindDragRows() {
    $$("[data-rows]").forEach((list) => {
      $$(".handle", list).forEach((h) => {
        h.addEventListener("pointerdown", (e) => {
          const row = h.closest(".row");
          if (!row) return;
          e.preventDefault();
          row.classList.add("dragging");
          let alvo = null;
          const move = (ev) => {
            const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".row[data-item]");
            $$(".row.over", list).forEach((r) => r.classList.remove("over"));
            if (el && el !== row && el.parentElement === list) { el.classList.add("over"); alvo = el; } else alvo = null;
          };
          const up = async () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
            row.classList.remove("dragging");
            $$(".row.over", list).forEach((r) => r.classList.remove("over"));
            if (!alvo) return;
            list.insertBefore(row, alvo);
            const ids = $$(".row[data-item]", list).map((r) => r.dataset.item);
            await salvar("/itens/reordenar", "POST", { ids }, "Ordem salva");
            render();
          };
          document.addEventListener("pointermove", move);
          document.addEventListener("pointerup", up);
        });
      });
    });
  }

  // ---------------- Roteamento + atualização ----------------
  window.addEventListener("hashchange", () => {
    const [page, ...rest] = location.hash.slice(1).split("/");
    S.page = page || "painel";
    if (S.page === "conversas" && rest.length) return abrirConversa(decodeURIComponent(rest.join("/")));
    if (S.page !== "conversas") { S.conv = null; S.convData = null; }
    render();
    window.scrollTo(0, 0);
  });

  // Atualiza painel e conversas sem atrapalhar quem está digitando
  setInterval(async () => {
    if (!S.token || !S.state || document.hidden) return;
    if (!["painel", "conversas", "leads", "reservas"].includes(S.page)) return;
    const ativo = document.activeElement;
    if (ativo && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName) && ativo.value) return;
    if (document.querySelector(".modal-bg")) return;
    try {
      await refresh();
      if (S.page === "conversas" && S.conv) S.convData = await api(`/conversas/${encodeURIComponent(S.conv)}`);
      render();
    } catch {}
  }, 10000);

  (async () => {
    if (S.token) {
      try { await refresh(); } catch { /* token inválido → login */ }
    }
    const [page, ...rest] = location.hash.slice(1).split("/");
    if (page === "conversas" && rest.length && S.token) return abrirConversa(decodeURIComponent(rest.join("/")));
    render();
  })();
})();
