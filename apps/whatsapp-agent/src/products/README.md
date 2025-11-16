# Products Analysis Module

Module d'analyse de produits utilisant l'IA pour améliorer la qualité des données produits e-commerce.

## Fonctionnalités

- Correction orthographique et grammaticale en français
- Suggestion de métadonnées pertinentes selon la catégorie
- Amélioration des descriptions produits

## API

### POST /products/analyze

Analyse un produit et retourne des suggestions d'amélioration.

**Request Body:**
```json
{
  "name": "T-shirt en coton bio",
  "description": "Un t-shirt confortabel en coton biologique, parfait pour l'été",
  "category": "Vêtements"
}
```

**Response:**
```json
{
  "spellingCorrections": [
    {
      "original": "confortabel",
      "corrected": "confortable",
      "position": 15
    }
  ],
  "metadataSuggestions": [
    {
      "key": "taille",
      "values": ["XS", "S", "M", "L", "XL", "XXL"],
      "reason": "Les vêtements nécessitent généralement une indication de taille"
    },
    {
      "key": "couleur",
      "values": ["Blanc", "Noir", "Bleu", "Rouge", "Vert"],
      "reason": "La couleur est une information essentielle pour les vêtements"
    },
    {
      "key": "matière",
      "values": ["Coton bio 100%"],
      "reason": "La composition est déjà mentionnée mais devrait être structurée"
    }
  ],
  "descriptionImprovements": [
    "Ajouter des détails sur la composition exacte du coton",
    "Préciser les instructions d'entretien (lavage, repassage)",
    "Mentionner les certifications biologiques (GOTS, Oeko-Tex, etc.)"
  ]
}
```

## Configuration

Le module utilise le `LangChainAgentService` qui nécessite l'une des configurations suivantes :

### Option 1 : Grok (xAI)
```env
GROK_API_KEY=your-grok-api-key
GROK_MODEL=grok-beta
GROK_API_BASE=https://api.x.ai/v1
```

### Option 2 : Gemini (Google)
```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash-exp
```

## Utilisation

### Depuis le backend NestJS principal

```typescript
import { ProductsAnalysisService } from './products/products-analysis.service';

@Injectable()
export class YourService {
  constructor(private readonly productsAnalysisService: ProductsAnalysisService) {}

  async analyzeProduct() {
    const result = await this.productsAnalysisService.analyzeProduct({
      name: 'Mon produit',
      description: 'Description du produit',
      category: 'Catégorie'
    });

    console.log(result.spellingCorrections);
    console.log(result.metadataSuggestions);
    console.log(result.descriptionImprovements);
  }
}
```

### Depuis l'API REST

```bash
curl -X POST http://localhost:3002/products/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "name": "T-shirt en coton bio",
    "description": "Un t-shirt confortabel en coton biologique",
    "category": "Vêtements"
  }'
```

## Documentation

La documentation Swagger complète est disponible à : `http://localhost:3002/api`

## Architecture

```
products/
├── dto/
│   ├── analyze-product.dto.ts    # DTO pour la requête d'analyse
│   ├── analysis-result.dto.ts    # DTO pour le résultat d'analyse
│   └── index.ts                   # Barrel export
├── products-analysis.service.ts   # Service d'analyse principal
├── products.controller.ts         # Controller REST
├── products.module.ts             # Module NestJS
├── index.ts                       # Barrel export
└── README.md                      # Cette documentation
```

## Catégories supportées

Le module adapte ses suggestions selon la catégorie :
- **Vêtements** : taille, couleur, matière, style, coupe
- **Électronique** : marque, modèle, garantie, caractéristiques techniques
- **Alimentation** : ingrédients, allergènes, conservation, origine
- **Cosmétiques** : type de peau, composition, contenance, certifications
- Et plus encore...
