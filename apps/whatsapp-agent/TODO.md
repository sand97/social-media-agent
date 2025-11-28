# WhatsApp Agent - TODO List

## 📋 Endpoints Backend à implémenter

### 1. **POST /agent/can-process** (PRIORITÉ HAUTE)

**Description**: Valider si l'agent doit traiter un message

**Request**:

```typescript
{
  chatId: string; // Format: 237xxx@c.us
  message: string;
  timestamp: string; // ISO 8601
}
```

**Response**:

```typescript
{
  allowed: boolean;
  reason?: string;                   // Si allowed=false, pourquoi
  agentContext?: string;             // Contexte business de l'entreprise
  managementGroupId?: string;        // ID du groupe de gestion
  agentId?: string;                  // ID de l'agent configuré
}
```

**Use cases**:

- ✅ Vérifier les horaires d'ouverture
- ✅ Filtrer spam/messages interdits
- ✅ Router vers différents agents selon contexte
- ✅ Appliquer règles business personnalisées
- ✅ Bloquer certains contacts

**Statut actuel**:

- ⚠️ Endpoint non implémenté
- ✅ Fallback gracieux : permet tous les messages si endpoint 404
- ✅ Interface TypeScript définie dans `whatsapp-agent.service.ts`

---

### 2. **POST /agent/log-operation** (PRIORITÉ MOYENNE)

**Description**: Logger toutes les opérations de l'agent

**Request**:

```typescript
{
  chatId: string;
  userMessage: string;
  agentResponse: string;
  timestamp: string; // ISO 8601
}
```

**Response**:

```typescript
{
  success: boolean;
  logId?: string;      // ID du log créé
}
```

**Bénéfices**:

- 📊 Analytics des conversations
- 📈 Monitoring des performances
- 🐛 Debug des erreurs
- 📝 Audit trail
- 💰 Tracking des coûts (tokens utilisés)

**Évolutions futures** (à ajouter plus tard):

```typescript
{
  // ... champs actuels +
  tokensUsed?: number;           // Tokens consommés
  toolsUsed?: string[];          // Liste des tools appelés
  duration?: number;             // Temps de traitement en ms
  modelUsed?: 'grok' | 'gemini'; // Quel modèle a répondu
  errorCount?: number;           // Nombre d'erreurs lors du traitement
}
```

**Statut actuel**:

- ⚠️ Endpoint non implémenté
- ✅ Fail silencieux si endpoint 404 (ne bloque pas le flow)
- ✅ Logger NestJS en place pour debugging

---

## 🔮 Fonctionnalités futures

### 3. Support LangChain createAgent (PRIORITÉ BASSE)

**Contexte**: Actuellement on utilise une invocation simple du modèle.

**Quand LangChain v1 sera stable**, activer `createAgent` pour:

- ✅ Support natif des tools
- ✅ Middleware (rate limiting, tracking, model fallback)
- ✅ Context management automatique
- ✅ Meilleure gestion des erreurs

**Actions**:

1. Vérifier la stabilité de `@langchain/core` v1
2. Ajouter les imports de middleware
3. Créer la méthode `createAgentInstance()`
4. Mettre à jour `invokeAgent()` pour utiliser l'agent

**Note**: Pas prioritaire car le système actuel fonctionne bien.

---

### 4. Embeddings multimodaux (PRIORITÉ BASSE)

**Description**: Recherche de produits par image

**Technologies**:

- Gemini Vision API (embeddings multimodaux)
- Stockage des embeddings d'images dans `CatalogProduct.imageEmbedding`

**Use case**:
Client envoie une photo → Agent trouve des produits similaires visuellement

**Coût**: À évaluer (API Gemini Vision)

**Référence**: Voir `WHATSAPP_AGENT_PLAN.md:1078-1085`

---

### 5. Caching Redis des embeddings (PRIORITÉ BASSE)

**Description**: Cache pour éviter de recalculer les embeddings

**Technologies**:

- LangChain `CacheBackedEmbeddings`
- Redis existant (déjà configuré pour Bull Queue)

**Bénéfices**:

- 💰 Économie API calls Gemini
- ⚡ Performance améliorée
- 📉 Réduction des coûts

**Référence**: Voir `WHATSAPP_AGENT_PLAN.md:1087-1090`

---

## ✅ Complété récemment

- ✅ Infrastructure Prisma + PostgreSQL
- ✅ Bull Queue + Redis (rappels automatiques)
- ✅ Sécurité (sanitization, rate limiting)
- ✅ 17+ tools LangChain opérationnels
- ✅ Service principal avec Grok + Gemini fallback
- ✅ Webhook handler intégré
- ✅ **Recherche sémantique du catalogue avec embeddings**
- ✅ **Refactoring des scripts inline → fichiers TypeScript**
- ✅ **PageScriptService (comme dans le backend)**
- ✅ **Nettoyage complet de whatsapp-agent.service.ts (0 TODOs)**

---

## 🚀 Prochaines étapes recommandées

### Court terme (1-2 jours):

1. Implémenter `POST /agent/can-process` dans le backend
2. Implémenter `POST /agent/log-operation` dans le backend
3. Tester le whatsapp-agent avec une vraie BD PostgreSQL

### Moyen terme (1 semaine):

1. Dashboard analytics dans le frontend (afficher les logs)
2. Ajouter plus de règles business dans `can-process`
3. Ajouter tracking des tokens/coûts dans `log-operation`

### Long terme (1 mois+):

1. Activer `createAgent` si LangChain v1 stable
2. Embeddings multimodaux pour les images
3. Caching Redis des embeddings

---

**Date de dernière mise à jour**: 27 novembre 2025
**Status**: ✅ Code propre, 0 TODOs dans le code
