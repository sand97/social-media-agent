import type { paths } from '@app/lib/api/v1'
import createFetchClient, { type Middleware } from 'openapi-fetch'
import createClient from 'openapi-react-query'

const fetchClient = createFetchClient<paths>({
  baseUrl: 'http://localhost:3005',
})

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = localStorage.getItem('token')
    if (!token) {
      return request
    }
    request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

fetchClient.use(authMiddleware)

export const $api = createClient(fetchClient)
