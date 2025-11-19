# Module Minio

Module NestJS pour l'intégration avec Minio (S3-compatible object storage) permettant l'upload et la gestion des fichiers du catalogue WhatsApp.

## 📁 Structure

```
minio/
├── minio.module.ts     # Module NestJS
├── minio.service.ts    # Service principal
├── index.ts            # Barrel exports
└── README.md           # Documentation
```

## ⚙️ Configuration

### Variables d'environnement

Ajoutez ces variables dans votre fichier `.env`:

```bash
# Minio Configuration
MINIO_ENDPOINT=localhost           # Hôte Minio (par défaut: localhost)
MINIO_PORT=9000                    # Port Minio (par défaut: 9000)
MINIO_USE_SSL=false                # Utiliser SSL (par défaut: false)
MINIO_ACCESS_KEY=whatsapp-user     # Clé d'accès (REQUIS)
MINIO_SECRET_KEY=your-secret-key   # Clé secrète (REQUIS)
MINIO_BUCKET=whatsapp-agent        # Nom du bucket (par défaut: whatsapp-agent)
```

⚠️ **Note**: Si `MINIO_ACCESS_KEY` ou `MINIO_SECRET_KEY` ne sont pas configurés, le service Minio sera désactivé.

## 🎯 Fonctionnalités

### 1. **Gestion du bucket**
- Création automatique du bucket au démarrage si inexistant
- Vérification de l'existence du bucket

### 2. **ensureFolderExist(folderPath)**
Vérifie et crée un "dossier" (préfixe) dans le bucket.

**Note importante**: Dans S3/Minio, les dossiers n'existent pas réellement - ce sont juste des préfixes dans les clés d'objets. Cette fonction est un no-op intentionnel car les préfixes sont créés automatiquement lors de l'upload d'objets avec des clés contenant des "/".

```typescript
// Exemple d'utilisation
await minioService.ensureFolderExist('237012345678/catalog/images');
// Les dossiers seront créés automatiquement lors de l'upload
```

### 3. **Upload de fichiers**
- Upload depuis le système de fichiers local
- Détection automatique du Content-Type
- Support de tous les formats d'images

### 4. **Upload JSON**
- Upload direct d'objets JavaScript/JSON
- Sérialisation automatique avec indentation

### 5. **Autres fonctionnalités**
- Téléchargement de fichiers
- Liste des objets avec préfixe
- Suppression de fichiers
- Génération d'URLs pré-signées

## 📝 Utilisation

### Dans un service

```typescript
import { MinioService } from '../minio/minio.service';

@Injectable()
export class YourService {
  constructor(private readonly minioService: MinioService) {}

  async uploadCatalogImage(clientId: string, localFilePath: string, fileName: string) {
    // Créer la structure de dossiers
    await this.minioService.ensureFolderExist(`${clientId}/catalog/images`);

    // Upload du fichier
    const objectKey = `${clientId}/catalog/images/${fileName}`;
    const success = await this.minioService.uploadFile(localFilePath, objectKey);

    if (success) {
      console.log('✅ Image uploadée!');
    }
  }

  async uploadCatalogCache(clientId: string, cache: any) {
    // Créer le dossier catalog
    await this.minioService.ensureFolderExist(`${clientId}/catalog`);

    // Upload du JSON
    const objectKey = `${clientId}/catalog/infos.json`;
    await this.minioService.uploadJson(objectKey, cache);
  }

  async checkIfImageExists(clientId: string, fileName: string) {
    const objectKey = `${clientId}/catalog/images/${fileName}`;
    return await this.minioService.fileExists(objectKey);
  }
}
```

### Configuration du module

```typescript
import { MinioModule } from './minio/minio.module';

@Module({
  imports: [MinioModule],
  // ...
})
export class YourModule {}
```

## 📂 Structure des données dans le bucket

```
whatsapp-agent/
└── [clientId]/               # Ex: 237012345678
    └── catalog/
        ├── infos.json        # Cache des images téléchargées
        └── images/
            ├── [clientId]-[product-id]-0.jpeg    # Image principale
            ├── [clientId]-[product-id]-1.jpeg    # Image additionnelle 1
            ├── [clientId]-[product-id]-2.jpeg    # Image additionnelle 2
            └── ...
```

