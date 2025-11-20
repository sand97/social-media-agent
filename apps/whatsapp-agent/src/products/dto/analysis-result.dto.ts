import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpellingCorrection {
  @ApiProperty({
    description: "Texte original avec l'erreur",
    example: 'confortabel',
  })
  original: string;

  @ApiProperty({
    description: 'Correction suggérée',
    example: 'confortable',
  })
  corrected: string;

  @ApiPropertyOptional({
    description: "Position de l'erreur dans le texte",
    example: 15,
  })
  position?: number;
}

export class MetadataSuggestion {
  @ApiProperty({
    description: 'Clé de métadonnée suggérée',
    example: 'taille',
  })
  key: string;

  @ApiProperty({
    description: 'Valeurs possibles pour cette métadonnée',
    example: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    type: [String],
  })
  values: string[];

  @ApiPropertyOptional({
    description: 'Raison de la suggestion',
    example: 'Les vêtements nécessitent généralement une indication de taille',
  })
  reason?: string;
}

export class AnalysisResultDto {
  @ApiProperty({
    description: 'Corrections orthographiques et grammaticales',
    type: [SpellingCorrection],
  })
  spellingCorrections: SpellingCorrection[];

  @ApiProperty({
    description: 'Suggestions de métadonnées basées sur la catégorie',
    type: [MetadataSuggestion],
  })
  metadataSuggestions: MetadataSuggestion[];

  @ApiProperty({
    description: "Suggestions d'amélioration de la description",
    example: [
      'Ajouter des détails sur la composition exacte du coton',
      "Préciser les instructions d'entretien",
      'Mentionner les certifications biologiques',
    ],
    type: [String],
  })
  descriptionImprovements: string[];
}
