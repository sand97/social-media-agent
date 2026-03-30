import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly errors?: unknown[],
    readonly responseBody?: unknown,
  ) {
    super(message);
  }
}

type CloudflareDnsRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
  created_on: string;
  modified_on: string;
};

type CloudflareApiResponse<T> = {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
};

type CloudflareListResponse<T> = CloudflareApiResponse<T[]> & {
  result_info: {
    page: number;
    per_page: number;
    total_count: number;
    count: number;
  };
};

@Injectable()
export class CloudflareDnsService {
  private readonly logger = new Logger(CloudflareDnsService.name);

  constructor(private readonly configService: ConfigService) {}

  async createDnsRecord(
    name: string,
    ip: string,
  ): Promise<CloudflareDnsRecord> {
    const zoneId = this.getZoneId();
    const payload = {
      content: ip,
      name,
      proxied: true,
      ttl: 1,
      type: 'A',
    };

    this.logger.log(
      `[cloudflare_create_dns] name=${name} ip=${ip} proxied=true`,
    );

    const response = await this.request<
      CloudflareApiResponse<CloudflareDnsRecord>
    >(`/zones/${zoneId}/dns_records`, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    return response.result;
  }

  async deleteDnsRecord(recordId: string): Promise<void> {
    const zoneId = this.getZoneId();

    this.logger.warn(`[cloudflare_delete_dns] record_id=${recordId}`);

    try {
      await this.request(`/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (error instanceof CloudflareApiError && error.status === 404) {
        this.logger.warn(
          `[cloudflare_delete_dns] record ${recordId} not found, skipping`,
        );
        return;
      }
      throw error;
    }
  }

  async listDnsRecords(nameFilter?: string): Promise<CloudflareDnsRecord[]> {
    const zoneId = this.getZoneId();
    const params = new URLSearchParams({ type: 'A', per_page: '100' });
    if (nameFilter) {
      params.set('name', nameFilter);
    }

    this.logger.log(`[cloudflare_list_dns] filter=${nameFilter || 'none'}`);

    const response = await this.request<
      CloudflareListResponse<CloudflareDnsRecord>
    >(`/zones/${zoneId}/dns_records?${params.toString()}`);

    return response.result;
  }

  async getDnsRecord(recordId: string): Promise<CloudflareDnsRecord | null> {
    const zoneId = this.getZoneId();

    try {
      const response = await this.request<
        CloudflareApiResponse<CloudflareDnsRecord>
      >(`/zones/${zoneId}/dns_records/${recordId}`);
      return response.result;
    } catch (error) {
      if (error instanceof CloudflareApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private getApiToken(): string {
    const token = this.configService.get<string>('CLOUDFLARE_API_TOKEN');
    if (!token) {
      throw new Error(
        'CLOUDFLARE_API_TOKEN is required for Cloudflare DNS management.',
      );
    }
    return token;
  }

  private getZoneId(): string {
    const zoneId = this.configService.get<string>('CLOUDFLARE_ZONE_ID');
    if (!zoneId) {
      throw new Error(
        'CLOUDFLARE_ZONE_ID is required for Cloudflare DNS management.',
      );
    }
    return zoneId;
  }

  private async request<T = unknown>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `https://api.cloudflare.com/client/v4${path}`;
    const method = init?.method || 'GET';

    this.logger.log(`[cloudflare_request] method=${method} url=${url}`);

    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.getApiToken()}`,
        ...(init?.headers || {}),
      },
    });

    const responseText = await response.text();
    const responseBody = responseText ? this.safeParseJson(responseText) : null;

    this.logger.log(
      `[cloudflare_response] method=${method} status=${response.status}`,
    );

    if (!response.ok) {
      const errors =
        typeof responseBody === 'object' &&
        responseBody !== null &&
        'errors' in responseBody &&
        Array.isArray(responseBody.errors)
          ? responseBody.errors
          : undefined;

      throw new CloudflareApiError(
        `Cloudflare API ${method} ${path} failed (${response.status}): ${responseText}`,
        response.status,
        method,
        path,
        errors,
        responseBody,
      );
    }

    if (
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'success' in responseBody &&
      !responseBody.success
    ) {
      const errors =
        'errors' in responseBody && Array.isArray(responseBody.errors)
          ? responseBody.errors
          : undefined;

      throw new CloudflareApiError(
        `Cloudflare API ${method} ${path} returned success=false`,
        response.status,
        method,
        path,
        errors,
        responseBody,
      );
    }

    return responseBody as T;
  }

  private safeParseJson(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
