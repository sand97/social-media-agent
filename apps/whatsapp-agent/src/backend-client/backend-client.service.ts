import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import {
  CanProcessRequest,
  CanProcessResponse,
  LogOperationRequest,
  LogOperationResponse,
  ToolExecution,
  UploadMediaRequest,
  UploadMediaResponse,
  UpsertMessageMetadataRequest,
  UpsertMessageMetadataResponse,
  MessageMetadataListRequest,
  MessageMetadataListResponse,
  DeleteMediaRequest,
  DeleteMediaResponse,
  InternalProductSample,
  InternalProductMatch,
  InternalProductIdMatch,
  InternalProductByAnyIdsEntry,
  InternalProductForImageIndexing,
  InternalProductImageIndexingUpdate,
  InternalAgentSnapshotResponse,
  InternalAgentUpdatePayload,
  InternalCustomPromptResponse,
  InternalManagementGroupResponse,
  InternalImageSyncStatusUpdate,
} from './backend-api.types';

@Injectable()
export class BackendClientService {
  private readonly logger = new Logger(BackendClientService.name);
  private readonly baseUrl: string;
  private readonly agentBackendToken?: string;
  private agentSnapshotCache: InternalAgentSnapshotResponse | null = null;
  private agentSnapshotPromise: Promise<InternalAgentSnapshotResponse> | null =
    null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const baseUrl = this.configService.get<string>('BACKEND_URL');
    if (!baseUrl) {
      throw new Error('Missing BACKEND_URL');
    }
    this.baseUrl = baseUrl;
    this.agentBackendToken = this.configService.get<string>(
      'AGENT_BACKEND_TOKEN',
    );
    this.logger.log(`Backend URL configured: ${this.baseUrl}`);
  }

  private getInternalAuthHeaders() {
    if (!this.agentBackendToken) {
      throw new Error('Missing AGENT_BACKEND_TOKEN');
    }

    return {
      Authorization: `Bearer ${this.agentBackendToken}`,
    };
  }

  private async internalGet<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.httpService.axiosRef.get<T>(url, {
      params,
      headers: this.getInternalAuthHeaders(),
    });
    return response.data;
  }

  private async internalPatch<T>(path: string, payload: object): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.httpService.axiosRef.patch<T>(url, payload, {
      headers: this.getInternalAuthHeaders(),
    });
    return response.data;
  }

  /**
   * Notify backend that WhatsApp pairing was successful
   * @param phoneNumber The user's phone number
   * @param whatsappProfile The WhatsApp profile information
   */
  verifyPairingSuccess(
    phoneNumber: string,
    whatsappProfile: any,
  ): Observable<any> {
    const url = `${this.baseUrl}/auth/verify-pairing`;

    this.logger.log(
      `Notifying backend of successful pairing for: ${phoneNumber}`,
    );

    return this.httpService
      .post(url, {
        phoneNumber,
        whatsappProfile,
      })
      .pipe(
        map((response) => {
          this.logger.log(`Backend notified successfully for: ${phoneNumber}`);
          return response.data;
        }),
        catchError((error: AxiosError) => {
          this.logger.error(
            `Error notifying backend for ${phoneNumber}: ${error.message}`,
            error.stack,
          );
          return throwError(() => error);
        }),
      );
  }

  /**
   * Make a GET request to the backend
   * @param path - API endpoint path
   * @param config - Request configuration (params, headers, etc.)
   */
  async get(path: string, config?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`GET ${url}`);

    try {
      const response = await this.httpService.axiosRef.get(url, config);
      return response;
    } catch (error: any) {
      this.logger.error(`Error GET ${url}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make a POST request to the backend
   * @param path - API endpoint path
   * @param data - Request body data
   * @param config - Request configuration (headers, etc.)
   */
  async post(path: string, data?: any, config?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`POST ${url}`);

    try {
      const response = await this.httpService.axiosRef.post(url, data, config);
      return response;
    } catch (error: any) {
      this.logger.error(`Error POST ${url}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the agent can process a message
   * Returns agent configuration and authorized groups
   * @param userId - ID of the connected WhatsApp account (e.g., "237657888690@c.us")
   * @param chatId - ID of the chat where the message was received
   * @param message - The message content
   * @param contactLabels - Labels of the contact sending the message
   */
  async canProcess(
    userId: string,
    chatId: string,
    message: string,
    contactLabels?: Array<{ id: string; name: string; hexColor: string }>,
  ): Promise<CanProcessResponse> {
    const url = `${this.baseUrl}/agent/can-process`;
    this.logger.debug(`POST ${url} for userId: ${userId}, chatId: ${chatId}`);

    try {
      const requestData: CanProcessRequest = {
        userId,
        chatId,
        message,
        contactLabels,
        timestamp: new Date().toISOString(),
      };

      const response = await this.httpService.axiosRef.post<CanProcessResponse>(
        url,
        requestData,
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Error checking can-process for userId ${userId}, chatId ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Log an agent operation to the backend with full metrics
   */
  async logOperation(data: {
    chatId: string;
    agentId?: string;
    userId?: string;
    userMessage: string;
    agentResponse: string;
    systemPrompt: string;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    durationMs: number;
    modelName?: string;
    toolsUsed?: ToolExecution[];
    status: 'success' | 'error' | 'rate_limited';
    error?: string;
    metadata?: Record<string, any>;
  }): Promise<LogOperationResponse> {
    const url = `${this.baseUrl}/agent/log-operation`;
    this.logger.debug(`POST ${url} for chatId: ${data.chatId}`);

    try {
      const requestData: LogOperationRequest = {
        ...data,
        timestamp: new Date().toISOString(),
      };

      const response =
        await this.httpService.axiosRef.post<LogOperationResponse>(
          url,
          requestData,
        );

      return response.data;
    } catch (error: any) {
      // Log operation errors are non-critical, just log them
      this.logger.warn(
        `Failed to log operation for ${data.chatId}: ${error.message}`,
      );
      return { success: false };
    }
  }

  /**
   * Upload media (base64 buffer) to backend to get a signed URL
   */
  async uploadMedia(payload: UploadMediaRequest): Promise<UploadMediaResponse> {
    const url = `${this.baseUrl}/message-metadata/upload-media`;
    this.logger.debug(`POST ${url} for message ${payload.messageId}`);

    const response = await this.httpService.axiosRef.post<UploadMediaResponse>(
      url,
      payload,
    );
    return response.data;
  }

  /**
   * Upsert message metadata (AUDIO/IMAGE)
   */
  async upsertMessageMetadata(
    payload: UpsertMessageMetadataRequest,
  ): Promise<UpsertMessageMetadataResponse> {
    const url = `${this.baseUrl}/message-metadata/upsert`;
    this.logger.debug(
      `POST ${url} for message ${payload.messageId} (${payload.type})`,
    );

    const response =
      await this.httpService.axiosRef.post<UpsertMessageMetadataResponse>(
        url,
        payload,
      );
    return response.data;
  }

  /**
   * Fetch metadata for a list of message IDs (for context building)
   */
  async fetchMetadataList(
    payload: MessageMetadataListRequest,
  ): Promise<MessageMetadataListResponse> {
    const url = `${this.baseUrl}/message-metadata/list`;
    this.logger.debug(
      `POST ${url} for ${payload.messageIds.length} messageIds`,
    );

    const response =
      await this.httpService.axiosRef.post<MessageMetadataListResponse>(
        url,
        payload,
      );
    return response.data;
  }

  /**
   * Delete media from backend storage (MinIO)
   */
  async deleteMedia(payload: DeleteMediaRequest): Promise<DeleteMediaResponse> {
    const url = `${this.baseUrl}/message-metadata/delete-media`;
    this.logger.debug(`POST ${url} for objectKey ${payload.objectKey}`);

    const response = await this.httpService.axiosRef.post<DeleteMediaResponse>(
      url,
      payload,
    );
    return response.data;
  }

  async getSampleProducts(
    max = 20,
    perCollection = 3,
  ): Promise<InternalProductSample[]> {
    return this.internalGet<InternalProductSample[]>(
      '/agent-internal/products/sample',
      { max, perCollection },
    );
  }

  async getProductByRetailerId(
    retailerId: string,
  ): Promise<InternalProductMatch | null> {
    const encodedRetailerId = encodeURIComponent(retailerId);
    return this.internalGet<InternalProductMatch | null>(
      `/agent-internal/products/by-retailer-id/${encodedRetailerId}`,
    );
  }

  async getProductByAnyId(
    productId: string,
  ): Promise<InternalProductIdMatch | null> {
    const encodedProductId = encodeURIComponent(productId);
    return this.internalGet<InternalProductIdMatch | null>(
      `/agent-internal/products/by-id/${encodedProductId}`,
    );
  }

  async getProductsByAnyIds(
    productIds: string[],
  ): Promise<InternalProductByAnyIdsEntry[]> {
    const ids = Array.from(
      new Set((productIds || []).map((id) => String(id || '').trim())),
    ).filter(Boolean);

    if (ids.length === 0) {
      return [];
    }

    return this.internalGet<InternalProductByAnyIdsEntry[]>(
      '/agent-internal/products/by-ids',
      {
        ids: ids.join(','),
      },
    );
  }

  async searchProductsByKeywords(params: { keywords: string[] }): Promise<{
    products: InternalProductMatch[];
    matchedKeywords: string[];
  }> {
    return this.internalGet<{
      products: InternalProductMatch[];
      matchedKeywords: string[];
    }>('/agent-internal/products/search-by-keywords', {
      keywords: params.keywords.join(','),
    });
  }

  async getAgentSnapshot(
    forceRefresh = false,
  ): Promise<InternalAgentSnapshotResponse> {
    if (!forceRefresh && this.agentSnapshotCache) {
      return this.agentSnapshotCache;
    }

    if (!forceRefresh && this.agentSnapshotPromise) {
      return this.agentSnapshotPromise;
    }

    this.agentSnapshotPromise = this.internalGet<InternalAgentSnapshotResponse>(
      '/agent-internal/agents/me',
    );

    try {
      const snapshot = await this.agentSnapshotPromise;
      this.agentSnapshotCache = snapshot;
      return snapshot;
    } finally {
      this.agentSnapshotPromise = null;
    }
  }

  invalidateAgentSnapshotCache() {
    this.agentSnapshotCache = null;
  }

  private async updateAgentSnapshot(
    payload: InternalAgentUpdatePayload,
  ): Promise<InternalAgentSnapshotResponse> {
    const snapshot = await this.internalPatch<InternalAgentSnapshotResponse>(
      '/agent-internal/agents/me',
      payload,
    );

    this.agentSnapshotCache = snapshot;
    return snapshot;
  }

  async getAgentCustomPrompt(): Promise<InternalCustomPromptResponse | null> {
    const snapshot = await this.getAgentSnapshot();

    return {
      id: snapshot.agent.id,
      customDescriptionPrompt: snapshot.agent.customDescriptionPrompt,
      promptGeneratedAt: snapshot.agent.promptGeneratedAt,
      promptBasedOnProductsCount: snapshot.agent.promptBasedOnProductsCount,
    };
  }

  async updateAgentCustomPrompt(payload: {
    customDescriptionPrompt: string;
    promptBasedOnProductsCount?: number;
  }): Promise<InternalCustomPromptResponse> {
    const snapshot = await this.updateAgentSnapshot({
      customDescriptionPrompt: payload.customDescriptionPrompt,
      promptBasedOnProductsCount: payload.promptBasedOnProductsCount,
    });

    return {
      id: snapshot.agent.id,
      customDescriptionPrompt: snapshot.agent.customDescriptionPrompt,
      promptGeneratedAt: snapshot.agent.promptGeneratedAt,
      promptBasedOnProductsCount: snapshot.agent.promptBasedOnProductsCount,
    };
  }

  async getManagementGroup(): Promise<InternalManagementGroupResponse> {
    const snapshot = await this.getAgentSnapshot();
    return snapshot.managementGroup;
  }

  async getProductsForImageIndexing(): Promise<
    InternalProductForImageIndexing[]
  > {
    return this.internalGet<InternalProductForImageIndexing[]>(
      '/agent-internal/products/for-image-indexing',
    );
  }

  async batchUpdateProductImageIndexing(
    updates: InternalProductImageIndexingUpdate[],
  ): Promise<{ updated: number; ignored: number }> {
    return this.internalPatch<{ updated: number; ignored: number }>(
      '/agent-internal/products/cover-image-descriptions',
      { updates },
    );
  }

  async updateAgentImageSyncStatus(payload: InternalImageSyncStatusUpdate) {
    const snapshot = await this.updateAgentSnapshot({
      syncImageStatus: payload.status,
      syncImageError: payload.error,
    });

    return {
      id: snapshot.agent.id,
      syncImageStatus: snapshot.agent.syncImageStatus,
      lastImageSyncDate: snapshot.agent.lastImageSyncDate,
      lastImageSyncError: snapshot.agent.lastImageSyncError,
    } satisfies {
      id: string;
      syncImageStatus: string;
      lastImageSyncDate?: string | null;
      lastImageSyncError?: string | null;
    };
  }
}
