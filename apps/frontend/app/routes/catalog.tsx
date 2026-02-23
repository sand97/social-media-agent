import {
  ShopOutlined,
  SyncOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import {
  catalogApi,
  type CatalogData,
  type Product,
  type ImageSyncStatus,
} from '@app/lib/api/catalog'
import { Typography, Empty, Button, message, Spin, Alert } from 'antd'
import useEmblaCarousel from 'embla-carousel-react'
import { useState, useEffect, useMemo, useCallback } from 'react'

const { Text, Paragraph } = Typography

function formatCatalogPrice(
  rawPrice?: number | null,
  rawCurrency?: string | null
) {
  if (rawPrice === null || rawPrice === undefined) return null
  if (!rawCurrency) return null

  const currencyLabel = rawCurrency.trim()
  if (!currencyLabel) return null

  const numericPrice = Number(rawPrice)
  if (!Number.isFinite(numericPrice)) return null

  const majorAmount = numericPrice / 100
  const currencyUpper = currencyLabel.toUpperCase()
  const currencyForIntl = currencyUpper === 'FCFA' ? 'XAF' : currencyUpper

  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currencyForIntl,
    }).format(majorAmount)
  } catch {
    const formatted = new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 2,
    }).format(majorAmount)
    return `${formatted} ${currencyUpper}`
  }
}

export function meta() {
  return [
    { title: 'Catalogue - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Gérez votre catalogue de produits',
    },
  ]
}

