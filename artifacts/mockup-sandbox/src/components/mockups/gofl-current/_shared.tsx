import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight, Headphones, Languages, Menu, Radio,
} from 'lucide-react';

export type GoFLSession = {
  id: string;
  sessionType: 'artist_spotlight' | 'genre_showcase' | 'weekend_takeover';
  startsAt: string;
  capacity: number;
  registered: number;
  available: number;
  isOpen: boolean;
};

export type GoFLQueueItem = {
  id: string;
  queueNumber: number;
  artistName: string;
  songTitle: string;
  intro: string;
  genre: string;
  country: string;
  trackUrl: string;
  socialUrl: string | null;
  status: 'pending' | 'approved' | 'played' | 'rejected' | 'skipped';
};

export type GoflLanguage = 'en' | 'fr' | 'ua';

type TranslationKey = string;
type LanguageContextValue = {
  language: GoflLanguage;
  setLanguage: (language: GoflLanguage) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const translations: Record<GoflLanguage, Record<string, string>> = {
  en: {
    home: 'Home', sessions: 'Live sessions', submit: 'Submit music', admin: 'Host desk', live: 'Live mode',
    signIn: 'Sign in', nextSession: 'Next session', liveNow: 'Live now', open: 'Open for submissions',
    closed: 'Closed', full: 'Full', viewSessions: 'View sessions', join: 'Join this session', details: 'Session details',
    submitCta: 'Send a track to the next room',
    submitNote: 'No gatekeeping. No inbox chasing. Just a song and a place in the night.',
    sessionsTitle: 'Choose a live session',
    sessionsBody: 'Find a room with space for your sound. Every session is hosted, human, and in order.',
    capacity: 'capacity', registered: 'registered', availability: 'availability',
    noSessions: 'No sessions are open right now.', noSessionsBody: 'Check back soon for the next room in the calendar.',
    refresh: 'Refresh', submitTitle: 'Put your song in the room',
    submitBody: 'A short introduction helps the host make space for the right feeling.',
    artist: 'Artist / band name', song: 'Song title', intro: 'Short intro for the host',
    introHint: 'Tell us what this song carries, or what you want the room to know.', genre: 'Genre',
    country: 'Country / region', social: 'Social link', track: 'Track link',
    trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp, or another playable link.',
    chooseSession: 'Choose a live session',
    rights: 'I confirm I own or control the rights to this track and allow it to be played in the livestream.',
    sendTrack: 'Submit track', submitting: 'Sending into the room…', required: 'Required', optional: 'Optional',
    receiptTitle: 'You are in the room.', receiptBody: 'Keep this receipt. The host will review the queue before going live.',
    queueNumber: 'Queue number', status: 'Status', submitted: 'Submitted', returnHome: 'Back to home',
    hostTitle: 'Host desk', hostBody: 'Review the room once. Then let the queue move itself.',
    pending: 'Pending', approved: 'Approved', played: 'Played', waiting: 'Waiting', rejected: 'Rejected', skipped: 'Skipped',
    selectSession: 'Select a session', noAdminSessions: 'No hosted sessions found.', queue: 'Queue', all: 'All',
    review: 'Review', approve: 'Approve', reject: 'Reject', markPlayed: 'Mark played', skip: 'Skip',
    play: 'Play', pause: 'Pause', next: 'Next', nowPlaying: 'Now playing',
    upcoming: 'Up next', trackOf: 'Track', tracksInQueue: 'tracks in queue', hostGuide: 'Host guide',
    guide1: 'Read the intro', guide2: 'Press play', guide3: 'Move next', guide4: 'Mark played',
    guideBody1: 'Take a quick look at the artist and the blurb.', guideBody2: 'Start the track on stream.',
    guideBody3: 'Keep the order moving.', guideBody4: 'Confirm the track has been heard.',
    emptyQueue: 'The queue is quiet.', emptyQueueBody: 'Approved artists will appear here in assigned order.',
    openLink: 'Open track link', audioFallback: 'This link cannot play inline. Open it in a new tab.',
    embeddedPlayer: 'Embedded track player', menu: 'Menu', language: 'Language',
    available: 'available', spacesRemaining: 'spaces remaining',
    artistSpotlight: 'Artist spotlight', genreShowcase: 'Genre showcase', weekendTakeover: 'Weekend takeover',
    howItWorks: 'How the room works', step1: 'Send your song',
    step1Body: 'Drop a link and tell the host what they are about to hear.',
    step2: 'Choose a night', step2Body: 'Pick an open session. Your place in the queue is held instantly.',
    step3: 'Get played LIVE', step3Body: 'The host moves through the room in order. You listen with everyone.',
    countryPlaceholder: 'Canada, Ukraine, United Kingdom…', genrePlaceholder: 'Post-rock, metal, darkwave…',
    artistPlaceholder: 'Your artist name', songPlaceholder: 'The song we should hear', urlPlaceholder: 'https://…',
    selected: 'Selected', sessionClosed: 'This session is closed for submissions.',
    queuePreview: 'Queue preview', onAir: 'On air', mainNav: 'Main navigation',
    footerTag: 'Independent music · Real people · Live rooms', managing: 'Managing', host: 'Host',
  },
  fr: {
    home: 'Accueil', sessions: 'Sessions LIVE', submit: 'Envoyer une musique', admin: 'Régie', live: 'Mode LIVE',
    signIn: 'Se connecter', nextSession: 'Prochaine session', liveNow: 'En direct', open: 'Inscriptions ouvertes',
    closed: 'Fermée', full: 'Complète', viewSessions: 'Voir les sessions',
    join: 'Rejoindre cette session', details: 'Détails de la session',
    submitCta: 'Envoyer une piste à la prochaine salle',
    submitNote: 'Pas de porte fermée. Pas de relance. Seulement une chanson et une place dans la nuit.',
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
    play: 'Lire', pause: 'Pause', next: 'Suivante', nowPlaying: 'En lecture',
    upcoming: 'À suivre', trackOf: 'Piste', tracksInQueue: 'pistes dans la file', hostGuide: 'Guide régie',
    guide1: 'Lire l’intro', guide2: 'Appuyer sur lecture', guide3: 'Passer à la suivante', guide4: 'Marquer passée',
    guideBody1: 'Jetez un œil à l’artiste et au texte.', guideBody2: 'Lancez la piste en direct.',
    guideBody3: 'Gardez l’ordre en mouvement.', guideBody4: 'Confirmez que la piste est passée.',
    emptyQueue: 'La file est silencieuse.', emptyQueueBody: 'Les artistes approuvés apparaîtront ici dans l’ordre.',
    openLink: 'Ouvrir le lien', audioFallback: 'Ce lien ne peut pas être lu ici. Ouvrez-le dans un nouvel onglet.',
    embeddedPlayer: 'Lecteur de musique intégré', menu: 'Menu', language: 'Langue',
    available: 'disponibles', spacesRemaining: 'places restantes',
    artistSpotlight: 'Coup de projecteur', genreShowcase: 'Vitrine de genres',
    weekendTakeover: 'Prise de contrôle du week-end', howItWorks: 'Comment ça marche',
    step1: 'Envoyez votre chanson', step1Body: 'Ajoutez un lien et dites à la régie ce qu’elle va entendre.',
    step2: 'Choisissez une soirée', step2Body: 'Choisissez une session ouverte. Votre place est gardée instantanément.',
    step3: 'Passez en LIVE', step3Body: 'La régie avance dans l’ordre. Vous écoutez avec tout le monde.',
    countryPlaceholder: 'Canada, Ukraine, Royaume-Uni…', genrePlaceholder: 'Post-rock, metal, darkwave…',
    artistPlaceholder: 'Nom de votre projet', songPlaceholder: 'La chanson que nous devons entendre',
    urlPlaceholder: 'https://…', selected: 'Sélectionnée',
    sessionClosed: 'Cette session est fermée aux inscriptions.',
    queuePreview: 'Aperçu de la file', onAir: 'En ondes',
    mainNav: 'Navigation principale', footerTag: 'Musique indépendante · Vraies personnes · Salles LIVE',
    managing: 'Gestion de', host: 'Régie',
  },
  ua: {
    home: 'Головна', sessions: 'LIVE-сесії', submit: 'Надіслати музику', admin: 'Пульт ведучого', live: 'LIVE-режим',
    signIn: 'Увійти', nextSession: 'Наступна сесія', liveNow: 'Наживо', open: 'Прийом відкрито',
    closed: 'Закрито', full: 'Місць немає', viewSessions: 'Переглянути сесії',
    join: 'Приєднатися', details: 'Деталі сесії',
    submitCta: 'Надішліть трек у наступну кімнату',
    submitNote: 'Без бар’єрів. Без листування. Лише пісня і місце цієї ночі.',
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
    sendTrack: 'Надіслати трек', submitting: 'Відправляємо в кімнату…',
    required: 'Обов’язково', optional: 'Необов’язково',
    receiptTitle: 'Ви в кімнаті.', receiptBody: 'Збережіть цей чек. Ведучий перегляне чергу перед ефіром.',
    queueNumber: 'Номер у черзі', status: 'Статус', submitted: 'Надіслано', returnHome: 'На головну',
    hostTitle: 'Пульт ведучого', hostBody: 'Перевірте кімнату один раз. Далі черга рухається сама.',
    pending: 'Очікує', approved: 'Схвалено', played: 'Програно', waiting: 'Очікує',
    rejected: 'Відхилено', skipped: 'Пропущено', selectSession: 'Оберіть сесію',
    noAdminSessions: 'Керованих сесій немає.', queue: 'Черга', all: 'Усі', review: 'Перегляд',
    approve: 'Схвалити', reject: 'Відхилити', markPlayed: 'Позначити програним', skip: 'Пропустити',
    play: 'Відтворити', pause: 'Пауза', next: 'Наступний', nowPlaying: 'Зараз грає',
    upcoming: 'Далі', trackOf: 'Трек', tracksInQueue: 'треків у черзі', hostGuide: 'Підказки ведучому',
    guide1: 'Прочитайте вступ', guide2: 'Натисніть play', guide3: 'Перейдіть далі', guide4: 'Позначте програним',
    guideBody1: 'Швидко перегляньте артиста і текст.', guideBody2: 'Запустіть трек в ефірі.',
    guideBody3: 'Підтримуйте порядок.', guideBody4: 'Підтвердіть, що трек прозвучав.',
    emptyQueue: 'Черга тиха.', emptyQueueBody: 'Схвалені артисти з’являться тут у визначеному порядку.',
    openLink: 'Відкрити посилання', audioFallback: 'Це посилання не можна відтворити тут. Відкрийте його в новій вкладці.',
    embeddedPlayer: 'Вбудований аудіопрогравач', menu: 'Меню', language: 'Мова',
    available: 'доступно', spacesRemaining: 'вільних місць',
    artistSpotlight: 'Фокус на артистах', genreShowcase: 'Жанрова вітрина', weekendTakeover: 'Вікенд-ефір',
    howItWorks: 'Як це працює', step1: 'Надішліть пісню',
    step1Body: 'Додайте посилання і розкажіть ведучому, що він почує.',
    step2: 'Оберіть вечір', step2Body: 'Оберіть відкриту сесію. Місце в черзі буде збережено одразу.',
    step3: 'Потрапте в LIVE', step3Body: 'Ведучий рухається за порядком. Ви слухаєте разом з усіма.',
    countryPlaceholder: 'Канада, Україна, Велика Британія…', genrePlaceholder: 'Пост-рок, метал, дарквейв…',
    artistPlaceholder: 'Назва вашого проєкту', songPlaceholder: 'Пісня, яку ми маємо почути',
    urlPlaceholder: 'https://…', selected: 'Обрано',
    sessionClosed: 'Цю сесію закрито для нових заявок.',
    queuePreview: 'Попередній список', onAir: 'В ефірі',
    mainNav: 'Головна навігація', footerTag: 'Незалежна музика · Справжні люди · LIVE-кімнати',
    managing: 'Керування сесією', host: 'Ведучий',
  },
};

const isLanguage = (value: unknown): value is GoflLanguage =>
  value === 'en' || value === 'fr' || value === 'ua';

const translate = (language: GoflLanguage, key: string) =>
  translations[language][key] || translations.en[key] || key;

function readLanguage(): GoflLanguage {
  try {
    const saved = window.localStorage.getItem('gfl-language');
    return isLanguage(saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

export function useGoflLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useGoflLanguage must be used within GoflLanguageProvider');
  return context;
}

export const sessionFixture: GoFLSession[] = [
  { id: 'session-01', sessionType: 'artist_spotlight', startsAt: '2026-10-10T23:00:00-04:00', capacity: 24, registered: 17, available: 7, isOpen: true },
  { id: 'session-02', sessionType: 'genre_showcase', startsAt: '2026-10-17T22:00:00-04:00', capacity: 20, registered: 12, available: 8, isOpen: true },
  { id: 'session-03', sessionType: 'weekend_takeover', startsAt: '2026-10-24T23:30:00-04:00', capacity: 18, registered: 18, available: 0, isOpen: true },
];

export const queueFixture: GoFLQueueItem[] = [
  { id: 'submission-01', queueNumber: 1, artistName: 'The Quiet Hours', songTitle: 'Glass Cathedral', intro: 'A slow-burning song about finding a little room to breathe inside a noisy city.', genre: 'Post-rock', country: 'Canada', trackUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', socialUrl: 'https://instagram.com/', status: 'approved' },
  { id: 'submission-02', queueNumber: 2, artistName: 'Mara Voss', songTitle: 'Blackwater Bloom', intro: 'Written after a winter on the coast; it starts in the dark and keeps reaching upward.', genre: 'Darkwave', country: 'Ukraine', trackUrl: 'https://soundcloud.com/', socialUrl: null, status: 'approved' },
  { id: 'submission-03', queueNumber: 3, artistName: 'Northbound Static', songTitle: 'Signal Fires', intro: 'For everyone trying to find their people across a long distance.', genre: 'Alternative', country: 'United Kingdom', trackUrl: 'https://bandcamp.com/', socialUrl: null, status: 'pending' },
  { id: 'submission-04', queueNumber: 4, artistName: 'Ash & Ember', songTitle: 'A Map of Nothing', intro: 'A heavy, patient track built around a single guitar motif.', genre: 'Metal', country: 'United States', trackUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ', socialUrl: null, status: 'approved' },
];

export function sessionName(session: GoFLSession, language: GoflLanguage = 'en') {
  return translate(language, session.sessionType === 'artist_spotlight' ? 'artistSpotlight' : session.sessionType === 'genre_showcase' ? 'genreShowcase' : 'weekendTakeover');
}

export function formatDate(date: string, language: GoflLanguage = 'en', options?: Intl.DateTimeFormatOptions) {
  const locale = language === 'ua' ? 'uk-UA' : language === 'fr' ? 'fr-CA' : 'en-CA';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Toronto', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options,
  }).format(new Date(date));
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <a href="#top" className="group flex items-center gap-3" data-testid="link-brand">
    <span className="relative grid size-10 place-items-center rounded-full border border-primary/60 text-primary shadow-[0_0_18px_hsl(267_89%_68%/.25)]">
      <span className="absolute inset-1 rounded-full border border-accent/30" />
      <span className="font-mono-ui text-lg">G</span>
    </span>
    <span className={compact ? 'hidden sm:block' : 'block'}>
      <span className="block font-display text-[14px] tracking-[.13em] text-foreground group-hover:text-primary">GATHERING</span>
      <span className="block text-[9px] font-semibold tracking-[.34em] text-muted-foreground">OF THE FALLEN · LIVE</span>
    </span>
  </a>;
}

export function Header({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const { language, setLanguage, t } = useGoflLanguage();
  const nav = [{ href: '#home', key: 'home' }, { href: '#sessions', key: 'sessions' }, { href: '#submit', key: 'submit' }, { href: '#host', key: 'admin' }] as const;
  return <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
    <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-7">
      <Brand compact />
      <nav className="hidden items-center gap-1 lg:flex" aria-label={t('mainNav')}>
        {nav.map((item) => <a key={item.key} href={item.href} className={`rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[.16em] transition ${current === item.key ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>{t(item.key)}</a>)}
      </nav>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-border/80 bg-card/60 p-1" role="group" aria-label={t('language')} data-testid="language-switcher">
          <Languages className="ml-2 size-3.5 text-muted-foreground" />
          {(['en', 'fr', 'ua'] as const).map((item) => <button key={item} type="button" onClick={() => setLanguage(item)} aria-pressed={language === item} aria-label={`${t('language')}: ${item.toUpperCase()}`} data-testid={`language-${item}`} className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition ${language === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>)}
        </div>
        <a href="#host" className="hidden rounded-md border border-primary/50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 sm:block">{t('signIn')}</a>
        <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-card lg:hidden" onClick={() => setOpen((value) => !value)} aria-label={t('menu')}><Menu className="size-5" /></button>
      </div>
    </div>
    {open && <div className="border-t border-border/70 bg-background px-4 py-3 lg:hidden"><nav aria-label={t('mainNav')} className="mx-auto flex max-w-[1440px] flex-col gap-1">{nav.map((item) => <a key={item.key} href={item.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-card hover:text-foreground">{t(item.key)}</a>)}</nav></div>}
  </header>;
}

export function Footer() {
  const { t } = useGoflLanguage();
  return <footer className="border-t border-border/70 px-4 py-10">
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div><Brand /><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t('submitNote')}</p></div>
      <p className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-muted-foreground">{t('footerTag')}</p>
    </div>
  </footer>;
}

export function GoflLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<GoflLanguage>(readLanguage);
  const setLanguage = (next: GoflLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem('gfl-language', next);
    } catch {
      // Keep language switching available when browser storage is disabled.
    }
    window.dispatchEvent(new CustomEvent('gfl-language-change', { detail: next }));
  };

  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isLanguage(next)) setLanguageState(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'gfl-language') setLanguageState(isLanguage(event.newValue) ? event.newValue : 'en');
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

  const value: LanguageContextValue = { language, setLanguage, t: (key) => translate(language, key) };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function GoflShell({ children, current }: { children: ReactNode; current: string }) {
  return <div className="gofl-current page-shell min-h-[100dvh]" id="top"><Header current={current} />{children}<Footer /></div>;
}

export function SectionHeading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return <div className="max-w-2xl"><p className="font-mono-ui text-[10px] uppercase tracking-[.28em] text-primary">{eyebrow}</p><h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-foreground sm:text-5xl">{title}</h1>{body && <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">{body}</p>}</div>;
}

export function SessionCard({ session, onJoin }: { session: GoFLSession; onJoin?: (session: GoFLSession) => void }) {
  const { language, t } = useGoflLanguage();
  const ratio = Math.min(100, Math.round((session.registered / Math.max(session.capacity, 1)) * 100));
  const canJoin = session.isOpen && session.available > 0;
  return <article className="glass-panel violet-line group relative overflow-hidden rounded-xl p-5 transition hover:-translate-y-1" data-testid={`card-session-${session.id}`}>
    <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-accent/10 blur-3xl transition group-hover:bg-primary/20" />
    <div className="relative flex items-start justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.23em] text-primary">{formatDate(session.startsAt, language, { weekday: 'short' })}</p><h3 className="mt-2 font-display text-2xl">{sessionName(session, language)}</h3></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${canJoin ? 'border-primary/50 bg-primary/10 text-primary' : 'border-destructive/50 bg-destructive/10 text-destructive'}`}>{canJoin ? `${session.available} ${t('available')}` : session.isOpen ? t('full') : t('closed')}</span></div>
    <p className="relative mt-3 text-sm text-muted-foreground">{formatDate(session.startsAt, language)}</p>
    <div className="relative mt-5 grid grid-cols-2 gap-3 border-y border-border/70 py-4 text-xs text-muted-foreground"><span><strong className="block font-mono-ui text-sm text-foreground">{session.capacity}</strong>{t('capacity')}</span><span><strong className="block font-mono-ui text-sm text-foreground">{session.registered}</strong>{t('registered')}</span></div>
    <div className="relative mt-4 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${ratio}%` }} /></div>
    <div className="relative mt-5 flex gap-2"><button type="button" disabled={!canJoin} onClick={() => onJoin?.(session)} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider ${canJoin ? 'bg-primary text-primary-foreground hover:bg-primary/85' : 'cursor-not-allowed bg-secondary text-muted-foreground'}`}>{canJoin ? t('join') : t('closed')}<ArrowRight className="size-3.5" /></button><a href="#details" className="rounded-md border border-border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-secondary">{t('details')}</a></div>
  </article>;
}

export function QueuePreview({ items = queueFixture.filter((item) => item.status === 'approved') }: { items?: GoFLQueueItem[] }) {
  const { t } = useGoflLanguage();
  return <section className="glass-panel rounded-xl border border-border/80 p-5" data-testid="section-queue-preview"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.23em] text-primary">{t('queuePreview')}</p><h2 className="mt-2 font-display text-xl">{t('nextSession')}</h2></div><Radio className="size-5 text-accent" /></div>{items.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('emptyQueue')}</div> : <div className="mt-5 divide-y divide-border/70">{items.slice(0, 5).map((item) => <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" key={`${item.queueNumber}-${item.songTitle}`}><span className="w-6 font-mono-ui text-xs text-primary">0{item.queueNumber}</span><span className="grid size-8 place-items-center rounded-full border border-border bg-secondary/60 text-xs text-muted-foreground"><Headphones className="size-3.5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-foreground">{item.songTitle}</strong><span className="block truncate text-xs text-muted-foreground">{item.artistName}</span></span><span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{item.genre}</span></div>)}</div>}</section>;
}

export function Field({ label, value, onChange, placeholder, required, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; type?: string }) {
  const { t } = useGoflLanguage();
  return <div><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-foreground">{label} {required && <span className="text-accent">*</span>} {!required && <span className="text-muted-foreground">({t('optional')})</span>}</label><input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-md border border-input bg-background/60 px-3 py-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>;
}