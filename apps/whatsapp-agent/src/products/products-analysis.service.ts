import { Injectable, Logger } from '@nestjs/common';
import { LangChainAgentService } from '../langchain/langchain-agent.service';
import {
  AnalysisResultDto,
  SpellingCorrection,
  MetadataSuggestion,
} from './dto/analysis-result.dto';

@Injectable()
export class ProductsAnalysisService {
  private readonly logger = new Logger(ProductsAnalysisService.name);

  constructor(private readonly langChainService: LangChainAgentService) {}

  async analyzeProduct(product: {
    name: string;
    description?: string;
    category?: string;
  }): Promise<AnalysisResultDto> {
    try {
      this.logger.log(
        `Analyzing product: ${product.name} (category: ${product.category || 'non spécifiée'})`,
      );

      const prompt = this.buildAnalysisPrompt(product);
      const response = await this.langChainService.generateResponse(prompt);

      this.logger.debug('AI Response:', response);

      // Parser la réponse JSON
      const analysisResult = this.parseAnalysisResponse(response);

      this.logger.log('Product analysis completed successfully');
      return analysisResult;
    } catch (error: any) {
      this.logger.error('Failed to analyze product:', error.message);
      throw new Error(`Échec de l'analyse du produit: ${error.message}`);
    }
  }

  private buildAnalysisPrompt(product: {
    name: string;
    description?: string;
    category?: string;
  }): string {
    const categoryContext = product.category
      ? `La catégorie du produit est : ${product.category}`
      : 'La catégorie du produit n\'est pas spécifiée';

    const descriptionContext = product.description
      ? `Description : ${product.description}`
      : 'Aucune description fournie';

    return `Tu es un expert en analyse de produits e-commerce. Analyse le produit suivant et fournis une réponse au format JSON strictement structuré.

**Produit à analyser :**
Nom : ${product.name}
${descriptionContext}
${categoryContext}

**Ta mission :**
1. Vérifier l'orthographe et la grammaire en français dans le nom et la description
2. Suggérer des champs de métadonnées pertinents selon la catégorie (ex: pour les vêtements: taille, couleur, matière)
3. Proposer des améliorations pour la description

**Format de réponse requis (JSON uniquement, sans texte supplémentaire) :**
{
  "spellingCorrections": [
    {
      "original": "mot avec erreur",
      "corrected": "mot corrigé",
      "position": 10
    }
  ],
  "metadataSuggestions": [
    {
      "key": "nom_du_champ",
      "values": ["valeur1", "valeur2"],
      "reason": "explication de pourquoi ce champ est pertinent"
    }
  ],
  "descriptionImprovements": [
    "suggestion 1",
    "suggestion 2"
  ]
}

**Important :**
- Réponds UNIQUEMENT avec le JSON, sans markdown, sans backticks, sans texte avant ou après
- Si aucune correction n'est nécessaire, retourne un tableau vide []
- Adapte les métadonnées à la catégorie du produit
- Sois précis et pertinent dans tes suggestions`;
  }

  private parseAnalysisResponse(response: string): AnalysisResultDto {
    try {
      // Nettoyer la réponse : enlever les backticks markdown si présents
      let cleanedResponse = response.trim();

      // Enlever les blocs de code markdown
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '');
      cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
      cleanedResponse = cleanedResponse.trim();

      // Extraire le JSON s'il y a du texte avant ou après
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanedResponse);

      // Valider et normaliser la structure
      const result: AnalysisResultDto = {
        spellingCorrections: Array.isArray(parsed.spellingCorrections)
          ? parsed.spellingCorrections.map((c: any) => ({
              original: c.original || '',
              corrected: c.corrected || '',
              position: c.position,
            }))
          : [],
        metadataSuggestions: Array.isArray(parsed.metadataSuggestions)
          ? parsed.metadataSuggestions.map((m: any) => ({
              key: m.key || '',
              values: Array.isArray(m.values) ? m.values : [],
              reason: m.reason,
            }))
          : [],
        descriptionImprovements: Array.isArray(parsed.descriptionImprovements)
          ? parsed.descriptionImprovements
          : [],
      };

      return result;
    } catch (error: any) {
      this.logger.error('Failed to parse AI response:', error.message);
      this.logger.debug('Raw response:', response);

      // Retourner un résultat vide en cas d'erreur de parsing
      return {
        spellingCorrections: [],
        metadataSuggestions: [],
        descriptionImprovements: [
          'Erreur lors de l\'analyse. Veuillez réessayer.',
        ],
      };
    }
  }
}
