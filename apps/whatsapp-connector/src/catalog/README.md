# Module Catalog

Module NestJS dédié à la gestion du catalogue WhatsApp Business et au téléchargement optimisé des images de produits.

## 📁 Structure

```
catalog/
├── catalog.module.ts              # Module NestJS
├── catalog.service.ts             # Service principal
├── interfaces/
│   ├── catalog-cache.interface.ts # Types pour le cache
│   └── catalog-image.interface.ts # Types pour les images
└── README.md                      # Documentation
```

## 🎯 Fonctionnalités

### 1. **Récupération du catalogue**
- Extraction des produits via `WPP.catalog.getProducts()`
- Téléchargement automatique de toutes les images (principale + additionnelles)
- Gestion des images WhatsApp CDN avec headers appropriés

### 2. **Système de cache intelligent**
- Cache JSON persistant dans `temp/infos.json`
- Évite les téléchargements redondants
- Vérification de l'existence des fichiers sur le disque

### 3. **Nettoyage automatique**
- Méthode pour supprimer les images anciennes
- Configurable (par défaut: 30 jours)

## 📝 Utilisation

### Dans un service

```typescript
import { CatalogService } from '../catalog/catalog.service';

@Injectable()
export class YourService {
  constructor(private readonly catalogService: CatalogService) {}

  async handleCatalog(page: any) {
    // Récupérer le catalogue et les images
    const { catalog, images } = await this.catalogService.fetchCatalogWithImages(page);

    // Sauvegarder les images avec cache
    const clientId = '237012345678';
    const result = await this.catalogService.saveImages(images, clientId);

    console.log(`${result.downloaded} nouvelles, ${result.cached} en cache`);
  }

  async cleanOldImages() {
    // Nettoyer les images de plus de 30 jours
    const deleted = this.catalogService.cleanOldCachedImages(30);
    console.log(`${deleted} image(s) supprimée(s)`);
  }
}
```

### Configuration du module

```typescript
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  // ...
})
export class YourModule {}
```

## 📊 Structure des données

### Catalogue
```typescript
{
  catalog: [
    {
      id: '25095720553426064',
      name: 'Grand studio',
      image_cdn_urls: [...],
      additional_image_cdn_urls: [...]
    }
  ],
  images: [
    {
      productId: '25095720553426064',
      imageData: 'data:image/jpeg;base64,...',
      originalUrl: 'https://media.frns1-1.fna.whatsapp.net/...',
      imageIndex: 0,
      imageType: 'main'
    }
  ]
}
```

### Cache (`temp/infos.json`)
```json
{
  "images": [
    {
      "url": "https://media.frns1-1.fna.whatsapp.net/...",
      "fileName": "237012345678-25095720553426064-0.jpeg",
      "filePath": "/full/path/to/file.jpeg",
      "productId": "25095720553426064",
      "imageIndex": 0,
      "downloadedAt": "2025-11-17T20:00:00.000Z",
      "size": 145632
    }
  ]
}
```

## 🔧 Méthodes principales

### `fetchCatalogWithImages(page: any)`
Récupère le catalogue depuis WhatsApp Web et télécharge toutes les images.

**Paramètres:**
- `page`: Instance de Page Puppeteer

**Retour:**
```typescript
{
  catalog: any[];
  images: DownloadedImage[];
}
```

### `saveImages(images: DownloadedImage[], clientId: string)`
Sauvegarde les images avec système de cache.

**Paramètres:**
- `images`: Tableau d'images téléchargées
- `clientId`: ID du client (numéro de téléphone)

**Retour:**
```typescript
{
  downloaded: number;  // Nouvelles images sauvegardées
  cached: number;      // Images déjà en cache
  errors: number;      // Nombre d'erreurs
}
```

### `cleanOldCachedImages(daysOld: number = 30)`
Supprime les images plus anciennes que X jours.

**Paramètres:**
- `daysOld`: Nombre de jours (par défaut: 30)

**Retour:** `number` - Nombre d'images supprimées

## 📂 Fichiers générés

- `temp/images/` - Dossier contenant toutes les images téléchargées
- `temp/infos.json` - Fichier cache JSON

**Format des noms de fichiers:**
```
[client-id]-[product-id]-[image-index].[extension]
```

**Exemple:**
```
237012345678-25095720553426064-0.jpeg  ← Image principale
237012345678-25095720553426064-1.jpeg  ← Première additionnelle
237012345678-25095720553426064-2.jpeg  ← Deuxième additionnelle
```

## ⚡ Performances

- **Cache intelligent**: Évite les re-téléchargements inutiles
- **Téléchargement dans le navigateur**: Authentification WhatsApp automatique
- **Base64 → Fichier**: Conversion efficace côté Node.js

## 🛡️ Sécurité

- ✅ Vérification de l'existence des fichiers en cache
- ✅ Validation du format base64
- ✅ Gestion des erreurs robuste
- ✅ Headers HTTP appropriés pour WhatsApp CDN

## 🔍 Logs

Le service génère des logs détaillés pour le débogage:

```
[CatalogService] 🔍 Récupération du catalogue via WPP...
[CatalogService] 📦 Catalogue reçu: 3 produits, 21 images téléchargées
[CatalogService] 📋 Cache chargé: 15 image(s) en cache
[CatalogService] 💾 Image en cache: 237012345678-25095720553426064-0.jpeg (produit 25095720553426064, index 0)
[CatalogService] ✅ Image sauvegardée: 237012345678-25095720553426064-6.jpeg (142KB)
[CatalogService] 💾 Cache sauvegardé: 21 image(s) au total
[CatalogService] ✅ Traitement terminé - 6 nouvelle(s) image(s), 15 en cache, 0 erreur(s)
```

## 📝 Notes

- Le dossier `temp/` est déjà dans `.gitignore`
- Les URLs WhatsApp CDN expirent après 5 minutes
- Le cache utilise l'URL complète comme clé unique
