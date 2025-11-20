# Scripts TypeScript - Guide d'utilisation

## 🎯 Pourquoi des fichiers TypeScript séparés ?

Au lieu d'écrire les scripts dans des chaînes de caractères JavaScript, nous utilisons des fichiers `.ts` séparés pour bénéficier de :

### ✅ Avantages

1. **Auto-complétion complète**
   - IntelliSense sur `window.WPP.*`
   - Suggestions de méthodes et propriétés
   - Documentation inline

2. **Vérification de types**
   - Détection d'erreurs avant l'exécution
   - Typage des paramètres et retours de fonction
   - Alertes sur les propriétés inexistantes

3. **Coloration syntaxique**
   - Code plus lisible
   - Meilleure compréhension de la structure

4. **Debugging facile**
   - Erreurs claires avec numéros de ligne
   - Possibilité de copier-coller pour tester dans la console

5. **Refactoring sûr**
   - Renommage de variables
   - Extraction de fonctions
   - Déplacement de code

## 📂 Structure des fichiers

```
apps/backend/src/page-scripts/
├── scripts/                        # Scripts exécutés dans le navigateur
│   ├── global.d.ts                # Types pour window.WPP et APIs navigateur
│   ├── getCatalog.ts              # Script de récupération du catalogue
│   ├── tsconfig.json              # Configuration TypeScript pour les scripts
│   ├── .eslintrc.json             # Configuration ESLint
│   └── README.md                  # Documentation
│
├── page-script.service.ts         # Service qui charge et compile les scripts
├── page-script.module.ts
└── index.ts
```

## 🔧 Comment ça marche

### 1. Écriture du script

Créez un fichier `.ts` dans `scripts/` :

```typescript
/* eslint-disable no-undef */
// @ts-nocheck

(async () => {
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';

  console.log('Script executing...');

  const result = await window.WPP.catalog.getProducts(userId, 10);

  return { success: true, data: result };
})();
```

### 2. Chargement du script

Le `PageScriptService` charge le script avec `fs.readFileSync()` :

```typescript
// Dans page-script.service.ts
private loadScript(scriptName: string): string {
  const scriptPath = path.join(this.scriptsDir, `${scriptName}.ts`);
  return fs.readFileSync(scriptPath, 'utf-8');
}
```

### 3. Remplacement des variables

Les placeholders `{{VAR}}` sont remplacés :

```typescript
const script = this.loadScript('getCatalog');
const processed = this.replacePlaceholders(script, {
  BACKEND_URL: 'http://localhost:3000',
  TOKEN: 'abc123',
  CLIENT_ID: '5521999999999@c.us',
});
```

### 4. Exécution dans le navigateur

Le script est envoyé au connector qui l'exécute via `page.evaluate()`.

## 🎨 Configuration de l'IDE

### Types disponibles

Le fichier `global.d.ts` expose les types :

```typescript
declare global {
  interface Window {
    WPP: {
      conn: {
        getMyUserId(): { _serialized: string } | undefined;
      };
      catalog: {
        getProducts(userId: string, quantity: number): Promise<any[]>;
        getCollections(userId: string, qnt?: number): Promise<any[]>;
        // ...
      };
    };
  }
}
```

### Configuration TypeScript

Le `tsconfig.json` dans `scripts/` :

- `noEmit: true` : Ne compile pas les fichiers
- `target: ES2020` : Syntaxe moderne
- `lib: ["DOM"]` : APIs du navigateur
- `strict: true` : Vérifications strictes

### Configuration ESLint

Le `.eslintrc.json` désactive :

- `no-undef` : Car les globals du navigateur ne sont pas dans Node
- `@typescript-eslint/ban-ts-comment` : Pour autoriser `@ts-nocheck`

## 📝 Template de script

Utilisez ce template pour créer un nouveau script :

