/**
 * Types for backend API endpoints
 * These types complement the auto-generated types from openapi-ts
 */

export interface AuthorizedGroup {
  whatsappGroupId: string; // ID WhatsApp du groupe (ex: "12345@g.us")
  usage: string; // Usage du groupe (ex: "Support client", "Ventes")
  name?: string; // Nom du groupe (optionnel)
}

export interface ContactLabel {
  id: string;
  name: string;
  hexColor: string;
}

export interface CanProcessRequest {
  userId: string; // ID of the connected WhatsApp account (e.g., "237657888690@c.us")
  chatId: string; // ID of the chat where the message was received
  message: string;
  contactLabels?: ContactLabel[]; // Labels of the contact sending the message
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

export interface ToolExecution {
  name: string;
  args: any;
  result?: any;
  error?: string;
  durationMs?: number;
}

export interface LogOperationRequest {
  // Context
  chatId: string;
  agentId?: string;
  userId?: string;

  // Messages
  userMessage: string;
  agentResponse: string;
  systemPrompt: string;

  // Metrics
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
  modelName?: string;

  // Tools
  toolsUsed?: ToolExecution[];

  // Status
  status: 'success' | 'error' | 'rate_limited';
  error?: string;

  // Metadata
  metadata?: Record<string, any>;

  timestamp: string;
}

export interface LogOperationResponse {
  success: boolean;
  operationId?: string;
}

export interface UploadMediaRequest {
  messageId: string;
  chatId?: string;
  userId?: string;
  mediaBase64: string;
  mimeType?: string;
  filename?: string;
  userPhoneNumber?: string;
  contactPhoneNumber?: string;
}

export interface UploadMediaResponse {
  success: boolean;
  url: string;
  objectKey: string;
  size: number;
}

export interface DeleteMediaRequest {
  objectKey: string;
}

export interface DeleteMediaResponse {
  success: boolean;
}

export interface UpsertMessageMetadataRequest {
  messageId: string;
  type: 'AUDIO' | 'IMAGE';
  metadata: any;
}

export interface UpsertMessageMetadataResponse {
  success: boolean;
  record: any;
}

export interface MessageMetadataListRequest {
  messageIds: string[];
  type?: 'AUDIO' | 'IMAGE';
}

export interface MessageMetadataListResponse {
  success: boolean;
  data: Record<string, any[]>;
}

export interface InternalProductImage {
  id: string;
  product_id: string;
  url: string;
  original_url?: string | null;
  normalized_url?: string | null;
  image_type: string;
  image_index: number;
}

export interface InternalProductSample {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  retailer_id?: string | null;
  price?: number | null;
  images: InternalProductImage[];
}

export interface InternalProductMatch {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  retailer_id?: string | null;
  price?: number | null;
  coverImageDescription?: string | null;
}

export interface InternalProductIdMatch {
  id: string;
  name: string;
  retailer_id?: string | null;
  whatsapp_product_id?: string | null;
}

export interface InternalProductByAnyIdsMatch {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
  retailer_id?: string | null;
  whatsapp_product_id?: string | null;
  url?: string | null;
  coverImageUrl?: string | null;
}

export interface InternalProductByAnyIdsEntry {
  inputId: string;
  matchedBy: 'id' | 'whatsapp_product_id' | 'retailer_id' | null;
  product: InternalProductByAnyIdsMatch | null;
}

export interface InternalProductForImageIndexing {
  id: string;
  name: string;
  description?: string | null;
  retailer_id?: string | null;
  price?: number | null;
  category?: string | null;
  images: Array<{
    id: string;
    url: string;
    imageIndex: number;
    needsImageIndexing: boolean;
    whatsappImageHash?: string | null;
    createdAt?: string | null;
  }>;
  coverImageDescription?: string | null;
  coverImageUrl?: string | null;
  coverImageCreatedAt?: string | null;
  needsTextIndexing: boolean;
}

export interface InternalProductImageIndexingUpdate {
  productId: string;
  coverImageDescription?: string;
  textIndexed?: boolean;
  indexedImageIds?: string[];
}

export interface InternalAgentCore {
  id: string;
  userId?: string | null;
  ipAddress: string;
  port: number;
  connectorPort: number;
  status: string;
  connectionStatus: string;
  syncStatus: string;
  syncProgress?: unknown;
  lastCatalogSyncedAt?: string | null;
  syncImageStatus: 'PENDING' | 'SYNCING' | 'DONE' | 'FAILED';
  lastImageSyncDate?: string | null;
  lastImageSyncError?: string | null;
  customDescriptionPrompt?: string | null;
  promptGeneratedAt?: string | null;
  promptBasedOnProductsCount?: number | null;
  metadata?: unknown;
  testPhoneNumbers: string[];
  testLabels: string[];
  labelsToNotReply: string[];
  productionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastHealthCheckAt?: string | null;
}

export interface InternalManagementGroupResponse {
  managementGroupId: string | null;
  name: string | null;
  usage: string | null;
}

export interface InternalAgentSnapshotResponse {
  agent: InternalAgentCore;
  managementGroup: InternalManagementGroupResponse;
  businessContext?: string | null;
}

export interface InternalAgentUpdatePayload {
  customDescriptionPrompt?: string;
  promptBasedOnProductsCount?: number;
  syncImageStatus?: 'SYNCING' | 'DONE' | 'FAILED';
  syncImageError?: string;
}

export interface InternalCustomPromptResponse {
  id: string;
  customDescriptionPrompt?: string | null;
  promptGeneratedAt?: string | null;
  promptBasedOnProductsCount?: number | null;
}

export interface InternalImageSyncStatusUpdate {
  status: 'SYNCING' | 'DONE' | 'FAILED';
  error?: string;
}
