import express from "express";
import { config } from "./config.js";
import { webhookRouter } from "./routes/webhook.js";

const app = express();

app.use(express.json());
app.use("/", webhookRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  console.log(`Couch AI chatbot running on port ${config.port}`);
});
