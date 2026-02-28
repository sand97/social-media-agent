/**
 * Types pour le catalogue WhatsApp Business
 */

import { Prisma } from '@app/generated/client';

export interface ImageUrl {
  key: 'requested' | 'full';
  value: string;
}

export interface ReviewStatus {
  key: string;
  value: string;
}

export interface UploadedImage {
  index: number;
  type: 'main' | 'additional';
  url: string; // URL MinIO
  originalUrl?: string; // URL WhatsApp originale complète
  normalizedUrl?: string; // URL normalisée (sans query params) pour comparaison
  whatsappImageHash?: string | null; // Hash WhatsApp de l'image si disponible
}

export interface CatalogProduct {
  id: string;
  retailer_id?: string;
  name: string;
  description?: string;
  url?: string;
  currency?: string | null;
  price?: number | null;
  is_hidden?: boolean;
  is_sanctioned?: boolean;
  max_available?: number;
  availability?: string;
  checkmark?: boolean;
  image_hashes_for_whatsapp?: string[];
  image_cdn_urls?: ImageUrl[];
  additional_image_cdn_urls?: ImageUrl[][];
  whatsapp_product_can_appeal?: boolean;
  capability_to_review_status?: ReviewStatus[];
  videos?: unknown[];
  uploadedImages?: UploadedImage[]; // Ajouté par le script après upload
}

export interface CatalogCollection {
  id: string;
  name?: string;
  description?: string;
  products?: CatalogProduct[];
}

export interface CatalogData {
  collections: CatalogCollection[];
  uncategorizedProducts?: CatalogProduct[];
}

export interface BusinessHoursConfig {
  mode: string;
  [key: string]: unknown;
}

export interface BusinessHours {
  config: {
    sun?: BusinessHoursConfig;
    mon?: BusinessHoursConfig;
    tue?: BusinessHoursConfig;
    wed?: BusinessHoursConfig;
    thu?: BusinessHoursConfig;
    fri?: BusinessHoursConfig;
    sat?: BusinessHoursConfig;
  };
  timezone?: string;
}

export interface Category {
  id: string;
  localized_display_name: string;
}

export interface ProfileOptions {
  commerceExperience?: string;
  cartEnabled?: boolean;
  [key: string]: unknown;
}

export interface ClientInfoData {
  isBusiness: boolean;
  profileName?: string;
  whatsappId?: string;
  avatarUrl?: string;
  businessProfile?: {
    tag?: string;
    description?: string;
    categories?: Category[];
    profileOptions?: ProfileOptions;
    email?: string;
    website?: Array<{ url: string }>;
    latitude?: number;
    longitude?: number;
    businessHours?: BusinessHours;
  };
}

/**
 * Type pour les données d'insertion de BusinessInfo
 */
export type BusinessInfoCreateInput =
  | Prisma.BusinessInfoCreateInput
  | Prisma.BusinessInfoUpdateInput;

/**
 * Type pour les données d'insertion de Product
 */
export type ProductUpsertData = Omit<
  Prisma.ProductCreateInput,
  'user' | 'collection'
> & {
  collection_id?: string;
};
