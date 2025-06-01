import { IS_DEV, IS_PROD, TEST_SERVER_ID } from '../config'

export function shouldIgnoreInteraction(interaction: {
  guildId: string | null
}) {
  // The bot is meant to be used in a guild, so if there is no guild ID, then
  // the interaction should be ignored.
  if (!interaction.guildId) return

  // Prevent the production bot from answering in the test server, and the test
  // bot from answering in any other server than the test one
  if (IS_PROD && interaction.guildId === TEST_SERVER_ID) return true
  if (IS_DEV && interaction.guildId !== TEST_SERVER_ID) return true
  return false
}
