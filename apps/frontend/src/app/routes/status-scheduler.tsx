import { DashboardHeader } from '@app/components/layout'
import { useLayout } from '@app/contexts/LayoutContext'
import {
  cancelStatusSchedule,
  createStatusSchedule,
  getStatusSchedules,
  updateStatusSchedule,
  type CreateStatusSchedulePayload,
  type StatusScheduleMutationResponse,
  type StatusSchedule,
} from '@app/lib/api/status-scheduler'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Calendar,
  DatePicker,
  Skeleton,
  type CalendarProps,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'

import { ComposerModal } from '../components/status-scheduler/ComposerModal'
import { DayScheduleModal } from '../components/status-scheduler/DayScheduleModal'
import { EmptyDayModal } from '../components/status-scheduler/EmptyDayModal'
import {
  getErrorMessage,
  getMonthRange,
  toIsoString,
  type ComposerFormValues,
  type ModalMode,
} from '../components/status-scheduler/utils'

function formatStoriesMonthLabel(value: Date, isDesktop: boolean) {
  const monthLabel = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(value)

  if (isDesktop) {
    return monthLabel
  }

  return `Stories de ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`
}

export function meta() {
  return [
    { title: 'Status scheduler - WhatsApp Agent' },
    {
      name: 'description',
      content:
        'Calendrier de planification des statuts WhatsApp avec édition par journée',
    },
  ]
}

