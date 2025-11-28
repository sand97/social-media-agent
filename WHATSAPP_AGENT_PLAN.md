# WHATSAPP AGENT PLAN - Architecture et Implémentation

---

## 🎯 VUE D'ENSEMBLE

Architecture décentralisée avec **deux agents LangChain distincts** :

1. **Backend Agent** : Conversation avec le **patron** (onboarding, configuration)
2. **WhatsApp Agent** : Conversation avec les **clients WhatsApp** du patron

---

## 🏗️ ARCHITECTURE GLOBALE

```
┌──────────────────────────────────────────────────────────────────┐
│  VPS BACKEND (1 pour tous les clients)                          │
│                                                                    │
│  ┌─────────────────────┐         ┌──────────────────────┐       │
│  │  Backend (NestJS)   │────────▶│  PostgreSQL          │       │
│  │  - API REST         │         │  - Users             │       │
│  │  - LangChain Agent  │◄────────│  - WhatsappAgents    │       │
│  │  - Tools (config)   │         │  - Products          │       │
│  │  - Onboarding       │         │  - Logs              │       │
│  │  - Prisma           │         │  - Threads           │       │
│  └─────────┬───────────┘         └──────────────────────┘       │
│            │                     ┌──────────────────────┐       │
│            │                     │  Redis               │       │
│            │                     │  - Cache             │       │
│            │                     │  - Jobs              │       │
│            │                     └──────────────────────┘       │
│  ┌─────────▼───────────┐                                        │
│  │  Frontend (React)   │                                        │
│  │  - Dashboard patron │                                        │
│  │  - Chat onboarding  │                                        │
│  └─────────────────────┘                                        │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
                                       │ HTTPS/REST API
                                       │
┌──────────────────────────────────────▼───────────────────────────┐
│  VPS CLIENT (plusieurs clients possible)                         │
│                                                                    │
│  ┌─────────────── CLIENT 1 ───────────────────────────┐          │
│  │                                                      │          │
│  │  ┌──────────────────┐         ┌──────────────────┐ │          │
│  │  │  Connector       │────────▶│  Agent           │ │          │
│  │  │  - wwebjs        │ webhook │  - LangChain     │ │          │
│  │  │  - Events        │  local  │  - Tools         │ │          │
│  │  │  - Execute code  │         │  - Prisma        │ │          │
│  │  │  PAS de BD       │         └────────┬─────────┘ │          │
│  │  │  PAS de Prisma   │                  │           │          │
│  │  └──────────────────┘                  │           │          │
│  │                              ┌──────────▼─────────┐ │          │
│  │                              │  PostgreSQL        │ │          │
│  │                              │  - Checkpoints     │ │          │
│  │                              │  - Memories        │ │          │
│  │                              └────────────────────┘ │          │
│  │                              ┌────────────────────┐ │          │
│  │                              │  Redis             │ │          │
│  │                              │  - Bull Queue      │ │          │
│  │                              └────────────────────┘ │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                    │
│  ┌─────────────── CLIENT 2 ───────────────────────────┐          │
│  │  (même structure)                                   │          │
│  └──────────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧠 DEUX AGENTS LANGCHAIN DISTINCTS

### 1. Backend Agent (Onboarding)

**Rôle** : Configurer l'agent du patron via chat conversationnel

**Utilisateur** : Le patron (via dashboard web)

**Tools Backend** :
- `readUserInfo` - Lire infos utilisateur
- `readBusinessProfile` - Lire profil business
- `readProducts` - Lire produits
- `updateAgentContext` - Modifier le contexte de l'agent
- `executeScriptViaConnector` - Exécuter script WPP via connector
- `getAllLabels` - Récupérer labels WhatsApp
- `addNewLabel` - Créer un label
- `editLabel` - Modifier un label
- `createGroup` - Créer groupe WhatsApp
- `analyzeProductImages` - Analyser images avec IA
- `updateStrategy` - Changer stratégie de vente

**Exemple de conversation** :
```
Patron: "Je veux que mon agent soit plus amical"
Backend Agent:
  1. Lit le contexte actuel (readAgentContext)
  2. Modifie le ton (updateAgentContext)
  3. Répond: "✅ Contexte mis à jour ! Ton amical activé."
