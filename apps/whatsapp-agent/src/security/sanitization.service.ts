import { Injectable, Logger } from '@nestjs/common';

/**
 * Service for sanitizing user inputs to prevent security issues
 * Protects against prompt injection, XSS, and other attacks
 */
@Injectable()
export class SanitizationService {
  private readonly logger = new Logger(SanitizationService.name);

  /**
   * Sanitize user input from WhatsApp messages
   * Removes or escapes potentially dangerous content
   */
  sanitizeUserInput(input: string): string {
    if (!input) return '';

    let sanitized = input;

    // Remove markdown code blocks (could be used for prompt injection)
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '');

    // Remove markdown headers (could confuse the agent)
    sanitized = sanitized.replace(/#{1,6}\s/g, '');

    // Remove script tags (XSS prevention, though WhatsApp already handles this)
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Limit length to prevent DoS
    sanitized = sanitized.substring(0, 2000);

    // Remove excessive newlines (normalize whitespace)
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    return sanitized.trim();
  }

  /**
   * Validate user input against security rules
   * Returns true if input is safe, false otherwise
   */
  validateInput(input: string): { valid: boolean; reason?: string } {
    const securityRules = [
      {
        name: 'no_system_override',
        test: (text: string) =>
          !text.toLowerCase().includes('you are now') &&
          !text.toLowerCase().includes('ignore previous') &&
          !text.toLowerCase().includes('disregard'),
        reason: 'Tentative de modification du système détectée',
      },
      {
        name: 'no_context_leak',
        test: (text: string) =>
          !text.match(/show.*context|reveal.*prompt|display.*system/i),
        reason: 'Tentative de fuite de contexte détectée',
      },
      {
        name: 'no_cross_chat',
        test: (text: string) => !text.match(/\d{10,}@c\.us/),
        reason: 'Référence à un autre chat détectée',
      },
      {
        name: 'no_excessive_length',
        test: (text: string) => text.length <= 2000,
        reason: 'Message trop long (max 2000 caractères)',
      },
    ];

    for (const rule of securityRules) {
      if (!rule.test(input)) {
        this.logger.warn(`Security rule violated: ${rule.name}`);
        return {
          valid: false,
          reason: rule.reason,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize agent response before sending
   * Ensures the response is appropriate and safe
   */
  sanitizeAgentResponse(response: string): string {
    if (!response) return '';

    let sanitized = response;

    // Remove any accidentally leaked system prompts or context
    sanitized = sanitized.replace(/\[SYSTEM\][\s\S]*?\[\/SYSTEM\]/gi, '');

    // Remove any phone numbers that might be accidentally included
    // (except for the business's own number)
    // This is a basic filter - may need refinement
    sanitized = sanitized.replace(/\b\d{10,15}\b/g, (match) => {
      // If it's a very long number, it's probably not intentional
      if (match.length > 12) return '[NUMÉRO MASQUÉ]';
      return match;
    });

    // Ensure response isn't too long
    if (sanitized.length > 1000) {
      this.logger.warn(
        `Agent response too long (${sanitized.length} chars), truncating`,
      );
      sanitized = sanitized.substring(0, 950) + '...';
    }

    return sanitized.trim();
  }
}
