# Plan de développement - Outil de réponse automatique aux messages réseaux sociaux

## 📋 Vue d'ensemble du projet

Développement d'un système de réponse automatique multi-plateforme utilisant l'IA pour gérer les
conversations sur WhatsApp, Messenger et Instagram. Le système repose sur une architecture
distribuée avec un serveur central de gestion et des serveurs clients pour l'hébergement des
instances WhatsApp.

### Objectifs principaux

- ✅ Réponses automatiques intelligentes via LangChain
- ✅ Architecture scalable et isolée pour limiter les risques de bannissement
- ✅ Gestion centralisée des utilisateurs, souscriptions et crédits
- ✅ Déploiement dynamique des instances client
- ✅ Système de facturation basé sur l'utilisation des tokens

---

## 🏗️ Architecture technique

### 1. Serveur Central (apps/backend + apps/frontend)

**Responsabilités:**

- Gestion des utilisateurs et authentification
- Dashboard et site vitrine
- Gestion des souscriptions et crédits
- Réception et stockage des métriques
- Orchestration des serveurs clients (API Contabo + SSH + Docker Swarm)
- Contrôle des autorisations de traitement
- Facturation et décompte des crédits

**Stack technique:**

- Backend: NestJS (existant)
- Frontend: React Router v7 (existant)
- Base de données: PostgreSQL via Prisma
- Cache: Redis
- API: REST + Swagger

### 2. Microservices WhatsApp

#### 2.1. whatsapp-connector (apps/whatsapp-connector)

**Responsabilités:**

- Connexion et maintien du client WhatsApp via wwebjs.dev
- Exposition d'endpoints HTTP pour envoyer des messages
- Réception des messages entrants
- Transmission des messages via webhook vers whatsapp-agent
- Gestion du QR code et de l'état de connexion
- Minimisation des mises à jour pour garantir la stabilité

**Points d'intégration:**

- ← Reçoit les demandes d'envoi de message via HTTP (depuis whatsapp-agent)
- → Envoie les messages reçus via webhook (vers whatsapp-agent)

**Stack technique:**

- Framework: NestJS
- Librairie WhatsApp: wwebjs.dev
- Communication: HTTP + Webhooks

**Configuration (.env):**

```
PORT=3001
AGENT_WEBHOOK_URL=http://whatsapp-agent:3002/webhook/message
WHATSAPP_SESSION_PATH=/data/sessions
```

**Endpoints exposés:**

- `POST /send` - Envoyer un message
- `POST /send-media` - Envoyer un média
- `GET /status` - État de la connexion
- `GET /qr` - Récupérer le QR code
- `GET /contacts` - Liste des contacts
- `GET /chats` - Liste des conversations
- `POST /mark-read` - Marquer comme lu
- `GET /health` - Health check

#### 2.2. whatsapp-agent (apps/whatsapp-agent)

**Responsabilités:**

- Réception des messages via webhook (depuis whatsapp-connector)
- Analyse et génération de réponses via LangChain
- Vérification des crédits auprès du serveur central
- Reporting de l'utilisation des tokens
- Envoi des réponses via HTTP au connector

**Points d'intégration:**

- ← Reçoit les messages via webhook (depuis whatsapp-connector)
- → Envoie les réponses via HTTP (vers whatsapp-connector)
- ↔️ Vérifie les crédits et reporte l'utilisation (vers serveur central)

**Stack technique:**

- Framework: NestJS
- IA: LangChain + OpenAI/Anthropic
- Communication: HTTP + Webhooks

**Configuration (.env):**

```
PORT=3002
CONNECTOR_URL=http://whatsapp-connector:3001
CENTRAL_SERVER_URL=https://central.example.com
CLIENT_ID=unique-client-id
CLIENT_SECRET=secret-key
OPENAI_API_KEY=sk-...
```

**Endpoints exposés:**

- `POST /webhook/message` - Réception des messages
- `GET /health` - Health check

### 3. Microservices Messenger et Instagram

