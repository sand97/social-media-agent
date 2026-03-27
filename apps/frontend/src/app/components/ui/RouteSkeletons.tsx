function PulseBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />
}

function PulseParagraph({ lines }: { lines: string[] }) {
  return (
    <div className='space-y-3'>
      {lines.map((line, index) => (
        <PulseBlock key={index} className={line} />
      ))}
    </div>
  )
}

function DashboardStatCardSkeleton() {
  return (
    <div className='rounded-[28px] border border-[rgba(17,27,33,0.06)] bg-white p-5 shadow-card'>
      <PulseBlock className='mb-4 h-4 w-28 max-w-full' />
      <PulseBlock className='mb-3 h-9 w-24 max-w-full' />
      <PulseParagraph lines={['h-4 w-[85%]', 'h-4 w-[60%]']} />
    </div>
  )
}

function DashboardPanelSkeleton({ lines }: { lines: string[] }) {
  return (
    <div className='rounded-[28px] border border-[rgba(17,27,33,0.06)] bg-white p-6 shadow-card'>
      <PulseBlock className='mb-5 h-5 w-40 max-w-full' />
      <PulseParagraph lines={lines} />
    </div>
  )
}

export function HomeRouteSkeleton() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-10'>
      <div className='w-full max-w-3xl rounded-[32px] border border-white/60 bg-white/80 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-10'>
        <PulseBlock className='mb-5 h-12 w-48 max-w-full' />
        <PulseParagraph lines={['h-4 w-[92%]', 'h-4 w-[78%]', 'h-4 w-[56%]']} />
        <div className='mt-8 flex items-center justify-center gap-3'>
          <PulseBlock className='h-3 w-3 rounded-full bg-blue-300' />
          <PulseBlock className='h-3 w-3 rounded-full bg-blue-200 [animation-delay:150ms]' />
          <PulseBlock className='h-3 w-3 rounded-full bg-blue-100 [animation-delay:300ms]' />
        </div>
      </div>
    </div>
  )
}

export function AuthRouteSkeleton() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-[#f7f9fc] via-white to-[#eef3ff] px-4 py-8'>
      <div className='mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center'>
        <div className='w-full max-w-2xl rounded-[32px] border border-[rgba(17,27,33,0.06)] bg-white/90 p-6 shadow-[0_24px_60px_rgba(17,27,33,0.08)] backdrop-blur sm:p-8'>
          <PulseBlock className='mb-3 h-4 w-24 max-w-full' />
          <PulseBlock className='mb-6 h-12 w-56 max-w-full' />
          <PulseParagraph lines={['h-4 w-full', 'h-4 w-[72%]']} />
          <div className='mt-8 space-y-4'>
            <PulseBlock className='h-12 w-full' />
            <PulseBlock className='h-12 w-full' />
            <PulseBlock className='h-12 w-full' />
          </div>
        </div>
      </div>
    </div>
  )
}

export function DocumentRouteSkeleton() {
  return (
    <div className='min-h-screen bg-[radial-gradient(circle_at_top,_rgba(36,211,102,0.12),_transparent_32%),linear-gradient(180deg,_#fcfbf8_0%,_#f5f4f1_100%)] px-4 py-8 sm:px-6 sm:py-12'>
      <div className='mx-auto max-w-5xl space-y-6'>
        <div className='rounded-[32px] border border-[rgba(17,27,33,0.08)] bg-[rgba(255,255,255,0.82)] p-6 shadow-[0px_20px_60px_rgba(17,27,33,0.08)] sm:p-10'>
          <PulseBlock className='mb-4 h-4 w-28 max-w-full' />
          <PulseBlock className='mb-6 h-12 w-80 max-w-full' />
          <PulseParagraph lines={['h-4 w-[96%]', 'h-4 w-[88%]', 'h-4 w-[72%]']} />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className='rounded-[28px] border border-[rgba(17,27,33,0.08)] bg-white px-6 py-6 shadow-card sm:px-8'
          >
            <PulseBlock className='mb-5 h-6 w-56 max-w-full' />
            <PulseParagraph lines={['h-4 w-full', 'h-4 w-[96%]', 'h-4 w-[91%]', 'h-4 w-[78%]']} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardRouteSkeleton() {
  return (
    <div className='flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div className='min-w-0 flex-1'>
          <PulseBlock className='mb-3 h-10 w-48 max-w-full' />
          <PulseParagraph lines={['h-4 w-[68%]', 'h-4 w-[44%]']} />
        </div>
        <PulseBlock className='h-11 w-40 max-w-full' />
      </div>

      <div className='grid gap-4 xl:grid-cols-3'>
        {Array.from({ length: 3 }, (_, index) => (
          <DashboardStatCardSkeleton key={index} />
        ))}
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'>
        <DashboardPanelSkeleton
          lines={[
            'h-4 w-full',
            'h-4 w-[92%]',
            'h-4 w-[88%]',
            'h-4 w-[95%]',
            'h-4 w-[80%]',
            'h-4 w-[72%]',
          ]}
        />
        <DashboardPanelSkeleton
          lines={[
            'h-4 w-full',
            'h-4 w-[91%]',
            'h-4 w-[86%]',
            'h-4 w-[78%]',
            'h-4 w-[64%]',
          ]}
        />
      </div>
    </div>
  )
}

export function OnboardingRouteSkeleton() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8'>
      <div className='mx-auto max-w-5xl space-y-6'>
        <div className='rounded-lg bg-white p-6 shadow-sm'>
          <div className='grid gap-3 md:grid-cols-4'>
            {Array.from({ length: 4 }, (_, index) => (
              <PulseBlock key={index} className='h-11 w-full rounded-full' />
            ))}
          </div>
        </div>

        <div className='rounded-lg bg-white p-8 shadow-lg'>
          <PulseBlock className='mb-6 h-10 w-64 max-w-full' />
          <PulseParagraph lines={['h-4 w-full', 'h-4 w-[88%]', 'h-4 w-[72%]']} />
          <div className='mt-8 grid gap-4 md:grid-cols-2'>
            <DashboardPanelSkeleton
              lines={['h-4 w-full', 'h-4 w-[92%]', 'h-4 w-[84%]', 'h-4 w-[70%]']}
            />
            <DashboardPanelSkeleton
              lines={['h-4 w-full', 'h-4 w-[94%]', 'h-4 w-[82%]', 'h-4 w-[68%]']}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
