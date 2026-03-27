import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let context:
  | {
      queryClient: QueryClient
    }
  | undefined

export function getContext() {
  if (context) {
    return context
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        staleTime: 0,
      },
    },
  })

  context = {
    queryClient,
  }

  return context
}

export default function TanStackQueryProvider({
  children,
}: {
  children?: unknown
}) {
  const { queryClient } = getContext()

  return (
    <QueryClientProvider client={queryClient}>
      {children as never}
    </QueryClientProvider>
  )
}
