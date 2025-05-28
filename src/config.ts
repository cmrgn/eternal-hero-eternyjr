import dotenv from 'dotenv'

dotenv.config()

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  throw new Error('Missing environment variables')
}

export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN
export const DATABASE_URL = process.env.DATABASE_URL
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN
export const TEST_SERVER_ID = process.env.TEST_SERVER_ID
export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_PROD = process.env.NODE_ENV === 'production'
export const BOT_COLOR = '#ac61ff'
