if (!process.env.DISCORD_TOKEN) {
  throw new Error('Missing environment variable DISCORD_TOKEN; aborting.')
}

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN
export const IS_DEV = process.env.NODE_ENV === 'development'
