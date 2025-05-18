import dotenv from 'dotenv'

dotenv.config()

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  throw new Error('Missing environment variables')
}

export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN
export const LOCAL_SERVER_ID = process.env.LOCAL_SERVER_ID
export const IS_DEV = process.env.NODE_ENV === 'development'
