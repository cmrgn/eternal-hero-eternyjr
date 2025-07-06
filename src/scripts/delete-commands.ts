import dotenv from 'dotenv'

import { DiscordManager } from '../managers/DiscordManager'

dotenv.config()

const Discord = new DiscordManager()

const GUILD_ID = process.env.GUILD_ID
const COMMAND_ID = process.env.COMMAND_ID

if (!GUILD_ID) throw new Error('Missing ‘GUILD_ID’ environment variable.')

if (COMMAND_ID) {
  Discord.deleteCommand(GUILD_ID, COMMAND_ID)
} else {
  Discord.deleteCommands(GUILD_ID)
}