```

**Base de données** : PostgreSQL backend (centrale)

**LangGraph State** :
```typescript
const BackendAgentState = z.object({
  messages: MessagesZodMeta,
  userId: z.string(),
  agentId: z.string(),
  currentContext: z.string(),
  contextScore: z.number(),
});
```

---

### 2. WhatsApp Agent (Conversations clients)

**Rôle** : Répondre aux clients WhatsApp automatiquement

**Utilisateur** : Les clients WhatsApp du patron

**Tools Agent** :
- `sendMessage` - Envoyer message (max 500 chars)
- `sendProduct` - Envoyer produit du catalogue
- `sendCollection` - Envoyer collection
- `forwardToManagementGroup` - Transférer au groupe de gestion
- `listProducts` - Lister produits
- `searchProducts` - Rechercher produits
- `getProductDetails` - Détails produit
- `getContactLabels` - Labels du contact
- `addLabelToContact` - Ajouter label
- `getOlderMessages` - Récupérer messages anciens
- `detectIntent` - Détecter intention
- `scheduleMessage` - Programmer rappel
- `savePersistentMemory` - Sauvegarder mémoire importante
- `retrievePersistentMemory` - Récupérer mémoires

**Exemple de conversation** :
```
Client: "C'est combien la robe bleue ?"
WhatsApp Agent:
  1. Recherche produit (searchProducts)
  2. Obtient détails (getProductDetails)
  3. Envoie produit (sendProduct)
  4. Répond: "Voici notre robe bleue élégante! 👗 Prix: 25000 FCFA"
```

**Base de données** : PostgreSQL agent (locale sur VPS client)

**LangGraph State** :
```typescript
const WhatsAppAgentState = z.object({
  messages: MessagesZodMeta,
  chatId: z.string(),
  contactLabels: z.array(z.string()),
  agentContext: z.string(),  // Récupéré depuis backend
  userPreferences: z.record(z.string(), z.any()).optional(),
  pendingOrder: z.any().optional(),
});
```

---

## 🔄 CONNECTOR (CLIENT PUR)

**Responsabilités UNIQUEMENT** :
1. Se connecter à WhatsApp Web
2. Envoyer events → Agent (webhook local)
3. Recevoir scripts → Exécuter dans la page
4. **C'EST TOUT**

**PAS de** :
- ❌ Base de données
- ❌ Prisma
- ❌ Logique métier
- ❌ LangChain
- ❌ Tools

**Configuration** :
```env
CONNECTOR_IP=connector-client-001
AGENT_WEBHOOK_URL=http://localhost:3002/webhook  # Local au VPS
```

**Code minimal** :
```typescript
// whatsapp-client.service.ts
this.client.on('ready', (...args) => {
  // Envoyer event au agent (local)
  await this.webhookService.sendEvent('ready', args);
});

this.client.on('message', (...args) => {
  // Envoyer event au agent (local)
  await this.webhookService.sendEvent('message', args);
});

this.client.on('disconnected', (...args) => {
  // Envoyer event au agent (local)
  await this.webhookService.sendEvent('disconnected', {
    connectorIp: this.connectorIp,
    reason: args[0]
  });
});

// Endpoint pour exécuter scripts
@Post('execute-script')
async executeScript(@Body() { script }) {
  const result = await this.pupPage.evaluate(script);
  return result;
}
```

---

## 📡 FLOW COMPLET D'UN MESSAGE

### 1. Message reçu sur WhatsApp

```
1. WhatsApp → Connector (wwebjs event 'message')
   ↓
