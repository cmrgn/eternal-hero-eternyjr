import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'

const RULES = {
  'Rule 1.1: No bullying':
    'No hate speech, bullying or discrimination of any kind.',
  'Rule 1.2: No judging': 'No judging other members for who they are.',
  'Rule 1.3: No arguing':
    'No unnecessary arguments or fights — handle disagreements respectfully.',
  'Rule 1.4: No doxxing':
    'No doxxing or sharing others’ personal information, even if publicly available on the internet.',
  'Rule 2.1: No exploits':
    'No sharing information about cheats and exploits. Remember that using scripts, macros, auto-clickers or any other form of automation is forbidden. Please report suspicious players via DM to the mods, not in public channels.',
  'Rule 2.2: No account sharing': 'No buying, selling or sharing accounts.',
  'Rule 3.1: No non-English':
    'No non-English content in main channels (use the appropriate international channels).',
  'Rule 3.2: No off topic':
    'No irrelevant content (use the off-topic channels).',
  'Rule 3.3: No swearing':
    'No swearing or attempting to circumvent the profanity filter.',
  'Rule 3.4: No cross-posting':
    'No posting the same message in multiple channels.',
  'Rule 3.5: No NSWF/spam': 'No NSFW or spam content.',
  'Rule 3.6: No links':
    'No links to other Discord servers without permission from the mods.',
  'Rule 3.7: No scams': 'No scams or malicious activities.',
  'Rule 3.8: No advertisement': 'No advertisement of any kind.',
  'Rule 4.1: No pinging staff':
    'No unnecessarily pinging the devs — they read through Discord in due time.',
  'Rule 4.2: No harrassing mods':
    'No harassing, excessively pinging or taunting the moderators.',
}

export const data = new SlashCommandBuilder()
  .setName('rule')
  .addStringOption(option =>
    option
      .setName('rule')
      .setDescription('Rule to mention')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addUserOption(option =>
    option.setName('user').setDescription('User to mention')
  )
  .setDescription('Say something via the bot')

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused()
  const choices = Object.keys(RULES)
  const filtered = choices.filter(choice => choice.startsWith(focusedValue))
  await interaction.respond(
    filtered.map(choice => ({ name: choice, value: choice }))
  )
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const rule = interaction.options.getString('rule') ?? ''
  const user = interaction.options.getUser('user')
  const number = rule.split(': ')[0]
  const message = RULES[rule as keyof typeof RULES]

  return interaction.reply(
    `${user ? `<@${user.id}> ` : ''}**${number}:** ${message}`
  )
}
