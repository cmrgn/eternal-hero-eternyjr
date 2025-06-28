import dotenv from 'dotenv'

import { deleteCommand, deleteCommands } from '../utils/commands'

dotenv.config()

const GUILD_ID = process.env.GUILD_ID
const COMMAND_ID = process.env.COMMAND_ID

if (!GUILD_ID) throw new Error('Missing ‘GUILD_ID’ environment variable.')

if (COMMAND_ID) {
  deleteCommand(GUILD_ID, COMMAND_ID)
} else {
  deleteCommands(GUILD_ID)
}
