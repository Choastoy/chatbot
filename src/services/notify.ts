import { config } from "../config.js";
import { canalConfigurado, whatsappTexto } from "../channels/meta.js";

/** Alertas para a equipe (dono/gerente) via WhatsApp. Registra no log se não houver número. */
export async function notificarEquipe(texto: string): Promise<void> {
  console.log(`[equipe] ${texto.replace(/\n/g, " | ")}`);
  if (!config.owner.whatsappNumber || !canalConfigurado("whatsapp")) return;
  try {
    await whatsappTexto(config.owner.whatsappNumber, texto);
  } catch (err) {
    console.error("Falha ao notificar equipe:", (err as Error).message);
  }
}