#### 3.1. messenger-agent (apps/messenger-agent)

**Responsabilités:**

- Intégration avec l'API Messenger de Meta
- Réception des webhooks Messenger
- Génération de réponses via LangChain
- Vérification des crédits et reporting

**Stack technique:**

- Framework: NestJS
- API: Meta Messenger Platform
- IA: LangChain

**Configuration (.env):**

```
PORT=3003
META_APP_ID=...
META_APP_SECRET=...
META_PAGE_ACCESS_TOKEN=...
META_VERIFY_TOKEN=...
CENTRAL_SERVER_URL=https://central.example.com
OPENAI_API_KEY=sk-...
```

#### 3.2. instagram-agent (apps/instagram-agent)

**Responsabilités:**

- Intégration avec l'API Instagram Messaging
- Réception des webhooks Instagram
- Génération de réponses via LangChain
- Vérification des crédits et reporting

**Stack technique:**

- Framework: NestJS
- API: Instagram Graph API
- IA: LangChain

**Configuration (.env):**

```
PORT=3004
META_APP_ID=...
META_APP_SECRET=...
INSTAGRAM_ACCESS_TOKEN=...
META_VERIFY_TOKEN=...
CENTRAL_SERVER_URL=https://central.example.com
OPENAI_API_KEY=sk-...
```

### 4. Serveurs Clients

**Composition:**

- 1 instance whatsapp-connector + 1 instance whatsapp-agent = 1 stack client
- Maximum 3 stacks par serveur
- Déploiement via Docker Swarm

**Responsabilités:**

- Hébergement des clients WhatsApp isolés
- Isolation des IP pour réduire les risques de bannissement
- Communication avec le serveur central

---

## 🔄 Flux de communication

### Flow WhatsApp - Message entrant

```
WhatsApp → wwebjs → whatsapp-connector → [webhook] → whatsapp-agent
                                                           ↓
                                                    [Vérification crédits]
                                                           ↓
                                                    serveur central
                                                           ↓
                                                    [Autorisation OK]
                                                           ↓
                                                    [Analyse LangChain]
                                                           ↓
whatsapp-connector ← [HTTP POST /send] ← whatsapp-agent
        ↓
    WhatsApp
        ↓
[Report utilisation] → serveur central → [Décompte crédits]
```

### Flow Messenger/Instagram - Message entrant

```
Messenger/Instagram → [Webhook] → messenger/instagram-agent
                                           ↓
                                   [Vérification crédits]
                                           ↓
                                   serveur central
                                           ↓
                                   [Autorisation OK]
                                           ↓
                                   [Analyse LangChain]
                                           ↓
                                   [Réponse API Meta]
                                           ↓
                                   Messenger/Instagram
                                           ↓
                            [Report utilisation] → serveur central
```

---

## 📦 Structure du monorepo

```
whatsapp-agent/
├── apps/
│   ├── backend/                 # Serveur central (existant)
│   ├── frontend/                # Dashboard & site vitrine (existant)
│   ├── whatsapp-connector/      # 🆕 Connector WhatsApp
│   ├── whatsapp-agent/          # 🆕 Agent WhatsApp
│   ├── messenger-agent/         # 🆕 Agent Messenger
│   └── instagram-agent/         # 🆕 Agent Instagram
├── packages/
│   └── common/                  # Code partagé
├── docker/
│   ├── whatsapp-stack.yml       # Stack Docker pour WhatsApp
│   ├── central.yml              # Stack serveur central
│   └── agents.yml               # Stack agents Messenger/Instagram
├── scripts/
│   ├── deploy-client.sh         # Script déploiement client
│   └── provision-vps.sh         # Script provisioning VPS
├── PLAN.md                      # Ce document
├── package.json
└── pnpm-workspace.yaml
```

---

## 🎯 Phases de développement

### Phase 1: Fondations WhatsApp (PRIORITAIRE)

#### 1.1. Création de whatsapp-connector

