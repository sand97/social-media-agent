import { ArrowRightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { ReactNode } from 'react'

type ActionCardProps = {
  title: string
  subtitle: string
  icon?: ReactNode
  actionLabel: string
  onAction: () => void
  className?: string
}

export function ActionCard({
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
  className,
}: ActionCardProps) {
  return (
    <article
      className={`flex items-center justify-between gap-6 border-none bg-white p-6 text-left shadow-card max-md:flex-col max-md:items-start ${className || ''}`.trim()}
    >
      <div className='min-w-0 flex-1'>
        <div className='mb-2 flex items-center gap-2.5'>
          {icon ? (
            <span className='inline-flex h-6 w-6 items-center justify-center text-text-dark'>
              {icon}
            </span>
          ) : null}
          <span className='text-base font-semibold leading-[1.1] text-text-dark'>
            {title}
          </span>
        </div>
        <p className='m-0 text-sm leading-[1.7] text-text-muted'>{subtitle}</p>
      </div>

      <Button
        icon={<ArrowRightOutlined />}
        iconPosition='end'
        className='max-md:w-full'
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </article>
  )
}
