# WhatsApp Agent

Service d'agent IA pour WhatsApp - Génération de réponses intelligentes via LangChain

## Description

Le WhatsApp Agent est un service NestJS qui reçoit les événements WhatsApp depuis le connector, les traite avec LangChain (Grok/Gemini), et génère des réponses intelligentes automatiquement.

## Caractéristiques

- **IA Multi-modèles** : Grok (xAI) en primaire, Gemini (Google) en fallback
- **LangChain Tools** : Accès aux fonctions WhatsApp (envoi de messages, récupération de chats, etc.)
- **Webhook endpoint** : Reçoit tous les événements du connector
- **Traitement intelligent** : Ignore les messages personnels, groupes, etc.
- **Documentation Swagger** : API complètement documentée

## Installation

```bash
# Depuis la racine du monorepo
pnpm install
```

## Configuration

Créer un fichier `.env` basé sur `.env.example`:

```bash
# Port du serveur
PORT=3002

# WhatsApp Connector URL
CONNECTOR_URL=http://localhost:3001

# Grok API (xAI) - Primary model
GROK_API_KEY=your-grok-api-key
GROK_API_BASE=https://api.x.ai/v1
GROK_MODEL=grok-beta

# Gemini API (Google) - Fallback model
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash-exp

# Agent configuration
AGENT_SYSTEM_PROMPT=You are a helpful WhatsApp assistant...
```

## Démarrage

```bash
# Mode développement
pnpm dev:whatsapp-agent

# Ou démarrer connector + agent ensemble
pnpm dev:whatsapp

# Mode production
pnpm build:whatsapp-agent
pnpm start:whatsapp-agent
```

## Architecture

```
src/
├── connector/
│   ├── connector-client.service.ts    # Client HTTP vers whatsapp-connector
│   └── connector.module.ts
├── langchain/
│   ├── langchain-agent.service.ts     # Service IA principal
│   ├── whatsapp.tools.ts              # Tools LangChain pour WhatsApp
│   └── langchain.module.ts
├── webhook/
│   ├── webhook.controller.ts          # Réception des événements
│   └── webhook.module.ts
├── health/
├── app.module.ts
└── main.ts
```

## Utilisation

### 1. Flow de traitement

```
WhatsApp Connector → [Webhook] → WhatsApp Agent
                                      ↓
                              [Analyse Message]
                                      ↓
                            [LangChain + Grok/Gemini]
                                      ↓
                           [Génération Réponse]
                                      ↓
                    [Envoi via Connector] → WhatsApp
```

### 2. Événements traités

L'agent écoute tous les événements du connector mais ne traite que :

- `message` : Messages entrants (ignore messages personnels et groupes par défaut)

Les autres événements sont loggés mais ignorés :

- `qr`, `ready`, `authenticated`, `disconnected`, etc.

### 3. Tools WhatsApp disponibles

L'agent a accès aux tools suivants :

**send_whatsapp_message**

```json
{
  "chatId": "1234567890@c.us",
  "message": "Hello from AI!"
}
```

**get_chat_info**

```json
{
  "chatId": "1234567890@c.us"
}
```

**get_contact_info**

```json
{
  "contactId": "1234567890@c.us"
}
```

**get_all_chats** (retourne les 20 premiers)

**get_all_contacts** (retourne les 50 premiers)

### 4. Customisation du comportement

Modifier le prompt système dans `.env` :

```bash
AGENT_SYSTEM_PROMPT="You are a professional customer support assistant for ACME Corp. You help customers with their orders, answer product questions, and provide technical support. Always be professional and helpful."
```

## API Endpoints

### POST /webhook/message

Reçoit les événements WhatsApp du connector.

**Body:**

```json
{
  "event": "message",
  "timestamp": "2025-11-11T10:30:00.000Z",
  "data": [
    {
      "id": {...},
      "from": "1234567890@c.us",
      "body": "Hello!",
      "fromMe": false,
      ...
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "event": "message",
  "processed": true
}
```

### GET /health

Health check endpoint.

### GET /api

Documentation Swagger interactive.

## Configuration du Connector

Dans le `.env` du **whatsapp-connector**, ajouter l'agent comme webhook :

```bash
WEBHOOK_URLS=http://localhost:3002/webhook/message
```