function ImageCarousel({ images }: { images: Array<{ url: string }> }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })
  const [hovering, setHovering] = useState(false)

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  if (!images || images.length === 0) {
    return (
      <div className='w-full h-48 bg-gradient-to-br from-blue-600 to-pink-500 rounded-t-lg flex items-center justify-center'>
        <ShopOutlined className='text-5xl text-white' />
      </div>
    )
  }

  if (images.length === 1) {
    return (
      <img
        src={images[0].url}
        alt='Product'
        className='w-full h-48 object-cover rounded-t-lg'
      />
    )
  }

  return (
    <div
      className='relative'
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className='overflow-hidden rounded-t-lg' ref={emblaRef}>
        <div className='flex'>
          {images.map((image, index) => (
            <div key={index} className='flex-[0_0_100%] min-w-0'>
              <img
                src={image.url}
                alt={`Product ${index + 1}`}
                className='w-full h-48 object-cover'
              />
            </div>
          ))}
        </div>
      </div>

      {hovering && images.length > 1 && (
        <>
          <Button
            onClick={scrollPrev}
            className='!absolute left-2 top-1/2 !-translate-y-1/2 shadow-lg'
            variant='outlined'
            icon={<LeftOutlined />}
            shape='circle'
          />
          <Button
            onClick={scrollNext}
            className='!absolute right-2 top-1/2 !-translate-y-1/2 shadow-lg'
            variant='outlined'
            icon={<RightOutlined />}
            shape='circle'
          />
        </>
      )}
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const price = formatCatalogPrice(product.price, product.currency)

  return (
    <div className='bg-white rounded-lg  overflow-hidden shadow-card flex flex-col h-full'>
      <ImageCarousel images={product.images} />

      <div className='p-4 flex flex-col flex-1'>
        <Text strong className='block mb-2 text-base'>
          {product.name}
        </Text>

        {product.retailer_id && (
          <Text type='secondary' className='block mb-2 text-sm'>
            #{product.retailer_id}
          </Text>
        )}

        {product.description && (
          <Paragraph
            type='secondary'
            ellipsis={{ rows: 2 }}
            className='mb-3 text-sm flex-1'
          >
            {product.description}
          </Paragraph>
        )}

        {(price || product.category) && (
          <div className='flex items-center justify-between mt-auto gap-2'>
            {product.category && (
              <Text
                type='secondary'
                className='text-xs pr-4 truncate min-w-0 flex-1'
              >
                {product.category}
              </Text>
            )}
            {price && (
              <Text strong className='text-base shrink-0'>
                {price}
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CatalogPage() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [catalogData, setCatalogData] = useState<CatalogData | null>(null)
  const [syncStatus, setSyncStatus] =
    useState<ImageSyncStatus['syncImageStatus']>('PENDING')
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  // Load catalog data
  const loadCatalog = async () => {
    try {
      setIsLoading(true)
      const data = await catalogApi.getCatalog()
      setCatalogData(data)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erreur inconnue'
      message.error({
        content: errorMessage || 'Erreur lors du chargement du catalogue',
        duration: 5,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadImageSyncStatus = async () => {
    try {
      const status = await catalogApi.getImageSyncStatus()
      setSyncStatus(status.syncImageStatus)
      setLastSyncError(status.lastImageSyncError ?? null)
    } catch {
      // no-op: status is non-blocking for catalog rendering
    }
  }

  useEffect(() => {
    loadCatalog()
    loadImageSyncStatus()
  }, [])

  useEffect(() => {
    if (syncStatus !== 'SYNCING') {
      return
    }

    const interval = setInterval(async () => {
      try {
        const status = await catalogApi.getImageSyncStatus()
        setSyncStatus(status.syncImageStatus)
        setLastSyncError(status.lastImageSyncError ?? null)

        if (status.syncImageStatus === 'DONE') {
          message.success({
            content: 'Synchronisation des images terminée',
            key: 'image-sync-status',
            duration: 3,
          })
          await loadCatalog()
        }
      } catch {
        // ignore polling errors; next tick will retry
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [syncStatus])

  const handleForceSync = async () => {
    try {
      setIsSyncing(true)
      message.loading({ content: 'Synchronisation en cours...', key: 'sync' })

      const result = await catalogApi.forceSync()

      if (result.success) {
        message.success({
          content: 'Synchronisation lancée !',
          key: 'sync',
          duration: 3,
        })
        setSyncStatus('SYNCING')
        setLastSyncError(null)
      } else {
        message.error({
          content: result.error || 'Échec de la synchronisation',
          key: 'sync',
          duration: 5,
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erreur inconnue'
      message.error({
        content: errorMessage || 'Erreur lors de la synchronisation',
        key: 'sync',
        duration: 5,
      })
    } finally {
      setIsSyncing(false)
    }
  }

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!catalogData) return { collections: 0, products: 0 }

    const collectionsCount = catalogData.collections.length
    const productsInCollections = catalogData.collections.reduce(
      (sum, col) => sum + col.products.length,
      0
    )
    const productsCount =
      productsInCollections + catalogData.uncategorizedProducts.length

    return { collections: collectionsCount, products: productsCount }
  }, [catalogData])

  const headerTitle = `${statistics.collections} collection${
    statistics.collections > 1 ? 's' : ''
  }, ${statistics.products} produit${statistics.products > 1 ? 's' : ''}`

  const hasContent = useMemo(() => {
    if (!catalogData) return false
    return (
      catalogData.collections.length > 0 ||
      catalogData.uncategorizedProducts.length > 0
    )
  }, [catalogData])

  if (isLoading) {
    return (
      <div className='flex items-center justify-center w-full h-full'>
        <Spin size='large' />
      </div>
    )
  }

  return (
    <>
      <DashboardHeader
        title={headerTitle}
        right={
          <Button
            className={'!h-9 !py-0'}
            variant={'outlined'}
            onClick={handleForceSync}
            loading={isSyncing}
            icon={<SyncOutlined spin={isSyncing} />}
          >
            Synchroniser
          </Button>
        }
      />
      <div className='flex flex-col gap-6 w-full py-6 px-6'>
        {syncStatus === 'SYNCING' && (
          <Alert
            message='Synchronisation des images en cours'
            description='Indexation des images produits pour la recherche visuelle.'
            type='info'
            showIcon
            className='mb-4'
            action={
              <Button
                size='small'
                type='text'
                icon={<SyncOutlined spin />}
                onClick={loadImageSyncStatus}
              >
                Rafraîchir
              </Button>
            }
          />
        )}

        {syncStatus === 'FAILED' && (
          <Alert
            message='Échec de la synchronisation des images'
            description={
              lastSyncError ||
              "Certaines images n'ont pas pu être indexées. Vous pouvez relancer la synchronisation."
            }
            type='error'
            showIcon
            className='mb-4'
            action={
              <Button size='small' danger onClick={handleForceSync}>
                Réessayer
              </Button>
            }
          />
        )}

        {hasContent ? (
          <>
            {/* Collections and their products */}
            {catalogData?.collections.map((collection, index) => (
              <div key={index} className='flex flex-col gap-4'>
                {/* Collection Header */}
                <div>
                  <Text className='text-lg block'>{collection.name}</Text>
                  <Text type='secondary' className='text-sm'>
                    {collection.products.length} produit
                    {collection.products.length > 1 ? 's' : ''}
                  </Text>
                </div>

                {/* Products Grid */}
                <div className='grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4'>
                  {collection.products.map((product, productIndex) => (
                    <ProductCard key={productIndex} product={product} />
                  ))}
                </div>
              </div>
            ))}

            {/* Uncategorized Products */}
            {catalogData && catalogData.uncategorizedProducts.length > 0 && (
              <div className='flex flex-col gap-4'>
                {/* Uncategorized Header */}
                <div>
                  <Text className='text-lg block'>
                    Produits non catégorisés
                  </Text>
                  <Text type='secondary' className='text-sm'>
                    {catalogData.uncategorizedProducts.length} produit
                    {catalogData.uncategorizedProducts.length > 1 ? 's' : ''}
                  </Text>
                </div>

                {/* Products Grid */}
                <div className='grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4'>
                  {catalogData.uncategorizedProducts.map(
                    (product, productIndex) => (
                      <ProductCard key={productIndex} product={product} />
                    )
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className='p-6'>
            <Empty
              image={
                <div className='w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto'>
                  <ShopOutlined className='text-2xl text-[#494949]' />
                </div>
              }
              description={
                <div className='flex flex-col gap-2'>
                  <Text strong>Aucun résultat</Text>
                  <Text type='secondary'>
                    Importez votre catalogue WhatsApp Business pour commencer
                  </Text>
                </div>
              }
            />
          </div>
        )}
      </div>
    </>
  )
}
