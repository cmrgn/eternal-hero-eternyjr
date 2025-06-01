import {
  bold,
  channelMention,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
} from 'discord.js'
import { franc } from 'franc-min'
import { shouldIgnoreInteraction } from '../utils/shouldIgnoreInteraction'
import { IS_DEV, TEST_SERVER_ID } from '../config'

type DiscordMessage = OmitPartialGroupDMChannel<Message<boolean>>
type Locale = {
  code2: string
  code3: string
  language: string
  role: string
  channel: string
  messages: { discord_linking: string; internationalization: string }
}

const IGNORED_CATEGORY_IDS = [
  /* Test */ '1378712571099611236',
  /* Admin */ '1350167759035830394',
  /* Info */ '1239215562547138693',
  /* International */ '1250884635081048189',
]
const MIN_LENGTH_GUESS = 15
const LOCALES: Locale[] = [
  {
    code2: 'de',
    code3: 'deu',
    language: 'Deutsch',
    role: 'de | Deutsch',
    channel: 'de-deutsch',
    messages: {
      discord_linking:
        'Offenbar versuchst du, dein Spielkonto mit deinem Discord-Konto zu verknüpfen. Allerdings hast du anscheinend deine Spiel-ID anstelle des Verknüpfungsbefehls eingefügt. Bitte befolge die Anweisungen in %s sorgfältig.',
      internationalization:
        'Unser Discord-Server ist ausschließlich englischsprachig (Regel 3.1). Bitte bleiben Sie bei Englisch oder treten Sie %s bei, um Deutsch zu sprechen.',
    },
  },
  {
    code2: 'en',
    code3: 'eng',
    language: 'English',
    role: 'en | English',
    channel: 'en-english',
    messages: {
      discord_linking:
        'It looks like you’re attempting to link your game account to your Discord account. However, you appear to have pasted your game ID instead of the linking command. Please, carefully follow the instructions in %s.',
      internationalization:
        'Our Discord server is English-speaking only (rule 3.1). Kindly stick to using English or consider joining our international channels.',
    },
  },
  {
    code2: 'es',
    code3: 'spa',
    language: 'Español',
    role: 'es | Español',
    channel: 'es-español',
    messages: {
      discord_linking:
        'Parece que intentas vincular tu cuenta de juego con tu cuenta de Discord. Sin embargo, parece que has pegado tu ID de juego en lugar del comando de vinculación. Sigue atentamente las instrucciones de %s.',
      internationalization:
        'Nuestro servidor de Discord es exclusivamente angloparlante (regla 3.1). Por favor, habla solo inglés o considera unirte a %s para hablar en español.',
    },
  },
  {
    code2: 'fr',
    code3: 'fra',
    language: 'Français',
    role: 'fr | Français',
    channel: 'fr-français',
    messages: {
      discord_linking:
        'Il semblerait que vous souhaitiez lier votre compte de jeu à votre compte Discord. Cependant, vous avez collé votre identifiant de jeu au lieu de la commande de liaison. Veuillez suivre attentivement les instructions dans %s.',
      internationalization:
        'Notre serveur Discord est exclusivement anglophone (règle 3.1). Veuillez utiliser l’anglais ou joignez %s pour parler français.',
    },
  },
  {
    code2: 'it',
    code3: 'ita',
    language: 'Italiano',
    role: 'it | Italiano',
    channel: 'it-italiano',
    messages: {
      discord_linking:
        'Sembra che tu stia tentando di collegare il tuo account di gioco al tuo account Discord. Tuttavia, sembra che tu abbia incollato il tuo ID di gioco invece del comando di collegamento. Segui attentamente le istruzioni in %s.',
      internationalization:
        'Il nostro server Discord è in lingua inglese (regola 3.1). Si prega di utilizzare l’inglese o di unirsi a %s per parlare in italiano.',
    },
  },
  {
    code2: 'jp',
    code3: 'jpn',
    language: '日本語',
    role: 'jp | 日本語',
    channel: 'jp-日本語',
    messages: {
      discord_linking:
        'ゲームアカウントをDiscordアカウントにリンクしようとしているようです。しかし、リンクコマンドではなくゲームIDを貼り付けたようです。%sの指示に従ってください。',
      internationalization:
        'Discordサーバーは英語のみでご利用いただけます（ルール3.1）。英語で会話いただくか、%sに参加して日本語で会話されることをご検討ください。',
    },
  },
  {
    code2: 'kr',
    code3: 'kor',
    language: '한국어',
    role: 'kr | 한국어',
    channel: 'kr-한국어',
    messages: {
      discord_linking:
        '게임 계정을 Discord 계정에 연결하려고 하시는 것 같습니다. 하지만 연결 명령어 대신 게임 ID를 붙여넣으신 것 같습니다. %s의 지침을 주의 깊게 따르세요.',
      internationalization:
        '저희 디스코드 서버는 영어로만 소통합니다(규칙 3.1). 영어를 사용하시거나 %s 님과 함께 한국어로 소통해 보세요.',
    },
  },
  {
    code2: 'ph',
    code3: 'tgl',
    language: 'Filipino',
    role: 'ph | Filipino',
    channel: 'ph-filipino',
    messages: {
      discord_linking:
        'Mukhang sinusubukan mong i-link ang iyong game account sa iyong Discord account. Gayunpaman, lumilitaw na nai-paste mo ang iyong ID ng laro sa halip na ang command sa pag-link. Mangyaring, maingat na sundin ang mga tagubilin sa %s.',
      internationalization:
        'Ang aming Discord server ay nagsasalita lamang ng Ingles (panuntunan 3.1). Mangyaring manatili sa paggamit ng Ingles o isaalang-alang ang pagsali sa %s upang magsalita sa Filipino.',
    },
  },
  {
    code2: 'pl',
    code3: 'pol',
    language: 'Polski',
    role: 'pol | Polski',
    channel: 'pl-polski',
    messages: {
      discord_linking:
        'Wygląda na to, że próbujesz połączyć swoje konto gry z kontem Discord. Jednak wygląda na to, że wkleiłeś swój identyfikator gry zamiast polecenia łączenia. Postępuj dokładnie według instrukcji w %s.',
      internationalization:
        'Nasz serwer Discord jest tylko anglojęzyczny (zasada 3.1). Prosimy trzymać się języka angielskiego lub rozważyć dołączenie do %s, aby rozmawiać po polsku.',
    },
  },
  {
    code2: 'pt',
    code3: 'por',
    language: 'Português',
    role: 'pt-br | Português',
    channel: 'pt-br-português',
    messages: {
      discord_linking:
        'Parece que você está tentando vincular sua conta de jogo à sua conta do Discord. No entanto, você aparentemente colou o ID do jogo em vez do comando de vinculação. Siga atentamente as instruções em %s.',
      internationalization:
        'Nosso servidor do Discord é somente em inglês (regra 3.1). Por favor, continue usando o inglês ou considere se juntar ao %s para falar em português.',
    },
  },
  {
    code2: 'ru',
    code3: 'rus',
    language: 'Русский',
    role: 'ru | Русский',
    channel: 'ru-русский',
    messages: {
      discord_linking:
        'Похоже, вы пытаетесь связать свою игровую учетную запись с учетной записью Discord. Однако, похоже, вы вставили свой игровой идентификатор вместо команды связывания. Пожалуйста, внимательно следуйте инструкциям в %s.',
      internationalization:
        'Наш сервер Discord только на английском языке (правило 3.1). Пожалуйста, придерживайтесь английского языка или рассмотрите возможность присоединиться к %s, чтобы говорить на русском.',
    },
  },
  {
    code2: 'th',
    code3: 'tha',
    language: 'ภาษาไทย',
    role: 'th | ภาษาไทย',
    channel: 'th-ภาษาไทย',
    messages: {
      discord_linking:
        'ดูเหมือนว่าคุณกำลังพยายามเชื่อมโยงบัญชีเกมของคุณกับบัญชี Discord แต่ดูเหมือนว่าคุณได้วาง ID เกมของคุณแทนคำสั่งเชื่อมโยง โปรดปฏิบัติตามคำแนะนำใน %s อย่างระมัดระวัง',
      internationalization:
        'เซิร์ฟเวอร์ Discord ของเรารองรับเฉพาะภาษาอังกฤษเท่านั้น (กฎ 3.1) โปรดใช้ภาษาอังกฤษหรือพิจารณาเข้าร่วม %s เพื่อพูดภาษาไทย',
    },
  },
  {
    code2: 'tr',
    code3: 'tur',
    language: 'Türkçe',
    role: 'tr | Türkçe',
    channel: 'tr-türkçe',
    messages: {
      discord_linking:
        'Oyun hesabınızı Discord hesabınıza bağlamaya çalışıyor gibi görünüyorsunuz. Ancak, bağlantı komutu yerine oyun kimliğinizi yapıştırmış gibi görünüyorsunuz. Lütfen %s içindeki talimatları dikkatlice izleyin.',
      internationalization:
        'Discord sunucumuz sadece İngilizce konuşulmaktadır (kural 3.1). Lütfen İngilizce kullanmaya devam edin veya Türkçe konuşmak için %s’e katılmayı düşünün.',
    },
  },
  {
    code2: 'vn',
    code3: 'vie',
    language: 'Tiếng Việt',
    role: 'vn | Tiếng Việt',
    channel: 'vn-tiếng-việt',
    messages: {
      discord_linking:
        'Có vẻ như bạn đang cố gắng liên kết tài khoản trò chơi của mình với tài khoản Discord. Tuy nhiên, có vẻ như bạn đã dán ID trò chơi của mình thay vì lệnh liên kết. Vui lòng làm theo hướng dẫn cẩn thận trong %s.',
      internationalization:
        'Máy chủ Discord của chúng tôi chỉ sử dụng tiếng Anh (quy tắc 3.1). Vui lòng sử dụng tiếng Anh hoặc cân nhắc tham gia %s để nói tiếng Việt.',
    },
  },
  {
    code2: 'zh',
    code3: 'zho',
    language: '汉语',
    role: 'zh | 汉语',
    channel: 'zh-汉语',
    messages: {
      discord_linking:
        '您似乎正在尝试将您的游戏帐户关联到您的 Discord 帐户。但是，您粘贴的似乎是您的游戏 ID，而不是关联命令。请仔细按照 %s 中的说明操作。',
      internationalization:
        '我们的 Discord 服务器仅支持英语（规则 3.1）。请坚持使用英语，或考虑加入 %s 使用中文交流。',
    },
  },
]
// biome-ignore lint/style/noNonNullAssertion: <explanation>
const ENGLISH_LOCALE = LOCALES.find(locale => locale.code2 === 'en')!
const I18N_ROLES = LOCALES.map(locale => locale.role)

