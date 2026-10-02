import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, AudioLines, CalendarDays, Check, CheckCircle2,
  CircleHelp, ExternalLink, Headphones, ListMusic, Pause, Play, Radio, Send,
  ShieldCheck, SkipForward, Sparkles, X,
} from 'lucide-react';
import '../gofl-current/_group.css';
import {
  queueFixture, sessionFixture,
  type GoFLQueueItem, type GoFLSession,
} from '../gofl-current/_shared';

type Screen = 'home' | 'sessions' | 'submit' | 'receipt' | 'host' | 'live';
type Language = 'en' | 'fr' | 'ua';
type SubmissionForm = {
  artistName: string;
  songTitle: string;
  intro: string;
  genre: string;
  country: string;
  socialUrl: string;
  trackUrl: string;
};

const blankForm: SubmissionForm = {
  artistName: '', songTitle: '', intro: '', genre: '', country: '', socialUrl: '', trackUrl: '',
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    home: 'Home', sessions: 'Live sessions', submit: 'Submit music', admin: 'Host desk', live: 'Live mode',
    signIn: 'Sign in', nextSession: 'Next session', liveNow: 'Live now', open: 'Open for submissions',
    closed: 'Closed', full: 'Full', viewSessions: 'View sessions', submitCta: 'Send a track to the next room',
    submitNote: 'No gatekeeping. No inbox chasing. Just a song and a place in the night.',
    heroEyebrow: 'Independent music · live sessions · rising together', heroTitle: 'Let the songs\nfind the light.',
    heroBody: 'Gathering of the Fallen LIVE is a self-service listening room for artists making beautiful noise at the edge of the map.',
    browse: 'Browse sessions', hostLogin: 'Host sign in', queuePreview: 'Queue preview', tonight: 'Next on air',
    spaces: 'spaces left', people: 'artists registered', allGenres: 'All genres', join: 'Join this session',
    details: 'Session details', howItWorks: 'How the room works', step1: 'Send your song',
    step1Body: 'Drop a link and tell the host what they are about to hear.', step2: 'Choose a night',
    step2Body: 'Pick an open session. Your place in the queue is held instantly.', step3: 'Get played LIVE',
    step3Body: 'The host moves through the room in order. You listen with everyone.',
    sessionsTitle: 'Choose a live session', sessionsBody: 'Find a room with space for your sound. Every session is hosted, human, and in order.',
    capacity: 'capacity', registered: 'registered', availability: 'availability', noSessions: 'No sessions are open right now.',
    noSessionsBody: 'Check back soon for the next room in the calendar.', refresh: 'Refresh',
    submitTitle: 'Put your song in the room', submitBody: 'A short introduction helps the host make space for the right feeling.',
    artist: 'Artist / band name', song: 'Song title', intro: 'Short intro for the host',
    introHint: 'Tell us what this song carries, or what you want the room to know.', genre: 'Genre',
    country: 'Country / region', social: 'Social link', track: 'Track link',
    trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp, or another playable link.',
    chooseSession: 'Choose a live session', rights: 'I confirm I own or control the rights to this track and allow it to be played in the livestream.',
    sendTrack: 'Submit track', submitting: 'Sending into the room…', required: 'Required', optional: 'Optional',
    receiptTitle: 'You are in the room.', receiptBody: 'Keep this receipt. The host will review the queue before going live.',
    queueNumber: 'Queue number', status: 'Status', submitted: 'Submitted', returnHome: 'Back to home',
    hostTitle: 'Host desk', hostBody: 'Review the room once. Then let the queue move itself.',
    pending: 'Pending', approved: 'Approved', played: 'Played', waiting: 'Waiting', rejected: 'Rejected', skipped: 'Skipped',
    selectSession: 'Select a session', noAdminSessions: 'No hosted sessions found.', queue: 'Queue', all: 'All',
    review: 'Review', approve: 'Approve', reject: 'Reject', markPlayed: 'Mark played', skip: 'Skip',
    undoPlayed: 'Return to queue', play: 'Play', pause: 'Pause', next: 'Next', nowPlaying: 'Now playing',
    upcoming: 'Up next', trackOf: 'Track', hostGuide: 'Host guide', guide1: 'Read the intro',
    guide2: 'Press play', guide3: 'Move next', guide4: 'Mark played',
    guideBody1: 'Take a quick look at the artist and the blurb.', guideBody2: 'Start the track on stream.',
    guideBody3: 'Keep the order moving.', guideBody4: 'Confirm the track has been heard.',
    emptyQueue: 'The queue is quiet.', emptyQueueBody: 'Approved artists will appear here in assigned order.',
    openLink: 'Open track link', audioFallback: 'This link cannot play inline. Open it in a new tab.',
    embeddedPlayer: 'Embedded track player', menu: 'Menu', close: 'Close', language: 'Language',
    available: 'available', artistSpotlight: 'Artist spotlight', genreShowcase: 'Genre showcase',
    weekendTakeover: 'Weekend takeover', selected: 'Selected', sessionClosed: 'This session is closed for submissions.',
    countryPlaceholder: 'Canada, Ukraine, United Kingdom…', genrePlaceholder: 'Post-rock, metal, darkwave…',
    artistPlaceholder: 'Your artist name', songPlaceholder: 'The song we should hear', urlPlaceholder: 'https://…',
    introCount: 'characters', hostOnly: 'Host access required', hostOnlyBody: 'Sign in to review submissions and run a live session.',
    goToSignIn: 'Sign in to continue', host: 'Host', unavailable: 'Unavailable',
    fullNote: 'This session has reached capacity.', closedNote: 'Submissions are closed for this session.',
    trackLinkOnly: 'Submit a listening link. MP3 uploads are not supported.',
    requiredValidation: 'Please fill in this field.', invalidUrlValidation: 'Enter a valid URL.',
    mainNav: 'Main navigation', footerTag: 'Independent music · Real people · Live rooms',
    hostPreview: 'Host preview', publicPreview: 'Public preview', hostPreviewShort: 'Host', publicPreviewShort: 'Public',
    backToPublic: 'Return to public preview',
    openHostPreview: 'Open host preview', localPreview: 'Local preview only · no sign-in or backend actions.',
    onAir: 'On air', brandHome: 'Gathering of the Fallen LIVE — Home', capacityProgress: 'registered / capacity',
    queueTrackLabel: 'Queue position {number}: {song} by {artist}',
    artistSpotlightBody: 'A mix of genres, featuring emerging artists and new sounds.',
    genreShowcaseBody: 'Rotating genres each week: rock, metal, alternative, and more.',
    weekendTakeoverBody: 'A high-energy session to close the week with the best in independent music.',
  },
  fr: {
    home: 'Accueil', sessions: 'Sessions LIVE', submit: 'Envoyer une musique', admin: 'Régie', live: 'Mode LIVE',
    signIn: 'Se connecter', nextSession: 'Prochaine session', liveNow: 'En direct', open: 'Inscriptions ouvertes',
    closed: 'Fermée', full: 'Complète', viewSessions: 'Voir les sessions',
    submitCta: 'Envoyer une piste à la prochaine salle',
    submitNote: 'Pas de porte fermée. Pas de relance. Seulement une chanson et une place dans la nuit.',
    heroEyebrow: 'Musique indépendante · sessions live · grandir ensemble',
    heroTitle: 'Que les chansons\ntrouvent la lumière.',
    heroBody: 'Gathering of the Fallen LIVE est une salle d’écoute pour les artistes qui créent un bruit magnifique au bord de la carte.',
    browse: 'Parcourir les sessions', hostLogin: 'Connexion régie', queuePreview: 'Aperçu de la file',
    tonight: 'Prochaine mise en ondes', spaces: 'places libres', people: 'artistes inscrits', allGenres: 'Tous les genres',
    join: 'Rejoindre cette session', details: 'Détails de la session', howItWorks: 'Comment ça marche',
    step1: 'Envoyez votre chanson', step1Body: 'Ajoutez un lien et dites à la régie ce qu’elle va entendre.',
    step2: 'Choisissez une soirée', step2Body: 'Choisissez une session ouverte. Votre place est gardée instantanément.',
    step3: 'Passez en LIVE', step3Body: 'La régie avance dans l’ordre. Vous écoutez avec tout le monde.',
    sessionsTitle: 'Choisissez une session LIVE',
    sessionsBody: 'Trouvez une salle pour votre son. Chaque session est humaine, encadrée et ordonnée.',
    capacity: 'capacité', registered: 'inscrits', availability: 'disponibilité',
    noSessions: 'Aucune session ouverte pour le moment.', noSessionsBody: 'Revenez bientôt pour la prochaine soirée.',
    refresh: 'Actualiser', submitTitle: 'Placez votre chanson dans la salle',
    submitBody: 'Une courte introduction aide la régie à créer le bon moment.',
    artist: 'Nom de l’artiste / groupe', song: 'Titre de la chanson', intro: 'Courte présentation pour la régie',
    introHint: 'Dites-nous ce que cette chanson porte, ou ce que la salle doit savoir.', genre: 'Genre',
    country: 'Pays / région', social: 'Lien social', track: 'Lien de la piste',
    trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp ou autre lien lisible.',
    chooseSession: 'Choisir une session LIVE',
    rights: 'Je confirme détenir les droits de cette piste et autorise sa diffusion pendant le live.',
    sendTrack: 'Envoyer la piste', submitting: 'Envoi dans la salle…', required: 'Requis', optional: 'Facultatif',
    receiptTitle: 'Vous êtes dans la salle.', receiptBody: 'Gardez ce reçu. La régie vérifiera la file avant le direct.',
    queueNumber: 'Numéro de file', status: 'Statut', submitted: 'Envoyée', returnHome: 'Retour à l’accueil',
    hostTitle: 'Régie', hostBody: 'Vérifiez la salle une fois. Ensuite, laissez la file avancer.',
    pending: 'En attente', approved: 'Approuvée', played: 'Passée', waiting: 'En attente',
    rejected: 'Refusée', skipped: 'Passée', selectSession: 'Choisir une session',
    noAdminSessions: 'Aucune session hébergée.', queue: 'File', all: 'Toutes', review: 'Vérifier',
    approve: 'Approuver', reject: 'Refuser', markPlayed: 'Marquer passée', skip: 'Passer',
    undoPlayed: 'Remettre dans la file', play: 'Lire', pause: 'Pause', next: 'Suivante',
    nowPlaying: 'En lecture', upcoming: 'À suivre', trackOf: 'Piste', hostGuide: 'Guide régie',
    guide1: 'Lire l’intro', guide2: 'Appuyer sur lecture', guide3: 'Passer à la suivante', guide4: 'Marquer passée',
    guideBody1: 'Jetez un œil à l’artiste et au texte.', guideBody2: 'Lancez la piste en direct.',
    guideBody3: 'Gardez l’ordre en mouvement.', guideBody4: 'Confirmez que la piste est passée.',
    emptyQueue: 'La file est silencieuse.',
    emptyQueueBody: 'Les artistes approuvés apparaîtront ici dans l’ordre.',
    openLink: 'Ouvrir le lien',
    audioFallback: 'Ce lien ne peut pas être lu ici. Ouvrez-le dans un nouvel onglet.',
    embeddedPlayer: 'Lecteur de musique intégré', menu: 'Menu', close: 'Fermer', language: 'Langue',
    available: 'disponibles', artistSpotlight: 'Coup de projecteur', genreShowcase: 'Vitrine de genres',
    weekendTakeover: 'Prise de contrôle du week-end', selected: 'Sélectionnée',
    sessionClosed: 'Cette session est fermée aux inscriptions.',
    countryPlaceholder: 'Canada, Ukraine, Royaume-Uni…', genrePlaceholder: 'Post-rock, metal, darkwave…',
    artistPlaceholder: 'Nom de votre projet', songPlaceholder: 'La chanson que nous devons entendre',
    urlPlaceholder: 'https://…', introCount: 'caractères',
    hostOnly: 'Accès régie requis', hostOnlyBody: 'Connectez-vous pour vérifier les envois et lancer une session.',
    goToSignIn: 'Se connecter pour continuer', host: 'Régie', unavailable: 'Indisponible',
    fullNote: 'Cette session a atteint sa capacité.', closedNote: 'Les inscriptions sont fermées pour cette session.',
    trackLinkOnly: 'Ajoutez un lien d’écoute. Le téléversement MP3 n’est pas pris en charge.',
    requiredValidation: 'Veuillez renseigner ce champ.', invalidUrlValidation: 'Saisissez une URL valide.',
    mainNav: 'Navigation principale', footerTag: 'Musique indépendante · Vraies personnes · Salles LIVE',
    hostPreview: 'Aperçu régie', publicPreview: 'Aperçu public', hostPreviewShort: 'Régie', publicPreviewShort: 'Public',
    backToPublic: 'Retour à l’aperçu public',
    openHostPreview: 'Ouvrir l’aperçu régie', localPreview: 'Aperçu local uniquement · sans connexion ni action serveur.',
    onAir: 'En ondes', brandHome: 'Gathering of the Fallen LIVE — Accueil',
    capacityProgress: 'inscrits / capacité',
    queueTrackLabel: 'Position {number} dans la file : {song} par {artist}',
    artistSpotlightBody: 'Un mélange de genres avec des artistes émergents et de nouveaux sons.',
    genreShowcaseBody: 'Des genres qui tournent chaque semaine : rock, metal, alternatif et plus.',
    weekendTakeoverBody: 'Une session intense pour finir la semaine avec le meilleur de la musique indépendante.',
  },
  ua: {
    home: 'Головна', sessions: 'LIVE-сесії', submit: 'Надіслати музику', admin: 'Пульт ведучого', live: 'LIVE-режим',
    signIn: 'Увійти', nextSession: 'Наступна сесія', liveNow: 'Наживо', open: 'Прийом відкрито',
    closed: 'Закрито', full: 'Місць немає', viewSessions: 'Переглянути сесії',
    submitCta: 'Надішліть трек у наступну кімнату',
    submitNote: 'Без бар’єрів. Без листування. Лише пісня і місце цієї ночі.',
    heroEyebrow: 'Незалежна музика · LIVE-сесії · зростаємо разом',
    heroTitle: 'Нехай пісні\nзнайдуть світло.',
    heroBody: 'Gathering of the Fallen LIVE — це кімната для слухання митців, які створюють прекрасний шум на краю мапи.',
    browse: 'Переглянути сесії', hostLogin: 'Вхід ведучого', queuePreview: 'Попередній список',
    tonight: 'Наступний ефір', spaces: 'вільних місць', people: 'зареєстровано митців', allGenres: 'Усі жанри',
    join: 'Приєднатися', details: 'Деталі сесії', howItWorks: 'Як це працює',
    step1: 'Надішліть пісню', step1Body: 'Додайте посилання і розкажіть ведучому, що він почує.',
    step2: 'Оберіть вечір', step2Body: 'Оберіть відкриту сесію. Місце в черзі буде збережено одразу.',
    step3: 'Потрапте в LIVE', step3Body: 'Ведучий рухається за порядком. Ви слухаєте разом з усіма.',
    sessionsTitle: 'Оберіть LIVE-сесію',
    sessionsBody: 'Знайдіть кімнату для свого звуку. Кожна сесія жива, людяна і послідовна.',
    capacity: 'місткість', registered: 'зареєстровано', availability: 'доступність',
    noSessions: 'Наразі відкритих сесій немає.', noSessionsBody: 'Поверніться скоро — нова кімната вже в календарі.',
    refresh: 'Оновити', submitTitle: 'Помістіть свою пісню в кімнату',
    submitBody: 'Короткий вступ допоможе ведучому створити правильний момент.',
    artist: 'Ім’я артиста / гурту', song: 'Назва пісні', intro: 'Короткий вступ для ведучого',
    introHint: 'Розкажіть, що несе ця пісня або що має знати кімната.', genre: 'Жанр',
    country: 'Країна / регіон', social: 'Соціальне посилання', track: 'Посилання на трек',
    trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp або інше посилання.',
    chooseSession: 'Оберіть LIVE-сесію',
    rights: 'Я підтверджую, що володію правами на цей трек і дозволяю його трансляцію.',
    sendTrack: 'Надіслати трек', submitting: 'Відправляємо в кімнату…', required: 'Обов’язково', optional: 'Необов’язково',
    receiptTitle: 'Ви в кімнаті.', receiptBody: 'Збережіть цей чек. Ведучий перегляне чергу перед ефіром.',
    queueNumber: 'Номер у черзі', status: 'Статус', submitted: 'Надіслано', returnHome: 'На головну',
    hostTitle: 'Пульт ведучого', hostBody: 'Перевірте кімнату один раз. Далі черга рухається сама.',
    pending: 'Очікує', approved: 'Схвалено', played: 'Програно', waiting: 'Очікує',
    rejected: 'Відхилено', skipped: 'Пропущено', selectSession: 'Оберіть сесію',
    noAdminSessions: 'Керованих сесій немає.', queue: 'Черга', all: 'Усі', review: 'Перегляд',
    approve: 'Схвалити', reject: 'Відхилити', markPlayed: 'Позначити програним',
    skip: 'Пропустити', undoPlayed: 'Повернути в чергу', play: 'Відтворити', pause: 'Пауза',
    next: 'Наступний', nowPlaying: 'Зараз грає', upcoming: 'Далі', trackOf: 'Трек',
    hostGuide: 'Підказки ведучому', guide1: 'Прочитайте вступ', guide2: 'Натисніть play',
    guide3: 'Перейдіть далі', guide4: 'Позначте програним',
    guideBody1: 'Швидко перегляньте артиста і текст.', guideBody2: 'Запустіть трек в ефірі.',
    guideBody3: 'Підтримуйте порядок.', guideBody4: 'Підтвердіть, що трек прозвучав.',
    emptyQueue: 'Черга тиха.',
    emptyQueueBody: 'Схвалені артисти з’являться тут у визначеному порядку.',
    openLink: 'Відкрити посилання',
    audioFallback: 'Це посилання не можна відтворити тут. Відкрийте його в новій вкладці.',
    embeddedPlayer: 'Вбудований аудіопрогравач', menu: 'Меню', close: 'Закрити', language: 'Мова',
    available: 'доступно', artistSpotlight: 'Фокус на артистах', genreShowcase: 'Жанрова вітрина',
    weekendTakeover: 'Вікенд-ефір', selected: 'Обрано', sessionClosed: 'Цю сесію закрито для нових заявок.',
    countryPlaceholder: 'Канада, Україна, Велика Британія…', genrePlaceholder: 'Пост-рок, метал, дарквейв…',
    artistPlaceholder: 'Назва вашого проєкту', songPlaceholder: 'Пісня, яку ми маємо почути',
    urlPlaceholder: 'https://…', introCount: 'символів',
    hostOnly: 'Потрібен доступ ведучого', hostOnlyBody: 'Увійдіть, щоб переглядати заявки і вести LIVE-сесію.',
    goToSignIn: 'Увійти, щоб продовжити', host: 'Ведучий', unavailable: 'Недоступно',
    fullNote: 'У цій сесії вже немає вільних місць.', closedNote: 'Прийом заявок на цю сесію закрито.',
    trackLinkOnly: 'Додайте посилання для прослуховування. Завантаження MP3 не підтримується.',
    requiredValidation: 'Заповніть це поле.', invalidUrlValidation: 'Введіть коректне посилання.',
    mainNav: 'Головна навігація', footerTag: 'Незалежна музика · Справжні люди · LIVE-кімнати',
    hostPreview: 'Попередній перегляд ведучого', publicPreview: 'Публічний перегляд',
    hostPreviewShort: 'Ведучий', publicPreviewShort: 'Публічний',
    backToPublic: 'Повернутися до публічного перегляду',
    openHostPreview: 'Відкрити перегляд ведучого',
    localPreview: 'Локальний перегляд · без входу й серверних дій.',
    onAir: 'В ефірі', brandHome: 'Gathering of the Fallen LIVE — Головна',
    capacityProgress: 'зареєстровано / місткість',
    queueTrackLabel: 'Позиція {number} у черзі: {song}, виконавець {artist}',
    artistSpotlightBody: 'Різні жанри та нові голоси незалежної сцени.',
    genreShowcaseBody: 'Щотижня інші жанри: рок, метал, альтернатива та більше.',
    weekendTakeoverBody: 'Енергійна сесія наприкінці тижня з найкращою незалежною музикою.',
  },
};

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'fr' || value === 'ua';
const translate = (language: Language, key: string) => translations[language][key] || translations.en[key] || key;

