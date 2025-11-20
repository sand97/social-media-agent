# Scripts de Page WhatsApp

Ce dossier contient les scripts TypeScript qui sont exécutés dans le contexte de la page WhatsApp Web.

## 📝 Avantages de cette approche

1. **Auto-complétion** : Les scripts sont écrits en TypeScript avec des définitions de types (`global.d.ts`)
2. **Coloration syntaxique** : Support complet de l'IDE
3. **Vérification de types** : TypeScript vérifie la cohérence du code
4. **Debugging** : Plus facile de lire et déboguer du code structuré
5. **Refactoring** : Renommage, extraction de fonctions, etc.

## 🔧 Comment ajouter un nouveau script

### 1. Créer le fichier TypeScript

Créez un nouveau fichier dans `scripts/`, par exemple `getMessages.ts` :

```typescript
/**
 * Script de récupération des messages d'un chat
 *
 * Variables injectées :
 * - BACKEND_URL: URL du backend
 * - TOKEN: Token d'authentification
 * - CHAT_ID: ID du chat WhatsApp
 */

/* eslint-disable no-undef */
// @ts-nocheck

(async () => {
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';
  const CHAT_ID = '{{CHAT_ID}}';

  console.log('🔍 Récupération des messages...');

  try {
    // Votre code ici
    const messages = await window.WPP.chat.getMessages(CHAT_ID, 50);

    return {
      success: true,
      messages,
      count: messages.length,
    };
  } catch (error: any) {
    console.error('❌ Erreur:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
```

### 2. Ajouter la méthode dans le service

Dans `page-script.service.ts` :

```typescript
getGetMessagesScript(variables: ScriptVariables): string {
  const scriptContent = this.loadScript('getMessages');
  return this.replacePlaceholders(scriptContent, variables);
}
```

### 3. Utiliser le script

```typescript
const script = this.pageScriptService.getGetMessagesScript({
  BACKEND_URL: 'http://localhost:3000',
  TOKEN: 'abc123',
  CHAT_ID: '5521999999999@c.us',
});

await this.connectorClientService.executeScript(script);
```

## 📋 Variables disponibles

Les placeholders suivants sont remplacés automatiquement :

- `{{BACKEND_URL}}` : URL du backend (défaut : config ou `http://localhost:3000`)
- `{{TOKEN}}` : Token d'authentification
- `{{CLIENT_ID}}` : ID du client WhatsApp
- Vous pouvez ajouter vos propres variables en les passant à `replacePlaceholders()`

## 🎯 Types disponibles

Le fichier `global.d.ts` définit les types pour :

- `window.WPP.*` : API WPPConnect
- `fetch`, `FormData`, etc. : APIs du navigateur

Pour ajouter des types manquants, modifiez `global.d.ts`.

## ⚠️ Remarques importantes

1. **@ts-nocheck** : Nécessaire car le code s'exécute dans le navigateur, pas dans Node.js
2. **eslint-disable no-undef** : Les variables globales comme `window` ne sont pas définies dans Node
3. **IIFE** : Les scripts doivent être des fonctions auto-exécutées `(async () => { ... })()`
4. **Return** : Toujours retourner un objet avec `success: boolean`

## 📂 Structure

```
scripts/
├── global.d.ts          # Définitions de types
├── getCatalog.ts        # Script de récupération du catalogue
├── getMessages.ts       # (exemple) Script de récupération de messages
└── README.md            # Cette documentation
```

## 🚀 Compilation

Les scripts sont lus dynamiquement avec `fs.readFileSync()` au runtime. Ils ne sont pas compilés, mais TypeScript les vérifie quand même pendant le développement.

## 🧪 Testing

Pour tester un script :

1. Copiez le contenu du script
2. Remplacez manuellement les `{{VARIABLES}}`
3. Ouvrez la console du navigateur sur WhatsApp Web
4. Collez et exécutez le code

Exemple :

```javascript
// Remplacer les variables
const BACKEND_URL = 'http://localhost:3000';
const TOKEN = 'test-token';
const CLIENT_ID = '5521999999999@c.us';

// Puis copier tout le reste du script...
```
