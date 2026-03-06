import {
  EyeInvisibleOutlined,
  LeftOutlined,
  RightOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { type Product } from '@app/lib/api/catalog'
import { Button, Tooltip, Typography } from 'antd'
import useEmblaCarousel from 'embla-carousel-react'
import { memo, useCallback } from 'react'

const { Text, Paragraph } = Typography

function HiddenProductOverlay() {
  return (
    <div className='absolute text-white inset-0 bg-black/50 rounded-t-lg flex items-center justify-center pointer-events-none'>
      <Tooltip title='Produit masqué dans le catalogue'>
        <EyeInvisibleOutlined style={{ fontSize: '32px' }} />
      </Tooltip>
    </div>
  )
}

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

  const currencyUpper = currencyLabel.toUpperCase()
  const currencyForIntl = currencyUpper === 'FCFA' ? 'XAF' : currencyUpper

  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currencyForIntl,
    }).format(numericPrice)
  } catch {
    const formatted = new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 2,
    }).format(numericPrice)
    return `${formatted} ${currencyUpper}`
  }
}

function CatalogImageWithBlurBackground({
  src,
  alt,
}: {
  src: string
  alt: string
}) {
  return (
    <div className='relative w-full h-48 bg-gray-100'>
      <img
        src={src}
        alt=''
        aria-hidden='true'
        className='absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-70'
        loading='lazy'
        decoding='async'
        draggable={false}
      />
      <div className='absolute inset-0 bg-black/10' />
      <img
        src={src}
        alt={alt}
        className='relative z-10 w-full h-full object-contain object-center'
        loading='lazy'
        decoding='async'
        draggable={false}
      />
    </div>
  )
}

function ImageCarousel({
  images,
  isHidden,
}: {
  images: Array<{ url: string }>
  isHidden?: boolean
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  if (!images || images.length === 0) {
    return (
      <div className='w-full h-48 bg-gray-200 rounded-t-lg flex items-center justify-center relative'>
        <ShopOutlined className='text-5xl text-gray-400' />
        {isHidden && <HiddenProductOverlay />}
      </div>
    )
  }

  if (images.length === 1) {
    return (
      <div className='relative rounded-t-lg overflow-hidden'>
        <CatalogImageWithBlurBackground src={images[0].url} alt='Product' />
        {isHidden && <HiddenProductOverlay />}
      </div>
    )
  }

  return (
    <div className='relative group'>
      <div
        className='overflow-hidden rounded-t-lg select-none'
        ref={emblaRef}
        style={{ touchAction: 'pan-y' }}
      >
        <div className='flex'>
          {images.map((image, index) => (
            <div key={index} className='flex-[0_0_100%] min-w-0'>
              <CatalogImageWithBlurBackground
                src={image.url}
                alt={`Product ${index + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      {isHidden && <HiddenProductOverlay />}

      {images.length > 1 && (
        <>
          <Button
            onClick={scrollPrev}
            className='!absolute left-2 top-1/2 !-translate-y-1/2 shadow-lg !z-10 !opacity-0 !pointer-events-none group-hover:!opacity-100 group-hover:!pointer-events-auto transition-opacity'
            variant='outlined'
            icon={<LeftOutlined />}
            shape='circle'
          />
          <Button
            onClick={scrollNext}
            className='!absolute right-2 top-1/2 !-translate-y-1/2 shadow-lg !z-10 !opacity-0 !pointer-events-none group-hover:!opacity-100 group-hover:!pointer-events-auto transition-opacity'
            variant='outlined'
            icon={<RightOutlined />}
            shape='circle'
          />
        </>
      )}
    </div>
  )
}

function CatalogProductCardComponent({ product }: { product: Product }) {
  const price = formatCatalogPrice(product.price, product.currency)

  return (
    <div className='bg-white rounded-lg overflow-hidden shadow-card flex flex-col h-full'>
      <ImageCarousel images={product.images} isHidden={product.is_hidden} />

      <div className='p-4 flex flex-col flex-1'>
        <Text strong className='block mb-2 text-base'>
          {product.name}
        </Text>

        {product.retailer_id && (
          <Text type='secondary' className='block mb-2 text-sm'>
            {'#'.concat(product.retailer_id).replaceAll('##', '#')}
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

const CatalogProductCard = memo(CatalogProductCardComponent)

export default CatalogProductCard