```typescript
/**
 * Description du script
 *
 * Variables injectées :
 * - VAR1: Description
 * - VAR2: Description
 */

/* eslint-disable no-undef */
// @ts-nocheck - Ce code s'exécute dans le navigateur

(async () => {
  // 1. Récupérer les variables injectées
  const VAR1 = '{{VAR1}}';
  const VAR2 = '{{VAR2}}';

  console.log('🔍 Script starting...');

  try {
    // 2. Votre logique ici
    const result = await window.WPP.someMethod();

    // 3. Traitement
    // ...

    // 4. Retour obligatoire avec success: true
    return {
      success: true,
      data: result,
      count: result.length,
    };
  } catch (error: any) {
    console.error('❌ Error:', error);

    // 5. En cas d'erreur, retour avec success: false
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
})();
```

## 🧪 Testing des scripts

### Méthode 1 : Console du navigateur

1. Ouvrez WhatsApp Web dans votre navigateur
2. Ouvrez la console (F12)
3. Copiez le contenu du script `.ts`
4. Remplacez manuellement les `{{VARIABLES}}`
5. Collez et exécutez

### Méthode 2 : Via l'API

```bash
curl -X POST http://localhost:3001/whatsapp/execute-script \
  -H "Content-Type: application/json" \
  -d '{
    "script": "... votre script compilé ..."
  }'
```

## 🔍 Debugging

### Logs dans le script

Utilisez `console.log()` dans vos scripts :

```typescript
console.log('📦 Data:', data);
console.error('❌ Error:', error);
console.warn('⚠️  Warning:', warning);
```

Les logs apparaissent dans :

- La console du navigateur (si headless: false)
- Les logs du connector

### Inspection du script généré

Ajoutez un log dans `page-script.service.ts` :

```typescript
getGetCatalogScript(variables: ScriptVariables): string {
  const scriptContent = this.loadScript('getCatalog');
  const processed = this.replacePlaceholders(scriptContent, variables);

  // Debug: voir le script final
  this.logger.debug('Generated script:', processed);

  return processed;
}
```

## 🚀 Exemples d'utilisation

### Exemple 1 : Script simple

```typescript
// scripts/getStatus.ts
(async () => {
  const isAuth = window.WPP.conn.isAuthenticated();
  const userId = window.WPP.conn.getMyUserId()?._serialized;

  return {
    success: true,
    authenticated: isAuth,
    userId,
  };
})();
```

### Exemple 2 : Script avec upload

```typescript
// scripts/uploadContacts.ts
(async () => {
  const BACKEND_URL = '{{BACKEND_URL}}';
  const TOKEN = '{{TOKEN}}';

  const contacts = await window.WPP.contact.getAll();

  for (const contact of contacts) {
    await fetch(`${BACKEND_URL}/contacts/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contact),
    });
  }

  return { success: true, synced: contacts.length };
})();
```

## 📚 Ressources

- **WPPConnect API** : https://wppconnect.io/wa-js/
- **TypeScript Handbook** : https://www.typescriptlang.org/docs/
- **Puppeteer evaluate()** : https://pptr.dev/api/puppeteer.page.evaluate

## ⚠️ Limitations

1. **Pas d'imports** : Impossible d'importer des modules npm dans les scripts
2. **APIs navigateur uniquement** : Pas d'accès à Node.js (fs, path, etc.)
3. **Pas de bundling** : Le code est envoyé tel quel (pas de transpilation)
4. **Async obligatoire** : Les scripts doivent être des fonctions async

## 💡 Bonnes pratiques

1. ✅ Toujours utiliser `try/catch`
2. ✅ Toujours retourner `{ success: boolean }`
3. ✅ Logger les étapes importantes
4. ✅ Gérer les cas d'erreur
5. ✅ Valider les données avant de les envoyer
6. ✅ Utiliser des types explicites dans `global.d.ts`
7. ❌ Ne pas faire de boucles infinies
8. ❌ Ne pas bloquer le thread principal trop longtemps
