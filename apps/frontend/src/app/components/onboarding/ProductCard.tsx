import { Card, Button, Checkbox, Image, Tag } from 'antd'
import { useState } from 'react'

import { AIAnalysisPanel } from './AIAnalysisPanel'

interface Product {
  id: string
  name: string
  description: string
  price: number
  currency?: string
  image?: string
  approved?: boolean
}

interface ProductCardProps {
  product: Product
  onApprove: (productId: string, approved: boolean) => void
  onAnalyze: (productId: string) => Promise<AISuggestion[]>
}

export interface AISuggestion {
  type: 'spelling' | 'metadata' | 'improvement'
  field: string
  current: string
  suggested: string
  reason: string
}

export function ProductCard({
  product,
  onApprove,
  onAnalyze,
}: ProductCardProps) {
  const [analyzing, setAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [showAnalysis, setShowAnalysis] = useState(false)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const result = await onAnalyze(product.id)
      setSuggestions(result)
      setShowAnalysis(true)
    } catch (error) {
      console.error("Erreur lors de l'analyse:", error)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleApplySuggestion = (suggestion: AISuggestion) => {
    // This would update the product data
    console.log('Applying suggestion:', suggestion)
    // Remove the applied suggestion
    setSuggestions(prev => prev.filter(s => s !== suggestion))
  }

  const formatPrice = (price: number, currency?: string) => {
    if (!currency) return null
    const trimmed = currency.trim()
    if (!trimmed) return null

    const currencyUpper = trimmed.toUpperCase()
    const currencyForIntl = currencyUpper === 'FCFA' ? 'XAF' : currencyUpper
    const majorAmount = price / 100

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

  const formattedPrice = formatPrice(product.price, product.currency)

  return (
    <Card className='mb-4 hover:shadow-md transition-shadow'>
      <div className='flex gap-4'>
        {/* Product Image */}
        <div className='flex-shrink-0'>
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              width={120}
              height={120}
              className='rounded-lg object-cover'
              fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect fill='%23f0f0f0' width='120' height='120'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EPas d'image%3C/text%3E%3C/svg%3E"
            />
          ) : (
            <div className='w-[120px] h-[120px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400'>
              Pas d'image
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className='flex-1'>
          <div className='flex items-start justify-between mb-2'>
            <div>
              <h3 className='text-lg font-semibold text-gray-900'>
                {product.name}
              </h3>
              <p className='text-sm text-gray-600 mt-1'>
                {product.description}
              </p>
            </div>
            {formattedPrice && (
              <Tag color='green' className='text-base font-semibold px-3 py-1'>
                {formattedPrice}
              </Tag>
            )}
          </div>

          {/* Actions */}
          <div className='flex items-center gap-3 mt-4'>
            <Button
              type='primary'
              loading={analyzing}
              onClick={handleAnalyze}
              disabled={showAnalysis}
            >
              {showAnalysis ? 'Analysé' : "Analyser avec l'IA"}
            </Button>

            <Checkbox
              checked={product.approved}
              onChange={e => onApprove(product.id, e.target.checked)}
            >
              <span className='font-medium'>Approuvé</span>
            </Checkbox>
          </div>

          {/* AI Analysis Panel */}
          {showAnalysis && (
            <div className='mt-4'>
              <AIAnalysisPanel
                suggestions={suggestions}
                onApply={handleApplySuggestion}
                onDismiss={suggestion =>
                  setSuggestions(prev => prev.filter(s => s !== suggestion))
                }
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
