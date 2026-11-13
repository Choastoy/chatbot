# couch_ai · Atendimento com IA para bares e restaurantes

Atendimento automático no **WhatsApp** e no **Instagram**, ligado a uma **base de conhecimento** e a um **cardápio editável**, com as três automações das artes da couch_ai:

| | Feature | Como funciona aqui |
|---|---|---|
| **01** | **Reserva que se confirma sozinha** | O cliente escolhe dia, horário e nº de pessoas no chat. A IA confere a capacidade de cada horário e confirma com código, às 14h ou às 2h da manhã. Grupos acima do limite viram lead. |
| **02** | **Fim do "qual o cardápio?" repetido 40 vezes** | Horário, cardápio, couvert, estacionamento e programação respondidos na hora, com o tom de voz da casa. Preços e itens esgotados vêm do cardápio ao vivo. |
| **03** | **O cliente volta sem você pedir** | Lembrete de reserva, pedido de avaliação no Google no dia seguinte, mensagem de aniversário, programação da semana e reativação de clientes sumidos. |

Mais: **qualificação de leads** (aniversários grandes, eventos fechados, catering) com score configurável, **transferência para humano** com alerta no WhatsApp do gerente, **painel** para a equipe e **cardápio público** com o visual da marca.

---

## O que tem dentro

```
/admin      Painel da equipe (login com ADMIN_TOKEN)
  01 Painel             métricas do dia, o que precisa de você
  02 Conversas          inbox WhatsApp + Instagram, assumir/devolver ao bot
  03 Cardápio           edição rápida: preço na linha, esgotado com um toque,
                        destaque ★, arrastar para ordenar, ações em lote
  04 Reservas           ocupação por horário, status, regras de capacidade
  05 Leads              kanban com score e temperatura
  06 Clientes           aniversário, preferências, consentimento
  07 Base de conhecimento   informações da casa, FAQ, programação
  08 Fluxos             roteiros de qualificação com pontuação
  09 Automações         mensagens de retenção e templates do WhatsApp
  10 Simulador          converse com a IA antes de ligar os canais
/cardapio   Cardápio público (link enviado pela IA)
/webhook    Webhook único da Meta (WhatsApp + Instagram)
```

O guia do prompt, dos fluxos e da otimização de conversão está em **[docs/PROMPT.md](docs/PROMPT.md)**.

---

## Rodando localmente

Requisitos: Node.js 20+.

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha pelo menos `ADMIN_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN` e `ANTHROPIC_API_KEY`. Os canais são opcionais para testar: sem eles, use o **Simulador** do painel.

```bash
npm run dev
```

Abra `http://localhost:3000/admin`. Na primeira execução, o sistema cria `data/db.json` com um bar de exemplo; edite tudo pelo painel.

---

## Conectando os canais

Os dois canais usam o **mesmo app da Meta** e o **mesmo webhook**: `https://SEU_DOMINIO/webhook`, com o token de verificação `META_WEBHOOK_VERIFY_TOKEN`. Defina `META_APP_SECRET` para validar a assinatura das chamadas.

### WhatsApp (Cloud API)
1. No app da Meta, adicione o produto **WhatsApp** e um número.
2. Copie o **Phone number ID** para `WHATSAPP_PHONE_NUMBER_ID` e gere um **token permanente** (usuário do sistema) para `WHATSAPP_ACCESS_TOKEN`.
3. Em *Webhooks*, assine o campo `messages`.
4. Crie os templates das automações (sugestões em `docs/PROMPT.md`, seção 6) e informe os nomes em **Painel → Automações**.

### Instagram (Messaging API)
1. A conta precisa ser **profissional** e estar conectada a uma **página do Facebook**.
2. Adicione o produto **Instagram** ao app, com as permissões `instagram_basic`, `instagram_manage_messages` e `pages_manage_metadata`.
3. Copie o **IG User ID** para `INSTAGRAM_ACCOUNT_ID` e o token da página para `INSTAGRAM_ACCESS_TOKEN`.
4. Em *Webhooks* (objeto **Instagram**), assine `messages`.
5. No app do Instagram: *Configurações → Mensagens → Ferramentas conectadas → Permitir acesso às mensagens*.

---

## IA

- Usa a API da Anthropic (`@anthropic-ai/sdk`) com o modelo definido em `ANTHROPIC_MODEL` (padrão `claude-opus-5-5`) e esforço `ANTHROPIC_EFFORT` (padrão `low`, adequado para chat). Para reduzir custo em alto volume, `claude-sonnet-5-5` ou `claude-haiku-5-5` também funcionam; teste no Simulador antes de trocar.
- O prompt fixo fica em cache; cardápio, reservas e fluxos chegam por ferramentas, sempre atualizados.
- Se um classificador de segurança recusar uma resposta, a API refaz automaticamente em um modelo de fallback na mesma chamada (`fallbacks: "default"`).
- O histórico de cada conversa só cresce (nunca é reescrito), o que mantém o cache e o raciocínio do modelo válidos.

## Dados

Tudo fica em `data/db.json` (gravação atômica). Faça backup desse arquivo. Para várias unidades ou alto volume, troque `src/db/store.ts` por um banco (Postgres) mantendo a mesma interface.

## Produção

```bash
npm run build
```

```bash
npm start
```

Publique atrás de HTTPS (a Meta exige) e mantenha **uma instância** (o arquivo de dados e o agendador de automações são locais). Persista a pasta `data/` em volume.

## Estrutura do código

```
src/
  index.ts                 servidor Express
  config.ts                variáveis de ambiente
  ai/prompt.ts             prompt do atendente (ver docs/PROMPT.md)
  ai/tools.ts              ferramentas: cardápio, reservas, leads, transferência
  ai/agent.ts              loop de atendimento com a API da Anthropic
  channels/meta.ts         WhatsApp Cloud API + Instagram Messaging
  routes/webhook.ts        recebe mensagens dos dois canais
  routes/admin.ts          API do painel
  routes/public.ts         API do cardápio público
  services/conversation.ts fila por cliente, sessões, modo humano
  services/domain.ts       clientes, base de conhecimento, reservas, score de leads
  services/automations.ts  automações de retenção (roda a cada minuto)
  db/                      tipos, dados de exemplo e armazenamento
public/
  assets/brand.css         identidade visual couch_ai
  admin/                   painel
  cardapio/                cardápio público
```
