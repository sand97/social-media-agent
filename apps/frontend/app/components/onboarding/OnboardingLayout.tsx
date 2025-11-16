import type { ReactNode } from 'react'
import { Steps } from 'antd'

interface OnboardingLayoutProps {
  children: ReactNode
  currentStep: number
  title: string
}

const steps = [
  { title: 'Import' },
  { title: 'Produits' },
  { title: 'Boutique' },
  { title: 'Options' },
]

export function OnboardingLayout({ children, currentStep, title }: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Progress Stepper */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <Steps current={currentStep} items={steps} />
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}
