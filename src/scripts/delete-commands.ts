import dotenv from 'dotenv'
import { deleteCommands } from '../utils/commands'

dotenv.config()

const GUILD_ID = process.env.GUILD_ID
if (!GUILD_ID) throw new Error('Missing ‘GUILD_ID’ environment variable.')

deleteCommands(GUILD_ID)
