import apiClient from './client'

export type StatusScheduleContentType = 'TEXT' | 'IMAGE' | 'VIDEO'
export type StatusScheduleState =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED'

export interface StatusSchedule {
  id: string
  userId: string
  scheduledFor: string
  scheduledDay: string
  timezone: string
  contentType: StatusScheduleContentType
  textContent: string | null
  caption: string | null
  mediaUrl: string | null
  status: StatusScheduleState
  attempts: number
  lastError: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StatusScheduleRangeParams {
  startDate?: string
  endDate?: string
}

export interface CreateStatusSchedulePayload {
  scheduledFor: string
  timezone: string
  contentType: StatusScheduleContentType
  textContent?: string
  caption?: string
  mediaUrl?: string
}

export interface UpdateStatusSchedulePayload
  extends Partial<CreateStatusSchedulePayload> {}

export interface StatusScheduleDaySnapshot {
  day: string
  schedules: StatusSchedule[]
}

export interface StatusScheduleMutationResponse {
  affectedDays: StatusScheduleDaySnapshot[]
  schedule: StatusSchedule
}

export async function getStatusSchedules(
  params: StatusScheduleRangeParams = {}
): Promise<StatusSchedule[]> {
  const response = await apiClient.get<StatusSchedule[]>(
    '/users/me/status-schedules',
    {
      params,
    }
  )

  return response.data
}

export async function createStatusSchedule(
  payload: CreateStatusSchedulePayload
): Promise<StatusScheduleMutationResponse> {
  const response = await apiClient.post<StatusScheduleMutationResponse>(
    '/users/me/status-schedules',
    payload
  )

  return response.data
}

export async function updateStatusSchedule(
  scheduleId: string,
  payload: UpdateStatusSchedulePayload
): Promise<StatusScheduleMutationResponse> {
  const response = await apiClient.patch<StatusScheduleMutationResponse>(
    `/users/me/status-schedules/${scheduleId}`,
    payload
  )

  return response.data
}

export async function cancelStatusSchedule(
  scheduleId: string
): Promise<StatusScheduleMutationResponse> {
  const response = await apiClient.delete<StatusScheduleMutationResponse>(
    `/users/me/status-schedules/${scheduleId}`
  )

  return response.data
}
