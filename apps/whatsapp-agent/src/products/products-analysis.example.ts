/**
 * Exemple d'utilisation du ProductsAnalysisService
 *
 * Ce fichier montre comment utiliser le service d'analyse de produits
 * depuis d'autres parties de l'application.
 */

import { ProductsAnalysisService } from './products-analysis.service';
import { AnalysisResultDto } from './dto/analysis-result.dto';

export class ProductsAnalysisExample {
  constructor(private readonly productsAnalysisService: ProductsAnalysisService) {}

  /**
   * Exemple 1 : Analyse d'un vêtement
   */
  async analyzeClothing(): Promise<AnalysisResultDto> {
    return await this.productsAnalysisService.analyzeProduct({
      name: 'T-shirt en coton bio',
      description: 'Un t-shirt confortabel en coton biologique, parfait pour l\'été',
      category: 'Vêtements',
    });
  }

  /**
   * Exemple 2 : Analyse d'un produit électronique
   */
  async analyzeElectronics(): Promise<AnalysisResultDto> {
    return await this.productsAnalysisService.analyzeProduct({
      name: 'Casque audio Bluetooth',
      description: 'Casque sans fil avec réduction de bruit active',
      category: 'Électronique',
    });
  }

  /**
   * Exemple 3 : Analyse avec nom uniquement
   */
  async analyzeNameOnly(): Promise<AnalysisResultDto> {
    return await this.productsAnalysisService.analyzeProduct({
      name: 'Shampoing naturel lavande',
    });
  }

  /**
   * Exemple 4 : Traitement du résultat
   */
  async processAnalysisResult(): Promise<void> {
    const result = await this.productsAnalysisService.analyzeProduct({
      name: 'Chaussures de randonnée',
      description: 'Chaussures robuste et confortable pour la montagne',
      category: 'Sport & Outdoor',
    });

    // Afficher les corrections orthographiques
    if (result.spellingCorrections.length > 0) {
      console.log('Corrections orthographiques :');
      result.spellingCorrections.forEach((correction) => {
        console.log(`  - "${correction.original}" → "${correction.corrected}"`);
      });
    }

    // Afficher les métadonnées suggérées
    if (result.metadataSuggestions.length > 0) {
      console.log('\nMétadonnées suggérées :');
      result.metadataSuggestions.forEach((metadata) => {
        console.log(`  - ${metadata.key}: ${metadata.values.join(', ')}`);
        if (metadata.reason) {
          console.log(`    Raison: ${metadata.reason}`);
        }
      });
    }

    // Afficher les améliorations de description
    if (result.descriptionImprovements.length > 0) {
      console.log('\nAméliorations suggérées :');
      result.descriptionImprovements.forEach((improvement, index) => {
        console.log(`  ${index + 1}. ${improvement}`);
      });
    }
  }

  /**
   * Exemple 5 : Application automatique des corrections
   */
  async applyCorrections(product: {
    name: string;
    description?: string;
    category?: string;
  }): Promise<{ name: string; description: string }> {
    const result = await this.productsAnalysisService.analyzeProduct(product);

    let correctedDescription = product.description || '';

    // Appliquer les corrections orthographiques
    result.spellingCorrections.forEach((correction) => {
      correctedDescription = correctedDescription.replace(
        new RegExp(correction.original, 'g'),
        correction.corrected,
      );
    });

    return {
      name: product.name,
      description: correctedDescription,
    };
  }
}
