import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import type { StatusSchedule } from '@app/lib/api/status-scheduler'
import { Button, DatePicker, Form, Input, Modal, Select, Upload } from 'antd'
import type { UploadProps } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect } from 'react'

import {
  CONTENT_TYPE_META,
  createSlotValue,
  getDisabledScheduleTime,
  getMinimumScheduleTime,
  type ComposerFormValues,
} from './utils'

type ComposerModalProps = {
  open: boolean
  onCancel: () => void
  selectedDay: string
  editingSchedule: StatusSchedule | null
  onSubmit: (values: ComposerFormValues) => void
  isPending: boolean
}

export function ComposerModal({
  open,
  onCancel,
  selectedDay,
  editingSchedule,
  onSubmit,
  isPending,
}: ComposerModalProps) {
  const [form] = Form.useForm<ComposerFormValues>()
  const contentType = Form.useWatch('contentType', form) || 'TEXT'
  const currentMediaUrl = Form.useWatch('mediaUrl', form)

  useEffect(() => {
    if (open) {
      if (editingSchedule) {
        form.setFieldsValue({
          caption: editingSchedule.caption || '',
          contentType: editingSchedule.contentType,
          mediaUrl: editingSchedule.mediaUrl || '',
          slots: [{ scheduledFor: dayjs(editingSchedule.scheduledFor) }],
          textContent: editingSchedule.textContent || '',
        })
      } else {
        form.setFieldsValue({
          caption: '',
          contentType: 'TEXT',
          mediaUrl: '',
          slots: [{ scheduledFor: createSlotValue(selectedDay) }],
          textContent: '',
        })
      }
    } else {
      form.resetFields()
    }
  }, [open, selectedDay, editingSchedule, form])

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

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key='cancel' onClick={onCancel}>
          Annuler
        </Button>,
        <Button
          key='submit'
          type='primary'
          icon={<PlusOutlined />}
          iconPosition='end'
          loading={isPending}
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
          onFinish={onSubmit}
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
                                    `Choisissez une date au moins 2 minutes après cet instant.`
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
                      <Button
                        onClick={() => remove(field.name)}
                        className={'h-13!'}
                      >
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
                <Input.TextArea rows={5} placeholder='S’adapter à au client' />
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
                        <Button variant={'text'}>Changer le fichier</Button>
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
  )
}