- [ ] Initialiser l'app NestJS basée sur apps/backend
- [ ] Intégrer wwebjs.dev
- [ ] Implémenter la gestion de session et QR code
- [ ] Créer les endpoints HTTP (send, status, qr, etc.)
- [ ] Implémenter le système de webhook sortant
- [ ] Ajouter la gestion des médias
- [ ] Tests et documentation Swagger

#### 1.2. Création de whatsapp-agent

- [ ] Initialiser l'app NestJS basée sur apps/backend
- [ ] Intégrer LangChain (OpenAI/Anthropic)
- [ ] Créer le webhook d'entrée (réception messages)
- [ ] Implémenter la logique de vérification des crédits
- [ ] Implémenter le système de génération de réponses
- [ ] Créer le client HTTP pour communiquer avec connector
- [ ] Implémenter le reporting d'utilisation
- [ ] Tests et documentation Swagger

#### 1.3. Mise à jour du serveur central (apps/backend)

- [ ] Créer le module de gestion des crédits
- [ ] Implémenter les endpoints de vérification des crédits
- [ ] Créer le système de réception des métriques
- [ ] Implémenter le modèle de facturation
- [ ] Ajouter la gestion des stacks clients (CRUD)
- [ ] Créer le module de provisioning VPS (Contabo API)
- [ ] Tests

#### 1.4. Tests d'intégration WhatsApp

- [ ] Test du flow complet (réception → traitement → réponse)
- [ ] Test de vérification des crédits
- [ ] Test de reporting
- [ ] Test de déconnexion/reconnexion

### Phase 2: Messenger et Instagram

#### 2.1. Création de messenger-agent

- [ ] Initialiser l'app NestJS
- [ ] Intégrer l'API Meta Messenger
- [ ] Implémenter les webhooks Meta
- [ ] Intégrer LangChain
- [ ] Implémenter la vérification des crédits
- [ ] Tests et documentation

#### 2.2. Création de instagram-agent

- [ ] Initialiser l'app NestJS
- [ ] Intégrer l'API Instagram Graph
- [ ] Implémenter les webhooks Instagram
- [ ] Intégrer LangChain
- [ ] Implémenter la vérification des crédits
- [ ] Tests et documentation

#### 2.3. Tests d'intégration

- [ ] Test Messenger flow complet
- [ ] Test Instagram flow complet

### Phase 3: Dashboard et interface utilisateur

#### 3.1. Frontend (apps/frontend)

- [ ] Page de gestion des instances WhatsApp
- [ ] Page de configuration des agents (prompts, modèles)
- [ ] Dashboard de métriques et utilisation
- [ ] Gestion des crédits et facturation
- [ ] Page de gestion des serveurs clients
- [ ] Tests

### Phase 4: Infrastructure et déploiement

#### 4.1. Docker et orchestration

- [ ] Créer les Dockerfiles pour chaque service
- [ ] Créer les docker-compose/stacks
- [ ] Implémenter le système de déploiement SSH
- [ ] Scripts de provisioning VPS

#### 4.2. Intégration Contabo

- [ ] Intégrer l'API Contabo
- [ ] Automatiser la création de VPS
- [ ] Automatiser la configuration initiale (Docker Swarm)
- [ ] Automatiser le déploiement des stacks

#### 4.3. Monitoring et logs

- [ ] Centralisation des logs (ELK ou Loki)
- [ ] Métriques (Prometheus + Grafana)
- [ ] Alertes (erreurs, déconnexions, crédits bas)

### Phase 5: Production et optimisations

#### 5.1. Sécurité

- [ ] Chiffrement des communications
- [ ] Gestion des secrets (Vault ou équivalent)
- [ ] Rate limiting
- [ ] Protection DDoS

#### 5.2. Optimisations

- [ ] Cache des réponses similaires
- [ ] Optimisation des prompts LangChain
- [ ] Réduction des coûts API

#### 5.3. Tests de charge

- [ ] Test de charge serveur central
- [ ] Test de charge agents
- [ ] Test de déploiement multi-stacks

---

## 🛠️ Technologies utilisées

