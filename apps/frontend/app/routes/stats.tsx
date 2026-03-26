import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { DashboardHeader } from '@app/components/layout'
import { useAuth } from '@app/hooks/useAuth'
import {
  getStatsAnalytics,
  getUserStatsSummary,
  type DailyStatsPoint,
  type StatsAnalyticsResponse,
  type UserStatsSummary,
} from '@app/lib/api/stats'
import { getPlanLabel, resolveCurrentPlanKey } from '@app/lib/current-plan'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Progress,
  Segmented,
  Skeleton,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

dayjs.extend(isoWeek)

const { Title } = Typography

const DAY_IN_MS = 24 * 60 * 60 * 1000
const YEAR_OPTIONS_DEPTH = 3
const SHORT_MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mars',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aout',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
]

type StatsGranularity = 'week' | 'month' | 'year'
type SingleMetricKey = 'conversations'
type UsageSeriesKey = 'textMessages' | 'imageMessages' | 'audioMessages' | 'credits'

interface Range {
  startDate: string
  endDate: string
}

interface SingleMetricPoint {
  bucket: string
  value: number
}

interface UsageChartPoint {
  audioMessages: number
  bucket: string
  credits: number
  imageMessages: number
  textMessages: number
}

const USAGE_SERIES: Array<{
  color: string
  description: string
  key: UsageSeriesKey
  label: string
}> = [
  {
    color: '#111B21',
    description: '1 crédit par message textuel',
    key: 'textMessages',
    label: 'Textes',
  },
  {
    color: '#24D366',
    description: '2 crédits par image',
    key: 'imageMessages',
    label: 'Images',
  },
  {
    color: '#F59E0B',
    description: '1.5 crédit par audio',
    key: 'audioMessages',
    label: 'Audio',
  },
  {
    color: '#2F80ED',
    description: 'Calcul estimé côté front',
    key: 'credits',
    label: 'Crédit',
  },
]

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits > 0 ? 0 : undefined,
  }).format(value)
}

function parseUtcDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`)
}

function formatUtcDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(day: string, amount: number) {
  return formatUtcDay(new Date(parseUtcDay(day).getTime() + amount * DAY_IN_MS))
}

function clampDay(day: string, maxDay: string) {
  return day > maxDay ? maxDay : day
}

function diffUtcDays(startDate: string, endDate: string) {
  return Math.round(
    (parseUtcDay(endDate).getTime() - parseUtcDay(startDate).getTime()) /
      DAY_IN_MS
  )
}

function formatAxisNumber(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
    notation: value >= 10000 ? 'compact' : 'standard',
  }).format(value)
}

function formatHumanDate(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    ...options,
  }).format(parseUtcDay(day))
}

function getShortMonthLabel(date: Dayjs) {
  return SHORT_MONTH_LABELS[date.month()]
}

function formatPickerDayLabel(date: Dayjs) {
  return `${date.date()} ${getShortMonthLabel(date)} ${date.year()}`
}

function buildSelectedRange(
  granularity: StatsGranularity,
  selectedDate: Dayjs,
  maxDay: string
): Range {
  if (granularity === 'week') {
    const startDate = selectedDate.startOf('isoWeek').format('YYYY-MM-DD')
    const endDate = clampDay(
      selectedDate.endOf('isoWeek').format('YYYY-MM-DD'),
      maxDay
    )

    return { startDate, endDate }
  }

  if (granularity === 'month') {
    const startDate = selectedDate.startOf('month').format('YYYY-MM-DD')
    const endDate = clampDay(
      selectedDate.endOf('month').format('YYYY-MM-DD'),
      maxDay
    )

    return { startDate, endDate }
  }

  const startDate = selectedDate.startOf('year').format('YYYY-MM-DD')
  const endDate = clampDay(
    selectedDate.endOf('year').format('YYYY-MM-DD'),
    maxDay
  )

  return { startDate, endDate }
}

function filterPoints(points: DailyStatsPoint[], range: Range) {
  return points.filter(
    point => point.day >= range.startDate && point.day <= range.endDate
  )
}

function sumSingleMetric(points: DailyStatsPoint[], metric: SingleMetricKey) {
  return points.reduce((total, point) => total + point[metric], 0)
}

function calculateCredits(point: DailyStatsPoint) {
  return (
    point.textMessages + point.imageMessages * 2 + point.audioMessages * 1.5
  )
}

function sumUsageMetric(points: DailyStatsPoint[], metric: UsageSeriesKey) {
  if (metric === 'credits') {
    return points.reduce((total, point) => total + calculateCredits(point), 0)
  }

  return points.reduce((total, point) => total + point[metric], 0)
}

function buildPreviousRange(range: Range): Range {
  const periodLength = diffUtcDays(range.startDate, range.endDate) + 1

  return {
    startDate: addUtcDays(range.startDate, -periodLength),
    endDate: addUtcDays(range.startDate, -1),
  }
}

function formatDelta(currentValue: number, previousValue: number) {
  if (previousValue <= 0) {
    return null
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100
  const rounded = Math.abs(delta) >= 10 ? delta.toFixed(0) : delta.toFixed(1)

  return {
    label: `${delta > 0 ? '+' : ''}${rounded}%`,
    positive: delta >= 0,
  }
}

function buildSingleMetricChartData(
  points: DailyStatsPoint[],
  granularity: StatsGranularity,
  metric: SingleMetricKey
): SingleMetricPoint[] {
  if (granularity === 'year') {
    const grouped = new Map<string, number>()

    for (const point of points) {
      const monthBucket = `${point.day.slice(0, 7)}-01`
      grouped.set(monthBucket, (grouped.get(monthBucket) ?? 0) + point[metric])
    }

    return Array.from(grouped.entries()).map(([bucket, value]) => ({
      bucket,
      value,
    }))
  }

  return points.map(point => ({
    bucket: point.day,
    value: point[metric],
  }))
}

function buildUsageChartData(
  points: DailyStatsPoint[],
  granularity: StatsGranularity
): UsageChartPoint[] {
  if (granularity === 'year') {
    const grouped = new Map<string, UsageChartPoint>()

    for (const point of points) {
      const monthBucket = `${point.day.slice(0, 7)}-01`
      const existing = grouped.get(monthBucket) ?? {
        audioMessages: 0,
        bucket: monthBucket,
        credits: 0,
        imageMessages: 0,
        textMessages: 0,
      }

      existing.textMessages += point.textMessages
      existing.imageMessages += point.imageMessages
      existing.audioMessages += point.audioMessages
      existing.credits += calculateCredits(point)
      grouped.set(monthBucket, existing)
    }

    return Array.from(grouped.values())
  }

  return points.map(point => ({
    audioMessages: point.audioMessages,
    bucket: point.day,
    credits: calculateCredits(point),
    imageMessages: point.imageMessages,
    textMessages: point.textMessages,
  }))
}

function formatTick(bucket: string, granularity: StatsGranularity) {
  if (granularity === 'week') {
    return formatHumanDate(bucket, { weekday: 'short' })
  }

  if (granularity === 'month') {
    return formatHumanDate(bucket, { day: 'numeric' })
  }

  return formatHumanDate(bucket, { month: 'short' })
}

function formatTooltipLabel(bucket: string, granularity: StatsGranularity) {
  if (granularity === 'year') {
    return formatHumanDate(bucket, {
      month: 'long',
      year: 'numeric',
    })
  }

  return formatHumanDate(bucket, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function buildDisabledDate(
  granularity: StatsGranularity,
  minDay: string,
  maxDay: string
) {
  const minDate = dayjs(minDay)
  const maxDate = dayjs(maxDay)

  return (current: Dayjs) => {
    if (granularity === 'week') {
      const periodStart = current.startOf('isoWeek')
      const periodEnd = current.endOf('isoWeek')

      return (
        periodStart.isAfter(maxDate, 'day') ||
        periodEnd.isBefore(minDate, 'day')
      )
    }

    if (granularity === 'month') {
      const periodStart = current.startOf('month')
      const periodEnd = current.endOf('month')

      return (
        periodStart.isAfter(maxDate, 'day') ||
        periodEnd.isBefore(minDate, 'day')
      )
    }

    const periodStart = current.startOf('year')
    const periodEnd = current.endOf('year')

    return (
      periodStart.isAfter(maxDate, 'day') || periodEnd.isBefore(minDate, 'day')
    )
  }
}

function findFirstSingleMetricDay(
  points: DailyStatsPoint[],
  metric: SingleMetricKey,
  fallbackDay: string
) {
  return points.find(point => point[metric] > 0)?.day ?? fallbackDay
}

function findFirstUsageDay(
  points: DailyStatsPoint[],
  selectedSeries: UsageSeriesKey[],
  fallbackDay: string
) {
  return (
    points.find(point =>
      selectedSeries.some(seriesKey =>
        seriesKey === 'credits'
          ? calculateCredits(point) > 0
          : point[seriesKey] > 0
      )
    )?.day ?? fallbackDay
  )
}

function formatPickerValue(
  value: Dayjs,
  granularity: StatsGranularity,
  maxDay: string
) {
  if (granularity === 'year') {
    return `Année ${value.year()}`
  }

  if (granularity === 'month') {
    return `${getShortMonthLabel(value)} ${value.year()}`
  }

  const startDate = value.startOf('isoWeek')
  const endDate = dayjs(
    clampDay(value.endOf('isoWeek').format('YYYY-MM-DD'), maxDay)
  )

  return `${formatPickerDayLabel(startDate)} - ${formatPickerDayLabel(endDate)}`
}

function CreditsOverviewCard({
  summary,
  currentPlanLabel: _currentPlanLabel,
  onAddCredits,
}: {
  currentPlanLabel: string
  onAddCredits: () => void
  summary: UserStatsSummary
}) {
  const totalCredits = Math.max(
    summary.creditsRemaining + summary.creditsUsed,
    summary.creditsRemaining,
    1
  )
  const remainingRatio = Math.min(
    100,
    Math.max(0, (summary.creditsRemaining / totalCredits) * 100)
  )

  return (
    <section className='rounded-card bg-white px-6 py-4 shadow-card'>
      <div className='flex flex-col gap-12'>
        <div className='flex items-center justify-between'>
          <Progress
            type='circle'
            percent={Math.round(remainingRatio)}
            size={55}
            strokeColor='#24D366'
            trailColor='#E9E6E0'
            strokeWidth={8}
            format={percent => `${percent}%`}
          />

          <button
            type='button'
            onClick={onAddCredits}
            className='flex items-center gap-2 rounded-full border border-[var(--color-field-border-muted)] bg-white px-4 py-[10px] text-sm font-semibold text-[var(--color-text-primary)] shadow-card transition hover:border-[#111b21]'
          >
            <span>Ajouter</span>
            <span className='flex h-6 w-6 items-center justify-center rounded-full border border-current text-[11px]'>
              <PlusOutlined />
            </span>
          </button>
        </div>

        <div className='flex flex-col gap-2'>
          <p className='m-0 text-base font-medium tracking-[0.02em] text-[var(--color-text-primary)]'>
            WhatsApp
          </p>
          <p className='m-0 text-sm leading-6 text-[var(--color-text-secondary)]'>
            {formatNumber(summary.creditsRemaining)} Token restant
          </p>
        </div>
      </div>
    </section>
  )
}

function SingleMetricChartSection({
  title,
  metric,
  series,
  minDay,
  maxDay,
}: {
  title: string
  metric: SingleMetricKey
  series: DailyStatsPoint[]
  minDay: string
  maxDay: string
}) {
  const [granularity, setGranularity] = useState<StatsGranularity>('year')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs(maxDay))
  const effectiveMinDay = useMemo(
    () => findFirstSingleMetricDay(series, metric, minDay),
    [metric, minDay, series]
  )

  const selectedRange = useMemo(
    () => buildSelectedRange(granularity, selectedDate, maxDay),
    [granularity, maxDay, selectedDate]
  )
  const previousRange = useMemo(
    () => buildPreviousRange(selectedRange),
    [selectedRange]
  )
  const selectedPoints = useMemo(
    () => filterPoints(series, selectedRange),
    [selectedRange, series]
  )
  const previousPoints = useMemo(
    () =>
      previousRange.startDate >= effectiveMinDay
        ? filterPoints(series, previousRange)
        : [],
    [effectiveMinDay, previousRange, series]
  )
  const periodTotal = useMemo(
    () => sumSingleMetric(selectedPoints, metric),
    [metric, selectedPoints]
  )
  const previousTotal = useMemo(
    () => sumSingleMetric(previousPoints, metric),
    [metric, previousPoints]
  )
  const delta = useMemo(
    () => formatDelta(periodTotal, previousTotal),
    [periodTotal, previousTotal]
  )
  const chartData = useMemo(
    () => buildSingleMetricChartData(selectedPoints, granularity, metric),
    [granularity, metric, selectedPoints]
  )
  const disabledDate = useMemo(
    () => buildDisabledDate(granularity, effectiveMinDay, maxDay),
    [effectiveMinDay, granularity, maxDay]
  )
  const pickerFormat = useMemo(
    () => (value: Dayjs) => formatPickerValue(value, granularity, maxDay),
    [granularity, maxDay]
  )
  const isEmpty =
    chartData.length === 0 || chartData.every(point => point.value === 0)

  return (
    <section className='flex flex-col gap-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <Title level={5} className='!mb-0'>
          {title}
        </Title>

        {!isEmpty ? (
          <div className='flex items-center gap-3 md:justify-end'>
            <div className='text-[44px] font-semibold leading-none text-[#111b21]'>
              {formatNumber(periodTotal)}
            </div>
            {delta ? (
              <div
                className={`rounded-2xl bg-[#111b21] px-3 py-2 text-[12px] font-semibold leading-none ${
                  delta.positive ? 'text-primary-green' : 'text-[#ff7875]'
                }`}
              >
                {delta.label}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <Segmented<StatsGranularity>
          value={granularity}
          shape='round'
          options={[
            { label: 'Semaine', value: 'week' },
            { label: 'Mois', value: 'month' },
            { label: 'Année', value: 'year' },
          ]}
          className='stats-granularity-toggle'
          onChange={value => setGranularity(value)}
        />

        <DatePicker
          allowClear={false}
          inputReadOnly
          picker={granularity}
          value={selectedDate}
          format={pickerFormat}
          disabledDate={disabledDate}
          className='!h-[42px] w-full !rounded-full md:w-[240px] [&_.ant-picker-input>input]:!text-sm'
          onChange={value => {
            if (value) {
              setSelectedDate(value)
            }
          }}
        />
      </div>

      {isEmpty ? (
        <Empty
          description='Aucune activite exploitable sur la periode selectionnee.'
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div className='h-[280px] w-full sm:h-[340px]'>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={chartData} margin={{ top: 14, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient
                  id={`${metric}-surface`}
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop offset='0%' stopColor='#43C7B1' stopOpacity={0.34} />
                  <stop offset='100%' stopColor='#43C7B1' stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke='rgba(17,27,33,0.08)'
                strokeDasharray='4 8'
                vertical={false}
              />

              <XAxis
                dataKey='bucket'
                axisLine={false}
                tickLine={false}
                tickMargin={12}
                minTickGap={granularity === 'week' ? 0 : 24}
                tick={{ fill: '#8a8a8a', fontSize: 12 }}
                tickFormatter={value => formatTick(value, granularity)}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                width={52}
                tickMargin={10}
                tick={{ fill: '#696969', fontSize: 12 }}
                tickFormatter={value => formatAxisNumber(Number(value))}
              />

              <Tooltip
                cursor={{
                  stroke: 'rgba(17,27,33,0.12)',
                  strokeDasharray: '4 6',
                }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) {
                    return null
                  }

                  return (
                    <div className='rounded-[22px] bg-[#111b21] px-4 py-3 text-white'>
                      <div className='mb-1 text-xs font-medium text-white/70'>
                        {formatTooltipLabel(String(label || ''), granularity)}
                      </div>
                      <div className='text-[28px] font-semibold leading-none'>
                        {formatNumber(Number(payload[0]?.value || 0))}
                      </div>
                    </div>
                  )
                }}
              />

              <Area
                type='monotone'
                dataKey='value'
                stroke='#43C7B1'
                strokeWidth={2.5}
                fill={`url(#${metric}-surface)`}
                activeDot={{
                  r: 6,
                  stroke: '#ffffff',
                  strokeWidth: 3,
                  fill: '#43C7B1',
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function UsageChartSection({
  series,
  minDay,
  maxDay,
}: {
  series: DailyStatsPoint[]
  minDay: string
  maxDay: string
}) {
  const [granularity, setGranularity] = useState<StatsGranularity>('year')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs(maxDay))
  const [visibleSeries, setVisibleSeries] = useState<UsageSeriesKey[]>(
    USAGE_SERIES.map(seriesConfig => seriesConfig.key)
  )

  const effectiveMinDay = useMemo(
    () => findFirstUsageDay(series, visibleSeries, minDay),
    [minDay, series, visibleSeries]
  )
  const selectedRange = useMemo(
    () => buildSelectedRange(granularity, selectedDate, maxDay),
    [granularity, maxDay, selectedDate]
  )
  const previousRange = useMemo(
    () => buildPreviousRange(selectedRange),
    [selectedRange]
  )
  const selectedPoints = useMemo(
    () => filterPoints(series, selectedRange),
    [selectedRange, series]
  )
  const previousPoints = useMemo(
    () =>
      previousRange.startDate >= effectiveMinDay
        ? filterPoints(series, previousRange)
        : [],
    [effectiveMinDay, previousRange, series]
  )
  const periodMessages = useMemo(
    () => selectedPoints.reduce((total, point) => total + point.messages, 0),
    [selectedPoints]
  )
  const previousMessages = useMemo(
    () => previousPoints.reduce((total, point) => total + point.messages, 0),
    [previousPoints]
  )
  const periodCredits = useMemo(
    () => sumUsageMetric(selectedPoints, 'credits'),
    [selectedPoints]
  )
  const delta = useMemo(
    () => formatDelta(periodMessages, previousMessages),
    [periodMessages, previousMessages]
  )
  const chartData = useMemo(
    () => buildUsageChartData(selectedPoints, granularity),
    [granularity, selectedPoints]
  )
  const disabledDate = useMemo(
    () => buildDisabledDate(granularity, effectiveMinDay, maxDay),
    [effectiveMinDay, granularity, maxDay]
  )
  const pickerFormat = useMemo(
    () => (value: Dayjs) => formatPickerValue(value, granularity, maxDay),
    [granularity, maxDay]
  )
  const isEmpty =
    chartData.length === 0 ||
    chartData.every(point =>
      visibleSeries.every(seriesKey => Number(point[seriesKey]) === 0)
    )

  function toggleSeries(seriesKey: UsageSeriesKey) {
    setVisibleSeries(current => {
      if (current.includes(seriesKey)) {
        return current.length === 1
          ? current
          : current.filter(entry => entry !== seriesKey)
      }

      return [...current, seriesKey]
    })
  }

  return (
    <section className='flex flex-col gap-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div>
          <Title level={5} className='!mb-0'>
            Messages
          </Title>
          <p className='mt-2 mb-0 text-sm text-[var(--color-text-secondary)]'>
            Comparez les volumes texte, image, audio et l’estimation des crédits consommés.
          </p>
        </div>

        {!isEmpty ? (
          <div className='flex flex-wrap items-end gap-3 md:justify-end'>
            <div className='text-[44px] font-semibold leading-none text-[#111b21]'>
              {formatNumber(periodMessages)}
            </div>
            {delta ? (
              <div
                className={`rounded-2xl bg-[#111b21] px-3 py-2 text-[12px] font-semibold leading-none ${
                  delta.positive ? 'text-primary-green' : 'text-[#ff7875]'
                }`}
              >
                {delta.label}
              </div>
            ) : null}
            <div className='rounded-full bg-[#F4F2ED] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]'>
              {formatNumber(periodCredits, 1)} crédits estimés
            </div>
          </div>
        ) : null}
      </div>

      <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <Segmented<StatsGranularity>
          value={granularity}
          shape='round'
          options={[
            { label: 'Semaine', value: 'week' },
            { label: 'Mois', value: 'month' },
            { label: 'Année', value: 'year' },
          ]}
          className='stats-granularity-toggle'
          onChange={value => setGranularity(value)}
        />

        <DatePicker
          allowClear={false}
          inputReadOnly
          picker={granularity}
          value={selectedDate}
          format={pickerFormat}
          disabledDate={disabledDate}
          className='!h-[42px] w-full !rounded-full md:w-[240px] [&_.ant-picker-input>input]:!text-sm'
          onChange={value => {
            if (value) {
              setSelectedDate(value)
            }
          }}
        />
      </div>

      {isEmpty ? (
        <Empty
          description='Aucune activite exploitable sur la periode selectionnee.'
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          <div className='h-[300px] w-full sm:h-[360px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart data={chartData} margin={{ top: 14, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  {USAGE_SERIES.map(seriesConfig => (
                    <linearGradient
                      key={seriesConfig.key}
                      id={`usage-surface-${seriesConfig.key}`}
                      x1='0'
                      y1='0'
                      x2='0'
                      y2='1'
                    >
                      <stop
                        offset='0%'
                        stopColor={seriesConfig.color}
                        stopOpacity={0.24}
                      />
                      <stop
                        offset='100%'
                        stopColor={seriesConfig.color}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  ))}
                </defs>

                <CartesianGrid
                  stroke='rgba(17,27,33,0.08)'
                  strokeDasharray='4 8'
                  vertical={false}
                />

                <XAxis
                  dataKey='bucket'
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  minTickGap={granularity === 'week' ? 0 : 24}
                  tick={{ fill: '#8a8a8a', fontSize: 12 }}
                  tickFormatter={value => formatTick(value, granularity)}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickMargin={10}
                  tick={{ fill: '#696969', fontSize: 12 }}
                  tickFormatter={value => formatAxisNumber(Number(value))}
                />

                <Tooltip
                  cursor={{
                    stroke: 'rgba(17,27,33,0.12)',
                    strokeDasharray: '4 6',
                  }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) {
                      return null
                    }

                    return (
                      <div className='rounded-[22px] bg-[#111b21] px-4 py-3 text-white'>
                        <div className='mb-3 text-xs font-medium text-white/70'>
                          {formatTooltipLabel(String(label || ''), granularity)}
                        </div>
                        <div className='space-y-2'>
                          {payload
                            .filter(entry =>
                              visibleSeries.includes(entry.dataKey as UsageSeriesKey)
                            )
                            .map(entry => {
                              const config = USAGE_SERIES.find(
                                seriesConfig =>
                                  seriesConfig.key ===
                                  (entry.dataKey as UsageSeriesKey)
                              )

                              if (!config) {
                                return null
                              }

                              return (
                                <div
                                  key={config.key}
                                  className='flex items-center justify-between gap-5 text-sm'
                                >
                                  <div className='flex items-center gap-2'>
                                    <span
                                      className='h-2.5 w-2.5 rounded-full'
                                      style={{ backgroundColor: config.color }}
                                    />
                                    <span>{config.label}</span>
                                  </div>
                                  <span className='font-semibold'>
                                    {formatNumber(
                                      Number(entry.value || 0),
                                      config.key === 'credits' ? 1 : 0
                                    )}
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )
                  }}
                />

                {USAGE_SERIES.filter(seriesConfig =>
                  visibleSeries.includes(seriesConfig.key)
                ).map(seriesConfig => (
                  <Area
                    key={seriesConfig.key}
                    type='monotone'
                    dataKey={seriesConfig.key}
                    stroke={seriesConfig.color}
                    strokeWidth={2.3}
                    fill={`url(#usage-surface-${seriesConfig.key})`}
                    activeDot={{
                      r: 5,
                      stroke: '#ffffff',
                      strokeWidth: 2,
                      fill: seriesConfig.color,
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className='flex flex-wrap gap-2 pt-1'>
            {USAGE_SERIES.map(seriesConfig => {
              const checked = visibleSeries.includes(seriesConfig.key)

              return (
                <button
                  key={seriesConfig.key}
                  type='button'
                  onClick={() => toggleSeries(seriesConfig.key)}
                  className={`rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                    checked
                      ? 'text-white'
                      : 'border-[var(--color-field-border-muted)] bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]'
                  }`}
                  style={
                    checked
                      ? {
                          backgroundColor: seriesConfig.color,
                          borderColor: seriesConfig.color,
                        }
                      : undefined
                  }
                >
                  {seriesConfig.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

export function meta() {
  return [
    { title: 'Statistiques - WhatsApp Agent' },
    {
      name: 'description',
      content: 'Volumes de conversations et de messages sur WhatsApp Agent',
    },
  ]
}

export default function StatsPage() {
  const { user } = useAuth()
  const currentPlanLabel = getPlanLabel(resolveCurrentPlanKey(user))
  const today = useMemo(() => formatUtcDay(new Date()), [])
  const oldestFetchedYear =
    parseUtcDay(today).getUTCFullYear() - YEAR_OPTIONS_DEPTH
  const defaultStartDate = `${oldestFetchedYear}-01-01`

  const statsQuery = useQuery<StatsAnalyticsResponse>({
    queryKey: ['stats-analytics-dashboard', defaultStartDate, today],
    queryFn: () =>
      getStatsAnalytics({
        startDate: defaultStartDate,
        endDate: today,
      }),
  })

  const summaryQuery = useQuery<UserStatsSummary>({
    queryKey: ['stats-summary'],
    queryFn: () => getUserStatsSummary(),
  })

  const minDay = statsQuery.data?.series[0]?.day ?? defaultStartDate
  const maxDay = statsQuery.data?.range.endDate ?? today

  return (
    <>
      <DashboardHeader title='Statistiques' />

      <div className='flex w-full flex-col gap-10 px-4 py-5 sm:px-6 sm:py-6'>
        {summaryQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : summaryQuery.data ? (
          <CreditsOverviewCard
            summary={summaryQuery.data}
            currentPlanLabel={currentPlanLabel}
            onAddCredits={() => {
              window.location.assign('/pricing')
            }}
          />
        ) : null}

        {statsQuery.isLoading ? (
          <>
            <Skeleton active paragraph={{ rows: 8 }} />
            <Skeleton active paragraph={{ rows: 8 }} />
          </>
        ) : statsQuery.isError ? (
          <Alert
            type='error'
            showIcon
            message='Impossible de charger les statistiques'
            action={
              <Button
                type='text'
                icon={<ReloadOutlined />}
                className='!shadow-none'
                onClick={() => statsQuery.refetch()}
              >
                Réessayer
              </Button>
            }
          />
        ) : statsQuery.data ? (
          <>
            <UsageChartSection
              series={statsQuery.data.series}
              minDay={minDay}
              maxDay={maxDay}
            />
            <SingleMetricChartSection
              title='Conversations'
              metric='conversations'
              series={statsQuery.data.series}
              minDay={minDay}
              maxDay={maxDay}
            />
          </>
        ) : (
          <Empty
            description='Aucune statistique disponible pour le moment.'
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </div>
    </>
  )
}
