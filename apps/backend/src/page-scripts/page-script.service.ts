import * as fs from 'fs';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ScriptVariables {
  BACKEND_URL?: string;
  TOKEN?: string;
  INITIAL_ORIGINALS_URLS?: string; // JSON stringifié des images existantes [{id, original_url, url}]
  // Note: CLIENT_ID n'est plus une variable car il est encodé dans le TOKEN
  [key: string]: string | undefined;
}

@Injectable()
export class PageScriptService {
  private readonly logger = new Logger(PageScriptService.name);
  private readonly scriptsDir = path.join(__dirname, 'scripts');

  constructor(private readonly configService: ConfigService) {}

  /**
   * Charge un script depuis le système de fichiers
   * Essaie d'abord .js (production), puis .ts (développement)
   */
  private loadScript(scriptName: string): string {
    // Essayer d'abord .js (fichier compilé en production)
    const jsScriptPath = path.join(this.scriptsDir, `${scriptName}.js`);
    const tsScriptPath = path.join(this.scriptsDir, `${scriptName}.ts`);

    try {
      if (fs.existsSync(jsScriptPath)) {
        let scriptContent = fs.readFileSync(jsScriptPath, 'utf-8');
        // Nettoyer les exports CommonJS qui ne fonctionnent pas dans le navigateur (Puppeteer)
        scriptContent = this.cleanBrowserScript(scriptContent);
        this.logger.debug(`✅ Script loaded: ${scriptName}.js`);
        return scriptContent;
      } else if (fs.existsSync(tsScriptPath)) {
        const scriptContent = fs.readFileSync(tsScriptPath, 'utf-8');
        this.logger.debug(`✅ Script loaded: ${scriptName}.ts`);
        return scriptContent;
      } else {
        throw new Error(
          `Script file not found at ${jsScriptPath} or ${tsScriptPath}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to load script ${scriptName}: ${error.message}`,
      );
      throw new Error(`Script ${scriptName} not found`);
    }
  }

  /**
   * Nettoie un script compilé pour le rendre compatible avec l'environnement navigateur
   * Supprime les exports CommonJS ajoutés par TypeScript
   */
  private cleanBrowserScript(script: string): string {
    // Supprimer les lignes qui définissent exports (ajoutées par TypeScript)
    return (
      script
        // Supprimer "use strict"
        .replace(/^["']use strict["'];?\s*/gm, '')
        // Supprimer Object.defineProperty(exports, ...)
        .replace(
          /Object\.defineProperty\(exports,\s*["']__esModule["'],\s*\{\s*value:\s*true\s*\}\);?\s*/g,
          '',
        )
        // Supprimer exports.__esModule = true
        .replace(/exports\.__esModule\s*=\s*true;?\s*/g, '')
        // Supprimer var exports = {}
        .replace(/var exports\s*=\s*\{\};?\s*/g, '')
    );
  }

  /**
   * Remplace les placeholders dans un script
   */
  private replacePlaceholders(
    script: string,
    variables: ScriptVariables,
  ): string {
    let processedScript = script;

    // Ajouter les variables par défaut si non fournies
    const defaultVariables: ScriptVariables = {
      BACKEND_URL:
        variables.BACKEND_URL ||
        this.configService.get<string>('BACKEND_URL', 'http://localhost:3000'),
      ...variables,
    };

    // Remplacer chaque placeholder
    for (const [key, value] of Object.entries(defaultVariables)) {
      if (value !== undefined) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        processedScript = processedScript.replace(placeholder, value);
      }
    }

    // Vérifier s'il reste des placeholders non remplacés
    const remainingPlaceholders = processedScript.match(/{{\w+}}/g);
    if (remainingPlaceholders) {
      this.logger.warn(
        `Placeholders non remplacés: ${remainingPlaceholders.join(', ')}`,
      );
    }

    return processedScript;
  }

  /**
   * Génère le script de récupération du catalogue
   */
  getGetCatalogScript(variables: ScriptVariables): string {
    const scriptContent = this.loadScript('getCatalog');
    return this.replacePlaceholders(scriptContent, variables);
  }

  /**
   * Génère le script de récupération des informations du client
   */
  getClientInfoScript(variables: ScriptVariables): string {
    const scriptContent = this.loadScript('getClientInfo');
    return this.replacePlaceholders(scriptContent, variables);
  }

  /**
   * Liste tous les scripts disponibles
   */
  getAvailableScripts(): string[] {
    return ['getCatalog', 'getClientInfo'];
  }

  /**
   * Obtient un script par son nom
   */
  getScript(scriptName: string, variables: ScriptVariables): string {
    switch (scriptName) {
      case 'getCatalog':
        return this.getGetCatalogScript(variables);
      case 'getClientInfo':
        return this.getClientInfoScript(variables);
      default:
        throw new Error(`Script "${scriptName}" not found`);
    }
  }
}
