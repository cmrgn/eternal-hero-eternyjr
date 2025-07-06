import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing environment variable DATABASE_URL; aborting.')
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // for Heroku Postgres SSL
})
