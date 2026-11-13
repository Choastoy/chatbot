import type Anthropic from "@anthropic-ai/sdk";

export type Canal = "whatsapp" | "instagram" | "teste";

export interface Negocio {
  nome: string;
  segmento: string; // ex.: "bar com música ao vivo", "restaurante", "catering"
  slogan: string;
  endereco: string;
  bairroCidade: string;
  telefone: string;
  instagram: string;
  horarioFuncionamento: string; // texto livre, ex.: "Ter a Qui 17h–00h · Sex e Sáb 17h–02h"
  couvert: string;
  estacionamento: string;
  formasPagamento: string;
  petFriendly: string;
  acessibilidade: string;
  linkAvaliacaoGoogle: string;
  tomDeVoz: string; // como a casa fala: "descontraído, mineiro, acolhedor"
  observacoesInternas: string; // regras que o bot deve seguir e o cliente não vê
}

export interface FaqItem {
  id: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
}

export interface Programacao {
  id: string;
  diaSemana: number; // 0=domingo ... 6=sábado
  horario: string;
  titulo: string;
  descricao: string;
  ativo: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  descricao: string;
  ordem: number;
}

export interface ItemCardapio {
  id: string;
  categoriaId: string;
  nome: string;
  descricao: string;
  preco: number;
  /** Preço alternativo opcional, ex.: "meia porção". */
  precoObs: string;
  tags: string[]; // vegano, vegetariano, sem glúten, picante, novo, chef
  disponivel: boolean;
  destaque: boolean;
  ordem: number;
}

export interface ReservaConfig {
  ativo: boolean;
  /** Horários de entrada por dia da semana (0=domingo). Dia sem horários = fechado para reservas. */
  horarios: Record<string, string[]>;
  capacidadePorHorario: number; // lugares por horário
  maxPessoasAutoConfirma: number; // acima disso vira lead de grupo
  antecedenciaMinimaMin: number;
  toleranciaAtrasoMin: number;
  diasMaxAntecedencia: number;
}

export type StatusReserva = "confirmada" | "cancelada" | "concluida" | "nao_compareceu";

export interface Reserva {
  id: string;
  codigo: string;
  clienteId: string;
  nome: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  pessoas: number;
  ocasiao: string;
  observacoes: string;
  status: StatusReserva;
  canal: Canal;
  criadaEm: string;
}

export interface Cliente {
  id: string;
  canal: Canal;
  contatoId: string; // telefone (WhatsApp) ou IGSID (Instagram)
  nome: string;
  telefone: string;
  aniversario: string; // MM-DD
  preferencias: string;
  aceitaNovidades: boolean;
  tags: string[];
  criadoEm: string;
  ultimaInteracao: string;
}

export interface CampoFluxo {
  id: string;
  pergunta: string;
  peso: number; // pontos somados ao score quando o dado é coletado
  obrigatorio: boolean;
}

export interface RegraBonus {
  campo: string;
  /** Condição simples: ">=20", "contém:empresa", "preenchido" */
  condicao: string;
  pontos: number;
  descricao: string;
}

export interface Fluxo {
  id: string;
  nome: string;
  ativo: boolean;
  /** Quando o bot deve iniciar este fluxo. */
  gatilho: string;
  /** Objetivo de conversão do fluxo. */
  objetivo: string;
  campos: CampoFluxo[];
  regrasBonus: RegraBonus[];
  limiarQuente: number;
  limiarMorno: number;
  /** O que o bot diz ao concluir a qualificação. */
  mensagemFinal: string;
  /** Transfere para humano automaticamente se o lead ficar quente. */
  transferirSeQuente: boolean;
}

export type EtapaLead = "novo" | "qualificado" | "proposta" | "fechado" | "perdido";
export type Temperatura = "frio" | "morno" | "quente";

export interface Lead {
  id: string;
  clienteId: string;
  fluxoId: string;
  dados: Record<string, string>;
  score: number;
  temperatura: Temperatura;
  etapa: EtapaLead;
  resumo: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type AutomacaoId =
  | "lembrete_reserva"
  | "avaliacao_google"
  | "aniversario"
  | "programacao_semanal"
  | "reativacao";

export interface Automacao {
  id: AutomacaoId;
  nome: string;
  descricao: string;
  ativo: boolean;
  mensagem: string;
  /** Nome do template aprovado na Meta (obrigatório para WhatsApp fora da janela de 24h). */
  templateWhatsApp: string;
  horario: string; // HH:MM de disparo
  diaSemana?: number; // programação semanal
  horasAntes?: number; // lembrete
  diasSemVisita?: number; // reativação
}

export interface MensagemTranscript {
  de: "cliente" | "bot" | "humano" | "sistema";
  texto: string;
  em: string;
}

export interface Conversa {
  key: string; // canal:contatoId
  canal: Canal;
  contatoId: string;
  clienteId: string;
  /** Histórico enviado à API — somente append (preserva thinking e cache). */
  messages: Anthropic.Beta.BetaMessageParam[];
  transcript: MensagemTranscript[];
  modo: "bot" | "humano";
  iniciadaEm: string;
  ultimaAtividade: string;
  /** Última mensagem recebida do cliente (janela de 24h da Meta). */
  ultimaMsgCliente: string;
  naoLidas: number;
}

export interface Envio {
  id: string;
  automacaoId: AutomacaoId;
  clienteId: string;
  ref: string; // chave de idempotência (ex.: reservaId, ano do aniversário)
  em: string;
  status: "enviado" | "falhou" | "ignorado";
  detalhe: string;
}

export interface DB {
  negocio: Negocio;
  faq: FaqItem[];
  programacao: Programacao[];
  categorias: Categoria[];
  itens: ItemCardapio[];
  reservaConfig: ReservaConfig;
  reservas: Reserva[];
  clientes: Cliente[];
  leads: Lead[];
  fluxos: Fluxo[];
  automacoes: Automacao[];
  conversas: Record<string, Conversa>;
  envios: Envio[];
  processedMessageIds: string[];
}
