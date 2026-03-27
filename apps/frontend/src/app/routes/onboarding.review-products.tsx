import { OnboardingLayout } from '@app/components/onboarding/OnboardingLayout'
import {
  ProductCard,
  type AISuggestion,
} from '@app/components/onboarding/ProductCard'
import { useOnboarding } from '@app/hooks/useOnboarding'
import apiClient from '@app/lib/api/client'
import { Button, Space, Empty, Spin, message } from 'antd'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Product {
  id: string
  name: string
  description: string
  price: number
  currency?: string
  image?: string
  approved?: boolean
}

export function meta() {
  return [
    { title: 'Vérification des produits - WhatsApp Agent' },
    {
      name: 'description',
      content: "Vérifiez et analysez vos produits avec l'IA",
    },
  ]
}

export default function OnboardingReviewProducts() {
  const navigate = useNavigate()
  const { currentStep, currentStepNumber } = useOnboarding(
    '/onboarding/review-products'
  )
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzingAll, setAnalyzingAll] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      setLoading(true)
      // TODO: Replace with actual API endpoint
      const response = await apiClient.get('/products')
      setProducts(response.data)
    } catch (error) {
      console.error('Erreur lors du chargement des produits:', error)
      message.error('Impossible de charger les produits')
      // Mock data for development
      setProducts([
        {
          id: '1',
          name: 'T-shirt Premium',
          description: 'T-shirt en coton de qualité supérieure',
          price: 1500000,
          currency: 'XAF',
          image: undefined,
          approved: false,
        },
        {
          id: '2',
          name: 'Jean Slim',
          description: 'Jean slim fit confortable',
          price: 2500000,
          currency: 'XAF',
          image: undefined,
          approved: false,
        },
        {
          id: '3',
          name: 'Sneakers Sport',
          description: 'Chaussures de sport respirantes',
          price: 3500000,
          currency: 'XAF',
          image: undefined,
          approved: false,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = (productId: string, approved: boolean) => {
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, approved } : p))
    )
  }

  const handleAnalyze = async (productId: string): Promise<AISuggestion[]> => {
    try {
      // TODO: Replace with actual whatsapp-agent API endpoint
      const response = await apiClient.post(`/ai/analyze-product/${productId}`)
      return response.data.suggestions
    } catch (error) {
      console.error("Erreur lors de l'analyse:", error)
      // Mock suggestions for development
      return [
        {
          type: 'spelling',
          field: 'Nom du produit',
          current: 'T-shirt Premium',
          suggested: 'T-shirt Premium',
          reason: 'Orthographe correcte',
        },
        {
          type: 'improvement',
          field: 'Description',
          current: 'T-shirt en coton de qualité supérieure',
          suggested:
            'T-shirt en coton 100% bio de qualité supérieure, coupe moderne et confortable',
          reason: 'Description plus détaillée et attrayante pour les clients',
        },
        {
          type: 'metadata',
          field: 'Catégorie',
          current: 'Non définie',
          suggested: 'Vêtements > Hauts > T-shirts',
          reason: 'Catégorisation pour une meilleure organisation',
        },
      ]
    }
  }

  const handleAnalyzeAll = async () => {
    setAnalyzingAll(true)
    try {
      // Analyze all products sequentially
      for (const product of products) {
        await handleAnalyze(product.id)
      }
      message.success('Tous les produits ont été analysés')
    } catch (error) {
      message.error("Erreur lors de l'analyse des produits")
    } finally {
      setAnalyzingAll(false)
    }
  }

  const handleContinue = () => {
    navigate('/onboarding/business-info')
  }

  const handlePrevious = () => {
    navigate('/onboarding/import')
  }

  const allApproved = products.length > 0 && products.every(p => p.approved)

  if (loading) {
    return (
      <OnboardingLayout
        currentStep={currentStepNumber}
        title={currentStep?.title || ''}
      >
        <div className='flex justify-center items-center py-20'>
          <Spin size='large' />
        </div>
      </OnboardingLayout>
    )
  }

  return (
    <OnboardingLayout
      currentStep={currentStepNumber}
      title={currentStep?.title || ''}
    >
      <div className='space-y-6'>
        {products.length === 0 ? (
          <Empty description='Aucun produit trouvé' className='py-12'>
            <Button type='primary' onClick={handleContinue}>
              Continuer sans produits
            </Button>
          </Empty>
        ) : (
          <>
            {/* Products List */}
            <div className='space-y-4'>
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onApprove={handleApprove}
                  onAnalyze={handleAnalyze}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className='flex items-center justify-between pt-6 border-t'>
              <Button size='large' onClick={handlePrevious}>
                Précédent
              </Button>

              <Space>
                <Button
                  size='large'
                  loading={analyzingAll}
                  onClick={handleAnalyzeAll}
                >
                  Tout analyser
                </Button>

                <Button
                  type='primary'
                  size='large'
                  onClick={handleContinue}
                  disabled={!allApproved && products.length > 0}
                >
                  Continuer
                  {!allApproved && products.length > 0 && (
                    <span className='ml-2 text-xs'>
                      ({products.filter(p => p.approved).length}/
                      {products.length} approuvés)
                    </span>
                  )}
                </Button>
              </Space>
            </div>

            {!allApproved && products.length > 0 && (
              <p className='text-sm text-gray-500 text-center'>
                Veuillez approuver tous les produits pour continuer
              </p>
            )}
          </>
        )}
      </div>
    </OnboardingLayout>
  )
}
