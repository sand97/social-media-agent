# Guide de Configuration - WhatsApp Agent Platform

## 📋 Prérequis

- Node.js 18+ et pnpm 10+
- PostgreSQL 14+
- Redis 6+
- Compte API Grok (xAI) ou Gemini (Google)

## 🚀 Installation Rapide

### 1. Installer les dépendances

```bash
pnpm install
```

### 2. Configuration de la base de données

Créer une base de données PostgreSQL:

```bash
createdb whatsapp_agent
```

### 3. Configuration des variables d'environnement

#### Backend

```bash
cd apps/backend
cp .env.example .env
```

Éditer `.env` et configurer:

- `DATABASE_URL`: URL de connexion PostgreSQL
- `REDIS_URL`: URL de connexion Redis
- `JWT_SECRET`: Clé secrète pour JWT (générer une clé aléatoire)
- `ENCRYPTION_KEY`: Clé de cryptage (32 caractères)

#### WhatsApp Connector

```bash
cd apps/whatsapp-connector
cp .env.example .env
```

Vérifier que les URLs correspondent aux services locaux.

#### WhatsApp Agent

```bash
cd apps/whatsapp-agent
cp .env.example .env
```

Éditer `.env` et ajouter:

- `GROK_API_KEY`: Votre clé API xAI (ou Gemini)

#### Frontend

```bash
cd apps/frontend
cp .env.example .env
```

Par défaut: `VITE_API_URL=http://localhost:3000`

### 4. Initialiser la base de données

```bash
cd apps/backend
pnpm prisma:migrate   # Applique les migrations
pnpm prisma:seed      # Importe les données de test
```

### 5. Lancer tous les services

```bash
# À la racine du projet
pnpm dev:all
```

Ceci lance:

- **Backend** sur http://localhost:3000
- **Frontend** sur http://localhost:5173
- **WhatsApp Connector** sur http://localhost:3001
- **WhatsApp Agent** sur http://localhost:3002

## 📚 Documentation API

- Backend Swagger: http://localhost:3000/api
- Connector Swagger: http://localhost:3001/api
- Agent Swagger: http://localhost:3002/api

## 🧪 Données de Test

Après le seeding, vous pouvez vous connecter avec:

- **Téléphone**: +33612345678
- **Email**: test@example.com
- **Crédits**: 1000

## 🔧 Scripts Disponibles

```bash
# Développement
pnpm dev              # Backend + Frontend uniquement
pnpm dev:all          # Tous les services
pnpm dev:backend      # Backend seul
pnpm dev:frontend     # Frontend seul
pnpm dev:whatsapp     # Connector + Agent

# Build
pnpm build            # Build tous les services
pnpm build:backend    # Build backend seul
pnpm build:frontend   # Build frontend seul

# Base de données
cd apps/backend
pnpm prisma:migrate   # Créer/appliquer migrations
pnpm prisma:seed      # Seeding
pnpm prisma:studio    # Interface graphique Prisma
pnpm db:reset         # Reset complet (⚠️ données effacées)

# Tests
pnpm lint:all         # Linting + Type-check
pnpm type-check       # Type-check TypeScript
```

## 🔐 Authentification

### Premier utilisateur (Pairing WhatsApp)

1. Aller sur http://localhost:5173/auth/login
2. Entrer un numéro WhatsApp
3. Le système génère un code de pairing à 8 chiffres
4. Ouvrir WhatsApp > Paramètres > Appareils connectés > Associer avec numéro
5. Entrer le code
6. Une fois connecté, vous êtes redirigé vers l'onboarding

### Utilisateurs existants (OTP)

1. Aller sur http://localhost:5173/auth/verify-otp
2. Le système envoie un code à 6 chiffres via WhatsApp
3. Entrer le code pour se connecter

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌────────────────┐
│   Frontend  │─────▶│     Backend      │◀────▶│   PostgreSQL   │
│  (React v7) │      │    (NestJS)      │      │    + Redis     │
└─────────────┘      └──────────────────┘      └────────────────┘
                              │
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
            ┌──────────────┐   ┌──────────────┐
            │   WhatsApp   │   │   WhatsApp   │
            │   Connector  │──▶│     Agent    │
            │  (wwebjs)    │   │  (LangChain) │
            └──────────────┘   └──────────────┘
```

## ⚠️ Notes Importantes

- **JAMAIS** utiliser `prisma db push` en production, uniquement les migrations
- Le connector WhatsApp garde la session dans `./data/sessions`
- Les agents utilisent Grok par défaut, avec fallback sur Gemini
- En dev, un agent local est créé automatiquement (localhost:3002)

## 🐛 Troubleshooting

### La migration échoue

```bash
cd apps/backend
pnpm db:reset  # ⚠️ Efface toutes les données
```

### WhatsApp ne se connecte pas

1. Supprimer `./data/sessions` dans whatsapp-connector
2. Redémarrer le connector
3. Scanner le nouveau QR code

### Le frontend ne trouve pas l'API

Vérifier que `VITE_API_URL` dans `apps/frontend/.env` correspond au backend.

## 📞 Support

Pour toute question, consultez le PLAN.md ou les READMEs spécifiques de chaque service.