const looksLikePlayerId = (message: string) => {
  if (message.length < 20) return false
  if (message.toLocaleLowerCase() === message) return false
  if (message.toLocaleUpperCase() === message) return false

  return /^[A-Za-z0-9]+$/.test(message)
}

function getMemberLocale(member: GuildMember | null): Locale {
  if (!member) throw new Error('Missing member to get locale from.')

  const roles = member?.roles.cache
  const i18nRole = roles.find(role => I18N_ROLES.includes(role.name))
  if (!i18nRole) return ENGLISH_LOCALE

  const locale = LOCALES.find(locale => locale.role === i18nRole.name)
  return locale ?? ENGLISH_LOCALE
}

function getChannel(interaction: DiscordMessage) {
  const { guild, channel } = interaction
  return guild?.channels.cache.find(({ id }) => id === channel.id)
}

function helpWithDiscordLinking(interaction: DiscordMessage) {
  const { guild, member } = interaction
  if (!guild || !member) return

  const channelName = '🔗│discord-linking'
  const infoChannel = guild.channels.cache.find(
    ({ name }) => name === channelName
  )
  const link = infoChannel ? channelMention(infoChannel.id) : channelName
  const locale = getMemberLocale(member)
  const response = locale.messages.discord_linking
  const responseEnglish = ENGLISH_LOCALE.messages.discord_linking

  return locale.code2 === 'en'
    ? response
    : [
        `${bold(locale.language)}: ${response.replace('%s', link)}`,
        `${bold(ENGLISH_LOCALE.language)}: ${responseEnglish.replace('%s', link)}`,
      ].join('\n\n')
}

