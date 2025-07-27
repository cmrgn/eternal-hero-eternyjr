import type { Client } from 'discord.js'

export function onClientReady(client: Client<true>) {
  const { Discord } = client.managers

  Discord.onBotReady(client)

  // This makes it convenient to work on the bot locally, by automatically redeploying the commands
  // to the test server (given as an environment variable) every time the server gets started (such
  // as when saving a file that gets bundled).
  if (Discord.IS_DEV) Discord.deployCommands(Discord.TEST_SERVER_ID)

  // In production, regularly send update to Better Uptime for the status page.
  if (Discord.IS_PROD) Discord.startHeartbeat()
}
