import { google } from "googleapis";
import fs from "fs";
import { config } from "../config.js";
import type { AvailabilitySlot } from "../types/index.js";

function getAuth() {
  let credentials: object;

  if (config.google.keyJson) {
    credentials = JSON.parse(config.google.keyJson);
  } else if (config.google.keyPath) {
    credentials = JSON.parse(fs.readFileSync(config.google.keyPath, "utf-8"));
  } else {
    throw new Error(
      "Google credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_KEY_JSON."
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

export async function checkAvailability(
  startDate: string,
  endDate: string
): Promise<AvailabilitySlot[]> {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = new Date(`${startDate}T00:00:00-03:00`).toISOString();
  const timeMax = new Date(`${endDate}T23:59:59-03:00`).toISOString();

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: "America/Sao_Paulo",
      items: [{ id: config.google.calendarId }],
    },
  });

  const busyPeriods = data.calendars?.[config.google.calendarId]?.busy ?? [];

  const slots: AvailabilitySlot[] = [];
  const current = new Date(`${startDate}T00:00:00-03:00`);
  const end = new Date(`${endDate}T00:00:00-03:00`);

  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];
    const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59-03:00`);

    const isBusy = busyPeriods.some((period) => {
      const busyStart = new Date(period.start!);
      const busyEnd = new Date(period.end!);
      return busyStart < dayEnd && busyEnd > dayStart;
    });

    slots.push({ date: dateStr, available: !isBusy });
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

export function formatAvailabilityMessage(slots: AvailabilitySlot[]): string {
  if (slots.length === 0) return "Nenhuma data para verificar.";

  if (slots.length === 1) {
    const slot = slots[0];
    const formatted = formatDate(slot.date);
    return slot.available
      ? `${formatted} está disponível! 🎉`
      : `${formatted} já está reservado.`;
  }

  const available = slots.filter((s) => s.available);
  const booked = slots.filter((s) => !s.available);

  if (available.length === 0) {
    return "Todas as datas do período já estão reservadas.";
  }

  const lines = ["Datas disponíveis no período:"];
  for (const slot of available) {
    lines.push(`✅ ${formatDate(slot.date)}`);
  }
  if (booked.length > 0) {
    lines.push("\nDatas reservadas:");
    for (const slot of booked) {
      lines.push(`❌ ${formatDate(slot.date)}`);
    }
  }

  return lines.join("\n");
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
