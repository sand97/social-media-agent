import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Intent detection tools for the WhatsApp agent
 * Helps understand user intentions in conversations
 */
@Injectable()
export class IntentTools {
  private readonly logger = new Logger(IntentTools.name);

  constructor() {}

  /**
   * Create all intent tools
   */
  createTools() {
    const tools = [this.createDetectIntentTool()];
    return instrumentTools(this.logger, IntentTools.name, tools);
  }

  /**
   * Detect user intent from message
   */
  private createDetectIntentTool() {
    return tool(
      async ({ message, context }, config?: any) => {
        try {
          // This is a placeholder for intent detection
          // In a real implementation, this could use:
          // - A separate AI model for intent classification
          // - Pattern matching
          // - Historical data analysis

          // For now, we'll do basic keyword matching
          const lowerMessage = message.toLowerCase();

          let intent = 'unknown';
          let confidence = 0.5;

          // Shopping intents
          if (
            lowerMessage.includes('combien') ||
            lowerMessage.includes('prix') ||
            lowerMessage.includes('coûte')
          ) {
            intent = 'price_inquiry';
            confidence = 0.8;
          } else if (
            lowerMessage.includes('acheter') ||
            lowerMessage.includes('commander') ||
            lowerMessage.includes('prendre')
          ) {
            intent = 'purchase_intent';
            confidence = 0.85;
          } else if (
            lowerMessage.includes('livraison') ||
            lowerMessage.includes('livrer') ||
            lowerMessage.includes('envoyer')
          ) {
            intent = 'delivery_inquiry';
            confidence = 0.8;
          } else if (
            lowerMessage.includes('disponible') ||
            lowerMessage.includes('stock') ||
            lowerMessage.includes('en stock')
          ) {
            intent = 'availability_check';
            confidence = 0.75;
          }
          // Support intents
          else if (
            lowerMessage.includes('problème') ||
            lowerMessage.includes('pb') ||
            lowerMessage.includes('pas content')
          ) {
            intent = 'complaint';
            confidence = 0.7;
          } else if (
            lowerMessage.includes('merci') ||
            lowerMessage.includes('ok') ||
            lowerMessage.includes('parfait')
          ) {
            intent = 'satisfaction';
            confidence = 0.65;
          }
          // Greetings
          else if (
            lowerMessage.includes('bonjour') ||
            lowerMessage.includes('salut') ||
            lowerMessage.includes('bonsoir')
          ) {
            intent = 'greeting';
            confidence = 0.9;
          }

          return JSON.stringify({
            success: true,
            intent,
            confidence,
            message: `Intention détectée: ${intent} (confiance: ${Math.round(confidence * 100)}%)`,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'detect_intent',
        description:
          'Detect the intent of a customer message (purchase, price, delivery, complaint, etc.). Useful to better understand what the customer wants.',
        schema: z.object({
          message: z.string().describe('Customer message to analyze'),
          context: z
            .string()
            .optional()
            .describe('Additional conversation context'),
        }),
      },
    );
  }
}
