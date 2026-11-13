import { config } from "../config.js";

export const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Data/hora atuais no fuso do estabelecimento. */
export function agora(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const data = `${parts.year}-${parts.month}-${parts.day}`;
  const hora = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  return { data, hora, diaSemana: diaDaSemana(data), mmdd: `${parts.month}-${parts.day}` };
}

export function diaDaSemana(dataISO: string): number {
  const [y, m, d] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function somarDias(dataISO: string, dias: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Minutos entre "agora" (fuso local) e data+hora informadas. */
export function minutosAte(dataISO: string, hora: string): number {
  const now = agora();
  const toMin = (d: string, h: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    const [hh, mm] = h.split(":").map(Number);
    return Date.UTC(y, m - 1, dd, hh, mm) / 60000;
  };
  return toMin(dataISO, hora) - toMin(now.data, now.hora);
}

export function formatarData(dataISO: string): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
