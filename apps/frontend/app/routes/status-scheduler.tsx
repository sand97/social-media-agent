import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EllipsisOutlined,
  NotificationOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import {
  cancelStatusSchedule,
  createStatusSchedule,
  getStatusSchedules,
  updateStatusSchedule,
  type CreateStatusSchedulePayload,
  type StatusSchedule,
  type StatusScheduleContentType,
} from '@app/lib/api/status-scheduler'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Calendar,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Select,
  Skeleton,
  Upload,
  type CalendarProps,
  type MenuProps,
  type UploadProps,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

type ComposerFormValues = {
  caption?: string
  contentType: StatusScheduleContentType
  mediaUrl?: string
  slots: Array<{ scheduledFor: Dayjs | null }>
  textContent?: string
}

type ModalMode = 'composer' | 'day' | 'empty' | null

const CONTENT_TYPE_META: Record<
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

function formatTime(schedule: StatusSchedule) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: schedule.timezone,
  }).format(new Date(schedule.scheduledFor))
}

function formatDayHeading(day: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00`))
}

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDay = new Date(year, monthIndex, 0)

  return {
    endDate: `${month}-${String(lastDay.getDate()).padStart(2, '0')}`,
    startDate: `${month}-01`,
  }
}

function getDefaultTimeForDay(day: string) {
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

function getMinimumScheduleTime(reference = dayjs()) {
  const minimum = reference.add(5, 'minute')

  if (minimum.second() === 0 && minimum.millisecond() === 0) {
    return minimum
  }

  return minimum.add(1, 'minute').startOf('minute')
}

function createSlotValue(day: string) {
  return dayjs(`${day}T${getDefaultTimeForDay(day)}`)
}

function getDisabledScheduleTime(current: Dayjs | null) {
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

function getSchedulePreview(schedule: StatusSchedule) {
  if (schedule.contentType === 'TEXT') {
    return schedule.textContent || 'Story texte'
  }

  return schedule.caption || 'Story média'
}

function toIsoString(value: Dayjs) {
  return value.toDate().toISOString()
}

function getErrorMessage(error: unknown) {
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

function getCalendarStatusDotClass(status: StatusSchedule['status']) {
  if (status === 'SENT') {
    return 'bg-[var(--color-primary)]'
  }

  if (status === 'FAILED') {
    return 'bg-[var(--color-danger)]'
  }

  return 'bg-[var(--color-field-border-strong)]'
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
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ComposerFormValues>()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(today)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editingSchedule, setEditingSchedule] = useState<StatusSchedule | null>(
    null
  )
  const [showHelpCard, setShowHelpCard] = useState(true)
  const contentType = Form.useWatch('contentType', form) || 'TEXT'
  const currentMediaUrl = Form.useWatch('mediaUrl', form)
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

  const invalidateSchedules = async () => {
    await queryClient.invalidateQueries({ queryKey: ['status-schedules'] })
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

    if (schedule) {
      form.setFieldsValue({
        caption: schedule.caption || '',
        contentType: schedule.contentType,
        mediaUrl: schedule.mediaUrl || '',
        slots: [{ scheduledFor: dayjs(schedule.scheduledFor) }],
        textContent: schedule.textContent || '',
      })
      return
    }

    form.setFieldsValue({
      caption: '',
      contentType: 'TEXT',
      mediaUrl: '',
      slots: [{ scheduledFor: createSlotValue(day) }],
      textContent: '',
    })
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

  useEffect(() => {
    if (contentType === 'TEXT') {
      form.setFieldValue('mediaUrl', '')
      form.setFieldValue('caption', '')
    }
  }, [contentType, form])

  const uploadProps: UploadProps = {
    accept: contentType === 'VIDEO' ? 'video/*' : 'image/*',
    beforeUpload: file => {
      const reader = new globalThis.FileReader()
      reader.onload = event => {
        const result = event.target?.result
        if (typeof result === 'string') {
          form.setFieldValue('mediaUrl', result)
        }
      }
      reader.readAsDataURL(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }

  const handleSubmit = async (values: ComposerFormValues) => {
    const slots = (values.slots || [])
      .map(slot => slot.scheduledFor)
      .filter((slot): slot is Dayjs => Boolean(slot))
    const minimumScheduleTime = getMinimumScheduleTime()

    if (slots.length === 0) {
      notification.error({
        message: 'Date manquante',
        description: 'Ajoutez au moins une date de publication.',
      })
      return
    }

    if (slots.some(slot => slot.isBefore(minimumScheduleTime))) {
      notification.error({
        message: 'Horaire invalide',
        description:
          'Choisissez une date de publication au moins 5 minutes après maintenant.',
      })
      return
    }

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'

    try {
      if (editingSchedule) {
        await updateMutation.mutateAsync({
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

        await invalidateSchedules()
        notification.success({
          message: 'Story mise à jour',
          description: 'La planification a été enregistrée.',
        })
      } else {
        for (const slot of slots) {
          await createMutation.mutateAsync({
            caption: values.caption?.trim(),
            contentType: values.contentType,
            mediaUrl: values.mediaUrl?.trim(),
            scheduledFor: toIsoString(slot),
            textContent: values.textContent?.trim(),
            timezone,
          })
        }

        await invalidateSchedules()
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
      await cancelMutation.mutateAsync(scheduleId)
      await invalidateSchedules()
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
            <div className='mt-3 space-y-1.5'>
              {daySchedules.slice(0, 3).map(schedule => (
                <div
                  key={schedule.id}
                  className='flex items-center gap-2 text-left text-[var(--font-size-eyebrow)] text-[var(--color-text-secondary)]'
                >
                  <span
                    className={`inline-flex h-1.5 w-1.5 rounded-full ${getCalendarStatusDotClass(schedule.status)}`}
                  />
                  <span>{formatTime(schedule)}</span>
                  <span className='text-[var(--color-text-soft)]'>
                    {CONTENT_TYPE_META[schedule.contentType].icon}
                  </span>
                </div>
              ))}

              {daySchedules.length > 3 ? (
                <p className='m-0 text-[var(--color-text-soft)]'>
                  +{daySchedules.length - 3}
                </p>
              ) : null}
            </div>
          ) : null}
        </button>
      </div>
    )
  }

  const groupedSchedules = useMemo(() => {
    return {
      failed: selectedDaySchedules.filter(
        schedule => schedule.status === 'FAILED'
      ),
      pending: selectedDaySchedules.filter(schedule =>
        ['PENDING', 'PROCESSING'].includes(schedule.status)
      ),
      sent: selectedDaySchedules.filter(schedule => schedule.status === 'SENT'),
    }
  }, [selectedDaySchedules])

  const renderScheduleCard = (schedule: StatusSchedule) => {
    const menuItems: MenuProps['items'] = [
      {
        key: 'edit',
        label: 'Modifier',
        onClick: () => openComposer(schedule.scheduledDay, schedule),
      },
      {
        danger: true,
        key: 'delete',
        label: 'Supprimer',
        onClick: () => handleDeleteSchedule(schedule.id),
      },
    ]

    const isEditable = !['SENT', 'PROCESSING'].includes(schedule.status)

    return (
      <article
        key={schedule.id}
        className='rounded-[var(--radius-card)] border-none bg-white p-4 shadow-card sm:p-4 m-1'
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
          <div className='mt-4 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-field-border-muted)]'>
            {schedule.contentType === 'VIDEO' ? (
              <video
                src={schedule.mediaUrl}
                controls
                className='block h-[180px] w-full object-cover'
              />
            ) : (
              <Image
                src={schedule.mediaUrl}
                alt='Story programmée'
                preview={false}
                className='block h-[180px] w-full object-cover'
              />
            )}
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <>
      <DashboardHeader
        title='Planifier vos status'
        right={
          <DatePicker
            picker='month'
            value={dayjs(`${calendarMonth}-01`)}
            onChange={value =>
              setCalendarMonth((value || dayjs()).format('YYYY-MM'))
            }
            format='MMMM YYYY'
            allowClear={false}
          />
        }
      />

      <div className='w-full space-y-4 px-4 py-5 sm:px-6 sm:py-6'>
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
          <div className='overflow-hidden rounded-[24px] border-none bg-white p-3 shadow-card sm:p-4'>
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

      <Modal
        open={modalMode === 'empty'}
        onCancel={() => setModalMode(null)}
        footer={[
          <Button
            key='create'
            type='primary'
            icon={<PlusOutlined />}
            iconPosition='end'
            onClick={() => openComposer(selectedDay)}
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

      <Modal
        open={modalMode === 'day'}
        onCancel={() => setModalMode(null)}
        footer={[
          <Button key={'1'} onClick={() => setModalMode(null)}>
            Fermer
          </Button>,
          <Button
            key={'2'}
            type='primary'
            icon={<PlusOutlined />}
            iconPosition='end'
            onClick={() => openComposer(selectedDay)}
            disabled={!canCreateOnSelectedDay}
          >
            Programmer une story
          </Button>,
        ]}
        title={`Stories du ${formatDayHeading(selectedDay)}`}
        width={560}
        closeIcon={null}
        rootClassName='app-double-modal'
      >
        <div className='space-y-6 m-1'>
          {selectedDaySchedules.length === 0 && (
            <p className='m-0 text-sm leading-[1.7] text-[var(--color-text-secondary)]'>
              Aucune story programmée pour cette date. Cliquez sur "Programmer
              une story" pour en ajouter une.
            </p>
          )}

          <div className='max-h-[60vh] space-y-6 overflow-y-auto -m-1'>
            {groupedSchedules.sent.length > 0 ? (
              <section className='space-y-3'>
                <div className='flex items-center gap-2 text-[var(--color-text-primary)]'>
                  <CheckCircleOutlined />
                  <span className='text-base font-semibold'>Envoyée</span>
                </div>
                <div className='space-y-3'>
                  {groupedSchedules.sent.map(renderScheduleCard)}
                </div>
              </section>
            ) : null}

            {groupedSchedules.pending.length > 0 ? (
              <section className='space-y-3'>
                <div className='flex items-center gap-2 text-[var(--color-text-primary)]'>
                  <ClockCircleOutlined />
                  <span className='text-base font-semibold'>À venir</span>
                </div>
                <div className='space-y-3'>
                  {groupedSchedules.pending.map(renderScheduleCard)}
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
                  {groupedSchedules.failed.map(renderScheduleCard)}
                </div>
              </section>
            ) : null}

            {selectedDaySchedules.length === 0 ? (
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

      <Modal
        open={modalMode === 'composer'}
        onCancel={closeComposer}
        footer={[
          <Button key='cancel' onClick={closeComposer}>
            Annuler
          </Button>,
          <Button
            key='submit'
            type='primary'
            icon={<PlusOutlined />}
            iconPosition='end'
            loading={createMutation.isPending || updateMutation.isPending}
            onClick={() => form.submit()}
          >
            {editingSchedule ? 'Enregistrer' : 'Programmer'}
          </Button>,
        ]}
        width={560}
        closeIcon={null}
        rootClassName='app-double-modal'
        title={
          <div className='space-y-2'>
            <h2 className='m-0 text-[var(--font-size-title-sm)] font-semibold text-[var(--color-text-primary)]'>
              {editingSchedule ? 'Modifier une story' : 'Programmer une story'}
            </h2>
            <p className='m-0 text-sm leading-[1.7] font-normal text-[var(--color-text-secondary)]'>
              Elle sera envoyée comme depuis votre smartphone
            </p>
          </div>
        }
      >
        <div className='space-y-6 py-1'>
          <Form<ComposerFormValues>
            form={form}
            layout='vertical'
            onFinish={handleSubmit}
            initialValues={{
              contentType: 'TEXT',
              slots: [{ scheduledFor: createSlotValue(selectedDay) }],
            }}
          >
            <Form.Item
              label='Type'
              name='contentType'
              rules={[{ required: true, message: 'Choisissez un type.' }]}
            >
              <Select
                options={Object.entries(CONTENT_TYPE_META).map(
                  ([value, meta]) => ({
                    label: meta.label,
                    value,
                  })
                )}
              />
            </Form.Item>

            <Form.List name='slots'>
              {(fields, { add, remove }) => (
                <div className='space-y-3'>
                  <label className='block text-base text-[var(--color-text-secondary)]'>
                    Date (s) et heure (s)
                  </label>

                  {fields.map(field => (
                    <div key={field.key} className='flex gap-2'>
                      <Form.Item
                        className='!mb-0 flex-1'
                        name={[field.name, 'scheduledFor']}
                        rules={[
                          {
                            required: true,
                            message: 'Choisissez une date de publication.',
                          },
                          {
                            validator: (_, value?: Dayjs | null) => {
                              if (!value) {
                                return Promise.resolve()
                              }

                              return value.isBefore(getMinimumScheduleTime())
                                ? Promise.reject(
                                    new Error(
                                      'Choisissez une date au moins 5 minutes après maintenant.'
                                    )
                                  )
                                : Promise.resolve()
                            },
                          },
                        ]}
                      >
                        <DatePicker
                          className='w-full'
                          showTime={{ format: 'HH:mm' }}
                          format='DD MMM YYYY, HH:mm'
                          popupClassName='status-scheduler-slot-picker-dropdown'
                          disabledDate={current =>
                            current
                              ? current
                                  .endOf('day')
                                  .isBefore(
                                    getMinimumScheduleTime().startOf('day')
                                  )
                              : false
                          }
                          disabledTime={getDisabledScheduleTime}
                        />
                      </Form.Item>

                      {fields.length > 1 ? (
                        <Button onClick={() => remove(field.name)}>
                          Retirer
                        </Button>
                      ) : null}
                    </div>
                  ))}

                  {!editingSchedule ? (
                    <Button
                      className='mb-5'
                      icon={<PlusOutlined />}
                      onClick={() =>
                        add({ scheduledFor: createSlotValue(selectedDay) })
                      }
                    >
                      Ajouter une autre date
                    </Button>
                  ) : null}
                </div>
              )}
            </Form.List>

            {contentType !== 'TEXT' ? (
              <>
                <Form.Item className='mt-6' label='Message' name='caption'>
                  <Input.TextArea
                    rows={5}
                    placeholder='S’adapter à au client'
                  />
                </Form.Item>

                <Form.Item
                  label='Illustration'
                  name='mediaUrl'
                  rules={[
                    {
                      required: true,
                      message: 'Ajoutez un média pour cette story.',
                    },
                  ]}
                >
                  <Upload {...uploadProps}>
                    <div className='rounded-[var(--radius-card)] border-none bg-[var(--color-surface-muted)] px-5 py-10 text-center shadow-card'>
                      {currentMediaUrl ? (
                        <div className='space-y-4'>
                          <div className='overflow-hidden rounded-[var(--radius-control)]'>
                            {contentType === 'VIDEO' ? (
                              <video
                                src={currentMediaUrl}
                                controls
                                className='block w-full max-h-[220px] rounded-[var(--radius-control)] object-cover'
                              />
                            ) : (
                              <img
                                src={currentMediaUrl}
                                alt='Aperçu'
                                className='block w-full max-h-[220px] rounded-[var(--radius-control)] object-cover'
                              />
                            )}
                          </div>
                          <p className='m-0 text-sm font-medium text-[var(--color-text-primary)]'>
                            Changer le fichier
                          </p>
                        </div>
                      ) : (
                        <div className='space-y-3'>
                          <div className='mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-[rgba(36,211,102,0.3)] text-2xl text-[var(--color-primary)]'>
                            <UploadOutlined />
                          </div>
                          <div>
                            <p className='m-0 text-lg font-semibold text-[var(--color-text-primary)]'>
                              Cliquer ici pour charger vos images
                            </p>
                            <p className='mb-0 mt-2 text-sm leading-[1.7] text-[var(--color-text-secondary)]'>
                              Vous pouvez envoyer plusieurs images et ensuite
                              choisir l’ordre des publications
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </Upload>
                </Form.Item>
              </>
            ) : (
              <Form.Item
                className='mt-6'
                label='Votre message'
                name='textContent'
                rules={[
                  { required: true, message: 'Ajoutez le texte de la story.' },
                ]}
              >
                <Input.TextArea rows={6} placeholder='S’adapter à au client' />
              </Form.Item>
            )}
          </Form>
        </div>
      </Modal>
    </>
  )
}
