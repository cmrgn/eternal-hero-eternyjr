import { Events } from 'discord.js'
import 'dotenv/config'
import { client } from './client'
import { onClientReady } from './events/clientReady'
import { onGuildCreate } from './events/guildCreate'
import { onInteractionCreate } from './events/interactionCreate'
import { onMessageCreate } from './events/messageCreate'
import { LogManager } from './managers/LogManager'

// Set up global error handlers to catch unhandled errors and log them to Logtail
const globalLogger = new LogManager('GlobalErrorHandler')

process.on('uncaughtException', error => {
  globalLogger.log('error', 'Uncaught Exception - Bot will crash', {
    error: error.message,
    name: error.name,
    stack: error.stack,
  })

  // Give Logtail time to send the log before crashing
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

process.on('unhandledRejection', (reason, promise) => {
  globalLogger.log('error', 'Unhandled Promise Rejection - Bot will crash', {
    promise: promise.toString(),
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })

  // Give Logtail time to send the log before crashing
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

client.login(client.managers.Discord.token)
client
  .once(Events.ClientReady, onClientReady)
  .on(Events.GuildCreate, onGuildCreate)
  .on(Events.MessageCreate, onMessageCreate)
  .on(Events.InteractionCreate, onInteractionCreate)
