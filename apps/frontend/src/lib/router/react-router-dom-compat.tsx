import {
  Link as TanStackLink,
  useLocation as useTanStackLocation,
  useNavigate as useTanStackNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  type AnchorHTMLAttributes,
  type MouseEventHandler,
  useCallback,
  useMemo,
} from 'react'

type NavigateOptions = {
  replace?: boolean
  state?: unknown
}

type NavigateTarget =
  | number
  | string
  | {
      hash?: string
      pathname?: string
      search?: string
      state?: unknown
    }

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  replace?: boolean
  state?: unknown
  to?: string
}

type SearchParamsInit =
  | ConstructorParameters<typeof URLSearchParams>[0]
  | URLSearchParams

type SetSearchParams = (
  nextInit:
    | SearchParamsInit
    | ((prev: URLSearchParams) => SearchParamsInit | URLSearchParams),
  navigateOpts?: NavigateOptions
) => void

function normalizeHash(hash?: string) {
  if (!hash) {
    return ''
  }

  return hash.startsWith('#') ? hash.slice(1) : hash
}

function parseHref(
  href: string,
  currentPathname = '/'
): {
  hash: string
  pathname: string
  search: string
} {
  const isAbsolute = /^[a-zA-Z][a-zA-Z\\d+.-]*:/.test(href)
  const base = `https://router.local${currentPathname.startsWith('/') ? '' : '/'}${currentPathname}`
  const url = isAbsolute ? new URL(href) : new URL(href, base)

  return {
    hash: url.hash,
    pathname: url.pathname,
    search: url.search,
  }
}

function searchToObject(search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const result: Record<string, string | string[]> = {}

  for (const [key, value] of params.entries()) {
    const currentValue = result[key]

    if (currentValue === undefined) {
      result[key] = value
      continue
    }

    result[key] = Array.isArray(currentValue)
      ? [...currentValue, value]
      : [currentValue, value]
  }

  return result
}

function createSearchParams(init?: SearchParamsInit) {
  if (!init) {
    return new URLSearchParams()
  }

  if (init instanceof URLSearchParams) {
    return new URLSearchParams(init)
  }

  return new URLSearchParams(init)
}

function stripRouterState(state: unknown) {
  if (!state || typeof state !== 'object') {
    return state
  }

  const {
    __TSR_index: _index,
    __TSR_key: _key,
    key: _legacyKey,
    ...rest
  } = state as Record<string, unknown>

  return rest
}

export function useNavigate() {
  const navigate = useTanStackNavigate()
  const router = useRouter()
  const currentLocation = useTanStackLocation()

  return useCallback(
    (to: NavigateTarget, options: NavigateOptions = {}) => {
      if (typeof to === 'number') {
        window.history.go(to)
        return Promise.resolve()
      }

      const nextState =
        options.state ?? (typeof to === 'object' ? to.state : undefined)

      if (typeof to === 'string') {
        const parsed = parseHref(to, currentLocation.pathname)

        return navigate({
          hash: normalizeHash(parsed.hash) || undefined,
          replace: options.replace,
          search: searchToObject(parsed.search),
          state: nextState,
          to: parsed.pathname,
        } as never)
      }

      const pathname = to.pathname ?? router.state.location.pathname
      const search = to.search ?? ''
      const hash = to.hash ?? ''

      return navigate({
        hash: normalizeHash(hash) || undefined,
        replace: options.replace,
        search: searchToObject(search),
        state: nextState,
        to: pathname,
      } as never)
    },
    [currentLocation.pathname, navigate, router.state.location.pathname]
  )
}

export function useLocation() {
  const location = useTanStackLocation()
  const locationState =
    location.state as unknown as Record<string, unknown> | undefined

  return useMemo(
    () => ({
      hash: location.hash,
      key:
        locationState?.__TSR_key ??
        locationState?.key ??
        'default',
      pathname: location.pathname,
      search: location.searchStr,
      state: stripRouterState(location.state),
    }),
    [location.hash, location.pathname, location.searchStr, location.state, locationState]
  )
}

export function useSearchParams(defaultInit?: SearchParamsInit) {
  const location = useTanStackLocation()
  const navigate = useNavigate()

  const searchParams = useMemo(() => {
    if (!location.searchStr && defaultInit) {
      return createSearchParams(defaultInit)
    }

    return createSearchParams(location.searchStr)
  }, [defaultInit, location.searchStr])

  const setSearchParams = useCallback<SetSearchParams>(
    (nextInit, navigateOpts) => {
      const nextValue =
        typeof nextInit === 'function'
          ? nextInit(createSearchParams(location.searchStr))
          : nextInit
      const nextParams = createSearchParams(nextValue)
      const nextSearch = nextParams.toString()

      void navigate(
        {
          hash: location.hash,
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        navigateOpts
      )
    },
    [location.hash, location.pathname, location.searchStr, navigate]
  )

  return [searchParams, setSearchParams] as const
}

export function Link({
  href,
  onClick,
  replace,
  state,
  target,
  to,
  ...rest
}: LinkProps) {
  const currentLocation = useTanStackLocation()
  const destination = to ?? href

  if (!destination) {
    return <a {...rest} href={href} onClick={onClick} target={target} />
  }

  const isExternal = /^[a-zA-Z][a-zA-Z\\d+.-]*:/.test(destination)

  if (isExternal) {
    return (
      <a
        {...rest}
        href={destination}
        onClick={onClick}
        target={target}
      />
    )
  }

  const parsed = parseHref(destination, currentLocation.pathname)

  return (
    <TanStackLink
      {...(rest as object)}
      hash={normalizeHash(parsed.hash) || undefined}
      onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
      replace={replace}
      search={searchToObject(parsed.search) as never}
      state={state as never}
      target={target}
      to={parsed.pathname as never}
    />
  )
}

export function Outlet() {
  return null
}

export function Navigate() {
  return null
}