2. Connector → Agent (webhook local POST /webhook/message)
   {
     event: 'message',
     data: [message]
   }
   ↓
3. Agent récupère labels via Connector
   POST http://localhost:3001/execute-script
   { script: "WPP.labels.getChatLabels('237xxx@c.us')" }
   ↓
4. Agent récupère historique via Connector
   POST http://localhost:3001/execute-script
   { script: "WPP.chat.getMessages('237xxx@c.us', 10)" }
   ↓
5. Agent → Backend (API REST)
   POST https://backend.example.com/agent/can-process
   {
     connectorIp: "connector-001",
     from: "237xxx@c.us",
     message: "C'est combien ?",
     contactLabels: ["client"],
     recentMessages: [...]
   }
   ↓
6. Backend vérifie :
   - Score ≥ 80% ?
   - Crédits restants ?
   - Mode prod ou labels test ?
   - Labels exclus ?
   ↓
7. Backend → Agent
   {
     canProcess: true,
     whatsappAgent: {
       agentContext: "...",
       managementGroupId: "...",
       // ...
     }
   }
   ↓
8. Agent traite avec LangGraph
   - Charge checkpoints (mémoire conversation)
   - Exécute agent avec tools
   - Génère réponse
   ↓
9. Agent envoie réponse via Connector
   POST http://localhost:3001/execute-script
   {
     script: "WPP.chat.sendTextMessage('237xxx@c.us', 'Bonjour...')"
   }
   ↓
10. Agent log opération au Backend
    POST https://backend.example.com/agent/log-operation
    {
      from: "237xxx@c.us",
      userMessage: "...",
      agentResponse: "...",
      tokensUsed: 1234,
      toolsUsed: ["searchProducts", "sendMessage"]
    }
```

---

## 🛠️ TOOLS PAR AGENT

### Backend Agent Tools (Configuration)

#### Lecture de données

```typescript
const readAgentContext = tool(
  async ({ agentId }) => {
    const agent = await prisma.whatsAppAgent.findUnique({
      where: { id: agentId }
    });
    return JSON.stringify({
      context: agent.agentContext,
      score: agent.contextScore
    });
  },
  {
    name: 'read_agent_context',
    description: 'Lire le contexte actuel de l\'agent',
    schema: z.object({ agentId: z.string() })
  }
);

const readProducts = tool(
  async ({ userId }) => {
    const products = await prisma.product.findMany({
      where: { userId },
      include: { images: true }
    });
    return JSON.stringify(products);
  },
  {
    name: 'read_products',
    description: 'Lire tous les produits du catalogue',
    schema: z.object({ userId: z.string() })
  }
);
```

#### Modification de configuration

```typescript
const updateAgentContext = tool(
  async ({ agentId, newContext }) => {
    await prisma.whatsAppAgent.update({
      where: { id: agentId },
      data: { agentContext: newContext }
    });
    return { success: true };
  },
  {
    name: 'update_agent_context',
    description: 'Modifier le contexte de l\'agent (ton, règles, etc.)',
    schema: z.object({
      agentId: z.string(),
      newContext: z.string()
    })
  }
);

const updateStrategy = tool(
  async ({ agentId, strategy }) => {
    await prisma.whatsAppAgent.update({
      where: { id: agentId },
      data: { activationStrategy: strategy }
    });
    return { success: true };
  },
  {
    name: 'update_strategy',
    description: 'Changer la stratégie d\'activation (test/tags/all)',
    schema: z.object({
      agentId: z.string(),
      strategy: z.object({
        type: z.enum(['test', 'tags', 'all']),
        phoneNumbers: z.array(z.string()).optional(),
        tagIds: z.array(z.string()).optional()
      })
    })
  }
);
```

#### Interaction avec WhatsApp (via Connector)

```typescript
const getAllLabels = tool(
  async ({ connectorIp }) => {
    // Appel au connector pour exécuter script
    const result = await connectorClient.executeScript(
      connectorIp,
      `(async () => {
        const labels = await WPP.labels.getAllLabels();
        return labels.map(l => ({
          id: l.id,
          name: l.name,
          hexColor: l.hexColor
        }));
      })()`
    );
    return JSON.stringify(result);
  },
  {
    name: 'get_all_labels',
    description: 'Récupérer tous les labels WhatsApp',
    schema: z.object({ connectorIp: z.string() })
  }
);

