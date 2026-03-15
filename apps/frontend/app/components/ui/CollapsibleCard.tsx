import { DownCircleOutlined } from '@ant-design/icons'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

type CollapsibleCardProps = {
  title: string
  subtitle?: string
  children?: ReactNode
  defaultExpanded?: boolean
  expanded?: boolean
  onToggle?: (expanded: boolean) => void
  hideSubtitleWhenExpanded?: boolean
  className?: string
  bodyClassName?: string
}

export function CollapsibleCard({
  title,
  subtitle,
  children,
  defaultExpanded = false,
  expanded,
  onToggle,
  hideSubtitleWhenExpanded = false,
  className,
  bodyClassName,
}: CollapsibleCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const contentId = useId()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLParagraphElement | null>(null)
  const [fullHeight, setFullHeight] = useState<number | null>(null)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  const isControlled = expanded !== undefined
  const isExpanded = isControlled ? expanded : internalExpanded
  const isInteractive = Boolean(children)

  useEffect(() => {
    const bodyEl = bodyRef.current
    const previewEl = previewRef.current

    if (!bodyEl && !previewEl) return

    const observer = new ResizeObserver(() => {
      if (bodyEl) {
        setFullHeight(bodyEl.scrollHeight)
      }

      if (previewEl) {
        setPreviewHeight(previewEl.getBoundingClientRect().height)
      }
    })

    if (bodyEl) {
      observer.observe(bodyEl)
      setFullHeight(bodyEl.scrollHeight)
    }

    if (previewEl) {
      observer.observe(previewEl)
      setPreviewHeight(previewEl.getBoundingClientRect().height)
    }

    return () => observer.disconnect()
  }, [])

  const handleToggle = () => {
    if (!isInteractive) return
    const nextExpanded = !isExpanded
    if (!isControlled) setInternalExpanded(nextExpanded)
    onToggle?.(nextExpanded)
  }

  const subtitleLines = subtitle
    ? subtitle
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    : []
  const subtitlePreview =
    subtitleLines.length > 1 ? `${subtitleLines[0]}...` : subtitleLines[0]

  const shouldUseSharedContentSlot = isInteractive && hideSubtitleWhenExpanded
  const shouldShowSubtitle = Boolean(subtitlePreview) && !shouldUseSharedContentSlot
  const shouldRenderSharedContentSlot =
    shouldUseSharedContentSlot && (Boolean(subtitlePreview) || isExpanded)
  const bodyHeight = isExpanded ? (fullHeight ?? 0) : 0
  const sharedContentHeight =
    previewHeight === null && fullHeight === null
      ? undefined
      : {
          height: isExpanded
            ? (fullHeight ?? previewHeight ?? 0)
            : (previewHeight ?? 0),
        }

  return (
    <button
      type='button'
      className={`w-full rounded-[var(--radius-card)] bg-white text-left shadow-card transition-[box-shadow] duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${
        isExpanded
          ? 'shadow-[0px_0px_1px_0px_rgba(0,0,0,0.4),0px_24px_60px_rgba(17,27,33,0.08)]'
          : ''
      } ${className || ''}`.trim()}
      onClick={handleToggle}
      aria-expanded={isInteractive ? isExpanded : undefined}
      aria-controls={isInteractive ? contentId : undefined}
    >
      <div className='flex items-center justify-between gap-5 px-6 pb-4 pt-4'>
        <div className='min-w-0 flex-1'>
          <span className='block text-base font-semibold leading-[1.1] text-text-dark'>
            {title}
          </span>
          {shouldShowSubtitle ? (
            <p className='m-0 mt-2 truncate text-sm font-normal leading-[1.7] text-text-muted'>
              {subtitlePreview}
            </p>
          ) : null}

          {shouldRenderSharedContentSlot ? (
            <div
              id={contentId}
              className='mt-4 overflow-hidden transition-[height] duration-500 ease-in-out'
              style={sharedContentHeight}
            >
              <div
                className='relative'
              >
                <div
                  ref={bodyRef}
                  className={`transition-opacity duration-200 ease-in-out [&_strong]:font-normal [&_b]:font-normal ${
                    isExpanded ? 'opacity-100' : 'opacity-0'
                  } ${bodyClassName || ''}`.trim()}
                >
                  {children}
                </div>

                {subtitlePreview ? (
                  <div
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ease-in-out ${
                      isExpanded ? 'opacity-0' : 'opacity-100'
                    }`}
                  >
                    <p
                      ref={previewRef}
                      className='m-0 truncate text-sm font-normal leading-[1.75] text-text-muted'
                    >
                      {subtitlePreview}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {isInteractive ? (
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none text-lg text-text-dark transition-transform duration-300 ease-in-out ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden='true'
          >
            <DownCircleOutlined />
          </span>
        ) : null}
      </div>

      {isInteractive && !shouldUseSharedContentSlot ? (
        <div
          id={contentId}
          className='overflow-hidden transition-[height] duration-500 ease-in-out'
          style={{ height: bodyHeight }}
        >
          <div
            ref={bodyRef}
            className={`px-6 pb-4 pt-0 [&_strong]:font-normal [&_b]:font-normal ${bodyClassName || ''}`.trim()}
          >
            {children}
          </div>
        </div>
      ) : null}
    </button>
  )
}