export default function StatusSchedulerPage() {
  const { notification } = App.useApp()
  const { isDesktop } = useLayout()
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(today)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editingSchedule, setEditingSchedule] = useState<StatusSchedule | null>(
    null
  )
  const [showHelpCard, setShowHelpCard] = useState(true)

  const monthRange = useMemo(
    () => getMonthRange(calendarMonth),
    [calendarMonth]
  )

  const schedulesQuery = useQuery({
    queryKey: ['status-schedules', monthRange.startDate, monthRange.endDate],
    queryFn: () => getStatusSchedules(monthRange),
  })

  const createMutation = useMutation({ mutationFn: createStatusSchedule })
  const updateMutation = useMutation({
    mutationFn: ({
      payload,
      scheduleId,
    }: {
      payload: CreateStatusSchedulePayload
      scheduleId: string
    }) => updateStatusSchedule(scheduleId, payload),
  })
  const cancelMutation = useMutation({ mutationFn: cancelStatusSchedule })

  const schedulesByDay = useMemo(() => {
    const nextMap = new Map<string, StatusSchedule[]>()

    for (const schedule of schedulesQuery.data || []) {
      const entry = nextMap.get(schedule.scheduledDay) || []
      entry.push(schedule)
      nextMap.set(schedule.scheduledDay, entry)
    }

    for (const entry of nextMap.values()) {
      entry.sort(
        (left, right) =>
          new Date(left.scheduledFor).getTime() -
          new Date(right.scheduledFor).getTime()
      )
    }

    return nextMap
  }, [schedulesQuery.data])

  const selectedDaySchedules = useMemo(
    () => schedulesByDay.get(selectedDay) || [],
    [schedulesByDay, selectedDay]
  )

  const canCreateOnSelectedDay = selectedDay >= today
  const isDayInCurrentRange = (day: string) =>
    day >= monthRange.startDate && day <= monthRange.endDate

  const applyMutationResponse = (response: StatusScheduleMutationResponse) => {
    queryClient.setQueryData<StatusSchedule[]>(
      ['status-schedules', monthRange.startDate, monthRange.endDate],
      currentSchedules => {
        const existingSchedules = currentSchedules || []
        const relevantDays = response.affectedDays.filter(day =>
          isDayInCurrentRange(day.day)
        )

        if (relevantDays.length === 0) {
          return existingSchedules
        }

        const affectedDaySet = new Set(relevantDays.map(day => day.day))
        const nextSchedules = [
          ...existingSchedules.filter(
            schedule => !affectedDaySet.has(schedule.scheduledDay)
          ),
          ...relevantDays.flatMap(day => day.schedules),
        ]

        return nextSchedules.sort(
          (left, right) =>
            new Date(left.scheduledFor).getTime() -
            new Date(right.scheduledFor).getTime()
        )
      }
    )
  }

  const openDayModal = (day: string) => {
    setSelectedDay(day)
    setEditingSchedule(null)
    setModalMode((schedulesByDay.get(day) || []).length > 0 ? 'day' : 'empty')
  }

  const openComposer = (day: string, schedule?: StatusSchedule) => {
    setSelectedDay(day)
    setEditingSchedule(schedule || null)
    setModalMode('composer')
  }

  const closeComposer = () => {
    setEditingSchedule(null)
    setModalMode(selectedDaySchedules.length > 0 ? 'day' : 'empty')
  }

  useEffect(() => {
    if (modalMode === 'day' && selectedDaySchedules.length === 0) {
      setModalMode('empty')
    }
  }, [modalMode, selectedDaySchedules.length])

  const handleSubmit = async (values: ComposerFormValues) => {
    const slots = (values.slots || [])
      .map(slot => slot.scheduledFor)
      .filter((slot): slot is Dayjs => Boolean(slot))

    if (slots.length === 0) {
      notification.error({
        message: 'Date manquante',
        description: 'Ajoutez au moins une date de publication.',
      })
      return
    }

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'

    try {
      if (editingSchedule) {
        const response = await updateMutation.mutateAsync({
          payload: {
            caption: values.caption?.trim(),
            contentType: values.contentType,
            mediaUrl: values.mediaUrl?.trim(),
            scheduledFor: toIsoString(slots[0]),
            textContent: values.textContent?.trim(),
            timezone,
          },
          scheduleId: editingSchedule.id,
        })
        applyMutationResponse(response)
        if (isDayInCurrentRange(response.schedule.scheduledDay)) {
          setSelectedDay(response.schedule.scheduledDay)
        }

        notification.success({
          message: 'Story mise à jour',
          description: 'La planification a été enregistrée.',
        })
      } else {
        let lastCreatedSchedule: StatusSchedule | null = null

        for (const slot of slots) {
          const response = await createMutation.mutateAsync({
            caption: values.caption?.trim(),
            contentType: values.contentType,
            mediaUrl: values.mediaUrl?.trim(),
            scheduledFor: toIsoString(slot),
            textContent: values.textContent?.trim(),
            timezone,
          })
          applyMutationResponse(response)
          lastCreatedSchedule = response.schedule
        }

        if (
          slots.length === 1 &&
          lastCreatedSchedule &&
          isDayInCurrentRange(lastCreatedSchedule.scheduledDay)
        ) {
          setSelectedDay(lastCreatedSchedule.scheduledDay)
        }

        notification.success({
          message: 'Story programmée',
          description:
            slots.length > 1
              ? `${slots.length} stories ont été ajoutées au calendrier.`
              : 'La story a été ajoutée au calendrier.',
        })
      }

      setEditingSchedule(null)
      setModalMode('day')
    } catch (error) {
      notification.error({
        message: editingSchedule
          ? 'Mise à jour impossible'
          : 'Création impossible',
        description: getErrorMessage(error),
      })
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const response = await cancelMutation.mutateAsync(scheduleId)
      applyMutationResponse(response)
      notification.success({
        message: 'Story supprimée',
        description: 'La planification a été retirée du calendrier.',
      })
    } catch (error) {
      notification.error({
        message: 'Suppression impossible',
        description: getErrorMessage(error),
      })
    }
  }

  const fullCellRender: CalendarProps<Dayjs>['fullCellRender'] = (
    value,
    info
  ) => {
    if (info.type !== 'date') {
      return info.originNode
    }

    const dayKey = value.format('YYYY-MM-DD')
    const daySchedules = schedulesByDay.get(dayKey) || []
    const isToday = dayKey === today
    const now = Date.now()
    const hasUpcomingSchedule = daySchedules.some(
      schedule => new Date(schedule.scheduledFor).getTime() >= now
    )
    const badgeClassName = hasUpcomingSchedule
      ? 'story-calendar-day-badge story-calendar-day-badge--upcoming'
      : 'story-calendar-day-badge story-calendar-day-badge--past'
    const badgeLabel = daySchedules.length

    return (
      <div className='story-calendar-cell'>
        <button
          type='button'
          className='story-calendar-button'
          onClick={() => openDayModal(dayKey)}
        >
          <div className='flex items-center justify-between gap-2'>
            <span className='text-sm font-medium text-[var(--color-text-primary)]'>
              {value.format('DD')}
            </span>
            {isToday ? <span className='active-day-line' /> : null}
          </div>

          {daySchedules.length > 0 ? (
            <div className='mt-3'>
              <span className={badgeClassName}>{badgeLabel}</span>
            </div>
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <>
      <DashboardHeader
        title={isDesktop ? 'Planifier vos stories' : null}
        isBackgroundLoading={schedulesQuery.isFetching && !!schedulesQuery.data}
        right={
          <DatePicker
            picker='month'
            className='w-[228px] min-w-0 lg:w-auto'
            value={dayjs(`${calendarMonth}-01`)}
            onChange={value =>
              setCalendarMonth((value || dayjs()).format('YYYY-MM'))
            }
            format={(value: Dayjs) =>
              formatStoriesMonthLabel(value.toDate(), isDesktop)
            }
            allowClear={false}
          />
        }
      />

      <div className='flex w-full flex-1 flex-col space-y-4 px-4 py-5 sm:px-6 sm:py-6'>
        {showHelpCard ? (
          <div className='rounded-[var(--radius-card)] border-none bg-[var(--color-surface-muted)] px-5 py-4 shadow-card sm:px-5'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='m-0 text-lg font-semibold text-[var(--color-text-primary)]'>
                  Comment programmer un status
                </p>
                <p className='mb-0 mt-2 text-sm leading-[1.7] text-[var(--color-text-secondary)]'>
                  Il vous suffit de cliquer sur une date et de remplir le
                  formulaire.
                </p>
              </div>

              <Button onClick={() => setShowHelpCard(false)}>Fermer</Button>
            </div>
          </div>
        ) : null}

        {schedulesQuery.isLoading ? (
          <div className='rounded-[24px] border-none bg-white p-4 shadow-card sm:p-6'>
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        ) : schedulesQuery.isError ? (
          <Alert
            type='error'
            showIcon
            message='Impossible de charger le calendrier'
            description='Les stories planifiées n’ont pas pu être récupérées depuis le backend.'
          />
        ) : (
          <div className='story-calendar-shell overflow-hidden rounded-[24px] border-none bg-white p-3 shadow-card sm:p-4 lg:flex-1 lg:min-h-0'>
            <Calendar
              className='story-calendar'
              value={dayjs(`${calendarMonth}-01`)}
              onSelect={value => openDayModal(value.format('YYYY-MM-DD'))}
              onPanelChange={value => setCalendarMonth(value.format('YYYY-MM'))}
              headerRender={() => null}
              fullCellRender={fullCellRender}
            />
          </div>
        )}
      </div>

      <EmptyDayModal
        open={modalMode === 'empty'}
        onCancel={() => setModalMode(null)}
        selectedDay={selectedDay}
        canCreateOnSelectedDay={canCreateOnSelectedDay}
        onOpenComposer={openComposer}
      />

      <DayScheduleModal
        open={modalMode === 'day'}
        onCancel={() => setModalMode(null)}
        selectedDay={selectedDay}
        schedules={selectedDaySchedules}
        canCreateOnSelectedDay={canCreateOnSelectedDay}
        onOpenComposer={openComposer}
        onEditSchedule={schedule => openComposer(selectedDay, schedule)}
        onDeleteSchedule={handleDeleteSchedule}
      />

      <ComposerModal
        open={modalMode === 'composer'}
        onCancel={closeComposer}
        selectedDay={selectedDay}
        editingSchedule={editingSchedule}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </>
  )
}