function readLanguage(): Language {
  try {
    const saved = window.localStorage.getItem('gfl-language');
    return isLanguage(saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

function localizedDate(date: string, language: Language, options?: Intl.DateTimeFormatOptions) {
  const locale = language === 'ua' ? 'uk-UA' : language === 'fr' ? 'fr-CA' : 'en-CA';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Toronto', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options,
  }).format(new Date(date));
}

function localizedSessionName(session: GoFLSession, language: Language) {
  return translate(language, session.sessionType === 'artist_spotlight'
    ? 'artistSpotlight'
    : session.sessionType === 'genre_showcase' ? 'genreShowcase' : 'weekendTakeover');
}

function BrandMark({ onClick, language }: { onClick: () => void; language: Language }) {
  return (
    <button className="gm-brand" type="button" onClick={onClick} aria-label={translate(language, 'brandHome')} data-testid="button-brand-home">
      <span className="gm-sigil" aria-hidden="true"><span>G</span></span>
      <span className="gm-brand-copy">
        <span className="gm-brand-name">GATHERING</span>
        <span className="gm-brand-sub">OF THE FALLEN · LIVE</span>
      </span>
    </button>
  );
}

function ScreenHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="gm-heading">
      <p className="gm-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {body && <p className="gm-lede">{body}</p>}
    </div>
  );
}