const addNewLabel = tool(
  async ({ connectorIp, name, color }) => {
    const result = await connectorClient.executeScript(
      connectorIp,
      `WPP.labels.addNewLabel("${name}", "${color}")`
    );
    return JSON.stringify(result);
  },
  {
    name: 'add_new_label',
    description: 'Créer un nouveau label WhatsApp',
    schema: z.object({
      connectorIp: z.string(),
      name: z.string(),
      color: z.string().optional()
    })
  }
);

const createGroup = tool(
  async ({ connectorIp, name, participants }) => {
    const result = await connectorClient.executeScript(
      connectorIp,
      `WPP.group.create("${name}", ${JSON.stringify(participants)})`
    );
    return JSON.stringify(result);
  },
  {
    name: 'create_group',
    description: 'Créer un groupe WhatsApp',
    schema: z.object({
      connectorIp: z.string(),
      name: z.string(),
      participants: z.array(z.string())
    })
  }
);
```

#### Analyse IA

```typescript
const analyzeProductImages = tool(
  async ({ productId }) => {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { images: true }
    });

    // Analyser les 2 premières images avec Grok
    const analyses = [];
    for (const image of product.images.slice(0, 2)) {
      const analysis = await grokVision.invoke([
        {
          type: 'image_url',
          image_url: { url: image.url }
        },
        {
          type: 'text',
          text: 'Décris ce produit en détail (couleur, matière, style, etc.)'
        }
      ]);
      analyses.push(analysis.content);
    }

    return JSON.stringify(analyses);
  },
  {
    name: 'analyze_product_images',
    description: 'Analyser les images d\'un produit avec l\'IA',
    schema: z.object({ productId: z.string() })
  }
);
```

---

### WhatsApp Agent Tools (Client)

#### Communication

```typescript
const sendMessage = tool(
  async ({ to, message }) => {
    if (message.length > 500) {
      return JSON.stringify({
        success: false,
        error: 'Message trop long (max 500 chars)'
      });
    }

    // Appel au connector (local)
    const result = await connectorClient.executeScript(
      `WPP.chat.sendTextMessage("${to}", "${message}")`
    );

    return JSON.stringify({ success: true, result });
  },
  {
    name: 'send_message',
    description: 'Envoyer un message texte COURT (max 500 caractères)',
    schema: z.object({
      to: z.string(),
      message: z.string().max(500)
    })
  }
);

const sendProduct = tool(
  async ({ to, productId }) => {
    const result = await connectorClient.executeScript(
      `WPP.catalog.sendProductWithCatalog("${to}", "${productId}")`
    );
    return JSON.stringify(result);
  },
  {
    name: 'send_product',
    description: 'Envoyer un produit du catalogue WhatsApp',
    schema: z.object({
      to: z.string(),
      productId: z.string()
    })
  }
);

