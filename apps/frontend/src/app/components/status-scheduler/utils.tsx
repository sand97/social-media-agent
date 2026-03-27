import {
  NotificationOutlined,
  PictureOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import type {
  StatusSchedule,
  StatusScheduleContentType,
} from '@app/lib/api/status-scheduler'
import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'

export type ComposerFormValues = {
  caption?: string
  contentType: StatusScheduleContentType
  mediaUrl?: string
  slots: Array<{ scheduledFor: Dayjs | null }>
  textContent?: string
}

export type ModalMode = 'composer' | 'day' | 'empty' | null

export const CONTENT_TYPE_META: Record<
  StatusScheduleContentType,
  {
    icon: ReactNode
    label: string
  }
> = {
  IMAGE: {
    icon: <PictureOutlined />,
    label: 'Texte + image',
  },
  TEXT: {
    icon: <NotificationOutlined />,
    label: 'Texte',
  },
  VIDEO: {
    icon: <PlayCircleOutlined />,
    label: 'Vidéo',
  },
}

export function formatTime(schedule: StatusSchedule) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: schedule.timezone,
  }).format(new Date(schedule.scheduledFor))
}

export function formatDayHeading(day: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00`))
}

export function getMonthRange(month: string) {
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDay = new Date(year, monthIndex, 0)

  return {
    endDate: `${month}-${String(lastDay.getDate()).padStart(2, '0')}`,
    startDate: `${month}-01`,
  }
}

export function getDefaultTimeForDay(day: string) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  if (day === today) {
    const nextHour = dayjs(now).add(1, 'hour').startOf('hour')
    const minimumScheduleTime = getMinimumScheduleTime(dayjs(now))
    const defaultTime = nextHour.isAfter(minimumScheduleTime)
      ? nextHour
      : minimumScheduleTime

    return `${String(defaultTime.hour()).padStart(2, '0')}:${String(
      defaultTime.minute()
    ).padStart(2, '0')}`
  }

  return '09:00'
}

export function getMinimumScheduleTime(reference = dayjs()) {
  const minimum = reference.add(2, 'minute')

  if (minimum.second() === 0 && minimum.millisecond() === 0) {
    return minimum
  }

  return minimum.add(1, 'minute').startOf('minute')
}

export function createSlotValue(day: string) {
  return dayjs(`${day}T${getDefaultTimeForDay(day)}`)
}

export function getSchedulePreview(schedule: StatusSchedule) {
  if (schedule.contentType === 'TEXT') {
    return schedule.textContent || 'Story texte'
  }

  return schedule.caption || 'Story média'
}

export function toIsoString(value: Dayjs) {
  return value.toDate().toISOString()
}

export function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } })
      .response
    if (response?.data?.message) {
      return response.data.message
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Une erreur est survenue.'
}

export function getCalendarStatusDotClass(status: StatusSchedule['status']) {
  if (status === 'SENT') {
    return 'bg-[var(--color-primary)]'
  }

  if (status === 'FAILED') {
    return 'bg-[var(--color-danger)]'
  }

  return 'bg-[var(--color-field-border-strong)]'
}

export function getDisabledScheduleTime(current: Dayjs | null) {
  const minimum = getMinimumScheduleTime()

  if (!current || !current.isSame(minimum, 'day')) {
    return {}
  }

  const minimumHour = minimum.hour()
  const minimumMinute = minimum.minute()

  return {
    disabledHours: () =>
      Array.from({ length: minimumHour }, (_, index) => index),
    disabledMinutes: (selectedHour: number) =>
      selectedHour === minimumHour
        ? Array.from({ length: minimumMinute }, (_, index) => index)
        : [],
  }
}