function SessionCard({
  session, onJoin, language,
}: { session: GoFLSession; onJoin: (session: GoFLSession) => void; language: Language }) {
  const t = (key: string) => translate(language, key);
  const canJoin = session.isOpen && session.available > 0;
  const ratio = Math.min(100, Math.round((session.registered / Math.max(session.capacity, 1)) * 100));
  return (
    <article className="gm-session-card">
      <div className="gm-session-top">
        <div>
          <p className="gm-date">{localizedDate(session.startsAt, language, { weekday: 'short' })}</p>
          <h3>{localizedSessionName(session, language)}</h3>
        </div>
        <span className={`gm-pill ${canJoin ? 'is-open' : 'is-closed'}`}>
          {canJoin ? `${session.available} ${t('available')}` : session.isOpen ? t('full') : t('closed')}
        </span>
      </div>
      <p className="gm-session-time">{localizedDate(session.startsAt, language)}</p>
      <div className="gm-session-stats">
        <span><strong>{session.capacity}</strong>{t('capacity')}</span>
        <span><strong>{session.registered}</strong>{t('registered')}</span>
      </div>
      <div className="gm-progress" aria-label={`${session.registered} ${t('capacityProgress')} ${session.capacity}`} role="img">
        <span style={{ width: `${ratio}%` }} />
      </div>
      {canJoin ? (
        <button className="gm-button gm-button-primary gm-button-wide" type="button" onClick={() => onJoin(session)}>
          {t('join')} <ArrowRight size={16} />
        </button>
      ) : (
        <button className="gm-button gm-button-muted gm-button-wide" type="button" disabled>
          {session.isOpen ? t('full') : t('closed')}
        </button>
      )}
      {!canJoin && <p className="gm-availability-note">{session.isOpen ? t('fullNote') : t('closedNote')}</p>}
    </article>
  );
}

function QueueRow({ item, language }: { item: GoFLQueueItem; language: Language }) {
  const accessibleLabel = translate(language, 'queueTrackLabel')
    .replace('{number}', String(item.queueNumber))
    .replace('{song}', item.songTitle)
    .replace('{artist}', item.artistName);
  return (
    <div className="gm-queue-row" aria-label={accessibleLabel} role="group">
      <span className="gm-queue-number">{String(item.queueNumber).padStart(2, '0')}</span>
      <span className="gm-queue-icon"><Headphones size={15} /></span>
      <span className="gm-queue-copy">
        <strong>{item.songTitle}</strong>
        <small>{item.artistName}</small>
      </span>
      <span className="gm-genre-tag">{item.genre}</span>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required = false, type = 'text', language,
}: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder: string; required?: boolean; type?: string; language: Language;
}) {
  const t = (key: string) => translate(language, key);
  return (
    <label className="gm-field">
      <span className="gm-label">{label}{required ? <b className="gm-required"> *</b> : <small> ({t('optional')})</small>}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        autoCapitalize={type === 'url' ? 'none' : 'sentences'}
        aria-label={label}
        onInvalid={(event) => event.currentTarget.setCustomValidity(
          type === 'url' && !event.currentTarget.validity.valueMissing
            ? t('invalidUrlValidation')
            : t('requiredValidation'),
        )}
        onInput={(event) => event.currentTarget.setCustomValidity('')}
      />
    </label>
  );
}

function QueueStatus({ status, language }: { status: GoFLQueueItem['status']; language: Language }) {
  return <span className={`gm-status gm-status-${status}`}>{translate(language, status)}</span>;
}

