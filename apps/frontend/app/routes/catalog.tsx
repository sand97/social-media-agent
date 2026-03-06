import { ShopOutlined, SyncOutlined } from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import {
  catalogApi,
  type CatalogData,
  type Product,
} from '@app/lib/api/catalog'
import { Alert, Button, Empty, Progress, message, Spin, Typography } from 'antd'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const { Text } = Typography

const LazyCatalogProductCard = lazy(
  () => import('@app/components/catalog/CatalogProductCard')
)
const INDEXING_ALERT_DISMISSED_KEY = 'catalog-indexing-alert-dismissed'

function ProductCardSkeleton() {
  return (
    <div className='bg-white rounded-lg overflow-hidden shadow-card flex flex-col h-full animate-pulse'>
      <div className='h-48 bg-gray-200 rounded-t-lg' />
      <div className='p-4 flex flex-col gap-3 flex-1'>
        <div className='h-4 bg-gray-200 rounded w-4/5' />
        <div className='h-3 bg-gray-100 rounded w-2/5' />
        <div className='h-3 bg-gray-100 rounded w-full' />
        <div className='h-3 bg-gray-100 rounded w-4/5' />
        <div className='mt-auto h-4 bg-gray-200 rounded w-1/3' />
      </div>
    </div>
  )
}

