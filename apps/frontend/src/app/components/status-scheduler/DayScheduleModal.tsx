import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EllipsisOutlined,
} from '@ant-design/icons'
import type { StatusSchedule } from '@app/lib/api/status-scheduler'
import { Button, Dropdown, Empty, Image, Modal, type MenuProps } from 'antd'
import { useMemo } from 'react'

import { formatDayHeading, formatTime, getSchedulePreview } from './utils'

type ScheduleCardProps = {
  schedule: StatusSchedule
  onEdit: (schedule: StatusSchedule) => void
  onDelete: (scheduleId: string) => void
}

function ScheduleCard({ schedule, onEdit, onDelete }: ScheduleCardProps) {
  const menuItems: MenuProps['items'] = [
    {
      key: 'edit',
      label: 'Modifier',
      onClick: () => onEdit(schedule),
    },
    {
      danger: true,
      key: 'delete',
      label: 'Supprimer',
      onClick: () => onDelete(schedule.id),
    },
  ]

  const isEditable = !['SENT', 'PROCESSING'].includes(schedule.status)

  return (
    <article
      key={schedule.id}
      className='m-1 rounded-[var(--radius-card)] border-none bg-white p-4 shadow-card sm:p-4'
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='space-y-2'>
          <p className='m-0 text-[var(--font-size-display-sm)] font-semibold text-[var(--color-text-primary)]'>
            {formatTime(schedule)}
          </p>
          <p className='m-0 text-sm leading-[1.7] text-[var(--color-text-secondary)]'>
            {getSchedulePreview(schedule)}
          </p>
        </div>

        {isEditable ? (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <button
              type='button'
              className='inline-flex h-10 w-10 items-center justify-center rounded-full border-none bg-white text-[var(--color-text-primary)] shadow-card'
            >
              <EllipsisOutlined />
            </button>
          </Dropdown>
        ) : null}
      </div>

      {schedule.mediaUrl && schedule.contentType !== 'TEXT' ? (
        <div className='mt-4 overflow-hidden aspect-square rounded-[var(--radius-control)] border border-[var(--color-field-border-muted)]'>
          {schedule.contentType === 'VIDEO' ? (
            <video
              src={schedule.mediaUrl}
              controls
              className='block h-full! w-full object-cover'
            />
          ) : (
            <Image
              src={schedule.mediaUrl}
              alt='Story programmée'
              preview={false}
              className='block h-full! w-full object-cover'
            />
          )}
        </div>
      ) : null}
    </article>
  )
}

type DayScheduleModalProps = {
  open: boolean
  onCancel: () => void
  selectedDay: string
  schedules: StatusSchedule[]
  canCreateOnSelectedDay: boolean
  onOpenComposer: (day: string) => void
  onEditSchedule: (schedule: StatusSchedule) => void
  onDeleteSchedule: (scheduleId: string) => void
}

export function DayScheduleModal({
  open,
  onCancel,
  selectedDay,
  schedules,
  canCreateOnSelectedDay,
  onOpenComposer,
  onEditSchedule,
  onDeleteSchedule,
}: DayScheduleModalProps) {
  const groupedSchedules = useMemo(() => {
    return {
      failed: schedules.filter(schedule => schedule.status === 'FAILED'),
      pending: schedules.filter(schedule =>
        ['PENDING', 'PROCESSING'].includes(schedule.status)
      ),
      sent: schedules.filter(schedule => schedule.status === 'SENT'),
    }
  }, [schedules])

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={`Stories du ${formatDayHeading(selectedDay)}`}
      footer={[
        <Button onClick={onCancel}>Fermer</Button>,
        <Button
          type='primary'
          onClick={() => onOpenComposer(selectedDay)}
          disabled={!canCreateOnSelectedDay}
        >
          Programmer une story
        </Button>,
      ]}
      width={560}
      closeIcon={null}
      rootClassName='app-double-modal'
    >
      <div className='m-1 space-y-6'>
        {schedules.length === 0 ? (
          <p className='m-0 text-sm leading-[1.7] text-[var(--color-text-secondary)]'>
            Aucune story programmée pour cette date. Cliquez sur "Programmer une
            story" pour en ajouter une.
          </p>
        ) : null}

        <div className='-m-1 max-h-[60vh] space-y-6 overflow-y-auto mt-2'>
          {groupedSchedules.pending.length > 0 ? (
            <section className='space-y-3'>
              <div className='flex items-center gap-2 text-[var(--color-text-primary)]'>
                <ClockCircleOutlined />
                <span className='text-base font-semibold'>À venir</span>
              </div>
              <div className='space-y-3'>
                {groupedSchedules.pending.map(schedule => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onEdit={onEditSchedule}
                    onDelete={onDeleteSchedule}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {groupedSchedules.sent.length > 0 ? (
            <section className='space-y-3'>
              <div className='flex items-center gap-2 text-[var(--color-text-primary)]'>
                <CheckCircleOutlined />
                <span className='text-base font-semibold'>Envoyée</span>
              </div>
              <div className='space-y-3'>
                {groupedSchedules.sent.map(schedule => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onEdit={onEditSchedule}
                    onDelete={onDeleteSchedule}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {groupedSchedules.failed.length > 0 ? (
            <section className='space-y-3'>
              <div className='flex items-center gap-2 text-[var(--color-text-primary)]'>
                <CloseCircleOutlined />
                <span className='text-base font-semibold'>À corriger</span>
              </div>
              <div className='space-y-3'>
                {groupedSchedules.failed.map(schedule => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onEdit={onEditSchedule}
                    onDelete={onDeleteSchedule}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {schedules.length === 0 ? (
            <div className='rounded-[var(--radius-card)] border border-dashed border-[var(--color-field-border-muted)] bg-[var(--color-surface-muted)] px-4 py-10'>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description='Aucune story programmée pour cette date.'
              />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
