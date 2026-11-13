(() => {
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  let data = null;
  let filtroTag = null;

  async function carregar() {
    try {
      const r = await fetch("/api/cardapio", { cache: "no-store" });
      data = await r.json();
    } catch {
      $("#heroTitle").textContent = "Não foi possível carregar o cardápio.";
      return;
    }
    const n = data.negocio;
    document.title = `Cardápio · ${n.nome}`;
    $("#barName").textContent = n.nome;
    $("#kicker").textContent = n.segmento || "Cardápio";
    // Última palavra do nome em destaque, como nas artes
    const partes = n.nome.trim().split(" ");
    const ultima = partes.pop();
    $("#heroTitle").innerHTML = `${esc(partes.join(" "))} <span class="hl">${esc(ultima)}</span>.`;
    $("#heroLede").innerHTML = `${esc(n.slogan)}${n.couvert ? ` <strong>${esc(n.couvert)}</strong>` : ""}`;
    $("#footHandle").textContent = [n.instagram, n.bairroCidade].filter(Boolean).join(" · ");
    $("#itemCount").textContent = `${String(data.itens.filter((i) => i.disponivel).length).padStart(2, "0")} itens`;

    const tags = [...new Set(data.itens.flatMap((i) => i.tags))].sort();
    $("#filters").innerHTML = tags
      .map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`)
      .join("");
    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      filtroTag = filtroTag === b.dataset.tag ? null : b.dataset.tag;
      document.querySelectorAll("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.tag === filtroTag)));
      render();
    });

    renderInfo();
    render();
  }

  function render() {
    const q = norm($("#busca").value.trim());
    const cats = data.categorias;
    let html = "";
    let navHtml = "";
    let idx = 0;
    let total = 0;

    const destaques = data.itens.filter((i) => i.destaque && i.disponivel);
    if (!q && !filtroTag && destaques.length) {
      html += `<aside class="featured"><h3>★ Os queridinhos da casa</h3><ul>${destaques
        .slice(0, 4)
        .map((i) => `<li><span>${esc(i.nome)}</span><span>${brl(i.preco)}</span></li>`)
        .join("")}</ul></aside>`;
    }

    for (const cat of cats) {
      const itens = data.itens.filter(
        (i) =>
          i.categoriaId === cat.id &&
          (!filtroTag || i.tags.includes(filtroTag)) &&
          (!q || norm(`${i.nome} ${i.descricao} ${i.tags.join(" ")} ${cat.nome}`).includes(q))
      );
      if (!itens.length) continue;
      idx++;
      total += itens.length;
      const num = String(idx).padStart(2, "0");
      navHtml += `<a href="#c-${esc(cat.id)}" data-cat="${esc(cat.id)}">${esc(cat.nome)}</a>`;
      html += `<section class="cat" id="c-${esc(cat.id)}">
        <div class="cat-head"><span class="outline-num" aria-hidden="true">${num}</span><h2 class="headline">${esc(cat.nome)}</h2></div>
        ${cat.descricao ? `<p class="cat-desc">${esc(cat.descricao)}</p>` : ""}
        ${itens.map(itemHtml).join("")}
      </section>`;
    }
    $("#menu").innerHTML = html;
    $("#cats").innerHTML = navHtml;
    $("#vazio").hidden = total > 0;
    observar();
  }

  function itemHtml(i) {
    const tags = i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    return `<article class="item${i.disponivel ? "" : " off"}">
      <div class="item-name">${esc(i.nome)}
        ${i.destaque && i.disponivel ? `<span class="badge-star">★ destaque</span>` : ""}
        ${i.disponivel ? "" : `<span class="badge-off">esgotado hoje</span>`}
      </div>
      <div class="item-price">${brl(i.preco)}${i.precoObs ? `<small>${esc(i.precoObs)}</small>` : ""}</div>
      ${i.descricao ? `<p class="item-desc">${esc(i.descricao)}</p>` : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </article>`;
  }

  function renderInfo() {
    const n = data.negocio;
    const tel = (n.telefone || "").replace(/\D/g, "");
    const wa = tel ? `https://wa.me/${tel.length <= 11 ? "55" + tel : tel}?text=${encodeURIComponent("Oi! Quero reservar uma mesa.")}` : "";
    $("#info").innerHTML = `
      ${data.programacao.length ? `<div class="card"><h3>Programação</h3><div class="prog">${data.programacao
        .map((p) => `<div><b>${DIAS[p.diaSemana]} · ${esc(p.horario)}</b><span style="color:var(--muted)">${esc(p.titulo)} — ${esc(p.descricao)}</span></div>`)
        .join("")}</div></div>` : ""}
      <div class="card"><h3>Horários</h3><p>${esc(n.horarioFuncionamento)}</p></div>
      <div class="card"><h3>Onde estamos</h3><p>${esc(n.endereco)}\n${esc(n.bairroCidade)}</p>
        ${wa ? `<a class="cta" href="${wa}" target="_blank" rel="noopener">Reservar pelo WhatsApp →</a>` : ""}
      </div>`;
  }

  let observer;
  function observar() {
    observer?.disconnect();
    const links = new Map([...document.querySelectorAll("#cats a")].map((a) => [a.dataset.cat, a]));
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.id.slice(2);
          links.forEach((a, k) => a.classList.toggle("on", k === id));
          links.get(id)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
        }
      },
      { rootMargin: "-140px 0px -60% 0px" }
    );
    document.querySelectorAll(".cat").forEach((s) => observer.observe(s));
  }

  let t;
  $("#busca").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(render, 120);
  });

  carregar();
  // Atualiza a cada minuto (itens esgotados aparecem sem recarregar)
  setInterval(async () => {
    try {
      const r = await fetch("/api/cardapio", { cache: "no-store" });
      data = await r.json();
      render();
    } catch {}
  }, 60_000);
})();