### Backend

- **Framework:** NestJS
- **Base de données:** PostgreSQL
- **ORM:** Prisma (⚠️ NE JAMAIS utiliser `prisma db push`, uniquement migrations)
- **Cache:** Redis
- **Queue:** Bull
- **Validation:** class-validator, class-transformer
- **Documentation:** Swagger/OpenAPI

### IA et automatisation

- **LangChain:** Framework pour orchestration LLM
- **OpenAI/Anthropic:** Modèles de langage
- **wwebjs.dev:** Client WhatsApp

### API externes

- **Meta Platform:** Messenger & Instagram
- **Contabo API:** Gestion VPS

### Infrastructure

- **Conteneurisation:** Docker
- **Orchestration:** Docker Swarm
- **Provisioning:** SSH + scripts Bash
- **Monitoring:** Prometheus, Grafana
- **Logs:** ELK Stack ou Loki

### Frontend

- **Framework:** React Router v7
- **State management:** À définir (Context API, Zustand, Redux)
- **UI Library:** À définir

---

## 📊 Modèle de facturation

### Système de crédits

- 1 crédit = X tokens (à définir)
- Décompte basé sur l'utilisation réelle des API LLM
- Forfaits mensuels avec crédits inclus
- Recharge possible

### Pricing tiers (exemple)

- **Starter:** 1000 crédits/mois
- **Pro:** 5000 crédits/mois
- **Enterprise:** 20000 crédits/mois + instances dédiées

---

## 🔐 Sécurité et conformité

### Données utilisateurs

- Chiffrement des données sensibles
- Conformité RGPD
- Politique de rétention des messages

### Infrastructure

- Isolation réseau entre stacks
- Secrets management
- Authentification inter-services (JWT ou API keys)
- Rate limiting par client

### WhatsApp

- Respect des conditions d'utilisation
- Isolation des IP pour limiter les bannissements
- Rotation possible des instances

---

## 📈 Métriques à suivre

### Par utilisateur

- Nombre de messages traités
- Tokens consommés
- Crédits restants
- Taux de réponse
- Temps de réponse moyen

### Par serveur client

- Nombre de stacks actives
- Utilisation CPU/RAM
- État des connexions WhatsApp
- Erreurs et déconnexions

### Globalement

- Revenue mensuel
- Coûts API (OpenAI, Meta, etc.)
- Coûts infrastructure (Contabo)
- Marge

---

## 🚀 Prochaines étapes

### Immédiat (Phase 1.1)

1. ✅ Créer le projet whatsapp-connector
2. ✅ Configurer la structure NestJS
3. ✅ Intégrer wwebjs.dev
4. ✅ Implémenter les endpoints de base

### Cette semaine

- Finaliser whatsapp-connector
- Démarrer whatsapp-agent
- Tests d'intégration basiques

### Ce mois

- Compléter Phase 1 (WhatsApp complet)
- Démarrer Phase 2 (Messenger/Instagram)

---

## 📝 Notes importantes

### Contraintes techniques

- ⚠️ **JAMAIS** utiliser `prisma db push`, uniquement les migrations
- Minimiser les mises à jour de whatsapp-connector pour éviter les déconnexions
- Maximum 3 stacks par serveur client
- Vérification des crédits AVANT chaque traitement

### Décisions à prendre

- [ ] Choix du provider LLM par défaut (OpenAI vs Anthropic)
- [ ] Modèle de pricing exact
- [ ] Stack de monitoring (ELK vs Loki)
- [ ] Politique de rétention des messages
- [ ] Stratégie de backup

---

## 📚 Ressources

- [wwebjs.dev Documentation](https://wwebjs.dev/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [LangChain Documentation](https://js.langchain.com/)
- [Meta Messenger Platform](https://developers.facebook.com/docs/messenger-platform)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)
- [Contabo API Documentation](https://api.contabo.com/)

---

**Version:** 1.0 **Date:** 2025-11-11 **Statut:** En cours - Phase 1.1
