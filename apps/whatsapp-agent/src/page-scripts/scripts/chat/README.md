# Chat Scripts - WPP.js Integration

Scripts pour les fonctionnalités de chat WhatsApp utilisant l'API WPP.js.

## 📋 Scripts disponibles

### Messaging Scripts

#### `sendTextMessage.ts`

Envoie un message texte avec simulation naturelle de frappe.

**Variables:**

- `TO`: ID du destinataire (numéro ou avec @c.us)
- `MESSAGE`: Contenu du message
- `USE_TYPING`: Active la simulation (défaut: true)

**Fonctionnalités:**

- ✅ Simulation de frappe via l'option `delay` de WPP.js (80 WPM = 75ms/caractère)
- ✅ Délai: 500ms à 5000ms selon longueur
- ✅ Indicateur "en train d'écrire..." géré par WPP
- ✅ Vérification automatique du format contact ID

**Exemple:**

```json
{
  "TO": "33765538022",
  "MESSAGE": "Bonjour! Comment puis-je vous aider?",
  "USE_TYPING": "true"
}
```

**Délais de frappe:**

- Message court (20 chars): ~1.5s
- Message moyen (50 chars): ~3.75s (plafonné à 5s)
- Message long (100 chars): 5s (max)

---

#### `sendReaction.ts`

Envoie une réaction emoji à un message.

**Variables:**

- `MESSAGE_ID`: ID du message (format: true_xxxxx@c.us_yyyy)
- `REACTION`: Emoji ou "false" pour retirer

**Exemples de réactions:**

- `👍` - Pouce levé
- `❤️` - Coeur
- `😊` - Sourire
- `false` - Retire la réaction

---

#### `sendLocation.ts`

Partage une localisation géographique.

**Variables:**

- `TO`: Destinataire
- `LAT`: Latitude (requis)
- `LNG`: Longitude (requis)
- `NAME`: Nom du lieu (optionnel)
- `ADDRESS`: Adresse (optionnel)
- `URL`: URL associée (optionnel)

**Exemple - Magasin Paris:**

```json
{
  "TO": "33765538022",
  "LAT": "48.8566",
  "LNG": "2.3522",
  "NAME": "Notre Magasin",
  "ADDRESS": "123 rue de la Paix, 75001 Paris"
}
```

---

#### `editMessage.ts`

Modifie un message précédemment envoyé.

**Variables:**

- `MESSAGE_ID`: ID du message à éditer
- `NEW_TEXT`: Nouveau contenu
- `LINK_PREVIEW`: Prévisualisation liens (défaut: true)

**Use cases:**

- Correction d'erreurs
- Mise à jour d'informations
- Ajout de détails

---

### Chat Management Scripts

#### `markIsUnread.ts`

Marque une conversation comme non lue.

**Variables:**

- `CHAT_ID`: ID de la conversation

**Use case:** Flagger les conversations nécessitant une intervention humaine.

---

#### `setNotes.ts`

⚠️ **WhatsApp Business uniquement**

Définit des notes internes pour une conversation.

**Variables:**

- `CHAT_ID`: ID de la conversation
- `CONTENT`: Contenu des notes

**Use cases:**

- Préférences client
- Historique des interactions
- Contexte pour l'agent
- Mémoire à long terme

---

#### `markIsComposing.ts`

Affiche l'indicateur "en train d'écrire...".

**Variables:**

- `CHAT_ID`: ID de la conversation
- `DURATION`: Durée en ms (défaut: 2000)

**Note:** `sendTextMessage` utilise l'option `delay` de WPP pour simuler la frappe.

---

#### `sendScheduledCall.ts`

Envoie une invitation pour un appel planifié.

**Variables:**

- `TO`: Destinataire
- `TITLE`: Titre de l'appel
- `DESCRIPTION`: Description (optionnel)
- `CALL_TYPE`: "voice" ou "video" (défaut: voice)
- `TIMESTAMP_MS`: Timestamp en millisecondes

**Exemple - RDV Support:**

```json
{
  "TO": "33765538022",
  "TITLE": "Consultation Support",
  "DESCRIPTION": "Suivi de votre commande",
  "CALL_TYPE": "voice",
  "TIMESTAMP_MS": "1696084222000"
}
```

---

#### `getQuotedMessage.ts`

Récupère le message cité dans une réponse.

**Variables:**

- `MESSAGE_ID`: ID du message contenant la citation

**Retour:**

```json
{
  "success": true,
  "hasQuote": true,
  "message": {
    "id": "...",
    "body": "Message original",
    "from": "...",
    "timestamp": 1234567890
  }
}
```

---

**Note:** `sendTextMessage` utilise désormais l'option `delay` de WPP.

**Fonctions:**

- `simulateTyping(chatId, messageLength)`: Calcule et exécute le délai
- `sleep(ms)`: Utilitaire de pause

---

## 📊 Formules de calcul

### Vitesse de frappe (80 WPM):

```
80 mots/minute = 400 caractères/minute
= 6.67 caractères/seconde
= ~75ms par caractère
```

### Délai calculé:

```typescript
const baseDelay = message.length * 75;
const delay = Math.max(500, Math.min(5000, baseDelay));
```

**Exemples:**

- 10 chars → 750ms → capé à 500ms (min)
- 40 chars → 3000ms → 3s
- 100 chars → 7500ms → capé à 5000ms (max)

---

## ⚙️ Configuration

### Contact ID Format:

- ✅ Avec @ → Utilisation directe: `33765538022@c.us`
- ✅ Sans @ → Ajout automatique: `33765538022` → `33765538022@c.us`

### Gestion d'erreurs:

Tous les scripts retournent:

```json
{
  "success": true/false,
  "error": "message d'erreur" // si success: false
}
```

---

## 🎯 Use Cases Agent

### Conversations naturelles:

1. Recevoir message → `sendTextMessage` avec typing ✅
2. Feedback rapide → `sendReaction` ❤️
3. Corrections → `editMessage`

### Support client:

1. Envoyer localisation magasin → `sendLocation`
2. Prendre RDV → `sendScheduledCall`
3. Notes internes → `setNotes`
4. Escalade → `markIsUnread`

### Contexte:

1. Comprendre références → `getQuotedMessage`
2. Mémoire → `setNotes`

---

## 📝 Notes importantes

1. **setNotes** requiert WhatsApp Business
2. **sendTextMessage** utilise l'option `delay` de WPP pour la frappe
3. Tous les scripts utilisent `window.WPP` (context navigateur)
4. Délais de typing améliorent l'UX et rendent l'agent plus humain
5. Format contact: accepte avec ou sans `@c.us`
