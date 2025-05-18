import dotenv from 'dotenv'
import { deployCommands } from '../deploy-commands'

dotenv.config()

const GUILD_ID = process.env.GUILD_ID

if (!GUILD_ID) {
  throw new Error('Missing ‘GUILD_ID’ environment variable.')
}

deployCommands({ guildId: GUILD_ID })