## Modèles IA

### Grok (xAI)

- **Modèle recommandé** : `grok-beta`
- **API** : Compatible OpenAI
- **Base URL** : `https://api.x.ai/v1`
- **Obtenir une clé** : [x.ai](https://x.ai)

### Gemini (Google)

- **Modèle recommandé** : `gemini-2.0-flash-exp`
- **API** : Google Generative AI
- **Obtenir une clé** : [Google AI Studio](https://makersuite.google.com/app/apikey)

### Stratégie de Fallback

1. **Grok** est essayé en premier (si configuré)
2. Si Grok échoue → **Gemini** est utilisé
3. Si les deux échouent → erreur retournée

**Note** : Vous pouvez configurer uniquement Gemini si vous ne voulez pas utiliser Grok.

## Exemples de conversation

**Utilisateur** : "Hello!"  
**Agent (Grok)** : "Hi! How can I help you today?"

**Utilisateur** : "What's the weather like?"  
**Agent (Grok)** : "I'm a WhatsApp assistant and don't have access to weather information. However, I can help you with your WhatsApp chats and contacts. Is there anything else I can help you with?"

## Logs et Debugging

Les logs sont disponibles dans la console :

```
🤖 WhatsApp Agent is running on: http://localhost:3002
[LangChainAgentService] Grok model initialized
[LangChainAgentService] Gemini model initialized
[WebhookController] Received event: message
[LangChainAgentService] Processing message from 1234567890@c.us: Hello!...
[LangChainAgentService] Trying Grok model...
[LangChainAgentService] Response generated successfully with Grok
[LangChainAgentService] Response sent to 1234567890@c.us
```

## Troubleshooting

### L'agent ne répond pas

- Vérifier que le connector est démarré et accessible
- Vérifier que `CONNECTOR_URL` pointe vers le bon endpoint
- Vérifier que le webhook est configuré dans le connector
- Vérifier les logs pour les erreurs

### Erreurs API IA

- Vérifier que les clés API sont valides
- Vérifier les quotas/limites de l'API
- Consulter les logs pour le message d'erreur exact

### L'agent répond à tous les messages

Par défaut, l'agent ignore :

- Les messages envoyés par lui-même (`fromMe: true`)
- Les messages de groupe (`@g.us`)

Pour changer ce comportement, modifier `langchain-agent.service.ts`.

## Développement

### Ajouter un nouveau tool

1. Créer la fonction dans `whatsapp.tools.ts` :

```typescript
const myCustomTool = tool(
  async ({ param }) => {
    // Logique du tool
    return JSON.stringify({ success: true });
  },
  {
    name: 'my_custom_tool',
    description: 'Description of what the tool does',
    schema: z.object({
      param: z.string().describe('Parameter description'),
    }),
  },
);
```

2. L'ajouter au tableau retourné :

```typescript
return [
  sendMessageTool,
  // ... autres tools
  myCustomTool,
];
```

### Modifier le traitement des messages

Éditer `processIncomingMessage()` dans `langchain-agent.service.ts`.

## Tests

```bash
# Tests unitaires
pnpm --filter whatsapp-agent test

# Tests e2e
pnpm --filter whatsapp-agent test:e2e

# Coverage
pnpm --filter whatsapp-agent test:cov
```

## Production

### Déploiement

```bash
# Build
pnpm build:whatsapp-agent

# Démarrer
pnpm start:whatsapp-agent
```

### Variables d'environnement requises

- `GROK_API_KEY` ou `GEMINI_API_KEY` (au moins un)
- `CONNECTOR_URL`

## Sécurité

- Les clés API sont stockées dans `.env` (ne pas commit)
- Les webhooks n'ont pas d'authentification par défaut (à ajouter en production)
- Rate limiting recommandé en production

## Roadmap

- [ ] Authentification des webhooks
- [ ] Support de la mémoire conversationnelle (historique)
- [ ] Agents avec tools actifs (invocation automatique)
- [ ] Support des médias (images, vidéos)
- [ ] Réponses aux groupes (optionnel)
- [ ] Multi-utilisateurs (différents prompts par user)

## License

UNLICENSED

---

**Version:** 1.0  
**Date:** 2025-11-11