const forwardToManagementGroup = tool(
  async ({ context }) => {
    const state = getCurrentState();
    const groupId = state.agentContext.managementGroupId;

    const message = `
🔔 *Transfert de conversation*

👤 Contact: ${context.from}
📝 Raison: ${context.reason}

💬 Résumé:
${context.summary}
    `;

    await connectorClient.executeScript(
      `WPP.chat.sendTextMessage("${groupId}", "${message}")`
    );

    return JSON.stringify({ success: true });
  },
  {
    name: 'forward_to_management_group',
    description: 'Transférer au groupe de gestion',
    schema: z.object({
      context: z.object({
        from: z.string(),
        reason: z.string(),
        summary: z.string()
      })
    })
  }
);
```

#### Catalogue

```typescript
const listProducts = tool(
  async ({ includeDescriptions, limit }) => {
    // Appel au backend
    const products = await backendClient.get('/catalog/products', {
      params: {
        agentId: getCurrentAgentId(),
        includeDescriptions,
        limit
      }
    });
    return JSON.stringify(products);
  },
  {
    name: 'list_products',
    description: 'Lister les produits du catalogue',
    schema: z.object({
      includeDescriptions: z.boolean().default(false),
      limit: z.number().default(20)
    })
  }
);

const searchProducts = tool(
  async ({ query, limit }) => {
    const results = await backendClient.get('/catalog/products/search', {
      params: {
        query,
        agentId: getCurrentAgentId(),
        limit
      }
    });
    return JSON.stringify(results);
  },
  {
    name: 'search_products',
    description: 'Rechercher des produits par mots-clés',
    schema: z.object({
      query: z.string(),
      limit: z.number().default(10)
    })
  }
);
```

#### Labels et Contexte

```typescript
const getContactLabels = tool(
  async ({ contactId }) => {
    const labels = await connectorClient.executeScript(
      `WPP.labels.getChatLabels("${contactId}")`
    );
    return JSON.stringify(labels);
  },
  {
    name: 'get_contact_labels',
    description: 'Récupérer les labels d\'un contact',
    schema: z.object({ contactId: z.string() })
  }
);

const addLabelToContact = tool(
  async ({ contactId, labelId }) => {
    await connectorClient.executeScript(
      `WPP.labels.addOrRemoveLabels("${contactId}", ["${labelId}"], "add")`
    );
    return JSON.stringify({ success: true });
  },
  {
    name: 'add_label_to_contact',
    description: 'Ajouter un label à un contact',
    schema: z.object({
      contactId: z.string(),
      labelId: z.string()
    })
  }
);
```

#### Mémoire

```typescript
const savePersistentMemory = tool(
  async ({ chatId, type, key, value }) => {
    await prisma.conversationMemory.create({
      data: { chatId, type, key, value }
    });
    return { success: true };
  },
  {
    name: 'save_persistent_memory',
    description: 'Sauvegarder une mémoire critique (préférence VIP, etc.)',
    schema: z.object({
      chatId: z.string(),
      type: z.enum(['PREFERENCE', 'VIP_NOTE', 'ORDER']),
      key: z.string(),
      value: z.any()
    })
  }
);
```

#### Messages programmés

```typescript
const scheduleMessage = tool(
  async ({ chatId, scheduledFor, context }) => {
    const job = await scheduledMessagesQueue.add(
      'reminder',
      { chatId, scheduledFor, context },
      { delay: new Date(scheduledFor).getTime() - Date.now() }
    );
    return JSON.stringify({ success: true, jobId: job.id });
  },
  {
    name: 'schedule_message',
    description: 'Programmer un message futur intelligent',
    schema: z.object({
      chatId: z.string(),
      scheduledFor: z.string(),
      context: z.object({
        reason: z.string(),
        intentToCheck: z.string(),
        actionIfFalse: z.string()
      })
    })
  }
);
```

---

## 🔒 SÉCURITÉ

### Backend Agent (Onboarding)

**Utilisateur authentifié** : Seulement le patron peut modifier son agent

```typescript
// Guard sur tous les endpoints
@UseGuards(JwtAuthGuard)
async updateContext(@User() user, @Body() dto) {
  // Vérifier que l'agent appartient à l'utilisateur
  const agent = await prisma.whatsAppAgent.findFirst({
    where: {
      id: dto.agentId,
      userId: user.id
    }
  });

  if (!agent) {
    throw new UnauthorizedException();
  }

  // Continuer...
}
```

### WhatsApp Agent (Client)

**Sanitization et validation** :

```typescript
function sanitizeUserInput(input: string): string {
  return input
    .replace(/```/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/<script/gi, '')
    .substring(0, 2000);
}

const securityRules = [
  {
    name: 'no_system_override',
    validate: (input) => !input.toLowerCase().includes('you are now'),
  },
  {
    name: 'no_context_leak',
    validate: (input) => !input.match(/show.*context|reveal.*prompt/i),
  },
  {
    name: 'no_cross_chat',
    validate: (input) => !input.match(/\d{10,}@c\.us/),
  }
];
```

**Rate limiting** (Redis local) :

```typescript
async function checkRateLimit(chatId: string) {
  const key = `ratelimit:${chatId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 60);
  }

  if (count > 10) {
    throw new RateLimitException('Trop de messages');
  }
}
```

---

## 🎛️ MODEL SWITCHING DYNAMIQUE

**Les DEUX agents** utilisent le model switching :

```typescript
const geminiFast = new ChatGoogleGenerativeAI({
  model: 'gemini-2.0-flash-exp',
  temperature: 0.7,
});

