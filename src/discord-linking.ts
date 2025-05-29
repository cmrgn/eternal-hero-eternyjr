import type { Message, OmitPartialGroupDMChannel } from 'discord.js'
import { IS_DEV, IS_PROD, TEST_SERVER_ID } from './config'
import { shouldIgnoreInteraction } from './utils'

const CHANNEL_NAME = '🔗│discord-linking'

const RESPONSES = {
  de: 'Offenbar versuchst du, dein Spielkonto mit deinem Discord-Konto zu verknüpfen. Allerdings hast du anscheinend deine Spiel-ID anstelle des Verknüpfungsbefehls eingefügt. Bitte befolge die Anweisungen in %s sorgfältig.',
  en: 'It looks like you’re attempting to link your game account to your Discord account. However, you appear to have pasted your game ID instead of the linking command. Please, carefully follow the instructions in %s.',
  es: 'Parece que intentas vincular tu cuenta de juego con tu cuenta de Discord. Sin embargo, parece que has pegado tu ID de juego en lugar del comando de vinculación. Sigue atentamente las instrucciones de %s.',
  fr: 'Il semblerait que vous souhaitiez lier votre compte de jeu à votre compte Discord. Cependant, vous avez collé votre identifiant de jeu au lieu de la commande de liaison. Veuillez suivre attentivement les instructions dans %s.',
  it: 'Sembra che tu stia tentando di collegare il tuo account di gioco al tuo account Discord. Tuttavia, sembra che tu abbia incollato il tuo ID di gioco invece del comando di collegamento. Segui attentamente le istruzioni in %s.',
  jp: 'ゲームアカウントをDiscordアカウントにリンクしようとしているようです。しかし、リンクコマンドではなくゲームIDを貼り付けたようです。%sの指示に従ってください。',
  kr: '게임 계정을 Discord 계정에 연결하려고 하시는 것 같습니다. 하지만 연결 명령어 대신 게임 ID를 붙여넣으신 것 같습니다. %s의 지침을 주의 깊게 따르세요.',
  ph: 'Mukhang sinusubukan mong i-link ang iyong game account sa iyong Discord account. Gayunpaman, lumilitaw na nai-paste mo ang iyong ID ng laro sa halip na ang command sa pag-link. Mangyaring, maingat na sundin ang mga tagubilin sa %s.',
  pl: 'Wygląda na to, że próbujesz połączyć swoje konto gry z kontem Discord. Jednak wygląda na to, że wkleiłeś swój identyfikator gry zamiast polecenia łączenia. Postępuj dokładnie według instrukcji w %s.',
  pt: 'Parece que você está tentando vincular sua conta de jogo à sua conta do Discord. No entanto, você aparentemente colou o ID do jogo em vez do comando de vinculação. Siga atentamente as instruções em %s.',
  ru: 'Похоже, вы пытаетесь связать свою игровую учетную запись с учетной записью Discord. Однако, похоже, вы вставили свой игровой идентификатор вместо команды связывания. Пожалуйста, внимательно следуйте инструкциям в %s.',
  th: 'ดูเหมือนว่าคุณกำลังพยายามเชื่อมโยงบัญชีเกมของคุณกับบัญชี Discord แต่ดูเหมือนว่าคุณได้วาง ID เกมของคุณแทนคำสั่งเชื่อมโยง โปรดปฏิบัติตามคำแนะนำใน %s อย่างระมัดระวัง',
  tr: 'Oyun hesabınızı Discord hesabınıza bağlamaya çalışıyor gibi görünüyorsunuz. Ancak, bağlantı komutu yerine oyun kimliğinizi yapıştırmış gibi görünüyorsunuz. Lütfen %s içindeki talimatları dikkatlice izleyin.',
  vn: 'Có vẻ như bạn đang cố gắng liên kết tài khoản trò chơi của mình với tài khoản Discord. Tuy nhiên, có vẻ như bạn đã dán ID trò chơi của mình thay vì lệnh liên kết. Vui lòng làm theo hướng dẫn cẩn thận trong %s.',
  zh: '您似乎正在尝试将您的游戏帐户关联到您的 Discord 帐户。但是，您粘贴的似乎是您的游戏 ID，而不是关联命令。请仔细按照 %s 中的说明操作。',
}

const ROLES_MAP = {
  'de | Deutsch': 'de',
  'en | English': 'en',
  'es | Español': 'es',
  'fr | Français': 'fr',
  'it | Italiano': 'it',
  'jp | 日本語': 'jp',
  'kr | 한국어': 'kr',
  'ph | Filipino': 'ph',
  'pl | Polski': 'pl',
  'pt-br | Português': 'pt',
  'ru | Русский': 'ru',
  'th | ภาษาไทย': 'th',
  'tr | Türkçe': 'tr',
  'vn | Tiếng Việt': 'vn',
  'zh | 汉语': 'zh',
}

type I18nRole = keyof typeof ROLES_MAP
type Language = keyof typeof RESPONSES

const looksLikePlayerId = (message: string) => {
  if (message.length < 20) return false
  if (message.toLocaleLowerCase() === message) return false
  if (message.toLocaleUpperCase() === message) return false

  return /^[A-Za-z0-9]+$/.test(message)
}

export async function discordLinking(
  interaction: OmitPartialGroupDMChannel<Message<boolean>>
) {
  if (shouldIgnoreInteraction(interaction)) return

  const content = interaction.content

  if (looksLikePlayerId(content)) {
    const channel = interaction.guild?.channels.cache.find(
      channel => channel.name === CHANNEL_NAME
    )
    const link = channel?.url ?? CHANNEL_NAME
    const roles = interaction.member?.roles.cache
    const i18nRole =
      roles?.find(role => role.name in ROLES_MAP)?.name ?? 'en | English'
    const languageName = i18nRole.split(' | ')[1].trim()
    const language = (ROLES_MAP[i18nRole as I18nRole] ?? 'en') as Language
    const response = RESPONSES[language].replace('%s', link)

    return interaction.reply(
      language === 'en'
        ? response
        : `**${languageName}:** ${response}\n\n**English:** ${RESPONSES.en.replace('%s', link)}`
    )
  }
}