**Exemple concret:**
```
whatsapp-agent/
└── 237012345678/
    └── catalog/
        ├── infos.json
        └── images/
            ├── 237012345678-25095720553426064-0.jpeg
            ├── 237012345678-25095720553426064-1.jpeg
            └── 237012345678-25095720553426064-2.jpeg
```

## 🔧 Méthodes principales

### `ensureFolderExist(folderPath: string)`
Vérifie et crée un préfixe (dossier virtuel) dans le bucket.

**Note**: C'est un no-op intentionnel - les préfixes sont créés automatiquement.

```typescript
await minioService.ensureFolderExist('237012345678/catalog/images');
```

### `uploadFile(localFilePath: string, objectKey: string, contentType?: string)`
Upload un fichier depuis le disque local.

```typescript
await minioService.uploadFile(
  '/path/to/local/image.jpg',
  '237012345678/catalog/images/image.jpg',
  'image/jpeg'
);
```

### `uploadJson(objectKey: string, data: any)`
Upload un objet JSON.

```typescript
await minioService.uploadJson('237012345678/catalog/infos.json', {
  images: [...]
});
```

### `fileExists(key: string)`
Vérifie si un fichier existe.

```typescript
const exists = await minioService.fileExists('237012345678/catalog/infos.json');
```

### `downloadFile(objectKey: string, localFilePath: string)`
Télécharge un fichier depuis Minio.

```typescript
await minioService.downloadFile(
  '237012345678/catalog/infos.json',
  '/local/path/infos.json'
);
```

### `listObjects(prefix: string)`
Liste tous les objets avec un préfixe donné.

```typescript
const images = await minioService.listObjects('237012345678/catalog/images/');
// ['237012345678/catalog/images/img1.jpg', '237012345678/catalog/images/img2.jpg', ...]
```

### `deleteFile(objectKey: string)`
Supprime un fichier.

```typescript
await minioService.deleteFile('237012345678/catalog/images/old.jpg');
```

### `getPresignedUrl(objectKey: string, expirySeconds?: number)`
Génère une URL pré-signée pour télécharger un fichier (valide pendant X secondes).

```typescript
const url = await minioService.getPresignedUrl(
  '237012345678/catalog/images/img.jpg',
  3600  // URL valide 1 heure
);
```

## 🔄 Intégration avec CatalogService

Le `CatalogService` utilise automatiquement `MinioService` pour uploader:

1. **Images du catalogue** → `[clientId]/catalog/images/[fileName]`
2. **Cache JSON** → `[clientId]/catalog/infos.json`

Chaque nouvelle image téléchargée est automatiquement uploadée vers Minio après sauvegarde locale.

## 🔍 Logs

Le service génère des logs détaillés:

```
[MinioService] ✅ Minio client initialized: localhost:9000
[MinioService] 📦 Bucket existe: whatsapp-agent
[MinioService] 📁 Préfixe vérifié: 237012345678/catalog/images
[MinioService] ✅ Fichier uploadé: 237012345678/catalog/images/img.jpg (145KB)
[MinioService] ✅ JSON uploadé: 237012345678/catalog/infos.json (5KB)
```

## 🛡️ Sécurité

- ✅ Vérification de l'existence des fichiers locaux avant upload
- ✅ Gestion des erreurs robuste
- ✅ Désactivation automatique si credentials manquants
- ✅ Détection automatique des Content-Type

## 📊 Détection automatique des Content-Type

Le service détecte automatiquement le type MIME basé sur l'extension:

| Extension | Content-Type |
|-----------|--------------|
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.json` | `application/json` |
| `.txt` | `text/plain` |
| Autres | `application/octet-stream` |

## 🚀 Test local avec Docker

Pour tester Minio localement:

```bash
# Démarrer Minio avec Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=whatsapp-user" \
  -e "MINIO_ROOT_PASSWORD=your-secret-key" \
  minio/minio server /data --console-address ":9001"

# Console web: http://localhost:9001
```

## ⚠️ Notes importantes

1. **Dossiers virtuels**: Dans S3/Minio, il n'y a pas de concept de "dossier". Les objets avec des "/" dans leur clé simulent une hiérarchie.

2. **Performance**: La fonction `ensureFolderExist` est un no-op pour optimiser les performances. Les préfixes sont créés automatiquement.

3. **Désactivation gracieuse**: Si les credentials ne sont pas configurés, le service se désactive automatiquement sans casser l'application.

4. **Uploads asynchrones**: Les uploads Minio n'empêchent pas la sauvegarde locale - ils se font en parallèle.