const grokBalanced = new ChatOpenAI({
  openAIApiKey: process.env.GROK_API_KEY,
  modelName: 'grok-beta',
  configuration: { baseURL: 'https://api.x.ai/v1' },
});

const grokThinking = new ChatOpenAI({
  openAIApiKey: process.env.GROK_API_KEY,
  modelName: 'grok-2-vision-1212',
  configuration: { baseURL: 'https://api.x.ai/v1' },
});

const dynamicModelSelection = createMiddleware({
  name: 'DynamicModelSelection',
  wrapModelCall: (request, handler) => {
    const complexity = calculateComplexity(request);

    let model;
    if (complexity > 0.8) model = grokThinking;
    else if (complexity > 0.5) model = grokBalanced;
    else model = geminiFast;

    return handler({ ...request, model });
  },
});
```

---

## 📝 BASES DE DONNÉES

### Backend PostgreSQL

```prisma
// apps/backend/prisma/schema.prisma

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  // ...
  agents    WhatsAppAgent[]
  threads   Thread[]
}

model WhatsAppAgent {
  id                  String   @id @default(uuid())
  userId              String
  user                User     @relation(...)
  connectorIp         String   @unique
  phoneNumber         String?
  agentContext        String?  @db.Text
  contextScore        Int      @default(0)
  activationStrategy  Json?
  memoryRetentionDays Int      @default(30)
  // ...
}

model Product {
  id          String   @id @default(uuid())
  userId      String
  name        String
  description String?
  price       Int
  images      ProductImage[]
}

model ProductImage {
  id          String   @id @default(uuid())
  productId   String
  url         String
  ia_analyse  String?  @db.Text
}

model Thread {
  id       String          @id @default(uuid())
  userId   String
  type     ThreadType
  messages ThreadMessage[]
}

enum ThreadType {
  ONBOARDING
  CONTEXT_IMPROVEMENT
  SUPPORT
}

model ThreadMessage {
  id              String        @id @default(uuid())
  threadId        String
  content         String        @db.Text
  source          MessageSource
  potentialReplies Json?
  tokensUsed      Int?
}

enum MessageSource {
  USER
  AGENT
  SYSTEM
}

model AgentMessageLog {
  id              String   @id @default(uuid())
  agentId         String
  from            String
  userMessage     String   @db.Text
  agentResponse   String   @db.Text
  intent          String?
  toolsUsed       Json?
  tokensUsed      Int?
  creditsUsed     Int?
  responseTime    Int?
  createdAt       DateTime @default(now())

  @@index([agentId])
  @@index([createdAt])
}
```

### Agent PostgreSQL (local)

```prisma
// apps/whatsapp-agent/prisma/schema.prisma

