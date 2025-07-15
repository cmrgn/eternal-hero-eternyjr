import fetch from 'node-fetch'

export async function fetchJson(url: string, options: fetch.RequestInit) {
  const response = await fetch(url, options)
  const data = await response.json()

  if (!response.ok) {
    console.warn(`Fetch failed (${response.status}): ${JSON.stringify(data)}`)
    throw new Error(`Fetch failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return data
}
