import fetch from 'node-fetch'
import { logger } from './logger'

export async function fetchJson(url: string, options: fetch.RequestInit) {
  const response = await fetch(url, options)
  const data = await response.json()

  if (!response.ok) {
    logger.logtail.error('Fetch failed', { data, status: response.status })
    throw new Error(`Fetch failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return data
}
