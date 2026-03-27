import { CloseCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'

import { formatDayHeading } from './utils'

type EmptyDayModalProps = {
  open: boolean
  onCancel: () => void
  selectedDay: string
  canCreateOnSelectedDay: boolean
  onOpenComposer: (day: string) => void
}

export function EmptyDayModal({
  open,
  onCancel,
  selectedDay,
  canCreateOnSelectedDay,
  onOpenComposer,
}: EmptyDayModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={[
        <Button
          key='create'
          type='primary'
          icon={<PlusOutlined />}
          iconPosition='end'
          onClick={() => onOpenComposer(selectedDay)}
          disabled={!canCreateOnSelectedDay}
        >
          Programmer une story
        </Button>,
      ]}
      width={520}
      closeIcon={null}
      rootClassName='app-double-modal'
    >
      <div className='space-y-8 py-2 text-center'>
        <div className='space-y-4'>
          <div className='mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-empty)] text-[32px] text-[var(--color-empty-icon)]'>
            <CloseCircleOutlined />
          </div>
          <div>
            <p className='m-0 text-[var(--font-size-title-lg)] font-semibold text-[var(--color-text-primary)]'>
              {formatDayHeading(selectedDay)}
            </p>
            <p className='mb-0 mt-2 text-sm leading-[1.7] text-[var(--color-text-secondary)]'>
              Aucune story programmée pour cette date
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
