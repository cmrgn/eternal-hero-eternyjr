import type { TargetLanguageCode } from 'deepl-node'

export type LanguageObject = (typeof LANGUAGE_OBJECTS)[number]
export type Language = LanguageObject['twoLettersCode']
export type CrowdinCode = LanguageObject['crowdinCode']
export type Locale = LanguageObject['locale']

export const ENGLISH_LANGUAGE_OBJECT = {
  appleStoreLocale: null,
  channel: 'en-english',
  crowdinCode: 'en' as const,
  deepLCode: 'en' as TargetLanguageCode,
  googlePlayLocale: null,
  isOnCrowdin: false,
  languageName: 'English',
  locale: 'en-US' as const,
  messages: {
    discord_linking:
      'It looks like you’re attempting to link your game account to your Discord account. However, you appear to have pasted your game ID instead of the linking command. Please, carefully follow the instructions in %s.',
    internationalization:
      'Our Discord server is English-speaking only (rule 3.1). Kindly stick to using English or consider joining our international channels.',
    no_results:
      'Unfortunately, no relevant content was found for your question. Please try rephrasing it or ask a different question.',
  },
  role: 'en | English',
  twoLettersCode: 'en' as const,
}

export const LANGUAGE_OBJECTS = [
  {
    appleStoreLocale: null,
    channel: 'de-deutsch',
    crowdinCode: 'de' as const,
    deepLCode: 'de' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Deutsch',
    locale: 'de-DE' as const,
    messages: {
      discord_linking:
        'Offenbar versuchst du, dein Spielkonto mit deinem Discord-Konto zu verknüpfen. Allerdings hast du anscheinend deine Spiel-ID anstelle des Verknüpfungsbefehls eingefügt. Bitte befolge die Anweisungen in %s sorgfältig.',
      internationalization:
        'Unser Discord-Server ist ausschließlich englischsprachig (Regel 3.1). Bitte bleiben Sie bei Englisch oder treten Sie %s bei, um Deutsch zu sprechen.',
      no_results:
        'Leider konnten wir zu Ihrer Frage keinen relevanten Inhalt finden. Versuchen Sie es mit einer anderen Formulierung oder stellen Sie eine andere Frage.',
    },
    role: 'de | Deutsch',
    twoLettersCode: 'de' as const,
  },
  ENGLISH_LANGUAGE_OBJECT,
  {
    appleStoreLocale: null,
    channel: 'es-español',
    crowdinCode: 'es' as const,
    deepLCode: 'es' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: false,
    languageName: 'Español',
    locale: 'es-ES' as const,
    messages: {
      discord_linking:
        'Parece que intentas vincular tu cuenta de juego con tu cuenta de Discord. Sin embargo, parece que has pegado tu ID de juego en lugar del comando de vinculación. Sigue atentamente las instrucciones de %s.',
      internationalization:
        'Nuestro servidor de Discord es exclusivamente angloparlante (regla 3.1). Por favor, habla solo inglés o considera unirte a %s para hablar en español.',
      no_results:
        'Lamentablemente, no se encontró contenido relevante para tu pregunta. Intenta reformularla o haz otra pregunta.',
    },
    role: 'es | Español',
    twoLettersCode: 'es' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'fr-français',
    crowdinCode: 'fr' as const,
    deepLCode: 'fr' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Français',
    locale: 'fr-FR' as const,
    messages: {
      discord_linking:
        'Il semblerait que vous souhaitiez lier votre compte de jeu à votre compte Discord. Cependant, vous avez collé votre identifiant de jeu au lieu de la commande de liaison. Veuillez suivre attentivement les instructions dans %s.',
      internationalization:
        'Notre serveur Discord est exclusivement anglophone (règle 3.1). Veuillez utiliser l’anglais ou joignez %s pour parler français.',
      no_results:
        'Malheureusement, aucun contenu pertinent n’a été trouvé pour ta question. Reformule ta question ou poses-en une autre.',
    },
    role: 'fr | Français',
    twoLettersCode: 'fr' as const,
  },
  {
    appleStoreLocale: 'it' as const,
    channel: 'it-italiano',
    crowdinCode: 'it' as const,
    deepLCode: 'it' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Italiano',
    locale: 'it-IT' as const,
    messages: {
      discord_linking:
        'Sembra che tu stia tentando di collegare il tuo account di gioco al tuo account Discord. Tuttavia, sembra che tu abbia incollato il tuo ID di gioco invece del comando di collegamento. Segui attentamente le istruzioni in %s.',
      internationalization:
        'Il nostro server Discord è in lingua inglese (regola 3.1). Si prega di utilizzare l’inglese o di unirsi a %s per parlare in italiano.',
      no_results:
        'Purtroppo non è stato trovato alcun contenuto pertinente alla tua domanda. Prova a riformularla o a porre una domanda diversa.',
    },
    role: 'it | Italiano',
    twoLettersCode: 'it' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'jp-日本語',
    crowdinCode: 'ja' as const,
    deepLCode: 'ja' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: '日本語',
    locale: 'ja-JP' as const,
    messages: {
      discord_linking:
        'ゲームアカウントをDiscordアカウントにリンクしようとしているようです。しかし、リンクコマンドではなくゲームIDを貼り付けたようです。%sの指示に従ってください。',
      internationalization:
        'Discordサーバーは英語のみでご利用いただけます（ルール3.1）。英語で会話いただくか、%sに参加して日本語で会話されることをご検討ください。',
      no_results:
        '申し訳ございませんが、ご質問に該当するコンテンツは見つかりませんでした。別の質問をお試しいただくか、別の質問を投稿してください。',
    },
    role: 'jp | 日本語',
    twoLettersCode: 'ja' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'kr-한국어',
    crowdinCode: 'ko' as const,
    deepLCode: 'ko' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: '한국어',
    locale: 'ko-KR' as const,
    messages: {
      discord_linking:
        '게임 계정을 Discord 계정에 연결하려고 하시는 것 같습니다. 하지만 연결 명령어 대신 게임 ID를 붙여넣으신 것 같습니다. %s의 지침을 주의 깊게 따르세요.',
      internationalization:
        '저희 디스코드 서버는 영어로만 소통합니다(규칙 3.1). 영어를 사용하시거나 %s 님과 함께 한국어로 소통해 보세요.',
      no_results:
        '죄송하지만, 질문과 관련된 내용을 찾을 수 없습니다. 질문을 다시 작성하거나 다른 질문을 올려주세요.',
    },
    role: 'kr | 한국어',
    twoLettersCode: 'ko' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'ph-filipino',
    crowdinCode: 'tl' as const,
    deepLCode: 'tl' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: false,
    languageName: 'Filipino',
    locale: 'tl-PH' as const,
    messages: {
      discord_linking:
        'Mukhang sinusubukan mong i-link ang iyong game account sa iyong Discord account. Gayunpaman, lumilitaw na nai-paste mo ang iyong ID ng laro sa halip na ang command sa pag-link. Mangyaring, maingat na sundin ang mga tagubilin sa %s.',
      internationalization:
        'Ang aming Discord server ay nagsasalita lamang ng Ingles (panuntunan 3.1). Mangyaring manatili sa paggamit ng Ingles o isaalang-alang ang pagsali sa %s upang magsalita sa Filipino.',
      no_results:
        'Sa kasamaang palad, walang nakitang nauugnay na nilalaman para sa iyong tanong. Pakisubukang i-rephrase ito o magtanong ng ibang tanong.',
    },
    role: 'ph | Filipino',
    twoLettersCode: 'tl' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'pl-polski',
    crowdinCode: 'pl' as const,
    deepLCode: 'pl' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Polski',
    locale: 'pl-PL' as const,
    messages: {
      discord_linking:
        'Wygląda na to, że próbujesz połączyć swoje konto gry z kontem Discord. Jednak wygląda na to, że wkleiłeś swój identyfikator gry zamiast polecenia łączenia. Postępuj dokładnie według instrukcji w %s.',
      internationalization:
        'Nasz serwer Discord jest tylko anglojęzyczny (zasada 3.1). Prosimy trzymać się języka angielskiego lub rozważyć dołączenie do %s, aby rozmawiać po polsku.',
      no_results:
        'Niestety, nie znaleziono żadnej treści odpowiadającej Twojemu pytaniu. Spróbuj je sformułować inaczej lub zadaj inne pytanie.',
    },
    role: 'pol | Polski',
    twoLettersCode: 'pl' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'pt-br-português',
    crowdinCode: 'pt-BR' as const,
    deepLCode: 'pt-BR' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Português',
    locale: 'pt-BR' as const,
    messages: {
      discord_linking:
        'Parece que você está tentando vincular sua conta de jogo à sua conta do Discord. No entanto, você aparentemente colou o ID do jogo em vez do comando de vinculação. Siga atentamente as instruções em %s.',
      internationalization:
        'Nosso servidor do Discord é somente em inglês (regra 3.1). Por favor, continue usando o inglês ou considere se juntar ao %s para falar em português.',
      no_results:
        'Infelizmente, não encontramos conteúdo relevante para sua pergunta. Tente reformular a pergunta ou faça uma pergunta diferente.',
    },
    role: 'pt-br | Português',
    twoLettersCode: 'pt' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'ru-русский',
    crowdinCode: 'ru' as const,
    deepLCode: 'ru' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Русский',
    locale: 'ru-RU' as const,
    messages: {
      discord_linking:
        'Похоже, вы пытаетесь связать свою игровую учетную запись с учетной записью Discord. Однако, похоже, вы вставили свой игровой идентификатор вместо команды связывания. Пожалуйста, внимательно следуйте инструкциям в %s.',
      internationalization:
        'Наш сервер Discord только на английском языке (правило 3.1). Пожалуйста, придерживайтесь английского языка или рассмотрите возможность присоединиться к %s, чтобы говорить на русском.',
      no_results:
        'К сожалению, для вашего вопроса не найдено подходящего контента. Попробуйте перефразировать его или задать другой вопрос.',
    },
    role: 'ru | Русский',
    twoLettersCode: 'ru' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'th-ภาษาไทย',
    crowdinCode: 'th' as const,
    deepLCode: 'th' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: false,
    languageName: 'ภาษาไทย',
    locale: 'th-TH' as const,
    messages: {
      discord_linking:
        'ดูเหมือนว่าคุณกำลังพยายามเชื่อมโยงบัญชีเกมของคุณกับบัญชี Discord แต่ดูเหมือนว่าคุณได้วาง ID เกมของคุณแทนคำสั่งเชื่อมโยง โปรดปฏิบัติตามคำแนะนำใน %s อย่างระมัดระวัง',
      internationalization:
        'เซิร์ฟเวอร์ Discord ของเรารองรับเฉพาะภาษาอังกฤษเท่านั้น (กฎ 3.1) โปรดใช้ภาษาอังกฤษหรือพิจารณาเข้าร่วม %s เพื่อพูดภาษาไทย',
      no_results: 'ขออภัย ไม่พบเนื้อหาที่เกี่ยวข้องกับคำถามของคุณ โปรดลองเขียนคำถามใหม่หรือถามคำถามอื่น',
    },
    role: 'th | ภาษาไทย',
    twoLettersCode: 'th' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'tr-türkçe',
    crowdinCode: 'tr' as const,
    deepLCode: 'tr' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: 'Türkçe',
    locale: 'tr-TR' as const,
    messages: {
      discord_linking:
        'Oyun hesabınızı Discord hesabınıza bağlamaya çalışıyor gibi görünüyorsunuz. Ancak, bağlantı komutu yerine oyun kimliğinizi yapıştırmış gibi görünüyorsunuz. Lütfen %s içindeki talimatları dikkatlice izleyin.',
      internationalization:
        'Discord sunucumuz sadece İngilizce konuşulmaktadır (kural 3.1). Lütfen İngilizce kullanmaya devam edin veya Türkçe konuşmak için %s’e katılmayı düşünün.',
      no_results:
        'Maalesef sorunuzla ilgili alakalı içerik bulunamadı. Lütfen yeniden ifade etmeyi deneyin veya farklı bir soru sorun.',
    },
    role: 'tr | Türkçe',
    twoLettersCode: 'tr' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'vn-tiếng-việt',
    crowdinCode: 'vi' as const,
    deepLCode: 'vi' as TargetLanguageCode,
    googlePlayLocale: 'vi' as const,
    isOnCrowdin: true,
    languageName: 'Tiếng Việt',
    locale: 'vi-VN' as const,
    messages: {
      discord_linking:
        'Có vẻ như bạn đang cố gắng liên kết tài khoản trò chơi của mình với tài khoản Discord. Tuy nhiên, có vẻ như bạn đã dán ID trò chơi của mình thay vì lệnh liên kết. Vui lòng làm theo hướng dẫn cẩn thận trong %s.',
      internationalization:
        'Máy chủ Discord của chúng tôi chỉ sử dụng tiếng Anh (quy tắc 3.1). Vui lòng sử dụng tiếng Anh hoặc cân nhắc tham gia %s để nói tiếng Việt.',
      no_results:
        'Thật không may, không tìm thấy nội dung có liên quan cho câu hỏi của bạn. Vui lòng thử diễn đạt lại hoặc hỏi một câu hỏi khác.',
    },
    role: 'vn | Tiếng Việt',
    twoLettersCode: 'vi' as const,
  },
  {
    appleStoreLocale: null,
    channel: 'zh-汉语',
    crowdinCode: 'zh-CN' as const,
    deepLCode: 'zh' as TargetLanguageCode,
    googlePlayLocale: null,
    isOnCrowdin: true,
    languageName: '汉语',
    locale: 'zh-CN' as const,
    messages: {
      discord_linking:
        '您似乎正在尝试将您的游戏帐户关联到您的 Discord 帐户。但是，您粘贴的似乎是您的游戏 ID，而不是关联命令。请仔细按照 %s 中的说明操作。',
      internationalization:
        '我们的 Discord 服务器仅支持英语（规则 3.1）。请坚持使用英语，或考虑加入 %s 使用中文交流。',
      no_results: '很遗憾，我们未找到与您的问题相关的内容。请尝试重新表述或提出其他问题。',
    },
    role: 'zh | 汉语',
    twoLettersCode: 'zh' as const,
  },
]
export const LOCALES = LANGUAGE_OBJECTS.map(object => object.locale)
export const LANGUAGES = LANGUAGE_OBJECTS.map(object => object.twoLettersCode)
export const CROWDIN_CODES = LANGUAGE_OBJECTS.map(object => object.crowdinCode)
