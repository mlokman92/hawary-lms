import { AppState, type AppStateStatus } from 'react-native'
import { focusManager, QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// TanStack Query's "window focus" is a browser idea. On a phone the equivalent
// is the app coming back to the foreground, which is when stale lists refetch.
AppState.addEventListener('change', (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active')
})
