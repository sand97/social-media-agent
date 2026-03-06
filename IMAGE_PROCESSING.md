# Image Processing Strategy - WhatsApp Agent

## Overview

This document defines the production image matching flow used by the WhatsApp agent.

Goals:
1. Identify products from incoming contact images with minimal cost.
2. Stop early when a confident match is found.
3. Keep one source of truth for both webhook runtime and test endpoint.

## Runtime Pipeline (single source of truth)

The pipeline is implemented in `ImageProductMatchingService` and is reused by:
1. Webhook image handler (`ImageMessageHandlerService`)
2. Test endpoint (`POST /test/image-pipeline`)

Execution order:
1. OCR on original image buffer (no crop before OCR).
2. Keyword extraction from OCR text.
3. Retailer matching via backend `search-by-keywords` (retailer_id only).
4. If no match:
   - Crop with OpenCV (`SmartCropService.cropOpenCV`)
   - Generate local CLIP image embedding
   - Search in Qdrant `product-images`
5. If still no match:
   - Generate Gemini Vision description
   - Generate Gemini text embedding from that description
   - Search in Qdrant `product-text`
6. Build `[IMAGE_CONTEXT]` block and payload for agent context.

Hard rule:
- Gemini Vision description is not called when OCR retailer match or Qdrant image match already succeeded.

## Search Methods

Possible `searchMethod` values:
1. `ocr_keywords`
2. `qdrant_image`
3. `qdrant_text`
4. `none`
5. `error`

Returned payload contains:
1. OCR text and extracted keywords
2. Matched keywords
3. Matched products
4. Confidence / similarity
5. Crop metadata
6. Agent-ready context payload (`body`, `imageContextBlock`, etc.)

## Qdrant Collections

Collections:
1. `product-images` -> image embeddings (local CLIP model)
2. `product-text` -> text embeddings (Gemini text embedding)

Reset endpoint (internal JWT protected):
- `POST /image-processing/reset-qdrant`

Behavior:
1. Delete both collections if they exist.
2. Recreate both collections with configured vector sizes.
3. Return collection names and dimensions.

## Catalog Indexing

`ProductImageIndexingService` indexing behavior:
1. For image collection (`product-images`):
   - Download image
   - Generate local CLIP image embedding
   - Index image variant metadata
2. For text collection (`product-text`):
   - Build text from name + description + cover description
   - Generate text embedding
   - Index text metadata

Cover description generation by Gemini Vision is used only for text enrichment when needed.

## OCR Product Search Rule

Backend OCR keyword search is retailer-only.

`ProductsService.searchByKeywords`:
1. Input: `userId`, `keywords`
2. Match only against `retailer_id`
3. Returns matching products and matched keywords

No matching on `name`, `description`, or `category`.

## Test Endpoint

Public test endpoint:
- `POST /test/image-pipeline`

Purpose:
1. Run the exact production pipeline on an uploaded image.
2. Return full pipeline output for debugging and iteration.

All previous legacy debug endpoints (OCR/Qdrant/crop split endpoints) are removed.

## Upload Image Object Key

Catalog image upload now stores files without `collectionId` in path.

Object key format:
- `{agentId}/catalog/images/{userId}-{productId}-{imageIndex}.{ext}`

`collectionId` is no longer required in `POST /catalog/upload-image` payload.

## Environment Variables

Common keys:
1. `GEMINI_API_KEY`
2. `CLIP_IMAGE_MODEL` (default `Xenova/clip-vit-base-patch16`)
3. `GEMINI_VISION_MODEL`
4. `QDRANT_API_URL`
5. `QDRANT_API_KEY`
6. `QDRANT_IMAGE_COLLECTION` (default `product-images`)
7. `QDRANT_TEXT_COLLECTION` (default `product-text`)
8. `QDRANT_IMAGE_VECTOR_SIZE` (recommended: align with the active image model output dimension)
9. `QDRANT_TEXT_VECTOR_SIZE` (default `768`)
10. `QDRANT_IMAGE_THRESHOLD`
11. `QDRANT_TEXT_THRESHOLD`
12. `IMAGE_CROPPER_URL`

## Acceptance Checklist

1. OCR retailer-only returns matches only when retailer_id contains OCR keywords.
2. If OCR match succeeds, no Qdrant or Gemini Vision fallback call.
3. If OCR fails and Qdrant image succeeds, no Gemini Vision description call.
4. If both fail, Gemini Vision + Qdrant text fallback runs.
5. Test endpoint output is consistent with webhook behavior.
6. Qdrant reset endpoint recreates both collections.
7. Catalog image upload works without `collectionId`.
