import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Alert, Button, Tag, Space } from 'antd'

import type { AISuggestion } from './ProductCard'

interface AIAnalysisPanelProps {
  suggestions: AISuggestion[]
  onApply: (suggestion: AISuggestion) => void
  onDismiss: (suggestion: AISuggestion) => void
}

const suggestionTypeLabels: Record<
  AISuggestion['type'],
  { label: string; color: string }
> = {
  spelling: { label: 'Orthographe', color: 'orange' },
  metadata: { label: 'Métadonnées', color: 'blue' },
  improvement: { label: 'Amélioration', color: 'green' },
}

export function AIAnalysisPanel({
  suggestions,
  onApply,
  onDismiss,
}: AIAnalysisPanelProps) {
  if (suggestions.length === 0) {
    return (
      <Alert
        message='Aucune suggestion'
        description="L'IA n'a trouvé aucune amélioration à proposer pour ce produit."
        type='success'
        showIcon
      />
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2 mb-3'>
        <Tag color='blue'>
          {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}
        </Tag>
      </div>

      {suggestions.map((suggestion, index) => (
        <div
          key={index}
          className='border border-gray-200 rounded-lg p-4 bg-gray-50'
        >
          <div className='flex items-start justify-between mb-2'>
            <div className='flex-1'>
              <div className='flex items-center gap-2 mb-2'>
                <Tag color={suggestionTypeLabels[suggestion.type].color}>
                  {suggestionTypeLabels[suggestion.type].label}
                </Tag>
                <span className='text-sm font-medium text-gray-700'>
                  {suggestion.field}
                </span>
              </div>

              <div className='space-y-2'>
                <div>
                  <span className='text-xs text-gray-500 uppercase'>
                    Actuel:
                  </span>
                  <p className='text-sm text-gray-700 line-through'>
                    {suggestion.current}
                  </p>
                </div>

                <div>
                  <span className='text-xs text-gray-500 uppercase'>
                    Suggestion:
                  </span>
                  <p className='text-sm text-green-700 font-medium'>
                    {suggestion.suggested}
                  </p>
                </div>

                <div>
                  <span className='text-xs text-gray-500 uppercase'>
                    Raison:
                  </span>
                  <p className='text-sm text-gray-600 italic'>
                    {suggestion.reason}
                  </p>
                </div>
              </div>
            </div>

            <Space direction='vertical' size='small'>
              <Button
                type='primary'
                size='small'
                icon={<CheckOutlined />}
                onClick={() => onApply(suggestion)}
              >
                Appliquer
              </Button>
              <Button
                size='small'
                icon={<CloseOutlined />}
                onClick={() => onDismiss(suggestion)}
              >
                Ignorer
              </Button>
            </Space>
          </div>
        </div>
      ))}
    </div>
  )
}
