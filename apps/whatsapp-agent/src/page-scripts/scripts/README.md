# Scripts de Page WhatsApp Agent

Ce dossier contient les scripts TypeScript qui sont exécutés dans le contexte de la page WhatsApp Web par l'agent.

## 📝 Avantages de cette approche

1. **Auto-complétion** : Les scripts sont écrits en TypeScript avec des définitions de types (`global.d.ts`)
2. **Coloration syntaxique** : Support complet de l'IDE
3. **Vérification de types** : TypeScript vérifie la cohérence du code
4. **Debugging** : Plus facile de lire et déboguer du code structuré
5. **Refactoring** : Renommage, extraction de fonctions, etc.

## 🔧 Comment ajouter un nouveau script

### 1. Créer le fichier TypeScript

Créez un nouveau fichier dans le dossier approprié, par exemple `catalog/getProductDetails.ts` :

```typescript
/**
 * Get detailed information about a product
 * Variables: PRODUCT_ID (required)
 */

(async () => {
  const productId = '{{PRODUCT_ID}}';

  if (!productId || productId.includes('{{')) {
    throw new Error('PRODUCT_ID is required');
  }

  const product = await WPP.catalog.getProductById(productId);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
  };
})();
```

### 2. Utiliser le script dans le service

Le service PageScriptService charge automatiquement les scripts et remplace les variables.

```typescript
const script = await this.pageScriptService.getScript(
  'catalog/getProductDetails',
  {
    PRODUCT_ID: '123456',
  },
);

const result = await this.connectorClient.executeScript(script);
```

## 📋 Variables disponibles

Les placeholders suivants sont remplacés automatiquement par le service :

- `{{VARIABLE_NAME}}` : Toute variable passée via l'objet de variables

Exemple :

```typescript
const script = await this.pageScriptService.getScript('myScript', {
  CHAT_ID: '5521999999999@c.us',
  LIMIT: '50',
});
```

## 🎯 Types disponibles

Le fichier `global.d.ts` définit les types pour :

- `WPP.catalog.*` : API Catalogue WPP
- `WPP.chat.*` : API Chat WPP
- `WPP.labels.*` : API Labels WPP
- `WPP.conn.*` : API Connexion WPP
- `fetch`, `FormData`, etc. : APIs du navigateur

Pour ajouter des types manquants, modifiez `global.d.ts`.

## ⚠️ Remarques importantes

1. **IIFE** : Les scripts doivent être des fonctions auto-exécutées `(async () => { ... })()`
2. **Return** : Toujours retourner des données ou lever une erreur
3. **Validation** : Toujours valider que les variables requises sont présentes
4. **TypeScript pur** : Pas besoin de `@ts-nocheck`, le tsconfig.json gère tout

## 📂 Structure

```
scripts/
├── tsconfig.json           # Configuration TypeScript
├── global.d.ts             # Définitions de types WPP
├── README.md               # Cette documentation
├── catalog/                # Scripts liés au catalogue
│   ├── getCollections.ts
│   ├── searchProducts.ts
│   └── ...
├── communication/          # Scripts d'envoi de messages
│   ├── sendProduct.ts
│   ├── sendCollection.ts
│   └── ...
├── labels/                 # Scripts de gestion des labels
│   └── ...
└── messages/               # Scripts de récupération de messages
    └── ...
```

## 🚀 Compilation

Les scripts sont lus dynamiquement avec `fs.readFileSync()` au runtime. Ils ne sont pas compilés, mais TypeScript les vérifie pendant le développement.

## 🧪 Testing

Pour tester un script :

1. Copiez le contenu du script
2. Remplacez manuellement les `{{VARIABLES}}`
3. Ouvrez la console du navigateur sur WhatsApp Web
4. Collez et exécutez le code

Exemple :

```javascript
// Remplacer les variables
const productId = '123456';

// Puis exécuter le code du script
(async () => {
  const product = await WPP.catalog.getProductById(productId);
  console.log(product);
})();
```