function ViewportLazyRender({
  children,
  placeholder,
}: {
  children: ReactNode
  placeholder?: ReactNode
}) {
  const [isVisible, setIsVisible] = useState(false)
  const containerId = useId()

  useEffect(() => {
    if (isVisible) return

    const node = document.getElementById(containerId)
    if (!node) return

    if (typeof window === 'undefined') return
    if (typeof window.IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }

    const observer = new window.IntersectionObserver(
      entries => {
        const hasVisibleEntry = entries.some(
          entry => entry.isIntersecting || entry.intersectionRatio > 0
        )

        if (hasVisibleEntry) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '300px 0px',
        threshold: 0.01,
      }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [containerId, isVisible])

  return (
    <div id={containerId} className='h-full'>
      {isVisible ? children : placeholder || <ProductCardSkeleton />}
    </div>
  )
}

function LazyProductCard({ product }: { product: Product }) {
  const fallback = <ProductCardSkeleton />

  return (
    <ViewportLazyRender placeholder={fallback}>
      <Suspense fallback={fallback}>
        <LazyCatalogProductCard product={product} />
      </Suspense>
    </ViewportLazyRender>
  )
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

export default function CatalogPage() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isIndexingPolling, setIsIndexingPolling] = useState(false)
  const [hasPolledAfterSync, setHasPolledAfterSync] = useState(false)
  const [isIndexingAlertDismissed, setIsIndexingAlertDismissed] =
    useState(false)
  const [catalogData, setCatalogData] = useState<CatalogData | null>(null)

  const loadCatalog = useCallback(
    async ({ withLoader = false, showError = true } = {}) => {
      try {
        if (withLoader) {
          setIsLoading(true)
        }
        const data = await catalogApi.getCatalog()
        setCatalogData(data)
      } catch (error) {
        if (!showError) {
          return
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Erreur inconnue'
        message.error({
          content: errorMessage || 'Erreur lors du chargement du catalogue',
          duration: 5,
        })
      } finally {
        if (withLoader) {
          setIsLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    void loadCatalog({ withLoader: true })
  }, [loadCatalog])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(INDEXING_ALERT_DISMISSED_KEY)
    setIsIndexingAlertDismissed(dismissed === '1')
  }, [])

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

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(INDEXING_ALERT_DISMISSED_KEY)
        }
        setIsIndexingAlertDismissed(false)
        setHasPolledAfterSync(false)
        setIsIndexingPolling(true)
        void loadCatalog({ showError: false })
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

  const indexingStats = useMemo(() => {
    if (!catalogData) {
      return {
        indexedProducts: 0,
        totalProducts: 0,
        progressPercent: 0,
      }
    }

    const allProducts = [
      ...catalogData.collections.flatMap(collection => collection.products),
      ...catalogData.uncategorizedProducts,
    ]

    const totalProducts = allProducts.length
    const indexedProducts = allProducts.filter(
      product => product.needsTextIndexing === false
    ).length
    const progressPercent =
      totalProducts === 0
        ? 100
        : Math.min(100, Math.round((indexedProducts / totalProducts) * 100))

    return {
      indexedProducts,
      totalProducts,
      progressPercent,
    }
  }, [catalogData])

  useEffect(() => {
    if (!isIndexingPolling) return

    if (hasPolledAfterSync && indexingStats.progressPercent >= 100) {
      setIsIndexingPolling(false)
      return
    }

    const intervalId = window.setInterval(() => {
      setHasPolledAfterSync(true)
      void loadCatalog({ showError: false })
    }, 20_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    hasPolledAfterSync,
    isIndexingPolling,
    indexingStats.progressPercent,
    loadCatalog,
  ])

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

  const isIndexingCompleted = indexingStats.progressPercent >= 100
  const shouldShowIndexingAlert =
    hasContent && !(isIndexingCompleted && isIndexingAlertDismissed)
  const indexingAlertDescription = isIndexingCompleted
    ? "Lorsqu'un de vos client nous enverra une image ou un terme concernant l'un de vos produits nos seront capable de l'identifier automatiquement"
    : "Nos IA analyse vos images pour comprendre ce qu'elle contienne, et pouvoir identifier un produit quand un utilisateur envoie une de vos images."

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
            className='!h-9 !py-0'
            variant='outlined'
            onClick={handleForceSync}
            loading={isSyncing}
            icon={<SyncOutlined spin={isSyncing} />}
          >
            Synchroniser
          </Button>
        }
      />
      <div className='flex flex-col gap-6 w-full py-6 px-6'>
        {shouldShowIndexingAlert && (
          <Alert
            type='info'
            showIcon={false}
            className={'bg-white! border-none! shadow-card'}
            closable={isIndexingCompleted}
            onClose={() => {
              if (!isIndexingCompleted) return
              setIsIndexingAlertDismissed(true)
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(INDEXING_ALERT_DISMISSED_KEY, '1')
              }
            }}
            message={
              <div className='flex items-center gap-3'>
                <Progress
                  type='circle'
                  percent={indexingStats.progressPercent}
                  size={46}
                />
                <div className='flex flex-col'>
                  <Text strong>Indexations du contenu</Text>
                  <Text type='secondary' className='text-xs'>
                    {indexingStats.indexedProducts}/
                    {indexingStats.totalProducts} produits indexés
                  </Text>
                </div>
              </div>
            }
            description={indexingAlertDescription}
          />
        )}

        {hasContent ? (
          <>
            {catalogData?.collections
              .filter(collection => collection.products.length > 0)
              .map(collection => (
                <div key={collection.id} className='flex flex-col gap-4'>
                  <div>
                    <Text className='text-lg block'>{collection.name}</Text>
                    <Text type='secondary' className='text-sm'>
                      {collection.products.length} produit
                      {collection.products.length > 1 ? 's' : ''}
                    </Text>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4'>
                    {collection.products.map(product => (
                      <LazyProductCard
                        key={`${collection.id}-${product.id}`}
                        product={product}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {catalogData && catalogData.uncategorizedProducts.length > 0 && (
              <div className='flex flex-col gap-4'>
                <div>
                  <Text className='text-lg block'>
                    Produits non catégorisés
                  </Text>
                  <Text type='secondary' className='text-sm'>
                    {catalogData.uncategorizedProducts.length} produit
                    {catalogData.uncategorizedProducts.length > 1 ? 's' : ''}
                  </Text>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4'>
                  {catalogData.uncategorizedProducts.map(product => (
                    <LazyProductCard
                      key={`uncategorized-${product.id}`}
                      product={product}
                    />
                  ))}
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