export function MobileExperience() {
  const [screen, setScreen] = useState<Screen>('home');
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [sessions, setSessions] = useState<GoFLSession[]>(sessionFixture);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionFixture[0].id);
  const [hostSessionId, setHostSessionId] = useState(sessionFixture[0].id);
  const [queue, setQueue] = useState<GoFLQueueItem[]>(queueFixture);
  const [submissionSessionById, setSubmissionSessionById] = useState<Record<string, string>>({});
  const [form, setForm] = useState<SubmissionForm>(blankForm);
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const t = (key: string) => translate(language, key);

  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isLanguage(next)) setLanguage(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'gfl-language') setLanguage(isLanguage(event.newValue) ? event.newValue : 'en');
    };
    window.addEventListener('gfl-language-change', onLanguageChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('gfl-language-change', onLanguageChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'ua' ? 'uk' : language;
  }, [language]);

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    try {
      window.localStorage.setItem('gfl-language', next);
    } catch {
      // The in-memory selection still works when storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('gfl-language-change', { detail: next }));
  };

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || sessions[0];
  const nextSession = sessions[0];
  const hostSession = sessions.find((session) => session.id === hostSessionId) || sessions[0];
  const hostQueue = useMemo(() => queue.filter((item) => {
    const derivedSessionId = sessionFixture.find((session) => item.id.startsWith(`${session.id}-`))?.id;
    if (derivedSessionId) return derivedSessionId === hostSessionId;
    if (item.id.startsWith('submission-local-')) return (submissionSessionById[item.id] || sessionFixture[0].id) === hostSessionId;
    return hostSessionId === sessionFixture[0].id;
  }), [hostSessionId, queue, submissionSessionById]);
  const ordered = useMemo(
    () => hostQueue.filter((item) => item.status === 'approved' || item.status === 'played' || item.status === 'skipped').sort((a, b) => a.queueNumber - b.queueNumber),
    [hostQueue],
  );
  const current = useMemo(
    () => hostQueue.filter((item) => item.status === 'approved').sort((a, b) => a.queueNumber - b.queueNumber)[0],
    [hostQueue],
  );
  const currentPosition = current ? ordered.findIndex((item) => item.id === current.id) + 1 : 0;
  const nextItems = current
    ? hostQueue.filter((item) => item.status === 'approved' && item.queueNumber > current.queueNumber).sort((a, b) => a.queueNumber - b.queueNumber).slice(0, 3)
    : [];
  const counts = {
    all: hostQueue.length,
    pending: hostQueue.filter((item) => item.status === 'pending').length,
    approved: hostQueue.filter((item) => item.status === 'approved').length,
    played: hostQueue.filter((item) => item.status === 'played').length,
  };

  const go = (next: Screen) => {
    setScreen(next);
    setPlaying(false);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };
  const chooseSession = (session: GoFLSession) => {
    setSelectedSessionId(session.id);
    go('submit');
  };
  const updateForm = (key: keyof SubmissionForm, value: string) => {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  };
  const updateStatus = (id: string, status: GoFLQueueItem['status']) => {
    setQueue((items) => items.map((item) => item.id === id ? { ...item, status } : item));
    if (screen === 'live') setPlaying(false);
  };
  const onHostSessionChange = (id: string) => {
    setHostSessionId(id);
    if (id !== sessionFixture[0].id) {
      const firstApproved = queueFixture.filter((item) => item.status === 'approved').slice(0, 2)
        .map((item, index) => ({ ...item, id: `${id}-${index + 1}`, queueNumber: index + 1 }));
      setQueue((items) => [...items.filter((item) => !item.id.startsWith(`${id}-`)), ...firstApproved]);
    }
    setPlaying(false);
  };
  const submitTrack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSession || !rightsAccepted || !selectedSession.isOpen || selectedSession.available < 1) return;
    const nextNumber = Math.max(4, ...queue.map((item) => item.queueNumber)) + 1;
    setReceiptNumber(nextNumber);
    const nextSubmission: GoFLQueueItem = {
      id: `submission-local-${nextNumber}`,
      queueNumber: nextNumber,
      artistName: form.artistName,
      songTitle: form.songTitle,
      intro: form.intro,
      genre: form.genre,
      country: form.country,
      trackUrl: form.trackUrl,
      socialUrl: form.socialUrl || null,
      status: 'pending',
    };
    setQueue((items) => [...items, nextSubmission]);
    setSubmissionSessionById((items) => ({ ...items, [nextSubmission.id]: selectedSession.id }));
    setSessions((items) => items.map((item) => item.id === selectedSession.id
      ? { ...item, registered: item.registered + 1, available: Math.max(0, item.available - 1) }
      : item));
    go('receipt');
  };
  const nextLiveTrack = () => {
    if (current) updateStatus(current.id, 'skipped');
  };

  const hostActions = (item: GoFLQueueItem) => (
    <div className="gm-row-actions">
      {item.status === 'pending' && <>
        <button className="gm-action-button gm-action-approve" type="button" onClick={() => updateStatus(item.id, 'approved')}><Check size={15} />{t('approve')}</button>
        <button className="gm-action-button gm-action-reject" type="button" onClick={() => updateStatus(item.id, 'rejected')}><X size={15} />{t('reject')}</button>
      </>}
      {item.status === 'approved' && <>
        <button className="gm-action-button gm-action-played" type="button" onClick={() => updateStatus(item.id, 'played')}><Check size={15} />{t('markPlayed')}</button>
        <button className="gm-action-button gm-action-skip" type="button" onClick={() => updateStatus(item.id, 'skipped')}><SkipForward size={15} />{t('skip')}</button>
      </>}
      {(item.status === 'played' || item.status === 'rejected' || item.status === 'skipped') && <span className="gm-status-finished"><CheckCircle2 size={15} /><QueueStatus status={item.status} language={language} /></span>}
    </div>
  );

  return (
    <div className="gofl-current gofl-mobile" id="top">
      <style>{`
        .gofl-mobile { min-height:100dvh; width:100%; overflow-x:hidden; padding-bottom:calc(76px + env(safe-area-inset-bottom)); color:hsl(var(--foreground)); font-family:var(--app-font-sans); }
        .gofl-mobile button,.gofl-mobile input,.gofl-mobile select,.gofl-mobile textarea { font:inherit; }
        .gofl-mobile button:focus-visible,.gofl-mobile input:focus-visible,.gofl-mobile select:focus-visible,.gofl-mobile textarea:focus-visible { outline:2px solid hsl(var(--accent)); outline-offset:3px; }
        .gm-header { position:sticky; top:0; z-index:20; display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:68px; padding:10px 16px; border-bottom:1px solid hsl(var(--border)/.8); background:hsl(var(--background)/.88); backdrop-filter:blur(18px); }
        .gm-brand { display:flex; align-items:center; gap:10px; min-width:0; padding:0; border:0; color:inherit; background:transparent; text-align:left; cursor:pointer; }
        .gm-sigil { position:relative; display:grid; width:38px; height:38px; flex:0 0 38px; place-items:center; border:1px solid hsl(var(--primary)/.68); border-radius:50%; color:hsl(var(--primary)); box-shadow:0 0 18px hsl(var(--primary)/.2); }
        .gm-sigil:before { content:""; position:absolute; inset:4px; border:1px solid hsl(var(--accent)/.35); border-radius:50%; }
        .gm-sigil span { font:17px var(--app-font-mono); }
        .gm-brand-copy { min-width:0; }
        .gm-brand-name { display:block; font:600 12px var(--app-font-serif); letter-spacing:.14em; }
        .gm-brand-sub { display:block; margin-top:3px; color:hsl(var(--muted-foreground)); font-size:8px; font-weight:700; letter-spacing:.22em; white-space:nowrap; }
        .gm-header-actions { display:flex; flex:0 0 auto; align-items:center; gap:6px; }
        .gm-language-switcher { display:flex; flex:0 0 auto; align-items:center; gap:2px; padding:3px; border:1px solid hsl(var(--border)); border-radius:5px; background:hsl(var(--card)/.56); }
        .gm-language-button { display:grid; min-width:27px; min-height:28px; place-items:center; padding:0 5px; border:0; border-radius:3px; color:hsl(var(--muted-foreground)); background:transparent; font-size:9px!important; font-weight:800!important; letter-spacing:.04em; cursor:pointer; }
        .gm-language-button[aria-pressed="true"] { color:hsl(var(--primary-foreground)); background:hsl(var(--primary)); }
        .gm-preview-label { display:flex; flex:0 0 auto; align-items:center; justify-content:center; gap:6px; min-width:36px; min-height:36px; padding:0 9px; border:1px solid hsl(var(--accent)/.38); border-radius:4px; color:hsl(var(--accent)); background:hsl(var(--accent)/.07); font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; cursor:pointer; }
        .gm-preview-label svg { width:14px; height:14px; }
        .gm-preview-label span { overflow-wrap:anywhere; }
        .gm-main { width:min(100%,720px); margin:0 auto; padding:26px 16px 35px; }
        .gm-home-hero { position:relative; padding:28px 0 25px; }
        .gm-home-hero:before { content:""; position:absolute; top:-30px; right:-45px; z-index:-1; width:230px; height:270px; background:radial-gradient(ellipse,hsl(205 95% 28%/.24),transparent 70%); pointer-events:none; }
        .gm-home-hero:after { content:""; position:absolute; left:-30px; bottom:4px; z-index:-1; width:210px; height:190px; background:radial-gradient(ellipse,hsl(351 85% 24%/.2),transparent 70%); pointer-events:none; }
        .gm-eyebrow { display:flex; align-items:center; gap:9px; margin:0; color:hsl(var(--primary)); font:10px var(--app-font-mono); letter-spacing:.17em; line-height:1.65; text-transform:uppercase; }
        .gm-live-dot { width:7px; height:7px; flex:none; border-radius:50%; background:hsl(var(--accent)); box-shadow:0 0 0 4px hsl(var(--accent)/.12); }
        .gm-home-hero h1,.gm-heading h1 { margin:20px 0 0; font:500 clamp(38px,12vw,58px)/1.02 var(--app-font-serif); letter-spacing:-.045em; text-wrap:balance; }
        .gm-lede { margin:16px 0 0; color:hsl(var(--muted-foreground)); font-size:14px; line-height:1.8; }
        .gm-hero-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:22px; }
        .gm-button { display:inline-flex; min-width:0; min-height:46px; align-items:center; justify-content:center; gap:9px; padding:12px 14px; border:1px solid transparent; border-radius:5px; font-size:10px!important; font-weight:800!important; letter-spacing:.055em; line-height:1.35; text-align:center; text-transform:uppercase; white-space:normal; overflow-wrap:anywhere; cursor:pointer; transition:background .18s,transform .18s,border-color .18s; }
        .gm-button:active,.gm-action-button:active { transform:translateY(1px); }
        .gm-button-primary { color:hsl(var(--primary-foreground)); background:hsl(var(--primary)); }
        .gm-button-primary:hover { background:hsl(var(--primary)/.86); }
        .gm-button-outline { border-color:hsl(var(--border)); color:hsl(var(--foreground)); background:hsl(var(--card)/.55); }
        .gm-button-outline:hover { border-color:hsl(var(--primary)/.55); background:hsl(var(--primary)/.08); }
        .gm-button-muted { color:hsl(var(--muted-foreground)); background:hsl(var(--secondary)/.6); }
        .gm-button:disabled { opacity:.62; cursor:not-allowed; }
        .gm-button-wide { width:100%; margin-top:18px; }
        .gm-hero-steps { display:grid; grid-template-columns:1fr; gap:10px; margin-top:26px; padding-top:17px; border-top:1px solid hsl(var(--border)/.75); }
        .gm-hero-steps span { display:flex; align-items:center; gap:8px; color:hsl(var(--muted-foreground)); font-size:9px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; }
        .gm-hero-steps i { width:6px; height:6px; flex:none; border-radius:50%; background:hsl(var(--primary)); }
        .gm-hero-steps span:nth-child(2) i { background:hsl(var(--accent)); }
        .gm-hero-steps span:nth-child(3) i { background:hsl(var(--chart-3)); }
        .gm-next-card { position:relative; overflow:hidden; padding:17px; border:1px solid hsl(var(--border)); border-radius:10px; background:linear-gradient(145deg,hsl(var(--card)/.95),hsl(var(--background)/.84)); box-shadow:inset 0 1px hsl(240 80% 90%/.04),0 18px 44px hsl(230 45% 2%/.2); }
        .gm-next-card:after { content:""; position:absolute; top:-70px; right:-65px; width:180px; height:180px; border-radius:50%; background:radial-gradient(circle,hsl(var(--accent)/.15),transparent 68%); pointer-events:none; }
        .gm-next-head { display:flex; justify-content:space-between; gap:8px; }
        .gm-next-head h2 { margin:7px 0 0; font:500 22px/1.2 var(--app-font-serif); }
        .gm-next-head svg { color:hsl(var(--primary)); }
        .gm-next-date { margin:9px 0 0; color:hsl(var(--muted-foreground)); font-size:12px; line-height:1.6; }
        .gm-next-bottom { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:14px; padding-top:13px; border-top:1px solid hsl(var(--border)/.7); }
        .gm-next-bottom span { color:hsl(var(--muted-foreground)); font:11px var(--app-font-mono); }
        .gm-text-action { display:inline-flex; min-width:0; min-height:44px; align-items:center; justify-content:center; gap:5px; padding:6px 0; border:0; color:hsl(var(--primary)); background:transparent; font-size:10px; font-weight:800; letter-spacing:.045em; line-height:1.35; text-align:center; text-transform:uppercase; white-space:normal; overflow-wrap:anywhere; cursor:pointer; }
        .gm-home-section { margin-top:36px; }
        .gm-section-top { display:flex; align-items:end; justify-content:space-between; gap:10px; margin-bottom:14px; }
        .gm-section-top h2 { margin:6px 0 0; font:500 24px/1.2 var(--app-font-serif); }
        .gm-how { margin-top:30px; padding:18px; border:1px solid hsl(var(--border)/.8); border-radius:9px; background:hsl(var(--card)/.35); }
        .gm-how-title { margin:0; color:hsl(var(--primary)); font:10px var(--app-font-mono); letter-spacing:.2em; text-transform:uppercase; }
        .gm-how-step { display:flex; gap:12px; margin-top:16px; }
        .gm-step-num { display:grid; width:28px; height:28px; flex:none; place-items:center; border:1px solid hsl(var(--primary)/.5); border-radius:50%; color:hsl(var(--primary)); font:11px var(--app-font-mono); }
        .gm-how-step h3 { margin:0; font-size:12px; }
        .gm-how-step p { margin:4px 0 0; color:hsl(var(--muted-foreground)); font-size:11px; line-height:1.65; }
        .gm-heading { margin:4px 0 23px; }
        .gm-heading h1 { margin-top:12px; font-size:clamp(34px,10vw,48px); }
        .gm-heading .gm-lede { margin-top:12px; }
        .gm-session-list { display:grid; gap:13px; }
        .gm-session-card { position:relative; overflow:hidden; padding:16px; border:1px solid hsl(var(--card-border)/.9); border-radius:10px; background:linear-gradient(145deg,hsl(231 39% 12%/.95),hsl(231 39% 7%/.92)); box-shadow:inset 0 1px hsl(240 80% 90%/.045),0 14px 32px hsl(230 45% 2%/.18); }
        .gm-session-card:before { content:""; position:absolute; top:-70px; right:-70px; width:160px; height:150px; border-radius:50%; background:radial-gradient(circle,hsl(var(--primary)/.12),transparent 70%); pointer-events:none; }
        .gm-session-top { position:relative; display:flex; align-items:start; justify-content:space-between; gap:10px; }
        .gm-date { margin:0; color:hsl(var(--primary)); font:10px var(--app-font-mono); letter-spacing:.2em; text-transform:uppercase; }
        .gm-session-top h3 { margin:6px 0 0; font:500 20px/1.2 var(--app-font-serif); }
        .gm-pill { display:inline-flex; max-width:45%; align-items:center; justify-content:center; min-height:25px; padding:4px 8px; border:1px solid; border-radius:99px; font-size:9px; font-weight:800; letter-spacing:.025em; line-height:1.3; text-align:center; white-space:normal; overflow-wrap:anywhere; }
        .gm-pill.is-open { border-color:hsl(var(--primary)/.48); color:hsl(var(--primary)); background:hsl(var(--primary)/.08); }
        .gm-pill.is-closed { border-color:hsl(var(--chart-4)/.4); color:hsl(var(--chart-4)); background:hsl(var(--chart-4)/.06); }
        .gm-session-time { position:relative; margin:8px 0 0; color:hsl(var(--muted-foreground)); font-size:12px; line-height:1.6; }
        .gm-session-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px; padding:12px 0; border-top:1px solid hsl(var(--border)/.7); border-bottom:1px solid hsl(var(--border)/.7); color:hsl(var(--muted-foreground)); font-size:10px; }
        .gm-session-stats strong { display:block; margin-bottom:3px; color:hsl(var(--foreground)); font:13px var(--app-font-mono); }
        .gm-progress { height:3px; margin-top:12px; overflow:hidden; border-radius:99px; background:hsl(var(--secondary)); }
        .gm-progress span { display:block; height:100%; border-radius:inherit; background:hsl(var(--primary)); }
        .gm-availability-note { margin:9px 0 0; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.55; }
        .gm-selected-note { display:flex; gap:8px; align-items:flex-start; margin:-6px 0 18px; padding:11px 12px; border:1px solid hsl(var(--primary)/.34); border-radius:6px; color:hsl(var(--foreground)); background:hsl(var(--primary)/.08); font-size:11px; line-height:1.6; }
        .gm-selected-note svg { flex:none; margin-top:1px; color:hsl(var(--primary)); }
        .gm-preview-queue { margin-top:21px; padding:16px; border:1px solid hsl(var(--border)/.85); border-radius:9px; background:linear-gradient(135deg,hsl(var(--card)/.86),hsl(var(--background)/.82)); }
        .gm-queue-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .gm-queue-head h2 { margin:6px 0 0; font:500 20px var(--app-font-serif); }
        .gm-queue-head svg { color:hsl(var(--accent)); }
        .gm-queue-row { display:flex; align-items:center; gap:9px; min-width:0; padding:12px 0; border-bottom:1px solid hsl(var(--border)/.58); }
        .gm-queue-row:last-child { padding-bottom:0; border-bottom:0; }
        .gm-queue-number { width:20px; flex:none; color:hsl(var(--primary)); font:10px var(--app-font-mono); }
        .gm-queue-icon { display:grid; width:29px; height:29px; flex:none; place-items:center; border:1px solid hsl(var(--border)); border-radius:50%; color:hsl(var(--muted-foreground)); background:hsl(var(--secondary)/.55); }
        .gm-queue-copy { min-width:0; flex:1; }
        .gm-queue-copy strong,.gm-queue-copy small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .gm-queue-copy strong { font-size:11px; }
        .gm-queue-copy small { margin-top:3px; color:hsl(var(--muted-foreground)); font-size:10px; }
        .gm-genre-tag { max-width:90px; overflow:hidden; padding:4px 6px; border:1px solid hsl(var(--border)); border-radius:30px; color:hsl(var(--muted-foreground)); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
        .gm-empty { padding:22px 12px; border:1px dashed hsl(var(--border)); border-radius:7px; color:hsl(var(--muted-foreground)); font-size:12px; line-height:1.65; text-align:center; }
        .gm-submit-card { padding:16px; border:1px solid hsl(var(--border)); border-radius:9px; background:hsl(var(--card)/.36); }
        .gm-submit-form { display:grid; gap:16px; }
        .gm-field { display:block; min-width:0; }
        .gm-label { display:block; margin-bottom:7px; color:hsl(var(--foreground)); font-size:10px; font-weight:800; letter-spacing:.055em; line-height:1.5; text-transform:uppercase; overflow-wrap:anywhere; }
        .gm-label small { color:hsl(var(--muted-foreground)); font-size:9px; font-weight:500; letter-spacing:0; text-transform:none; }
        .gm-required { color:hsl(var(--accent)); }
        .gm-field input,.gm-field textarea,.gm-session-select { display:block; width:100%; min-height:46px; padding:12px; border:1px solid hsl(var(--input)); border-radius:5px; color:hsl(var(--foreground)); background:hsl(var(--background)/.68); font-size:13px!important; }
        .gm-field input::placeholder,.gm-field textarea::placeholder { color:hsl(var(--muted-foreground)/.8); }
        .gm-field textarea { min-height:104px; resize:vertical; line-height:1.6; }
        .gm-field textarea:focus,.gm-field input:focus,.gm-session-select:focus { border-color:hsl(var(--primary)); }
        .gm-field-hint { margin:6px 0 0; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.6; }
        .gm-char-count { float:right; color:hsl(var(--muted-foreground)); font:9px var(--app-font-mono); font-weight:400; letter-spacing:0; text-transform:none; }
        .gm-session-select { appearance:auto; }
        .gm-session-select option { color:#ececf4; background:#111320; }
        .gm-rights { display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid hsl(var(--border)); border-radius:5px; color:hsl(var(--muted-foreground)); background:hsl(var(--background)/.38); font-size:10px; line-height:1.6; cursor:pointer; }
        .gm-rights input { width:17px; height:17px; flex:none; margin:1px 0 0; accent-color:hsl(var(--primary)); }
        .gm-submit-button { width:100%; min-height:49px; }
        .gm-form-note { display:flex; gap:8px; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.6; }
        .gm-form-note svg { flex:none; color:hsl(var(--primary)); }
        .gm-receipt { padding:25px 17px; border:1px solid hsl(var(--primary)/.48); border-radius:12px; background:linear-gradient(145deg,hsl(231 39% 12%/.94),hsl(231 39% 7%/.9)); box-shadow:0 0 48px hsl(var(--primary)/.08); text-align:center; }
        .gm-receipt-icon { display:grid; width:56px; height:56px; margin:0 auto; place-items:center; border:1px solid hsl(var(--primary)/.4); border-radius:50%; color:hsl(var(--primary)); background:hsl(var(--primary)/.1); }
        .gm-receipt h1 { margin:13px 0 0; font:500 33px/1.12 var(--app-font-serif); }
        .gm-receipt-copy { margin:11px auto 0; color:hsl(var(--muted-foreground)); font-size:12px; line-height:1.75; }
        .gm-receipt-data { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:21px; text-align:left; }
        .gm-receipt-data div { min-width:0; padding:12px; border:1px solid hsl(var(--border)); border-radius:6px; background:hsl(var(--background)/.55); }
        .gm-receipt-data span { display:block; color:hsl(var(--muted-foreground)); font-size:8px; letter-spacing:.09em; text-transform:uppercase; }
        .gm-receipt-data strong { display:block; margin-top:5px; color:hsl(var(--primary)); font:18px var(--app-font-mono); overflow-wrap:anywhere; }
        .gm-receipt-data div:last-child strong { color:hsl(var(--foreground)); font:700 12px var(--app-font-sans); }
        .gm-receipt-actions { display:grid; gap:8px; margin-top:17px; }
        .gm-host-header { padding-bottom:17px; border-bottom:1px solid hsl(var(--border)/.75); }
        .gm-host-preview-note { margin:10px 0 0; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.5; }
        .gm-host-open-live { margin-top:15px; }
        .gm-host-tools { display:grid; gap:12px; margin:15px 0; }
        .gm-counts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; }
        .gm-count { min-width:0; padding:9px 4px; border:1px solid hsl(var(--border)); border-radius:6px; color:hsl(var(--muted-foreground)); font-size:8px; line-height:1.3; text-align:center; text-transform:uppercase; overflow-wrap:anywhere; }
        .gm-count strong { display:block; margin-bottom:3px; color:hsl(var(--foreground)); font:12px var(--app-font-mono); }
        .gm-host-queue { overflow:hidden; border:1px solid hsl(var(--border)); border-radius:9px; background:hsl(var(--card)/.3); }
        .gm-host-row { padding:14px 13px; border-bottom:1px solid hsl(var(--border)/.68); }
        .gm-host-row:last-child { border-bottom:0; }
        .gm-host-row-top { display:flex; align-items:flex-start; gap:8px; }
        .gm-host-number { padding-top:3px; color:hsl(var(--primary)); font:11px var(--app-font-mono); }
        .gm-host-title { min-width:0; flex:1; }
        .gm-host-title h3 { margin:0; overflow-wrap:anywhere; font-size:13px; line-height:1.45; }
        .gm-host-meta { margin:5px 0 0; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.5; }
        .gm-status { display:inline-flex; flex:none; max-width:46%; justify-content:center; padding:4px 7px; border:1px solid hsl(var(--chart-4)/.4); border-radius:20px; color:hsl(var(--chart-4)); font-size:8px; font-weight:800; letter-spacing:.04em; line-height:1.35; text-align:center; text-transform:uppercase; white-space:normal; overflow-wrap:anywhere; }
        .gm-status-approved { border-color:hsl(var(--primary)/.44); color:hsl(var(--primary)); }
        .gm-status-played { border-color:hsl(var(--chart-3)/.42); color:hsl(var(--chart-3)); }
        .gm-status-rejected,.gm-status-skipped { border-color:hsl(var(--destructive)/.45); color:hsl(var(--destructive)); }
        .gm-host-intro { margin:9px 0 0; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.65; }
        .gm-host-links { display:flex; flex-wrap:wrap; gap:13px; margin-top:9px; }
        .gm-host-links a { display:inline-flex; align-items:center; gap:5px; color:hsl(var(--primary)); font-size:9px; font-weight:800; letter-spacing:.05em; text-decoration:none; text-transform:uppercase; }
        .gm-host-links a:hover { color:hsl(var(--accent)); }
        .gm-row-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:11px; }
        .gm-action-button { display:inline-flex; min-width:0; min-height:44px; flex:1 1 auto; align-items:center; justify-content:center; gap:5px; padding:8px 9px; border:1px solid hsl(var(--border)); border-radius:5px; color:hsl(var(--foreground)); background:transparent; font-size:8px!important; font-weight:800!important; letter-spacing:.025em; line-height:1.3; text-align:center; text-transform:uppercase; white-space:normal; overflow-wrap:anywhere; cursor:pointer; }
        .gm-action-approve { border-color:hsl(var(--primary)/.45); color:hsl(var(--primary)); background:hsl(var(--primary)/.08); }
        .gm-action-reject { border-color:hsl(var(--destructive)/.45); color:hsl(var(--destructive)); }
        .gm-action-played { border-color:hsl(var(--chart-3)/.4); color:hsl(var(--chart-3)); background:hsl(var(--chart-3)/.08); }
        .gm-action-skip { color:hsl(var(--muted-foreground)); }
        .gm-status-finished { display:inline-flex; align-items:center; gap:6px; color:hsl(var(--chart-3)); font-size:10px; }
        .gm-live-top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding-bottom:15px; border-bottom:1px solid hsl(var(--border)/.75); }
        .gm-live-indicator { display:flex; align-items:center; gap:9px; }
        .gm-live-indicator .gm-live-dot { background:hsl(var(--accent)); }
        .gm-live-label { color:hsl(var(--accent)); font:10px var(--app-font-mono); letter-spacing:.2em; text-transform:uppercase; }
        .gm-live-top h1 { margin:4px 0 0; font:500 29px var(--app-font-serif); }
        .gm-back-button { display:inline-flex; min-height:42px; align-items:center; gap:5px; padding:8px 0 8px 9px; border:0; color:hsl(var(--muted-foreground)); background:transparent; font-size:9px!important; font-weight:800!important; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
        .gm-live-card { margin-top:17px; padding:16px; border:1px solid hsl(var(--primary)/.4); border-radius:11px; background:linear-gradient(145deg,hsl(231 39% 12%/.96),hsl(231 39% 7%/.92)); }
        .gm-track-counter { display:flex; align-items:center; justify-content:space-between; color:hsl(var(--primary)); font:10px var(--app-font-mono); }
        .gm-track-art { display:grid; width:100%; aspect-ratio:1.48; max-height:195px; margin-top:14px; place-items:center; border:1px solid hsl(var(--primary)/.25); border-radius:8px; color:hsl(var(--primary)/.75); background:radial-gradient(circle at 42% 35%,hsl(var(--accent)/.23),transparent 39%),linear-gradient(145deg,hsl(231 39% 17%),hsl(229 42% 5%)); }
        .gm-track-title { margin-top:15px; }
        .gm-track-title .gm-eyebrow { color:hsl(var(--accent)); }
        .gm-track-title h2 { margin:7px 0 0; font:500 clamp(28px,9vw,40px)/1.08 var(--app-font-serif); overflow-wrap:anywhere; }
        .gm-track-title h3 { margin:6px 0 0; font-size:15px; font-weight:500; }
        .gm-track-tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:11px; }
        .gm-track-tags span { padding:5px 8px; border:1px solid hsl(var(--border)); border-radius:20px; color:hsl(var(--muted-foreground)); font-size:9px; }
        .gm-track-intro { margin:12px 0 0; color:hsl(var(--muted-foreground)); font-size:11px; line-height:1.7; }
        .gm-player { display:flex; align-items:center; gap:10px; margin-top:14px; padding:10px; border:1px solid hsl(var(--border)); border-radius:7px; background:hsl(var(--background)/.55); }
        .gm-player-button { display:grid; width:39px; height:39px; flex:none; place-items:center; border:0; border-radius:50%; color:hsl(var(--primary-foreground)); background:hsl(var(--primary)); cursor:pointer; }
        .gm-player-body { min-width:0; flex:1; }
         .gm-player-title { display:flex; flex-wrap:wrap; align-items:center; gap:6px; color:hsl(var(--foreground)); font-size:9px; font-weight:800; letter-spacing:.055em; line-height:1.35; text-transform:uppercase; overflow-wrap:anywhere; }
        .gm-player-title svg { flex:none; color:hsl(var(--primary)); }
        .gm-player-progress { height:3px; margin-top:8px; overflow:hidden; border-radius:4px; background:hsl(var(--secondary)); }
        .gm-player-progress span { display:block; height:100%; background:linear-gradient(90deg,hsl(var(--primary)),hsl(var(--accent))); transition:width .25s; }
        .gm-player-time { display:flex; justify-content:space-between; margin-top:4px; color:hsl(var(--muted-foreground)); font:8px var(--app-font-mono); }
        .gm-live-controls { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:12px; }
        .gm-live-controls .gm-button { min-height:48px; padding:10px 8px; font-size:9px!important; }
        .gm-live-controls .gm-button:first-child { grid-column:1/-1; }
        .gm-upcoming { margin-top:14px; padding:15px; border:1px solid hsl(var(--border)); border-radius:9px; background:hsl(var(--card)/.28); }
        .gm-upcoming-head { display:flex; justify-content:space-between; gap:8px; align-items:center; }
        .gm-upcoming-head h2 { margin:0; font:500 20px var(--app-font-serif); }
        .gm-upcoming-head span { color:hsl(var(--muted-foreground)); font:9px var(--app-font-mono); text-transform:uppercase; }
        .gm-live-empty { padding:40px 12px; text-align:center; }
        .gm-live-empty svg { color:hsl(var(--primary)); }
        .gm-live-empty h2 { margin:12px 0 0; font:500 23px var(--app-font-serif); }
        .gm-live-empty p { margin:7px 0 0; color:hsl(var(--muted-foreground)); font-size:11px; line-height:1.7; }
        .gm-host-guide { margin-top:15px; padding:15px; border:1px solid hsl(var(--border)); border-radius:8px; background:hsl(var(--card)/.28); }
        .gm-guide-step { display:flex; gap:10px; margin-top:12px; }
        .gm-guide-step b { display:grid; width:24px; height:24px; flex:none; place-items:center; border:1px solid hsl(var(--primary)/.45); border-radius:50%; color:hsl(var(--primary)); font:10px var(--app-font-mono); }
        .gm-guide-step strong { font-size:10px; }
        .gm-guide-step p { margin:3px 0 0; color:hsl(var(--muted-foreground)); font-size:9px; line-height:1.5; }
        .gm-bottom-nav { position:fixed; z-index:30; right:0; bottom:0; left:0; display:grid; grid-template-columns:repeat(4,1fr); gap:2px; padding:7px 8px calc(7px + env(safe-area-inset-bottom)); border-top:1px solid hsl(var(--border)/.85); background:hsl(var(--background)/.94); backdrop-filter:blur(16px); }
        .gofl-mobile:has(.gm-submit-form :focus) .gm-bottom-nav { display:none; }
        .gm-nav-button { display:flex; min-width:0; min-height:49px; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:5px 2px; border:0; border-radius:5px; color:hsl(var(--muted-foreground)); background:transparent; cursor:pointer; }
        .gm-nav-button span { max-width:100%; font-size:8px; font-weight:800; letter-spacing:.025em; line-height:1.15; text-align:center; text-transform:uppercase; white-space:normal; overflow-wrap:anywhere; }
        .gm-nav-button svg { width:17px; height:17px; }
        .gm-nav-button.is-current { color:hsl(var(--primary)); background:hsl(var(--primary)/.09); }
        .gm-footer { width:calc(100% - 32px); max-width:680px; margin:30px auto 0; padding-top:17px; border-top:1px solid hsl(var(--border)/.7); }
        .gm-footer p { margin:0; color:hsl(var(--muted-foreground)); font-size:10px; line-height:1.65; }
        .gm-footer span { display:block; margin-top:9px; color:hsl(var(--muted-foreground)); font:8px var(--app-font-mono); letter-spacing:.13em; line-height:1.6; text-transform:uppercase; }
        @media (min-width:390px) {
          .gm-header { padding-right:19px; padding-left:19px; }
          .gm-main { padding:30px 20px 42px; }
          .gm-home-hero { padding-top:32px; }
          .gm-hero-steps { grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
          .gm-hero-steps span { font-size:8px; letter-spacing:.055em; }
          .gm-submit-card { padding:19px; }
          .gm-live-card { padding:19px; }
        }
        @media (min-width:430px) {
          .gm-main { padding-right:23px; padding-left:23px; }
           .gm-home-hero h1 { font-size:48px; }
          .gm-session-card { padding:18px; }
          .gm-header { padding-right:22px; padding-left:22px; }
        }
        @media (max-width:350px) {
          .gm-brand-name { font-size:11px; }
           .gm-brand-sub { display:none; }
          .gm-header { padding-right:11px; padding-left:11px; }
          .gm-preview-label { padding:0 7px; font-size:8px; }
           .gm-hero-actions .gm-button { gap:5px; padding-right:8px; padding-left:8px; font-size:8px!important; letter-spacing:.055em; }
           .gm-next-bottom { align-items:flex-start; flex-wrap:wrap; }
            .gm-next-bottom > span,.gm-next-bottom .gm-text-action { flex:0 1 auto; white-space:normal; overflow-wrap:anywhere; }
           .gm-next-bottom .gm-text-action { margin-left:auto; }
           .gm-main { padding:16px 13px 35px; }
           .gm-home-hero { padding-top:12px; padding-bottom:18px; }
           .gm-home-hero h1 { margin-top:15px; }
           .gm-hero-steps { margin-top:20px; }
          .gm-home-hero h1 { font-size:39px; }
          .gm-session-top { flex-direction:column; }
          .gm-session-top .gm-pill { position:static; max-width:100%; align-self:flex-start; }
          .gm-session-top { gap:7px; }
          .gm-session-top > div { max-width:100%; }
          .gm-hero-actions { grid-template-columns:1fr; }
          .gm-preview-label { padding:0 8px; }
          .gm-preview-label span { display:none; }
          .gm-header-actions { gap:4px; }
          .gm-header { gap:5px; }
          .gm-language-button { min-width:25px; min-height:28px; padding:0 4px; }
          .gm-field input,.gm-field textarea,.gm-session-select { font-size:12px!important; }
          .gm-action-button { padding-right:7px; padding-left:7px; font-size:7px!important; }
          .gm-row-actions { gap:5px; }
          .gm-nav-button span { font-size:7px; }
          .gm-count { font-size:7px; }
          .gm-count strong { font-size:11px; }
          .gm-genre-tag { max-width:68px; }
        }
        @media (prefers-reduced-motion:reduce) {
          .gofl-mobile *, .gofl-mobile *:before, .gofl-mobile *:after { scroll-behavior:auto!important; animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; }
        }
      `}</style>

      <header className="gm-header">
        <BrandMark onClick={() => go('home')} language={language} />
        <div className="gm-header-actions">
          <div className="gm-language-switcher" role="group" aria-label={t('language')} data-testid="language-switcher">
            {(['en', 'fr', 'ua'] as const).map((item) => (
              <button
                key={item}
                className="gm-language-button"
                type="button"
                aria-pressed={language === item}
                aria-label={`${t('language')}: ${item.toUpperCase()}`}
                data-testid={`language-${item}`}
                onClick={() => changeLanguage(item)}
              >{item.toUpperCase()}</button>
            ))}
          </div>
          <button
            className="gm-preview-label"
            type="button"
            onClick={() => go(screen === 'host' || screen === 'live' ? 'home' : 'host')}
            aria-label={screen === 'host' || screen === 'live' ? t('backToPublic') : t('openHostPreview')}
            title={screen === 'host' || screen === 'live' ? t('backToPublic') : t('openHostPreview')}
            data-testid="button-preview-mode"
          >
            <ShieldCheck aria-hidden="true" />
            <span>{screen === 'host' || screen === 'live' ? t('publicPreviewShort') : t('hostPreviewShort')}</span>
          </button>
        </div>
      </header>

      <main className="gm-main" data-testid={`mobile-screen-${screen}`}>
        {screen === 'home' && <>
          <section className="gm-home-hero">
            <p className="gm-eyebrow"><i className="gm-live-dot" aria-hidden="true" />{t('heroEyebrow')}</p>
            <h1>{t('heroTitle').split('\n').map((line, index) => <span key={`${index}-${line}`}>{line}{index === 0 && <br />}</span>)}</h1>
            <p className="gm-lede">{t('heroBody')}</p>
            <div className="gm-hero-actions">
              <button className="gm-button gm-button-primary" type="button" onClick={() => go('sessions')}>{t('browse')} <ArrowRight size={15} /></button>
              <button className="gm-button gm-button-outline" type="button" onClick={() => go('submit')}>{t('submit')}</button>
            </div>
            <div className="gm-hero-steps">
              <span><i />{t('step1')}</span><span><i />{t('step2')}</span><span><i />{t('step3')}</span>
            </div>
          </section>
          {nextSession && <section className="gm-next-card">
            <div className="gm-next-head">
              <div><p className="gm-eyebrow">{t('nextSession')}</p><h2>{localizedSessionName(nextSession, language)}</h2></div>
              <Sparkles size={19} />
            </div>
            <p className="gm-next-date">{localizedDate(nextSession.startsAt, language)}</p>
            <div className="gm-next-bottom">
              <span>{nextSession.isOpen && nextSession.available > 0 ? `${nextSession.available} spaces left` : nextSession.isOpen ? t('full') : t('closed')}</span>
              {nextSession.isOpen && nextSession.available > 0
                ? <button className="gm-text-action" type="button" onClick={() => chooseSession(nextSession)}>{t('join')} <ArrowRight size={13} /></button>
                : <button className="gm-text-action" type="button" onClick={() => go('sessions')}>{t('viewSessions')} <ArrowRight size={13} /></button>}
            </div>
          </section>}
          <section className="gm-home-section">
            <div className="gm-section-top">
              <div><p className="gm-eyebrow">{t('nextSession')}</p><h2>{t('viewSessions')}</h2></div>
              <button className="gm-text-action" type="button" onClick={() => go('sessions')}>{t('viewSessions')} <ArrowRight size={14} /></button>
            </div>
            <p className="gm-lede">{t('sessionsBody')}</p>
            <div className="gm-session-list" style={{ marginTop: 14 }}>
              {sessions.slice(0, 2).map((session) => <SessionCard key={session.id} session={session} onJoin={chooseSession} language={language} />)}
            </div>
          </section>
          <section className="gm-how">
            <p className="gm-how-title">{t('howItWorks')}</p>
            {[
              ['step1', 'step1Body'], ['step2', 'step2Body'], ['step3', 'step3Body'],
            ].map(([title, body], index) => (
              <div className="gm-how-step" key={title}>
                <span className="gm-step-num">{index + 1}</span>
                <div><h3>{t(title)}</h3><p>{t(body)}</p></div>
              </div>
            ))}
          </section>
          <section className="gm-preview-queue">
            <div className="gm-queue-head"><div><p className="gm-eyebrow">{t('queuePreview')}</p><h2>{t('nextSession')}</h2></div><Radio size={19} aria-hidden="true" /></div>
              {queue.filter((item) => item.status === 'approved').slice(0, 4).map((item) => <QueueRow item={item} language={language} key={item.id} />)}
          </section>
        </>}

        {screen === 'sessions' && <>
          <ScreenHeading eyebrow={t('liveNow')} title={t('sessionsTitle')} body={t('sessionsBody')} />
          <div className="gm-session-list">
            {sessions.length
              ? sessions.map((session) => <SessionCard key={session.id} session={session} onJoin={chooseSession} language={language} />)
              : <div className="gm-empty"><CalendarDays size={25} /><p>{t('noSessions')}</p><p>{t('noSessionsBody')}</p><button type="button" className="gm-text-action" onClick={() => setSessions(sessionFixture)}>{t('refresh')}</button></div>}
          </div>
          <section className="gm-preview-queue">
            <div className="gm-queue-head"><div><p className="gm-eyebrow">{t('queuePreview')}</p><h2>{t('nextSession')}</h2></div><Radio size={19} aria-hidden="true" /></div>
            {queue.filter((item) => item.status === 'approved').slice(0, 4).map((item) => <QueueRow item={item} language={language} key={item.id} />)}
          </section>
          <section className="gm-how">
            <p className="gm-how-title">{t('howItWorks')}</p>
            {[
              ['step1', 'step1Body'], ['step2', 'step2Body'], ['step3', 'step3Body'],
            ].map(([title, body], index) => <div className="gm-how-step" key={title}><span className="gm-step-num">{index + 1}</span><div><h3>{t(title)}</h3><p>{t(body)}</p></div></div>)}
          </section>
        </>}

        {screen === 'submit' && <>
          <ScreenHeading eyebrow={t('submit')} title={t('submitTitle')} body={t('submitBody')} />
          {selectedSession && <div className="gm-selected-note"><CheckCircle2 size={16} /><span>{t('selected')}: {localizedSessionName(selectedSession, language)} · {selectedSession.available} {t('available')}</span></div>}
          <form className="gm-submit-card gm-submit-form" onSubmit={submitTrack}>
            <Field language={language} label={t('artist')} required value={form.artistName} onChange={(value) => updateForm('artistName', value)} placeholder={t('artistPlaceholder')} />
            <Field language={language} label={t('song')} required value={form.songTitle} onChange={(value) => updateForm('songTitle', value)} placeholder={t('songPlaceholder')} />
            <label className="gm-field">
              <span className="gm-label">{t('intro')} <span className="gm-char-count">{form.intro.length}/300 {t('introCount')}</span><b className="gm-required"> *</b></span>
              <textarea
                aria-label={t('intro')}
                required
                maxLength={300}
                value={form.intro}
                onChange={(event) => updateForm('intro', event.target.value)}
                onInvalid={(event) => event.currentTarget.setCustomValidity(t('requiredValidation'))}
                onInput={(event) => event.currentTarget.setCustomValidity('')}
                placeholder={t('introHint')}
              />
            </label>
            <Field language={language} label={t('genre')} required value={form.genre} onChange={(value) => updateForm('genre', value)} placeholder={t('genrePlaceholder')} />
            <Field language={language} label={t('country')} required value={form.country} onChange={(value) => updateForm('country', value)} placeholder={t('countryPlaceholder')} />
            <Field language={language} label={t('social')} value={form.socialUrl} onChange={(value) => updateForm('socialUrl', value)} placeholder={t('urlPlaceholder')} type="url" />
            <Field language={language} label={t('track')} required value={form.trackUrl} onChange={(value) => updateForm('trackUrl', value)} placeholder={t('urlPlaceholder')} type="url" />
            <p className="gm-field-hint">{t('trackHint')} {t('trackLinkOnly')}</p>
            <label className="gm-field">
              <span className="gm-label">{t('chooseSession')}<b className="gm-required"> *</b></span>
              <select
                className="gm-session-select"
                aria-label={t('chooseSession')}
                required
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
                onInvalid={(event) => event.currentTarget.setCustomValidity(t('requiredValidation'))}
                onInput={(event) => event.currentTarget.setCustomValidity('')}
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id} disabled={!session.isOpen || session.available < 1}>
                    {localizedSessionName(session, language)}
                  </option>
                ))}
              </select>
              {selectedSession && !selectedSession.isOpen && <p className="gm-field-hint" role="alert">{t('sessionClosed')}</p>}
              {selectedSession?.isOpen && selectedSession.available < 1 && <p className="gm-field-hint" role="alert">{t('fullNote')}</p>}
            </label>
            <label className="gm-rights">
              <input
                type="checkbox"
                checked={rightsAccepted}
                onChange={(event) => setRightsAccepted(event.target.checked)}
                required
                onInvalid={(event) => event.currentTarget.setCustomValidity(t('requiredValidation'))}
                onInput={(event) => event.currentTarget.setCustomValidity('')}
              />
              <span>{t('rights')} <b className="gm-required">*</b></span>
            </label>
            <button className="gm-button gm-button-primary gm-submit-button" type="submit" disabled={!selectedSession || !selectedSession.isOpen || selectedSession.available < 1}>
              <Send size={16} />{t('sendTrack')}
            </button>
            <p className="gm-form-note"><CircleHelp size={15} aria-hidden="true" />{t('submitNote')}</p>
          </form>
          <section className="gm-preview-queue">
            <div className="gm-queue-head"><div><p className="gm-eyebrow">{t('queuePreview')}</p><h2>{t('nextSession')}</h2></div><Radio size={19} aria-hidden="true" /></div>
            {queue.filter((item) => item.status === 'approved').slice(0, 3).map((item) => <QueueRow item={item} language={language} key={item.id} />)}
          </section>
        </>}

        {screen === 'receipt' && <>
          <div className="gm-receipt">
            <span className="gm-receipt-icon"><CheckCircle2 size={30} /></span>
            <p className="gm-eyebrow" style={{ justifyContent: 'center', marginTop: 16 }}>{t('submitted')}</p>
            <h1>{t('receiptTitle')}</h1>
            <p className="gm-receipt-copy">{t('receiptBody')}</p>
            <div className="gm-receipt-data">
              <div><span>{t('queueNumber')}</span><strong>#{receiptNumber}</strong></div>
              <div><span>{t('status')}</span><strong>{t('pending')}</strong></div>
            </div>
            <div className="gm-receipt-actions">
              <button className="gm-button gm-button-outline" type="button" onClick={() => go('home')}>{t('returnHome')}</button>
              <button className="gm-button gm-button-primary" type="button" onClick={() => go('sessions')}>{t('viewSessions')}</button>
            </div>
          </div>
        </>}

        {screen === 'host' && <>
          <div className="gm-host-header">
            <ScreenHeading eyebrow={t('host')} title={t('hostTitle')} body={t('hostBody')} />
            <p className="gm-host-preview-note">{t('localPreview')}</p>
            <button className="gm-button gm-button-primary gm-host-open-live" type="button" onClick={() => go('live')}><Radio size={15} />{t('live')}</button>
          </div>
          <div className="gm-host-tools">
            <label className="gm-field">
              <span className="gm-label">{t('selectSession')}</span>
              <select className="gm-session-select" aria-label={t('selectSession')} value={hostSessionId} onChange={(event) => onHostSessionChange(event.target.value)}>
                {sessions.map((session) => <option key={session.id} value={session.id}>{localizedSessionName(session, language)}</option>)}
              </select>
            </label>
            <div className="gm-counts">
              {(['all', 'pending', 'approved', 'played'] as const).map((key) => <div className="gm-count" key={key}><strong>{counts[key]}</strong>{t(key)}</div>)}
            </div>
          </div>
          {hostQueue.length === 0
            ? <div className="gm-empty"><ListMusic size={26} /><p>{t('emptyQueue')}</p><p>{t('emptyQueueBody')}</p></div>
            : <div className="gm-host-queue">
              {hostQueue.map((item) => (
                <article className="gm-host-row" key={item.id}>
                  <div className="gm-host-row-top">
                    <span className="gm-host-number">#{String(item.queueNumber).padStart(2, '0')}</span>
                    <div className="gm-host-title"><h3>{item.songTitle}</h3><p className="gm-host-meta">{item.artistName} · {item.genre} · {item.country}</p></div>
                    <QueueStatus status={item.status} language={language} />
                  </div>
                  <p className="gm-host-intro">{item.intro}</p>
                  <div className="gm-host-links">
                    <a href={item.trackUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} />{t('openLink')}</a>
                    {item.socialUrl && <a href={item.socialUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} />{t('social')}</a>}
                  </div>
                  {hostActions(item)}
                </article>
              ))}
            </div>}
        </>}

        {screen === 'live' && <>
          <div className="gm-live-top">
            <div className="gm-live-indicator"><span className="gm-live-dot" aria-hidden="true" /><div><p className="gm-live-label">{t('onAir')}</p><h1>{t('live')}</h1></div></div>
            <button className="gm-back-button" type="button" onClick={() => go('host')}><ArrowLeft size={14} />{t('admin')}</button>
          </div>
          <section className="gm-live-card">
            <div className="gm-track-counter">
              <span>{current ? `${t('trackOf')} ${String(currentPosition).padStart(2, '0')} / ${String(ordered.length).padStart(2, '0')}` : t('upcoming')}</span>
              <AudioLines size={17} />
            </div>
            {current ? <>
              <div className="gm-track-art"><Headphones size={48} /></div>
              <div className="gm-track-title">
                <p className="gm-eyebrow">{t('nowPlaying')}</p>
                <h2>{current.artistName}</h2>
                <h3>{current.songTitle}</h3>
                <div className="gm-track-tags"><span>{current.genre}</span><span>{current.country}</span></div>
                <p className="gm-track-intro">{current.intro}</p>
              </div>
              <div className="gm-player" role="group" aria-label={t('embeddedPlayer')}>
                <button className="gm-player-button" type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? t('pause') : t('play')}>
                  {playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
                </button>
                <div className="gm-player-body">
                  <div className="gm-player-title"><AudioLines size={14} aria-hidden="true" />Gathering of the Fallen · {t('live')}</div>
                  <div className="gm-player-progress"><span style={{ width: playing ? '40%' : '20%' }} /></div>
                  <div className="gm-player-time"><span>{playing ? '1:24' : '0:00'}</span><span>4:12</span></div>
                </div>
              </div>
              <div className="gm-live-controls">
                <button className="gm-button gm-button-primary" type="button" onClick={() => setPlaying((value) => !value)}>
                  {playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}{playing ? t('pause') : t('play')}
                </button>
                <button className="gm-button gm-button-outline" type="button" onClick={nextLiveTrack}><SkipForward size={17} />{t('next')}</button>
                <button className="gm-button gm-button-outline" type="button" onClick={() => updateStatus(current.id, 'played')}><Check size={17} />{t('markPlayed')}</button>
              </div>
            </> : <div className="gm-live-empty"><ListMusic size={34} /><h2>{t('emptyQueue')}</h2><p>{t('emptyQueueBody')}</p></div>}
          </section>
          <section className="gm-upcoming">
            <div className="gm-upcoming-head"><h2>{t('upcoming')}</h2><span>{nextItems.length} {t('trackOf')}</span></div>
            {nextItems.length
               ? nextItems.map((item) => <QueueRow item={item} language={language} key={item.id} />)
              : <div className="gm-empty" style={{ marginTop: 12 }}>{t('emptyQueueBody')}</div>}
          </section>
          <section className="gm-host-guide">
            <p className="gm-how-title">{t('hostGuide')}</p>
            {[
              ['guide1', 'guideBody1'], ['guide2', 'guideBody2'], ['guide3', 'guideBody3'], ['guide4', 'guideBody4'],
            ].map(([title, body], index) => <div className="gm-guide-step" key={title}><b>{index + 1}</b><div><strong>{t(title)}</strong><p>{t(body)}</p></div></div>)}
          </section>
        </>}
      </main>
      <footer className="gm-footer">
        <p>{t('submitNote')}</p>
        <span>{t('footerTag')}</span>
      </footer>

      <nav className="gm-bottom-nav" aria-label={t('mainNav')}>
        {[
          { id: 'home' as const, label: t('home'), icon: Sparkles },
          { id: 'sessions' as const, label: t('sessions'), icon: CalendarDays },
          { id: 'submit' as const, label: t('submit'), icon: Send },
          { id: 'host' as const, label: t('admin'), icon: ShieldCheck },
        ].map(({ id, label, icon: Icon }) => {
          const isCurrent = screen === id || (screen === 'receipt' && id === 'submit') || (screen === 'live' && id === 'host');
          return <button className={`gm-nav-button ${isCurrent ? 'is-current' : ''}`} key={id} type="button" onClick={() => go(id)} aria-current={isCurrent ? 'page' : undefined} data-testid={`nav-${id}`}>
            <Icon /><span>{label}</span>
          </button>
        })}
      </nav>
    </div>
  );
}
