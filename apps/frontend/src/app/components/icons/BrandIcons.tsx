type BrandIconProps = {
  className?: string
}

export function GoogleBrandIcon({ className }: BrandIconProps) {
  return (
    <svg
      viewBox='0 0 48 48'
      fill='none'
      aria-hidden='true'
      className={className}
    >
      <path
        fill='#4285F4'
        d='M41 24.5c0-1.3-.1-2.5-.4-3.7H24v7h9.5c-.4 2.3-1.7 4.2-3.6 5.5v4.6h5.8c3.4-3.1 5.3-7.7 5.3-13.4Z'
      />
      <path
        fill='#34A853'
        d='M24 42c4.8 0 8.8-1.6 11.8-4.2L30 33.2c-1.6 1.1-3.6 1.8-6 1.8-4.6 0-8.5-3.1-9.9-7.3h-6V32c3 6 9.2 10 15.9 10Z'
      />
      <path
        fill='#FBBC04'
        d='M14.1 27.8c-.3-1.1-.5-2.2-.5-3.3s.2-2.3.5-3.4V16.4h-6C6.7 19 6 21.7 6 24.5c0 2.8.7 5.5 2.1 8l6-4.7Z'
      />
      <path
        fill='#EA4335'
        d='M24 13.8c2.6 0 4.9.9 6.8 2.7l5.1-5.1C32.8 8.6 28.8 7 24 7c-6.7 0-12.9 4-15.9 9.9l6 4.7c1.4-4.2 5.3-7.8 9.9-7.8Z'
      />
    </svg>
  )
}

export function FacebookBrandIcon({ className }: BrandIconProps) {
  return (
    <svg
      viewBox='0 0 48 48'
      fill='none'
      aria-hidden='true'
      className={className}
    >
      <path
        fill='#1877F2'
        d='M48 24C48 10.745 37.255 0 24 0S0 10.745 0 24c0 11.98 8.776 21.91 20.25 23.713V30.938h-6.094V24h6.094v-5.288c0-6.015 3.583-9.338 9.065-9.338 2.626 0 5.374.469 5.374.469v5.906h-3.027c-2.98 0-3.912 1.85-3.912 3.75V24h6.656l-1.064 6.938h-5.592v16.775C39.224 45.91 48 35.98 48 24Z'
      />
      <path
        fill='white'
        d='M33.345 30.938 34.409 24h-6.656v-4.781c0-1.897.932-3.75 3.912-3.75h3.027V9.563s-2.748-.469-5.374-.469c-5.482 0-9.065 3.323-9.065 9.338V24h-6.094v6.938h6.094v16.775a24.234 24.234 0 0 0 7.437 0V30.938h5.592Z'
      />
    </svg>
  )
}
