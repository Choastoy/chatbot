import express from "express";
import path from "path";
import { config } from "./config.js";
import { loadDb } from "./db/store.js";
import { webhookRouter } from "./routes/webhook.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { iniciarAgendador } from "./services/automations.js";

loadDb();

const app = express();
app.disable("x-powered-by");

// Guarda o corpo bruto para validar a assinatura dos webhooks da Meta
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

const publicDir = path.resolve(process.cwd(), "public");

app.use("/", webhookRouter);
app.use("/", publicRouter);
app.use("/api/admin", adminRouter);
app.use(express.static(publicDir, { extensions: ["html"] }));
app.get("/", (_req, res) => res.redirect("/cardapio"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  console.log(`couch_ai atendimento rodando na porta ${config.port}`);
  console.log(`  Painel:   ${config.publicUrl}/admin`);
  console.log(`  Cardápio: ${config.publicUrl}/cardapio`);
  console.log(`  Webhook:  ${config.publicUrl}/webhook`);
  iniciarAgendador();
});
