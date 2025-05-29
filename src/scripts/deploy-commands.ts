import dotenv from 'dotenv'
import { deployCommands } from '../utils/deploy-commands'

dotenv.config()

const GUILD_ID = process.env.GUILD_ID
if (!GUILD_ID) throw new Error('Missing ‘GUILD_ID’ environment variable.')

deployCommands(GUILD_ID)
