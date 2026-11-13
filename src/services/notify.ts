import { config } from "../config.js";
import { canalConfigurado, whatsappTexto } from "../channels/meta.js";

/** Alertas para a equipe (dono/gerente) via WhatsApp. Registra no log se não houver número. */
export async function notificarEquipe(texto: string): Promise<void> {
  console.log(`[equipe] ${texto.replace(/\n/g, " | ")}`);
  if (!config.owner.whatsappNumber || !canalConfigurado("whatsapp")) return;
  try {
    // Aceita o número em qualquer formato (+55 31 9..., 5531...): envia só os dígitos
    await whatsappTexto(config.owner.whatsappNumber.replace(/\D/g, ""), texto);
  } catch (err) {
    console.error("Falha ao notificar equipe:", (err as Error).message);
  }
}
