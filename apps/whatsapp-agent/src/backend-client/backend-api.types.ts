/**
 * Types for backend API endpoints
 * These types complement the auto-generated types from openapi-ts
 */

export interface AuthorizedGroup {
  whatsappGroupId: string; // ID WhatsApp du groupe (ex: "12345@g.us")
  usage: string; // Usage du groupe (ex: "Support client", "Ventes")
}

export interface CanProcessRequest {
  chatId: string;
  message: string;
  timestamp: string;
}

export interface CanProcessResponse {
  allowed: boolean;
  reason?: string;
  agentContext?: string;
  managementGroupId?: string;
  agentId?: string;
  authorizedGroups?: AuthorizedGroup[];
}

export interface LogOperationRequest {
  chatId: string;
  userMessage: string;
  agentResponse: string;
  timestamp: string;
}

export interface LogOperationResponse {
  success: boolean;
}
