import dotenv from 'dotenv'

import { deployCommand, deployCommands } from '../utils/commands'

dotenv.config()

const GUILD_ID = process.env.GUILD_ID
const COMMAND_NAME = process.env.COMMAND_NAME

if (!GUILD_ID) throw new Error('Missing ‘GUILD_ID’ environment variable.')

if (COMMAND_NAME) {
  deployCommand(GUILD_ID, COMMAND_NAME)
} else {
  deployCommands(GUILD_ID)
}