model ConversationMemory {
  id        String      @id @default(uuid())
  chatId    String
  type      MemoryType
  key       String
  value     Json
  createdAt DateTime    @default(now())
  expiresAt DateTime?

  @@index([chatId])
  @@index([expiresAt])
}

enum MemoryType {
  PREFERENCE
  VIP_NOTE
  ORDER
}

// Note: Table `checkpoints` créée automatiquement par PostgresSaver
```

---

## 📋 IMPLÉMENTATION - CHECKLIST

### Phase 1 : Connector (Client pur) ✅

- [ ] Nettoyer le connector (supprimer toute logique)
- [ ] Garder uniquement :
  - [ ] whatsapp-web.js client
  - [ ] Event listeners → webhook agent
  - [ ] Endpoint /execute-script
- [ ] Configurer CONNECTOR_IP
- [ ] Configurer AGENT_WEBHOOK_URL (local)

### Phase 2 : Backend Agent (Onboarding) ✅

**Backend** :
- [ ] Setup LangGraph pour backend agent
- [ ] Créer tools de configuration :
  - [ ] read_agent_context
  - [ ] update_agent_context
  - [ ] read_products
  - [ ] update_strategy
  - [ ] get_all_labels
  - [ ] add_new_label
  - [ ] create_group
  - [ ] analyze_product_images
- [ ] Système de threads (onboarding)
- [ ] WebSocket pour chat en temps réel
- [ ] Endpoint /agent/can-process

**Frontend** :
- [ ] Page chat onboarding
- [ ] Affichage score contexte
- [ ] Interface sélection stratégie

### Phase 3 : WhatsApp Agent (Client) ✅

**Agent** :
- [ ] Setup PostgreSQL local
- [ ] Setup Prisma
- [ ] Setup Redis local (Bull)
- [ ] Setup LangGraph avec PostgresSaver
- [ ] Créer tools :
  - [ ] send_message
  - [ ] send_product
  - [ ] send_collection
  - [ ] forward_to_management_group
  - [ ] list_products
  - [ ] search_products
  - [ ] get_contact_labels
  - [ ] add_label_to_contact
  - [ ] schedule_message
  - [ ] save_persistent_memory
- [ ] Worker Bull pour rappels
- [ ] Sécurité (sanitization, rate limiting)
- [ ] Cleanup automatique (cron)

### Phase 4 : Communication ✅

- [ ] Connector → Agent (webhook local)
- [ ] Agent → Backend (API REST)
- [ ] Backend → Connector (execute-script via API)
- [ ] Logging centralisé (agent → backend)

### Phase 5 : Tests ✅

- [ ] Tests E2E flow complet
- [ ] Tests backend agent (onboarding)
- [ ] Tests whatsapp agent (client)
- [ ] Tests sécurité (prompt injection)
- [ ] Load testing

---

## 🎯 MÉTRIQUES DE SUCCÈS

**Backend Agent (Onboarding)** :
- Score contexte ≥ 80% avant activation
- Temps onboarding < 10 minutes
- Satisfaction patron ≥ 90%

**WhatsApp Agent (Client)** :
- Taux de résolution auto ≥ 70%
- Temps de réponse < 3 secondes
- Messages courts : 95% < 500 chars
- Coût par conversation < 0.05€
- Sécurité : 0 incident

---

## 📚 RESSOURCES

- [LangChain Docs](https://docs.langchain.com/)
- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [WPP.js](https://wppconnect.io/wa-js/modules.html)
- [Bull Queue](https://docs.bullmq.io/)

---

**Version** : 4.0 (Architecture finale décentralisée)
**Date** : 2025-11-24

---

## 📝 LOG D'IMPLÉMENTATION

### 2025-11-25 - Début de l'implémentation WhatsApp Agent

#### ✅ Complété:

1. **Setup Prisma** (`apps/whatsapp-agent/prisma/`)
   - Créé `schema.prisma` avec les modèles:
     - `ConversationMemory` (PREFERENCE, VIP_NOTE, ORDER, CONTEXT)
     - `ScheduledMessage` (pour les reminders Bull Queue)
   - Créé `PrismaService` et `PrismaModule`
   - Ajouté scripts Prisma au `package.json`

2. **Installation des dépendances**
   - ✅ `@prisma/client`, `prisma`
   - ✅ `@nestjs/bull`, `bull`, `ioredis`
   - ✅ `@langchain/langgraph`

3. **Setup Queue avec Bull** (`apps/whatsapp-agent/src/queue/`)
   - Créé `QueueModule` avec configuration Redis
   - Créé `QueueService` pour gérer les messages programmés
   - Créé `ScheduledMessageProcessor` pour traiter les reminders

4. **Création des Tools LangChain** (`apps/whatsapp-agent/src/tools/`)
   - ✅ **CommunicationTools**: sendMessage, sendProduct, sendCollection, forwardToManagementGroup
   - ✅ **CatalogTools**: listProducts, searchProducts, getProductDetails
   - ✅ **LabelsTools**: getContactLabels, addLabelToContact
   - ✅ **MemoryTools**: savePersistentMemory, retrievePersistentMemory
   - ✅ **MessagesTools**: getOlderMessages, scheduleMessage
   - ✅ **IntentTools**: detectIntent
   - ✅ **ToolsModule**: Module regroupant tous les tools

5. **Sécurité** (`apps/whatsapp-agent/src/security/`)
   - ✅ **SanitizationService**: Validation et nettoyage des inputs utilisateur
   - ✅ **RateLimitService**: Limitation du nombre de messages par chat (Redis)
   - ✅ **SecurityModule**: Module regroupant les services de sécurité

6. **Service principal de l'agent** (`apps/whatsapp-agent/src/langchain/`)
   - ✅ **WhatsAppAgentService**: Service principal avec modèles IA (Grok + Gemini fallback)
   - ✅ Tous les modules intégrés dans `app.module.ts`
   - ✅ Webhook controller mis à jour pour utiliser le nouveau service
   - ✅ Type-check passant sans erreurs
   - ⚠️ Note: `createAgent` commenté temporairement (en attente de LangChain v1 stable)

#### ✅ COMPLETÉ:
Toute l'infrastructure de base est en place et fonctionnelle !

#### 🔮 Fonctionnalités futures à explorer:

1. **Embedding multimodal d'images** 🖼️
   - Gemini supporte les embeddings multimodaux (texte + images)
   - Permettrait une recherche "montre-moi une robe comme ça" (client envoie photo)
   - Coût: À évaluer
   - Complexité: Moyenne (Gemini a déjà l'API)
   - Use case: Recherche visuelle, recommandations basées sur photos
   - Doc: https://ai.google.dev/gemini-api/docs/embeddings

2. **Caching des embeddings**
   - LangChain `CacheBackedEmbeddings` avec Redis
   - Évite de re-calculer les embeddings existants
   - Économie de coûts API et temps

#### 📋 Prochaines étapes:
1. **Tests avec une base de données**
   - Configurer DATABASE_URL dans .env
   - Exécuter `pnpm prisma migrate dev`
   - Tester la connexion Prisma

2. **Configuration Redis**
   - Configurer REDIS_URL dans .env
   - Tester les connexions Redis (Queue + RateLimit)

3. **Intégration avec le backend**
   - Implémenter les endpoints `/agent/can-process` et `/agent/log-operation` dans le backend
   - Tester le flow complet de communication

4. **Migration vers LangChain v1**
   - Quand stable, décommenter le code `createAgent` dans WhatsAppAgentService
   - Implémenter les middleware et outils avec le système d'agent complet

5. **Tests end-to-end**
   - Tester réception de messages
   - Tester exécution des tools
   - Tester rate limiting et sanitization
   - Tester messages programmés (Bull Queue)
