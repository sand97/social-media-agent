import * as fs from 'fs';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';

export interface ScriptVariables {
  CHAT_ID?: string;
  TO?: string;
  MESSAGE?: string;
  QUOTED_MESSAGE_ID?: string;
  PRODUCT_ID?: string;
  PRODUCT_IDS?: string;
  PRODUCT_LINK_OVERRIDES?: string;
  COLLECTION_ID?: string;
  OWNER_ID?: string;
  LIMIT?: string;
  MAX_TOTAL?: string;
  MESSAGE_ID?: string;
  DIRECTION?: string;
  QUERY?: string;
  LABEL_NAME?: string;
  LABEL_COLOR?: string;
  [key: string]: string | undefined;
}

/**
 * Service to load and process WhatsApp Web scripts from files
 * Avoids inline script strings for better maintainability
 */
@Injectable()
export class PageScriptService {
  private readonly logger = new Logger(PageScriptService.name);
  private readonly scriptsDir = path.join(__dirname, 'scripts');

  /**
   * Load a script from the filesystem
   * Tries .js first (production), then .ts (development)
   */
  private loadScript(scriptPath: string): string {
    const jsScriptPath = path.join(this.scriptsDir, `${scriptPath}.js`);
    const tsScriptPath = path.join(this.scriptsDir, `${scriptPath}.ts`);

    try {
      if (fs.existsSync(jsScriptPath)) {
        let scriptContent = fs.readFileSync(jsScriptPath, 'utf-8');
        // Clean CommonJS exports that don't work in browser (Puppeteer)
        scriptContent = this.cleanBrowserScript(scriptContent);
        this.logger.debug(`✅ Script loaded: ${scriptPath}.js`);
        return scriptContent;
      } else if (fs.existsSync(tsScriptPath)) {
        const scriptContent = fs.readFileSync(tsScriptPath, 'utf-8');
        this.logger.debug(`✅ Script loaded: ${scriptPath}.ts`);
        return scriptContent;
      } else {
        throw new Error(
          `Script file not found at ${jsScriptPath} or ${tsScriptPath}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to load script ${scriptPath}: ${error.message}`,
      );
      throw new Error(`Script ${scriptPath} not found`);
    }
  }

  /**
   * Clean compiled script to make it browser-compatible
   * Removes CommonJS exports added by TypeScript
   */
  private cleanBrowserScript(script: string): string {
    return (
      script
        // Remove "use strict"
        .replace(/^["']use strict["'];?\s*/gm, '')
        // Remove Object.defineProperty(exports, ...)
        .replace(
          /Object\.defineProperty\(exports,\s*["']__esModule["'],\s*\{\s*value:\s*true\s*\}\);?\s*/g,
          '',
        )
        // Remove exports.__esModule = true
        .replace(/exports\.__esModule\s*=\s*true;?\s*/g, '')
        // Remove var exports = {}
        .replace(/var exports\s*=\s*\{\};?\s*/g, '')
    );
  }

  /**
   * Escape special characters for JavaScript string literals
   */
  private escapeJavaScriptString(str: string): string {
    return str
      .replace(/\\/g, '\\\\') // Backslash must be first
      .replace(/'/g, "\\'") // Single quote
      .replace(/"/g, '\\"') // Double quote
      .replace(/\n/g, '\\n') // Newline
      .replace(/\r/g, '\\r') // Carriage return
      .replace(/\t/g, '\\t') // Tab
      .replace(/\f/g, '\\f') // Form feed
      .replace(/\v/g, '\\v') // Vertical tab
      .replace(/\u2028/g, '\\u2028') // Line separator
      .replace(/\u2029/g, '\\u2029'); // Paragraph separator
  }

  /**
   * Replace placeholders in script
   * Format: {{VARIABLE_NAME}}
   */
  private replacePlaceholders(
    script: string,
    variables: ScriptVariables,
  ): string {
    let processedScript = script;

    // Replace each placeholder
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        // Escape the value to prevent breaking JavaScript syntax
        const escapedValue = this.escapeJavaScriptString(value);
        processedScript = processedScript.replace(placeholder, escapedValue);
      }
    }

    // Check for unreplaced placeholders
    const remainingPlaceholders = processedScript.match(/{{\w+}}/g);
    if (remainingPlaceholders) {
      this.logger.warn(
        `Unreplaced placeholders: ${remainingPlaceholders.join(', ')}`,
      );
    }

    return processedScript;
  }

  /**
   * Get a script by its path
   * Ex: getScript('catalog/getCollections', {})
   * Ex: getScript('communication/sendMessage', { TO: '1234@c.us', MESSAGE: 'Hello' })
   */
  getScript(scriptPath: string, variables: ScriptVariables = {}): string {
    const scriptContent = this.loadScript(scriptPath);
    return this.replacePlaceholders(scriptContent, variables);
  }

  /**
   * List all available scripts (for debugging)
   */
  listAvailableScripts(): string[] {
    const scripts: string[] = [];

    const scanDir = (dir: string, prefix = '') => {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath, `${prefix}${file}/`);
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
          const scriptName = file.replace(/\.(ts|js)$/, '');
          scripts.push(`${prefix}${scriptName}`);
        }
      }
    };

    if (fs.existsSync(this.scriptsDir)) {
      scanDir(this.scriptsDir);
    }

    return scripts;
  }
}
