import dotenv from 'dotenv'

dotenv.config()

if (!process.env.DISCORD_TOKEN) {
  throw new Error('Missing environment variable DISCORD_TOKEN; aborting.')
}

if (!process.env.DISCORD_CLIENT_ID) {
  throw new Error('Missing environment variable DISCORD_CLIENT_ID; aborting.')
}

if (!process.env.DATABASE_URL) {
  throw new Error('Missing environment variable DATABASE_URL; aborting.')
}

if (!process.env.CROWDIN_TOKEN) {
  throw new Error('Missing environment variable CROWDIN_TOKEN; aborting.')
}

export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_PROD = process.env.NODE_ENV === 'production'

export const DATABASE_URL = process.env.DATABASE_URL
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN
export const CROWDIN_TOKEN = process.env.CROWDIN_TOKEN
export const PINECONE_API_KEY = process.env.PINECONE_API_KEY
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY
