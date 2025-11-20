# WhatsApp Connector

Service de connexion WhatsApp - Wrapper REST pour whatsapp-web.js

## Description

Le WhatsApp Connector est un service NestJS qui expose toutes les fonctionnalités de whatsapp-web.js via une API REST générique. Il permet d'exécuter n'importe quelle méthode du client WhatsApp et diffuse tous les événements WhatsApp vers des webhooks configurables.

## Caractéristiques

- **Endpoint générique `/whatsapp/execute`** : Exécute n'importe quelle méthode du client whatsapp-web.js
- **Système de webhooks** : Tous les événements WhatsApp sont envoyés aux URLs configurées
- **Gestion du QR code** : Affichage dans le terminal + endpoint API pour récupération
- **Session persistante** : Les sessions WhatsApp sont sauvegardées localement
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
PORT=3001

# Chemin de stockage des sessions WhatsApp
WHATSAPP_SESSION_PATH=./data/sessions

# URLs des webhooks (séparées par des virgules)
WEBHOOK_URLS=http://localhost:3002/webhook/message
```

## Démarrage

```bash
# Mode développement
pnpm dev:whatsapp-connector

# Mode production
pnpm build:whatsapp-connector
pnpm start:whatsapp-connector
```

## Utilisation

### 1. Première connexion

Au démarrage, si aucune session n'existe, un QR code sera affiché dans le terminal. Scannez-le avec WhatsApp pour authentifier le client.

Vous pouvez aussi récupérer le QR code via l'API :

```bash
GET http://localhost:3001/whatsapp/qr
```

### 2. Exécuter une méthode WhatsApp

Utilisez l'endpoint générique pour exécuter n'importe quelle méthode du client :

```bash
POST http://localhost:3001/whatsapp/execute
Content-Type: application/json

{
  "method": "sendMessage",
  "parameters": ["123456789@c.us", "Hello World!"]
}
```

#### Exemples de méthodes disponibles

**Envoyer un message :**

```json
{
  "method": "sendMessage",
  "parameters": ["123456789@c.us", "Bonjour!"]
}
```

**Récupérer tous les chats :**

```json
{
  "method": "getChats",
  "parameters": []
}
```

**Récupérer un contact par ID :**

```json
{
  "method": "getContactById",
  "parameters": ["123456789@c.us"]
}
```

**Marquer un chat comme lu :**

```json
{
  "method": "getChatById",
  "parameters": ["123456789@c.us"]
}
```

### 3. Vérifier le statut

```bash
GET http://localhost:3001/whatsapp/status
```

Réponse :

```json
{
  "isReady": true,
  "hasQrCode": false,
  "state": {
    "wid": { ... },
    "pushname": "Mon WhatsApp"
  }
}
```

### 4. Configurer les webhooks

```bash
# Récupérer les webhooks actuels
GET http://localhost:3001/whatsapp/webhooks

# Configurer de nouveaux webhooks
POST http://localhost:3001/whatsapp/webhooks
Content-Type: application/json

{
  "urls": [
    "http://localhost:3002/webhook/message",
    "http://localhost:3000/webhook/whatsapp"
  ]
}
```

## Événements Webhooks

Tous les événements suivants sont envoyés aux webhooks configurés :

### Authentification

- `qr` - QR code disponible
- `ready` - Client prêt
- `authenticated` - Authentification réussie
- `auth_failure` - Échec d'authentification
- `disconnected` - Déconnexion

### Messages

- `message` - Message reçu
- `message_create` - Message créé (envoyé ou reçu)
- `message_ack` - Accusé de réception
- `message_edit` - Message édité
- `message_revoke_me` - Message supprimé (pour moi)
- `message_revoke_everyone` - Message supprimé (pour tous)
- `message_reaction` - Réaction à un message
- `media_uploaded` - Média uploadé

### Groupes

- `group_join` - Membre a rejoint le groupe
- `group_leave` - Membre a quitté le groupe
- `group_update` - Groupe mis à jour
- `group_admin_changed` - Admin de groupe changé
- `group_membership_request` - Demande d'adhésion au groupe

### Autres

- `chat_archived` - Chat archivé
- `chat_removed` - Chat supprimé
- `contact_changed` - Contact modifié
- `change_state` - Changement d'état
- `incoming_call` - Appel entrant
- `vote_update` - Vote mis à jour (sondages)

### Format des événements

Tous les événements sont envoyés au format :

```json
{
  "event": "message",
  "timestamp": "2025-11-11T10:30:00.000Z",
  "data": {
    "id": { ... },
    "from": "123456789@c.us",
    "to": "987654321@c.us",
    "body": "Hello!",
    "type": "chat",
    ...
  }
}
```

## Documentation API

La documentation Swagger complète est disponible à :

```
http://localhost:3001/api
```

## Architecture

```
src/
├── whatsapp/
│   ├── whatsapp-client.service.ts  # Gestion du client WhatsApp
│   ├── webhook.service.ts          # Gestion des webhooks
│   ├── whatsapp.controller.ts      # Endpoints REST
│   ├── whatsapp.module.ts          # Module NestJS
│   └── dto/
│       ├── execute-method.dto.ts
│       └── set-webhooks.dto.ts
├── health/                         # Health checks
├── app.module.ts
└── main.ts
```

## Notes importantes

- Le connector doit être mis à jour le moins souvent possible pour éviter les déconnexions WhatsApp
- Les sessions sont stockées localement dans `WHATSAPP_SESSION_PATH`
- Le service n'est pas exposé publiquement - il est utilisé uniquement par les agents

## Méthodes WhatsApp disponibles

Consultez la documentation de whatsapp-web.js pour la liste complète :
https://docs.wwebjs.dev/Client.html

Exemples de méthodes courantes :

- `sendMessage(chatId, content)`
- `getChats()`
- `getChatById(chatId)`
- `getContacts()`
- `getContactById(contactId)`
- `archiveChat(chatId)`
- `muteChat(chatId, unmuteDate)`
- `pinChat(chatId)`
- `createGroup(name, participants)`
- `setStatus(status)`
- `setDisplayName(displayName)`
- `setProfilePicture(media)`

Et bien d'autres...

## Troubleshooting

### Le QR code n'apparaît pas

- Vérifiez que `WHATSAPP_SESSION_PATH` est accessible en écriture
- Supprimez le dossier de session et redémarrez

### Déconnexions fréquentes

- Évitez de redémarrer le service trop souvent
- Vérifiez que le serveur a suffisamment de ressources
- Assurez-vous que Chromium/Puppeteer fonctionne correctement

### Les webhooks ne reçoivent pas d'événements

- Vérifiez que `WEBHOOK_URLS` est correctement configuré
- Vérifiez les logs du service pour les erreurs HTTP
- Testez les URLs avec curl/Postman
