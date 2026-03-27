import { useState, useCallback } from 'react'

export interface OnboardingStep {
  path: string
  step: number
  title: string
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    path: '/onboarding/import',
    step: 0,
    title: 'Importation de vos données WhatsApp Business',
  },
  {
    path: '/onboarding/review-products',
    step: 1,
    title: 'Vérification de vos produits',
  },
  {
    path: '/onboarding/business-info',
    step: 2,
    title: 'Informations de votre boutique',
  },
  { path: '/onboarding/advanced-options', step: 3, title: 'Options avancées' },
]

export function useOnboarding(currentPath: string) {
  const currentStepIndex = ONBOARDING_STEPS.findIndex(
    step => step.path === currentPath
  )
  const currentStep = ONBOARDING_STEPS[currentStepIndex]

  const [canProceed, setCanProceed] = useState(false)

  const getNextStep = useCallback(() => {
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      return ONBOARDING_STEPS[currentStepIndex + 1]
    }
    return null
  }, [currentStepIndex])

  const getPreviousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      return ONBOARDING_STEPS[currentStepIndex - 1]
    }
    return null
  }, [currentStepIndex])

  const hasNext = currentStepIndex < ONBOARDING_STEPS.length - 1
  const hasPrevious = currentStepIndex > 0
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1

  return {
    currentStep,
    currentStepNumber: currentStepIndex,
    totalSteps: ONBOARDING_STEPS.length,
    canProceed,
    setCanProceed,
    getNextStep,
    getPreviousStep,
    hasNext,
    hasPrevious,
    isFirstStep,
    isLastStep,
  }
}