export async function onMessageCreate(interaction: DiscordMessage) {
  const { content, guild, member } = interaction

  if (!guild || !member) return
  if (member.user.bot) return
  if (shouldIgnoreInteraction(interaction)) return

  if (looksLikePlayerId(content)) {
    const message = helpWithDiscordLinking(interaction)
    return message ? interaction.reply(message) : undefined
  }

  const channel = getChannel(interaction)
  if (!channel) return

  // If the current channel belongs to the “🌍 International Channels” category,
  // return early as this is the only category where non-English is allowed.
  if (channel.parentId && IGNORED_CATEGORY_IDS.includes(channel.parentId))
    return

  // If the current channel is a thread, return early as it may be a clan
  // recruitment thread, or just something else where non-English is allowed.
  if (channel.isThread()) return

  // If the guessed language is English, return early as there is nothing to do.
  const guessedLanguage = franc(content, { minLength: MIN_LENGTH_GUESS })
  if (guessedLanguage === 'eng') return

  // If the guessed language is not a language we have an international channel
  // for, return the generic English response about rule 3.1.
  const locale = LOCALES.find(locale => locale.code3 === guessedLanguage)
  const inEnglish = ENGLISH_LOCALE.messages.internationalization
  if (!locale) return interaction.reply(inEnglish)

  const i18nChannel = guild.channels.cache.find(
    ({ name }) => name === locale.channel
  )
  const link = i18nChannel ? channelMention(i18nChannel.id) : locale.channel
  const inLanguage = locale.messages.internationalization
  const message = [
    `${bold(locale.language)}: ${inLanguage.replace('%s', link)}`,
    `${bold(ENGLISH_LOCALE.language)}: ${inEnglish}`,
  ].join('\n\n')

  try {
    return interaction.reply(message)
  } catch (error) {
    console.log('Could not send internationalization message.')
    console.error(error)
  }
}
