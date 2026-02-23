import apiClient from './client'

export interface CatalogSyncResult {
  success: boolean
  backendSync?: any
  agentSync?: any
  imageSync?: {
    queued: boolean
    status: 'SYNCING'
  }
  error?: string
}

export interface ImageSyncStatus {
  syncImageStatus: 'PENDING' | 'SYNCING' | 'DONE' | 'FAILED'
  lastImageSyncDate?: string | null
  lastImageSyncError?: string | null
}

export interface ProductImage {
  id: string
  product_id: string
  url: string
  original_url?: string
  normalized_url?: string
  image_type: string
  image_index: number
  created_at: string
}

export interface ProductMetadata {
  id: string
  product_id: string
  key: string
  value: string
  is_visible: boolean
  suggested_by_ai: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  user_id: string
  whatsapp_product_id?: string
  collection_id?: string
  name: string
  description?: string
  price?: number
  currency?: string
  category?: string
  retailer_id?: string
  availability?: string
  max_available?: number
  is_hidden: boolean
  is_sanctioned: boolean
  checkmark: boolean
  url?: string
  capability_to_review_status?: any
  whatsapp_product_can_appeal: boolean
  image_hashes_for_whatsapp: string[]
  videos?: any
  ai_suggestions?: any
  created_at: string
  updated_at: string
  images: ProductImage[]
  metadata: ProductMetadata[]
}

export interface Collection {
  id: string
  user_id: string
  whatsapp_collection_id?: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  products: Product[]
}

export interface CatalogData {
  success: boolean
  collections: Collection[]
  uncategorizedProducts: Product[]
}

export const catalogApi = {
  /**
   * Force catalog synchronization
   * Triggers sync for both backend and whatsapp-agent
   */
  async forceSync(): Promise<CatalogSyncResult> {
    const response = await apiClient.post<CatalogSyncResult>(
      '/catalog/force-sync'
    )
    return response.data
  },

  /**
   * Get user catalog (collections and products)
   */
  async getCatalog(): Promise<CatalogData> {
    const response = await apiClient.get<CatalogData>('/catalog')
    return response.data
  },

  async getImageSyncStatus(): Promise<ImageSyncStatus> {
    const response = await apiClient.get<ImageSyncStatus>(
      '/catalog/image-sync-status'
    )
    return response.data
  },
}
