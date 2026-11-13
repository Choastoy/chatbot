import { Router } from "express";
import { getDb } from "../db/store.js";

export const publicRouter = Router();

/** Dados do cardápio público (sem nada interno). */
publicRouter.get("/api/cardapio", (_req, res) => {
  const { negocio: n, categorias, itens, programacao } = getDb();
  res.set("Cache-Control", "public, max-age=30");
  res.json({
    negocio: {
      nome: n.nome,
      slogan: n.slogan,
      segmento: n.segmento,
      endereco: n.endereco,
      bairroCidade: n.bairroCidade,
      instagram: n.instagram,
      telefone: n.telefone,
      horarioFuncionamento: n.horarioFuncionamento,
      couvert: n.couvert,
    },
    categorias: [...categorias].sort((a, b) => a.ordem - b.ordem),
    itens: [...itens]
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ id, categoriaId, nome, descricao, preco, precoObs, tags, disponivel, destaque }) => ({
        id, categoriaId, nome, descricao, preco, precoObs, tags, disponivel, destaque,
      })),
    programacao: programacao.filter((p) => p.ativo).sort((a, b) => a.diaSemana - b.diaSemana),
  });
});
