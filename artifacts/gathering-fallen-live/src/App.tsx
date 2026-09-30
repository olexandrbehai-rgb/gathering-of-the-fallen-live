import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  Headphones,
  Languages,
  Link2,
  ListMusic,
  Loader2,
  LogOut,
  Menu,
  Mic2,
  Pause,
  Play,
  Radio,
  Send,
  ShieldCheck,
  SkipForward,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { frFR, ukUA } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import {
  getGetAdminSessionQueueQueryKey,
  getGetSessionQueuePreviewQueryKey,
  getListAdminSessionsQueryKey,
  getListSessionsQueryKey,
  useCreateSubmission,
  useGetAdminSessionQueue,
  useGetSessionQueuePreview,
  useListAdminSessions,
  useListSessions,
  useUpdateSubmissionStatus,
} from '@workspace/api-client-react';
import type {
  AdminQueueSubmission,
  AdminSessionSummary,
  SessionSummary,
  SubmissionInput,
} from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import gothicMoonArt from '@assets/generated_images/gfl-gothic-moon.png';

type Language = 'en' | 'fr' | 'ua';
type Copy = Record<string, string>;

const copy: Record<Language, Copy> = {
  en: {
    home: 'Home', sessions: 'Live sessions', submit: 'Submit music', admin: 'Host desk', live: 'Live mode',
    signIn: 'Sign in', signUp: 'Create account', signOut: 'Sign out', nextSession: 'Next session',
    liveNow: 'Live now', open: 'Open for submissions', closed: 'Closed', full: 'Full', viewSessions: 'View sessions',
    submitCta: 'Send a track to the next room', submitNote: 'No gatekeeping. No inbox chasing. Just a song and a place in the night.',
    heroEyebrow: 'Independent music · live sessions · rising together',
    heroTitle: 'Let the songs\nfind the light.',
    heroBody: 'Gathering of the Fallen LIVE is a self-service listening room for artists making beautiful noise at the edge of the map.',
    browse: 'Browse sessions', hostLogin: 'Host sign in', queuePreview: 'Queue preview',
    tonight: 'Next on air', spaces: 'spaces left', people: 'artists registered', allGenres: 'All genres',
    join: 'Join this session', details: 'Session details', howItWorks: 'How the room works',
    step1: 'Send your song', step1Body: 'Drop a link and tell the host what they are about to hear.',
    step2: 'Choose a night', step2Body: 'Pick an open session. Your place in the queue is held instantly.',
    step3: 'Get played LIVE', step3Body: 'The host moves through the room in order. You listen with everyone.',
    sessionsTitle: 'Choose a live session', sessionsBody: 'Find a room with space for your sound. Every session is hosted, human, and in order.',
    capacity: 'capacity', registered: 'registered', availability: 'availability', noSessions: 'No sessions are open right now.',
    noSessionsBody: 'Check back soon for the next room in the calendar.', refresh: 'Refresh',
    submitTitle: 'Put your song in the room', submitBody: 'A short introduction helps the host make space for the right feeling.',
    artist: 'Artist / band name', song: 'Song title', intro: 'Short intro for the host', introHint: 'Tell us what this song carries, or what you want the room to know.',
    genre: 'Genre', country: 'Country / region', social: 'Social link', track: 'Track link', trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp, or another playable link.',
    chooseSession: 'Choose a live session', rights: 'I confirm I own or control the rights to this track and allow it to be played in the livestream.',
    sendTrack: 'Submit track', submitting: 'Sending into the room…', required: 'Required', optional: 'Optional',
    receiptTitle: 'You are in the room.', receiptBody: 'Keep this receipt. The host will review the queue before going live.',
    queueNumber: 'Queue number', status: 'Status', submitted: 'Submitted', returnHome: 'Back to home',
    hostTitle: 'Host desk', hostBody: 'Review the room once. Then let the queue move itself.',
    pending: 'Pending', approved: 'Approved', played: 'Played', waiting: 'Waiting', rejected: 'Rejected', skipped: 'Skipped',
    selectSession: 'Select a session', noAdminSessions: 'No hosted sessions found.', queue: 'Queue', all: 'All',
    review: 'Review', approve: 'Approve', reject: 'Reject', markPlayed: 'Mark played', skip: 'Skip',
    play: 'Play', pause: 'Pause', next: 'Next', nowPlaying: 'Now playing', upcoming: 'Up next',
    trackOf: 'Track', hostGuide: 'Host guide', guide1: 'Read the intro', guide2: 'Press play', guide3: 'Move next',
    guide4: 'Mark played', guideBody1: 'Take a quick look at the artist and the blurb.',
    guideBody2: 'Start the track on stream.', guideBody3: 'Keep the order moving.', guideBody4: 'Confirm the track has been heard.',
    emptyQueue: 'The queue is quiet.', emptyQueueBody: 'Approved artists will appear here in assigned order.',
    openLink: 'Open track link', audioFallback: 'This link cannot play inline. Open it in a new tab.',
    embeddedPlayer: 'Embedded track player',
    menu: 'Menu', close: 'Close', language: 'Language', loading: 'Loading the room…', error: 'Something went wrong.',
    retry: 'Try again', liveBadge: 'On air', available: 'available', day: 'Session',
    artistSpotlight: 'Artist spotlight', genreShowcase: 'Genre showcase', weekendTakeover: 'Weekend takeover',
    artistSpotlightBody: 'A mix of genres, featuring emerging artists and new sounds.',
    genreShowcaseBody: 'Rotating genres each week: rock, metal, alternative, and more.',
    weekendTakeoverBody: 'A high-energy session to close the week with the best in independent music.',
    countryPlaceholder: 'Canada, Ukraine, United Kingdom…', genrePlaceholder: 'Post-rock, metal, darkwave…',
    artistPlaceholder: 'Your artist name', songPlaceholder: 'The song we should hear', urlPlaceholder: 'https://…',
    introCount: 'characters', selected: 'Selected', sessionClosed: 'This session is closed for submissions.',
    hostOnly: 'Host access required', hostOnlyBody: 'Sign in to review submissions and run a live session.',
    goToSignIn: 'Sign in to continue', pageNotFound: 'The page is lost in the fog.', back: 'Go back',
    host: 'Host', search: 'Search', filters: 'Filters', anyStatus: 'Any status', recent: 'Recent',
    mainNav: 'Main navigation', footerTag: 'Independent music · Real people · Live rooms',
  },
  fr: {
    home: 'Accueil', sessions: 'Sessions LIVE', submit: 'Envoyer une musique', admin: 'Régie', live: 'Mode LIVE',
    signIn: 'Se connecter', signUp: 'Créer un compte', signOut: 'Se déconnecter', nextSession: 'Prochaine session',
    liveNow: 'En direct', open: 'Inscriptions ouvertes', closed: 'Fermée', full: 'Complète', viewSessions: 'Voir les sessions',
    submitCta: 'Envoyer une piste à la prochaine salle', submitNote: 'Pas de porte fermée. Pas de relance. Seulement une chanson et une place dans la nuit.',
    heroEyebrow: 'Musique indépendante · sessions live · grandir ensemble',
    heroTitle: 'Que les chansons\ntrouvent la lumière.',
    heroBody: 'Gathering of the Fallen LIVE est une salle d’écoute pour les artistes qui créent un bruit magnifique au bord de la carte.',
    browse: 'Parcourir les sessions', hostLogin: 'Connexion régie', queuePreview: 'Aperçu de la file',
    tonight: 'Prochaine mise en ondes', spaces: 'places libres', people: 'artistes inscrits', allGenres: 'Tous les genres',
    join: 'Rejoindre cette session', details: 'Détails de la session', howItWorks: 'Comment ça marche',
    step1: 'Envoyez votre chanson', step1Body: 'Ajoutez un lien et dites à la régie ce qu’elle va entendre.',
    step2: 'Choisissez une soirée', step2Body: 'Choisissez une session ouverte. Votre place est gardée instantanément.',
    step3: 'Passez en LIVE', step3Body: 'La régie avance dans l’ordre. Vous écoutez avec tout le monde.',
    sessionsTitle: 'Choisissez une session LIVE', sessionsBody: 'Trouvez une salle pour votre son. Chaque session est humaine, encadrée et ordonnée.',
    capacity: 'capacité', registered: 'inscrits', availability: 'disponibilité', noSessions: 'Aucune session ouverte pour le moment.',
    noSessionsBody: 'Revenez bientôt pour la prochaine soirée.', refresh: 'Actualiser',
    submitTitle: 'Placez votre chanson dans la salle', submitBody: 'Une courte introduction aide la régie à créer le bon moment.',
    artist: 'Nom de l’artiste / groupe', song: 'Titre de la chanson', intro: 'Courte présentation pour la régie', introHint: 'Dites-nous ce que cette chanson porte, ou ce que la salle doit savoir.',
    genre: 'Genre', country: 'Pays / région', social: 'Lien social', track: 'Lien de la piste', trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp ou autre lien lisible.',
    chooseSession: 'Choisir une session LIVE', rights: 'Je confirme détenir les droits de cette piste et autorise sa diffusion pendant le live.',
    sendTrack: 'Envoyer la piste', submitting: 'Envoi dans la salle…', required: 'Requis', optional: 'Facultatif',
    receiptTitle: 'Vous êtes dans la salle.', receiptBody: 'Gardez ce reçu. La régie vérifiera la file avant le direct.',
    queueNumber: 'Numéro de file', status: 'Statut', submitted: 'Envoyée', returnHome: 'Retour à l’accueil',
    hostTitle: 'Régie', hostBody: 'Vérifiez la salle une fois. Ensuite, laissez la file avancer.',
    pending: 'En attente', approved: 'Approuvée', played: 'Passée', waiting: 'En attente', rejected: 'Refusée', skipped: 'Passée',
    selectSession: 'Choisir une session', noAdminSessions: 'Aucune session hébergée.', queue: 'File', all: 'Toutes',
    review: 'Vérifier', approve: 'Approuver', reject: 'Refuser', markPlayed: 'Marquer passée', skip: 'Passer',
    play: 'Lire', pause: 'Pause', next: 'Suivante', nowPlaying: 'En lecture', upcoming: 'À suivre',
    trackOf: 'Piste', hostGuide: 'Guide régie', guide1: 'Lire l’intro', guide2: 'Appuyer sur lecture', guide3: 'Passer à la suivante',
    guide4: 'Marquer passée', guideBody1: 'Jetez un œil à l’artiste et au texte.', guideBody2: 'Lancez la piste en direct.',
    guideBody3: 'Gardez l’ordre en mouvement.', guideBody4: 'Confirmez que la piste est passée.', emptyQueue: 'La file est silencieuse.',
    emptyQueueBody: 'Les artistes approuvés apparaîtront ici dans l’ordre.', openLink: 'Ouvrir le lien',
    embeddedPlayer: 'Lecteur de musique intégré',
    audioFallback: 'Ce lien ne peut pas être lu ici. Ouvrez-le dans un nouvel onglet.', menu: 'Menu', close: 'Fermer',
    language: 'Langue', loading: 'Chargement de la salle…', error: 'Un problème est survenu.', retry: 'Réessayer',
    liveBadge: 'En ondes', available: 'disponibles', day: 'Session', artistSpotlight: 'Coup de projecteur',
    genreShowcase: 'Vitrine de genres', weekendTakeover: 'Prise de contrôle du week-end',
    artistSpotlightBody: 'Un mélange de genres avec des artistes émergents et de nouveaux sons.',
    genreShowcaseBody: 'Des genres qui tournent chaque semaine : rock, metal, alternatif et plus.',
    weekendTakeoverBody: 'Une session intense pour finir la semaine avec le meilleur de la musique indépendante.',
    countryPlaceholder: 'Canada, Ukraine, Royaume-Uni…', genrePlaceholder: 'Post-rock, metal, darkwave…',
    artistPlaceholder: 'Nom de votre projet', songPlaceholder: 'La chanson que nous devons entendre', urlPlaceholder: 'https://…',
    introCount: 'caractères', selected: 'Sélectionnée', sessionClosed: 'Cette session est fermée aux inscriptions.',
    hostOnly: 'Accès régie requis', hostOnlyBody: 'Connectez-vous pour vérifier les envois et lancer une session.',
    goToSignIn: 'Se connecter pour continuer', pageNotFound: 'La page s’est perdue dans le brouillard.', back: 'Retour',
    host: 'Régie', search: 'Rechercher', filters: 'Filtres', anyStatus: 'Tous les statuts', recent: 'Récentes',
    mainNav: 'Navigation principale', footerTag: 'Musique indépendante · Vraies personnes · Salles LIVE',
  },
  ua: {
    home: 'Головна', sessions: 'LIVE-сесії', submit: 'Надіслати музику', admin: 'Пульт ведучого', live: 'LIVE-режим',
    signIn: 'Увійти', signUp: 'Створити акаунт', signOut: 'Вийти', nextSession: 'Наступна сесія',
    liveNow: 'Наживо', open: 'Прийом відкрито', closed: 'Закрито', full: 'Місць немає', viewSessions: 'Переглянути сесії',
    submitCta: 'Надішліть трек у наступну кімнату', submitNote: 'Без бар’єрів. Без листування. Лише пісня і місце цієї ночі.',
    heroEyebrow: 'Незалежна музика · LIVE-сесії · зростаємо разом',
    heroTitle: 'Нехай пісні\nзнайдуть світло.',
    heroBody: 'Gathering of the Fallen LIVE — це кімната для слухання митців, які створюють прекрасний шум на краю мапи.',
    browse: 'Переглянути сесії', hostLogin: 'Вхід ведучого', queuePreview: 'Попередній список',
    tonight: 'Наступний ефір', spaces: 'вільних місць', people: 'зареєстровано митців', allGenres: 'Усі жанри',
    join: 'Приєднатися', details: 'Деталі сесії', howItWorks: 'Як це працює',
    step1: 'Надішліть пісню', step1Body: 'Додайте посилання і розкажіть ведучому, що він почує.',
    step2: 'Оберіть вечір', step2Body: 'Оберіть відкриту сесію. Місце в черзі буде збережено одразу.',
    step3: 'Потрапте в LIVE', step3Body: 'Ведучий рухається за порядком. Ви слухаєте разом з усіма.',
    sessionsTitle: 'Оберіть LIVE-сесію', sessionsBody: 'Знайдіть кімнату для свого звуку. Кожна сесія жива, людяна і послідовна.',
    capacity: 'місткість', registered: 'зареєстровано', availability: 'доступність', noSessions: 'Наразі відкритих сесій немає.',
    noSessionsBody: 'Поверніться скоро — нова кімната вже в календарі.', refresh: 'Оновити',
    submitTitle: 'Помістіть свою пісню в кімнату', submitBody: 'Короткий вступ допоможе ведучому створити правильний момент.',
    artist: 'Ім’я артиста / гурту', song: 'Назва пісні', intro: 'Короткий вступ для ведучого', introHint: 'Розкажіть, що несе ця пісня або що має знати кімната.',
    genre: 'Жанр', country: 'Країна / регіон', social: 'Соціальне посилання', track: 'Посилання на трек', trackHint: 'Spotify, SoundCloud, YouTube, Bandcamp або інше посилання.',
    chooseSession: 'Оберіть LIVE-сесію', rights: 'Я підтверджую, що володію правами на цей трек і дозволяю його трансляцію.',
    sendTrack: 'Надіслати трек', submitting: 'Відправляємо в кімнату…', required: 'Обов’язково', optional: 'Необов’язково',
    receiptTitle: 'Ви в кімнаті.', receiptBody: 'Збережіть цей чек. Ведучий перегляне чергу перед ефіром.',
    queueNumber: 'Номер у черзі', status: 'Статус', submitted: 'Надіслано', returnHome: 'На головну',
    hostTitle: 'Пульт ведучого', hostBody: 'Перевірте кімнату один раз. Далі черга рухається сама.',
    pending: 'Очікує', approved: 'Схвалено', played: 'Програно', waiting: 'Очікує', rejected: 'Відхилено', skipped: 'Пропущено',
    selectSession: 'Оберіть сесію', noAdminSessions: 'Керованих сесій немає.', queue: 'Черга', all: 'Усі',
    review: 'Перегляд', approve: 'Схвалити', reject: 'Відхилити', markPlayed: 'Позначити програним', skip: 'Пропустити',
    play: 'Відтворити', pause: 'Пауза', next: 'Наступний', nowPlaying: 'Зараз грає', upcoming: 'Далі',
    trackOf: 'Трек', hostGuide: 'Підказки ведучому', guide1: 'Прочитайте вступ', guide2: 'Натисніть play', guide3: 'Перейдіть далі',
    guide4: 'Позначте програним', guideBody1: 'Швидко перегляньте артиста і текст.', guideBody2: 'Запустіть трек в ефірі.',
    guideBody3: 'Підтримуйте порядок.', guideBody4: 'Підтвердіть, що трек прозвучав.', emptyQueue: 'Черга тиха.',
    emptyQueueBody: 'Схвалені артисти з’являться тут у визначеному порядку.', openLink: 'Відкрити посилання',
    embeddedPlayer: 'Вбудований аудіопрогравач',
    audioFallback: 'Це посилання не можна відтворити тут. Відкрийте його в новій вкладці.', menu: 'Меню', close: 'Закрити',
    language: 'Мова', loading: 'Завантажуємо кімнату…', error: 'Щось пішло не так.', retry: 'Повторити',
    liveBadge: 'В ефірі', available: 'доступно', day: 'Сесія', artistSpotlight: 'Фокус на артистах',
    genreShowcase: 'Жанрова вітрина', weekendTakeover: 'Вікенд-ефір',
    artistSpotlightBody: 'Різні жанри та нові голоси незалежної сцени.', genreShowcaseBody: 'Щотижня інші жанри: рок, метал, альтернатива та більше.',
    weekendTakeoverBody: 'Енергійна сесія наприкінці тижня з найкращою незалежною музикою.',
    countryPlaceholder: 'Канада, Україна, Велика Британія…', genrePlaceholder: 'Пост-рок, метал, дарквейв…',
    artistPlaceholder: 'Назва вашого проєкту', songPlaceholder: 'Пісня, яку ми маємо почути', urlPlaceholder: 'https://…',
    introCount: 'символів', selected: 'Обрано', sessionClosed: 'Цю сесію закрито для нових заявок.',
    hostOnly: 'Потрібен доступ ведучого', hostOnlyBody: 'Увійдіть, щоб переглядати заявки і вести LIVE-сесію.',
    goToSignIn: 'Увійти, щоб продовжити', pageNotFound: 'Сторінка загубилася в тумані.', back: 'Назад',
    host: 'Ведучий', search: 'Пошук', filters: 'Фільтри', anyStatus: 'Будь-який статус', recent: 'Нещодавні',
    mainNav: 'Головна навігація', footerTag: 'Незалежна музика · Справжні люди · LIVE-кімнати',
  },
};

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const queryClient = new QueryClient();

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('gfl-language') as Language) || 'en');
  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (next && next in copy) setLanguage(next);
    };
    window.addEventListener('gfl-language-change', onLanguageChange);
    return () => window.removeEventListener('gfl-language-change', onLanguageChange);
  }, []);
  const changeLanguage = (next: Language) => {
    setLanguage(next);
    localStorage.setItem('gfl-language', next);
    window.dispatchEvent(new CustomEvent('gfl-language-change', { detail: next }));
  };
  return { language, setLanguage: changeLanguage, t: (key: string) => copy[language][key] || copy.en[key] || key };
}

function formatDate(date: string, language: Language, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(language === 'ua' ? 'uk-UA' : language === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: 'America/Toronto', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options,
  }).format(new Date(date));
}

function sessionName(session: SessionSummary | AdminSessionSummary, t: (key: string) => string) {
  const names: Record<string, string> = {
    artist_spotlight: t('artistSpotlight'), genre_showcase: t('genreShowcase'), weekend_takeover: t('weekendTakeover'),
  };
  return names[session.sessionType] || session.sessionType.replaceAll('_', ' ');
}

function statusLabel(status: string, t: (key: string) => string) {
  return t(status === 'pending' ? 'pending' : status === 'approved' ? 'approved' : status === 'played' ? 'played' : status === 'rejected' ? 'rejected' : 'skipped');
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="group flex items-center gap-3" data-testid="link-brand">
    <span className="relative grid size-10 place-items-center rounded-full border border-primary/60 text-primary shadow-[0_0_18px_hsl(267_89%_68%/.25)]">
      <span className="absolute inset-1 rounded-full border border-accent/30" />
      <span className="font-mono-ui text-lg">G</span>
    </span>
    <span className={compact ? 'hidden sm:block' : 'block'}>
      <span className="block font-display text-[14px] tracking-[.13em] text-foreground group-hover:text-primary">GATHERING</span>
      <span className="block text-[9px] font-semibold tracking-[.34em] text-muted-foreground">OF THE FALLEN · LIVE</span>
    </span>
  </Link>;
}

function LanguageSwitcher({ language, setLanguage, t }: { language: Language; setLanguage: (v: Language) => void; t: (key: string) => string }) {
  return <div className="flex items-center gap-1 rounded-full border border-border/80 bg-card/60 p-1" aria-label={t('language')} data-testid="language-switcher">
    <Languages className="ml-2 size-3.5 text-muted-foreground" />
    {(['en', 'fr', 'ua'] as Language[]).map((item) => <button key={item} type="button" onClick={() => setLanguage(item)} className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition ${language === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-language-${item}`}>{item}</button>)}
  </div>;
}

function Header({ language, setLanguage, t }: { language: Language; setLanguage: (v: Language) => void; t: (key: string) => string }) {
  const [location] = useLocation();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const nav = [{ href: '/', key: 'home' }, { href: '/sessions', key: 'sessions' }, { href: '/submit', key: 'submit' }, ...(isSignedIn ? [{ href: '/admin', key: 'admin' }] : [])];
  return <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
    <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-7">
      <Brand compact />
      <nav className="hidden items-center gap-1 lg:flex" aria-label={t('mainNav')}>
        {nav.map((item) => <Link key={item.href} href={item.href} className={`rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[.16em] transition ${location === item.href ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`} data-testid={`link-nav-${item.key}`}>{t(item.key)}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        <LanguageSwitcher language={language} setLanguage={setLanguage} t={t} />
        {isSignedIn ? <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="hidden items-center gap-2 rounded-md border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground sm:flex" data-testid="button-sign-out"><LogOut className="size-3.5" />{t('signOut')}</button> : <Link href="/sign-in" className="hidden rounded-md border border-primary/50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 sm:block" data-testid="link-sign-in">{t('signIn')}</Link>}
        <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-card lg:hidden" onClick={() => setOpen((value) => !value)} aria-label={t('menu')} data-testid="button-mobile-menu"><Menu className="size-5" /></button>
      </div>
    </div>
    {open && <div className="border-t border-border/70 bg-background px-4 py-3 lg:hidden">
      <nav className="mx-auto flex max-w-[1440px] flex-col gap-1">
        {nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-card hover:text-foreground" data-testid={`link-mobile-nav-${item.key}`}>{t(item.key)}</Link>)}
        {!isSignedIn && <Link href="/sign-in" onClick={() => setOpen(false)} className="mt-2 rounded-md bg-primary px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-primary-foreground" data-testid="link-mobile-sign-in">{t('signIn')}</Link>}
      </nav>
    </div>}
  </header>;
}

function Footer({ t }: { t: (key: string) => string }) {
  return <footer className="border-t border-border/70 px-4 py-10">
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div><Brand /><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t('submitNote')}</p></div>
      <p className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-muted-foreground">{t('footerTag')}</p>
    </div>
  </footer>;
}

function Shell({ children }: { children: ReactNode }) {
  const { language, setLanguage, t } = useLanguage();
  return <div className="page-shell min-h-[100dvh]"><Header language={language} setLanguage={setLanguage} t={t} />{children}<Footer t={t} /></div>;
}

function LoadingState({ t }: { t: (key: string) => string }) {
  return <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border/80 bg-card/30" data-testid="state-loading"><Loader2 className="mr-3 size-5 animate-spin text-primary" /> <span className="text-sm text-muted-foreground">{t('loading')}</span></div>;
}

function ErrorState({ t, onRetry }: { t: (key: string) => string; onRetry: () => void }) {
  return <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/35 bg-destructive/5 px-5 text-center" data-testid="state-error"><AlertCircle className="size-7 text-destructive" /><p className="text-sm text-muted-foreground">{t('error')}</p><button type="button" onClick={onRetry} className="rounded-md border border-border px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-card" data-testid="button-retry">{t('retry')}</button></div>;
}

function SectionHeading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return <div className="max-w-2xl"><p className="font-mono-ui text-[10px] uppercase tracking-[.28em] text-primary">{eyebrow}</p><h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-foreground sm:text-5xl">{title}</h1>{body && <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">{body}</p>}</div>;
}

function SessionCard({ session, t, language }: { session: SessionSummary; t: (key: string) => string; language: Language }) {
  const ratio = Math.min(100, Math.round((session.registered / Math.max(session.capacity, 1)) * 100));
  const canJoin = session.isOpen && session.available > 0;
  return <article className="glass-panel violet-line group relative overflow-hidden rounded-xl p-5 transition hover:-translate-y-1" data-testid={`card-session-${session.id}`}>
    <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-accent/10 blur-3xl transition group-hover:bg-primary/20" />
    <div className="relative flex items-start justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.23em] text-primary">{formatDate(session.startsAt, language, { weekday: 'short' })}</p><h3 className="mt-2 font-display text-2xl">{sessionName(session, t)}</h3></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${canJoin ? 'border-primary/50 bg-primary/10 text-primary' : 'border-destructive/50 bg-destructive/10 text-destructive'}`} data-testid={`status-session-${session.id}`}>{canJoin ? `${session.available} ${t('available')}` : session.isOpen ? t('full') : t('closed')}</span></div>
    <p className="relative mt-3 text-sm text-muted-foreground">{formatDate(session.startsAt, language)}</p>
    <div className="relative mt-5 grid grid-cols-2 gap-3 border-y border-border/70 py-4 text-xs text-muted-foreground"><span><strong className="block font-mono-ui text-sm text-foreground">{session.capacity}</strong>{t('capacity')}</span><span><strong className="block font-mono-ui text-sm text-foreground">{session.registered}</strong>{t('registered')}</span></div>
    <div className="relative mt-4 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${ratio}%` }} /></div>
    <div className="relative mt-5 flex gap-2"><Link href={canJoin ? `/submit?sessionId=${session.id}` : `/sessions`} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider ${canJoin ? 'bg-primary text-primary-foreground hover:bg-primary/85' : 'cursor-not-allowed bg-secondary text-muted-foreground'}`} data-testid={`link-join-session-${session.id}`}>{canJoin ? t('join') : t('closed')}<ArrowRight className="size-3.5" /></Link><Link href={`/sessions?sessionId=${session.id}`} className="rounded-md border border-border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-secondary" data-testid={`link-details-session-${session.id}`}>{t('details')}</Link></div>
  </article>;
}

function QueuePreview({ sessionId, t }: { sessionId?: string; t: (key: string) => string }) {
  const query = useGetSessionQueuePreview(sessionId || '', { query: { enabled: Boolean(sessionId), queryKey: getGetSessionQueuePreviewQueryKey(sessionId || '') } });
  const items = query.data || [];
  return <section className="glass-panel rounded-xl border border-border/80 p-5" data-testid="section-queue-preview"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.23em] text-primary">{t('queuePreview')}</p><h2 className="mt-2 font-display text-xl">{t('tonight')}</h2></div><Radio className="size-5 text-accent" /></div>{query.isLoading ? <div className="mt-5"><LoadingState t={t} /></div> : query.isError ? <div className="mt-5 text-sm text-muted-foreground">{t('error')}</div> : items.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('emptyQueue')}</div> : <div className="mt-5 divide-y divide-border/70">{items.slice(0, 5).map((item) => <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" key={`${item.queueNumber}-${item.songTitle}`} data-testid={`row-preview-${item.queueNumber}`}><span className="w-6 font-mono-ui text-xs text-primary">0{item.queueNumber}</span><span className="grid size-8 place-items-center rounded-full border border-border bg-secondary/60 text-xs text-muted-foreground"><Headphones className="size-3.5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-foreground">{item.songTitle}</strong><span className="block truncate text-xs text-muted-foreground">{item.artistName}</span></span><span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{item.genre}</span></div>)}</div>}</section>;
}

function HomePage() {
  const { language, t } = useLanguage();
  const sessionsQuery = useListSessions();
  const sessions = sessionsQuery.data || [];
  const next = sessions[0];
  return <Shell><main>
    <section className="relative overflow-hidden border-b border-border/70">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_20%,hsl(267_75%_25%/.35),transparent_42%),radial-gradient(ellipse_at_20%_70%,hsl(326_80%_20%/.18),transparent_35%)]" />
      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-20 sm:px-7 sm:py-28 lg:grid-cols-[1.15fr_.85fr] lg:items-end lg:py-36">
        <div className="animate-rise">
          <p className="flex items-center gap-3 font-mono-ui text-[10px] uppercase tracking-[.3em] text-primary"><span className="size-2 animate-live rounded-full bg-accent" />{t('heroEyebrow')}</p>
          <h1 className="mt-7 max-w-4xl whitespace-pre-line font-display text-5xl leading-[.98] tracking-[-.035em] text-foreground sm:text-7xl lg:text-[92px]" data-testid="text-hero-title">{t('heroTitle')}</h1>
          <p className="mt-8 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">{t('heroBody')}</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/sessions" className="group flex items-center gap-3 rounded-md bg-primary px-5 py-3 text-xs font-bold uppercase tracking-[.16em] text-primary-foreground shadow-[0_0_28px_hsl(267_89%_68%/.2)] hover:bg-primary/85" data-testid="link-hero-sessions">{t('browse')}<ArrowRight className="size-4 transition group-hover:translate-x-1" /></Link><Link href="/submit" className="rounded-md border border-border bg-card/50 px-5 py-3 text-xs font-bold uppercase tracking-[.16em] text-foreground hover:bg-card" data-testid="link-hero-submit">{t('submit')}</Link></div>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-border/70 pt-5"><div><strong className="font-mono-ui text-xl text-foreground">{sessions.length || '—'}</strong><span className="mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">{t('nextSession')}</span></div><div><strong className="font-mono-ui text-xl text-foreground">24/7</strong><span className="mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">{t('liveNow')}</span></div><div><strong className="font-mono-ui text-xl text-foreground">∞</strong><span className="mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">{t('allGenres')}</span></div></div>
        </div>
        <div className="relative min-h-[360px] animate-rise [animation-delay:.15s]">
          <img src={gothicMoonArt} alt="" className="absolute inset-0 h-full w-full rounded-2xl object-cover opacity-55 mix-blend-screen" />
          <div className="absolute right-7 top-0 h-64 w-64 rounded-full border border-primary/20 bg-[radial-gradient(circle,hsl(326_89%_65%/.3),hsl(267_89%_68%/.08)_40%,transparent_70%)] shadow-[0_0_90px_hsl(326_89%_65%/.15)] sm:right-20" />
          <div className="absolute bottom-8 left-7 h-52 w-52 rotate-45 border border-primary/15 bg-primary/5 sm:left-20" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute bottom-8 left-0 right-0 rounded-xl border border-border/80 bg-card/75 p-5 backdrop-blur-md"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.24em] text-accent">{t('nextSession')}</p><h2 className="mt-2 font-display text-2xl">{next ? sessionName(next, t) : t('howItWorks')}</h2></div><Sparkles className="size-5 text-primary" /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{next ? formatDate(next.startsAt, language) : t('submitNote')}</p>{next && <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4"><span className="font-mono-ui text-xs text-muted-foreground">{next.available} {t('spaces')}</span><Link href={`/submit?sessionId=${next.id}`} className="text-xs font-bold uppercase tracking-widest text-primary hover:text-accent" data-testid="link-hero-next-submit">{t('join')} <ArrowRight className="ml-1 inline size-3" /></Link></div>}</div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-[1440px] px-4 py-20 sm:px-7"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><SectionHeading eyebrow={t('nextSession')} title={t('viewSessions')} body={t('sessionsBody') || t('heroBody')} /><Link href="/sessions" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary" data-testid="link-home-all-sessions">{t('viewSessions')}<ArrowRight className="size-4" /></Link></div>{sessionsQuery.isLoading ? <div className="mt-10"><LoadingState t={t} /></div> : sessionsQuery.isError ? <div className="mt-10"><ErrorState t={t} onRetry={() => sessionsQuery.refetch()} /></div> : sessions.length === 0 ? <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">{t('noSessions')}</div> : <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{sessions.slice(0, 3).map((session) => <SessionCard key={session.id} session={session} t={t} language={language} />)}</div>}</section>
    <section className="border-y border-border/70 bg-card/20"><div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr]"><SectionHeading eyebrow={t('howItWorks')} title={t('submitCta')} body={t('submitNote')} /><div className="grid gap-3 sm:grid-cols-3">{[['01', 'step1', 'step1Body', Send], ['02', 'step2', 'step2Body', CalendarDays], ['03', 'step3', 'step3Body', Radio]].map(([num, title, body, Icon]) => { const Glyph = Icon as typeof Send; return <div key={num as string} className="rounded-xl border border-border bg-background/50 p-5"><span className="font-mono-ui text-xs text-accent">{num as string}</span><Glyph className="mt-8 size-5 text-primary" /><h3 className="mt-5 text-sm font-bold">{t(title as string)}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{t(body as string)}</p></div>; })}</div></div></section>
    <section className="mx-auto grid max-w-[1440px] gap-6 px-4 py-20 sm:px-7 lg:grid-cols-[1.2fr_.8fr]"><QueuePreview sessionId={next?.id} t={t} /><div className="flex flex-col justify-center rounded-xl border border-primary/30 bg-primary/5 p-7"><Zap className="size-6 text-primary" /><h2 className="mt-5 font-display text-2xl">{t('submitCta')}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{t('submitNote')}</p><Link href="/submit" className="mt-7 inline-flex w-fit items-center gap-2 rounded-md border border-primary/50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/10" data-testid="link-home-submit">{t('sendTrack')}<ArrowRight className="size-4" /></Link></div></section>
  </main></Shell>;
}

function SessionsPage() {
  const { language, t } = useLanguage();
  const query = useListSessions();
  const sessions = query.data || [];
  return <Shell><main className="mx-auto max-w-[1440px] px-4 py-16 sm:px-7 sm:py-24"><SectionHeading eyebrow={t('liveNow')} title={t('sessionsTitle')} body={t('sessionsBody')} /><div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{query.isLoading ? <LoadingState t={t} /> : query.isError ? <ErrorState t={t} onRetry={() => query.refetch()} /> : sessions.length ? sessions.map((session) => <SessionCard key={session.id} session={session} t={t} language={language} />) : <div className="col-span-full rounded-xl border border-dashed border-border p-14 text-center"><CalendarDays className="mx-auto size-8 text-primary" /><p className="mt-4 text-sm font-semibold">{t('noSessions')}</p><p className="mt-2 text-sm text-muted-foreground">{t('noSessionsBody')}</p></div>}</div>{sessions.length > 0 && <div className="mt-16 grid gap-4 lg:grid-cols-[1fr_1fr]"><QueuePreview sessionId={sessions[0]?.id} t={t} /><div className="rounded-xl border border-border bg-card/35 p-6"><p className="font-mono-ui text-[10px] uppercase tracking-[.24em] text-primary">{t('howItWorks')}</p><div className="mt-7 space-y-5">{[['step1', 'step1Body'], ['step2', 'step2Body'], ['step3', 'step3Body']].map(([title, body], index) => <div className="flex gap-4" key={title}><span className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/50 font-mono-ui text-xs text-primary">{index + 1}</span><div><h3 className="text-sm font-bold">{t(title)}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{t(body)}</p></div></div>)}</div></div></div>}</main></Shell>;
}

function SubmitPage() {
  const { language, t } = useLanguage();
  const [, setLocation] = useLocation();
  const sessionsQuery = useListSessions();
  const create = useCreateSubmission();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const preselected = params.get('sessionId') || '';
  const [sessionId, setSessionId] = useState(preselected);
  const [form, setForm] = useState({ artistName: '', songTitle: '', intro: '', genre: '', country: '', socialUrl: '', trackUrl: '', rightsAccepted: false });
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof create.mutateAsync>> | null>(null);
  const sessions = sessionsQuery.data || [];
  const selected = sessions.find((item) => item.id === sessionId);
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!sessionId || !form.artistName || !form.songTitle || !form.intro || !form.genre || !form.country || !form.trackUrl || !form.rightsAccepted) return;
    const data: SubmissionInput = { ...form, sessionId, socialUrl: form.socialUrl || null, rightsAccepted: true };
    create.mutate({ data }, { onSuccess: (result) => { setReceipt(result); queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetSessionQueuePreviewQueryKey(sessionId) }); } });
  };
  if (receipt) return <Shell><main className="mx-auto max-w-3xl px-4 py-20 sm:py-28"><div className="glass-panel rounded-2xl border border-primary/50 p-7 text-center shadow-[0_0_50px_hsl(267_89%_68%/.12)] sm:p-12"><CheckCircle2 className="mx-auto size-14 text-primary" /><p className="mt-6 font-mono-ui text-[10px] uppercase tracking-[.25em] text-primary">{t('submitted')}</p><h1 className="mt-3 font-display text-4xl">{t('receiptTitle')}</h1><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted-foreground">{t('receiptBody')}</p><div className="mx-auto mt-8 grid max-w-sm grid-cols-2 gap-3 text-left"><div className="rounded-lg border border-border bg-background/50 p-4"><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{t('queueNumber')}</span><strong className="mt-1 block font-mono-ui text-2xl text-primary">#{receipt.queueNumber}</strong></div><div className="rounded-lg border border-border bg-background/50 p-4"><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{t('status')}</span><strong className="mt-1 block text-sm text-foreground">{statusLabel(receipt.status, t)}</strong></div></div><div className="mt-8 flex justify-center gap-3"><Link href="/" className="rounded-md border border-border px-4 py-3 text-xs font-bold uppercase tracking-wider hover:bg-secondary" data-testid="link-receipt-home">{t('returnHome')}</Link><Link href="/sessions" className="rounded-md bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground" data-testid="link-receipt-sessions">{t('viewSessions')}</Link></div></div></main></Shell>;
  return <Shell><main className="mx-auto max-w-[1180px] px-4 py-14 sm:px-7 sm:py-20"><div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr]"><div><SectionHeading eyebrow={t('submit')} title={t('submitTitle')} body={t('submitBody')} /><form onSubmit={onSubmit} className="mt-10 space-y-6 rounded-xl border border-border bg-card/35 p-5 sm:p-8" data-testid="form-submit-track">
    <div className="grid gap-5 sm:grid-cols-2"><Field label={t('artist')} required value={form.artistName} onChange={(v) => update('artistName', v)} placeholder={t('artistPlaceholder')} testId="input-artist-name" /><Field label={t('song')} required value={form.songTitle} onChange={(v) => update('songTitle', v)} placeholder={t('songPlaceholder')} testId="input-song-title" /></div>
    <div><label className="mb-2 flex justify-between text-xs font-bold uppercase tracking-wider text-foreground">{t('intro')}<span className="font-mono-ui text-[10px] font-normal text-muted-foreground">{form.intro.length}/300</span></label><textarea required maxLength={300} value={form.intro} onChange={(e) => update('intro', e.target.value)} placeholder={t('introHint')} className="min-h-28 w-full resize-y rounded-md border border-input bg-background/60 px-3 py-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-intro" /></div>
    <div className="grid gap-5 sm:grid-cols-2"><Field label={t('genre')} required value={form.genre} onChange={(v) => update('genre', v)} placeholder={t('genrePlaceholder')} testId="input-genre" /><Field label={t('country')} required value={form.country} onChange={(v) => update('country', v)} placeholder={t('countryPlaceholder')} testId="input-country" /></div>
    <div className="grid gap-5 sm:grid-cols-2"><Field label={t('social')} value={form.socialUrl} onChange={(v) => update('socialUrl', v)} placeholder={t('urlPlaceholder')} testId="input-social-url" /><Field label={t('track')} required value={form.trackUrl} onChange={(v) => update('trackUrl', v)} placeholder={t('urlPlaceholder')} testId="input-track-url" /></div>
    <div><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-foreground">{t('chooseSession')} <span className="text-accent">*</span></label><select required value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full rounded-md border border-input bg-background/60 px-3 py-3 text-sm outline-none focus:border-primary" data-testid="select-session"><option value="">{t('chooseSession')}</option>{sessions.map((session) => <option key={session.id} value={session.id} disabled={!session.isOpen || session.available < 1}>{sessionName(session, t)} · {formatDate(session.startsAt, language, { weekday: 'short' })} · {session.available} {t('spaces')}</option>)}</select>{selected && !selected.isOpen && <p className="mt-2 text-xs text-destructive">{t('sessionClosed')}</p>}</div>
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/35 p-3 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={form.rightsAccepted} onChange={(e) => update('rightsAccepted', e.target.checked)} className="mt-1 size-4 accent-[hsl(var(--primary))]" data-testid="input-rights-accepted" /><span>{t('rights')} <span className="text-accent">*</span></span></label>
    {create.isError && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{t('error')}</p>}
    <button type="submit" disabled={create.isPending || !sessions.length} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3.5 text-xs font-bold uppercase tracking-[.18em] text-primary-foreground transition hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-submit-track">{create.isPending ? <><Loader2 className="size-4 animate-spin" />{t('submitting')}</> : <><Send className="size-4" />{t('sendTrack')}</>}</button>
  </form></div><aside className="space-y-5"><div className="rounded-xl border border-primary/30 bg-primary/5 p-6"><ShieldCheck className="size-6 text-primary" /><h2 className="mt-5 font-display text-2xl">{t('howItWorks')}</h2><div className="mt-6 space-y-5">{[['step1', 'step1Body'], ['step2', 'step2Body'], ['step3', 'step3Body']].map(([title, body], i) => <div key={title} className="flex gap-3"><span className="font-mono-ui text-xs text-accent">0{i + 1}</span><div><h3 className="text-sm font-bold">{t(title)}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{t(body)}</p></div></div>)}</div></div><QueuePreview sessionId={selected?.id || sessions[0]?.id} t={t} /></aside></div></main></Shell>;
}

function Field({ label, value, onChange, placeholder, required, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; testId: string }) {
  return <div><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-foreground">{label} {required && <span className="text-accent">*</span>}</label><input required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-md border border-input bg-background/60 px-3 py-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid={testId} /></div>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { t } = useLanguage();
  if (!isLoaded) return <Shell><main className="mx-auto max-w-3xl px-4 py-24"><LoadingState t={t} /></main></Shell>;
  if (!isSignedIn) return <Shell><main className="mx-auto max-w-xl px-4 py-24 text-center"><ShieldCheck className="mx-auto size-10 text-primary" /><h1 className="mt-6 font-display text-3xl">{t('hostOnly')}</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">{t('hostOnlyBody')}</p><Link href="/sign-in" className="mt-7 inline-flex rounded-md bg-primary px-5 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground" data-testid="link-gate-sign-in">{t('goToSignIn')}</Link></main></Shell>;
  return <>{children}</>;
}

function AdminPage() {
  const { language, t } = useLanguage();
  const sessionsQuery = useListAdminSessions();
  const sessions = sessionsQuery.data || [];
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => { if (!selectedId && sessions[0]?.id) setSelectedId(sessions[0].id); }, [sessions, selectedId]);
  const queueQuery = useGetAdminSessionQueue(selectedId, { query: { enabled: Boolean(selectedId), queryKey: getGetAdminSessionQueueQueryKey(selectedId) } });
  const queue = queueQuery.data || [];
  const mutation = useUpdateSubmissionStatus();
  const queryClient = useQueryClient();
  const updateStatus = (id: string, status: 'approved' | 'rejected' | 'played' | 'skipped') => mutation.mutate({ submissionId: id, data: { status } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueueQueryKey(selectedId) }); queryClient.invalidateQueries({ queryKey: getListAdminSessionsQueryKey() }); } });
  const counts = useMemo(() => ({ all: queue.length, pending: queue.filter((item) => item.status === 'pending').length, approved: queue.filter((item) => item.status === 'approved').length, played: queue.filter((item) => item.status === 'played').length }), [queue]);
  return <Shell><main className="mx-auto max-w-[1440px] px-4 py-12 sm:px-7 sm:py-16"><div className="flex flex-col justify-between gap-5 border-b border-border/70 pb-8 lg:flex-row lg:items-end"><SectionHeading eyebrow={t('host')} title={t('hostTitle')} body={t('hostBody')} /><Link href={selectedId ? `/live/${selectedId}` : '/admin'} className="flex items-center gap-2 rounded-md bg-accent px-4 py-3 text-xs font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/85" data-testid="link-open-live"><Radio className="size-4" />{t('live')}</Link></div><div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="max-w-sm rounded-md border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary" data-testid="select-admin-session"><option value="">{t('selectSession')}</option>{sessions.map((session) => <option key={session.id} value={session.id}>{sessionName(session, t)} · {formatDate(session.startsAt, language)}</option>)}</select><div className="flex flex-wrap gap-2">{[['all', counts.all], ['pending', counts.pending], ['approved', counts.approved], ['played', counts.played]].map(([key, value]) => <span key={key as string} className="rounded-full border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><strong className="mr-1 font-mono-ui text-foreground">{value as number}</strong>{t(key as string)}</span>)}</div></div>{sessionsQuery.isLoading ? <div className="mt-8"><LoadingState t={t} /></div> : sessionsQuery.isError ? <div className="mt-8"><ErrorState t={t} onRetry={() => sessionsQuery.refetch()} /></div> : !sessions.length ? <div className="mt-8 rounded-xl border border-dashed border-border p-14 text-center text-muted-foreground">{t('noAdminSessions')}</div> : <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card/30">{queueQuery.isLoading ? <LoadingState t={t} /> : queueQuery.isError ? <ErrorState t={t} onRetry={() => queueQuery.refetch()} /> : queue.length === 0 ? <div className="p-14 text-center"><ListMusic className="mx-auto size-8 text-primary" /><p className="mt-4 text-sm">{t('emptyQueue')}</p><p className="mt-2 text-xs text-muted-foreground">{t('emptyQueueBody')}</p></div> : <div className="divide-y divide-border/70">{queue.map((item) => <AdminQueueRow item={item} key={item.id} t={t} onStatus={updateStatus} pending={mutation.isPending} />)}</div>}</div>}</main></Shell>;
}

function AdminQueueRow({ item, t, onStatus, pending }: { item: AdminQueueSubmission; t: (key: string) => string; onStatus: (id: string, status: 'approved' | 'rejected' | 'played' | 'skipped') => void; pending: boolean }) {
  return <article className="grid gap-4 px-4 py-5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:px-6" data-testid={`row-admin-submission-${item.id}`}><div className="font-mono-ui text-sm text-primary">#{String(item.queueNumber).padStart(2, '0')}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{item.songTitle}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.status === 'approved' ? 'border-primary/50 text-primary' : item.status === 'played' ? 'border-chart-3/50 text-chart-3' : item.status === 'rejected' || item.status === 'skipped' ? 'border-destructive/50 text-destructive' : 'border-chart-4/50 text-chart-4'}`}>{statusLabel(item.status, t)}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.artistName} · {item.genre} · {item.country}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.intro}</p><div className="mt-3 flex flex-wrap gap-2">{item.trackUrl && <a href={item.trackUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:text-accent" data-testid={`link-admin-track-${item.id}`}><ExternalLink className="size-3" />{t('openLink')}</a>}{item.socialUrl && <a href={item.socialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground" data-testid={`link-admin-social-${item.id}`}><Link2 className="size-3" />{t('social')}</a>}</div></div><div className="flex flex-wrap gap-2 sm:justify-end">{item.status === 'pending' && <><button type="button" disabled={pending} onClick={() => onStatus(item.id, 'approved')} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50" data-testid={`button-approve-${item.id}`}><Check className="size-3" />{t('approve')}</button><button type="button" disabled={pending} onClick={() => onStatus(item.id, 'rejected')} className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-destructive disabled:opacity-50" data-testid={`button-reject-${item.id}`}><X className="size-3" />{t('reject')}</button></>}{item.status === 'approved' && <><button type="button" disabled={pending} onClick={() => onStatus(item.id, 'played')} className="inline-flex items-center gap-1 rounded-md bg-chart-3/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-chart-3 disabled:opacity-50" data-testid={`button-played-${item.id}`}><Check className="size-3" />{t('markPlayed')}</button><button type="button" disabled={pending} onClick={() => onStatus(item.id, 'skipped')} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground disabled:opacity-50" data-testid={`button-skip-${item.id}`}><SkipForward className="size-3" />{t('skip')}</button></>}{item.status === 'played' && <span className="inline-flex items-center gap-1 text-xs text-chart-3"><CheckCircle2 className="size-4" />{t('played')}</span>}</div></article>;
}

function LivePage({ sessionId }: { sessionId: string }) {
  const { language, t } = useLanguage();
  const query = useGetAdminSessionQueue(sessionId, { query: { enabled: Boolean(sessionId), queryKey: getGetAdminSessionQueueQueryKey(sessionId) } });
  const queue = query.data || [];
  const [playing, setPlaying] = useState(false);
  const mutation = useUpdateSubmissionStatus();
  const queryClient = useQueryClient();
  const ordered = queue
    .filter((item) => item.status === 'approved' || item.status === 'played' || item.status === 'skipped')
    .sort((a, b) => a.queueNumber - b.queueNumber);
  const current = queue
    .filter((item) => item.status === 'approved')
    .sort((a, b) => a.queueNumber - b.queueNumber)[0];
  const currentPosition = current ? ordered.findIndex((item) => item.id === current.id) + 1 : 0;
  const nextItems = current
    ? queue
      .filter((item) => item.status === 'approved' && item.queueNumber > current.queueNumber)
      .sort((a, b) => a.queueNumber - b.queueNumber)
      .slice(0, 3)
    : [];
  useEffect(() => setPlaying(false), [current?.id]);
  const status = (id: string, value: 'played' | 'skipped') => mutation.mutate({ submissionId: id, data: { status: value } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueueQueryKey(sessionId) }); queryClient.invalidateQueries({ queryKey: getListAdminSessionsQueryKey() }); setPlaying(false); } });
  if (query.isLoading) return <Shell><main className="mx-auto max-w-5xl px-4 py-20"><LoadingState t={t} /></main></Shell>;
  if (query.isError) return <Shell><main className="mx-auto max-w-5xl px-4 py-20"><ErrorState t={t} onRetry={() => query.refetch()} /></main></Shell>;
  return <Shell><main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-7 sm:py-14"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-6"><div className="flex items-center gap-3"><span className="size-3 animate-live rounded-full bg-accent" /><div><p className="font-mono-ui text-[10px] uppercase tracking-[.24em] text-accent">{t('liveBadge')}</p><h1 className="mt-1 font-display text-3xl">{t('live')}</h1></div></div><Link href="/admin" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground" data-testid="link-live-admin"><ChevronLeft className="size-4" />{t('admin')}</Link></div><div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]"><section><div className="glass-panel rounded-2xl border border-primary/45 p-5 sm:p-8"><div className="flex items-center justify-between"><span className="font-mono-ui text-xs text-primary">{current ? `${t('trackOf')} ${String(currentPosition).padStart(2, '0')} / ${String(ordered.length).padStart(2, '0')}` : t('upcoming')}</span><AudioLines className="size-5 text-primary" /></div>{current ? <><div className="mt-9 grid gap-5 sm:grid-cols-[170px_1fr] sm:items-center"><div className="grid aspect-square place-items-center rounded-xl border border-primary/30 bg-[radial-gradient(circle_at_40%_30%,hsl(326_89%_65%/.28),transparent_35%),linear-gradient(145deg,hsl(231_39%_17%),hsl(229_42%_5%))] shadow-[0_0_35px_hsl(267_89%_68%/.1)]"><Headphones className="size-14 text-primary/70" /></div><div><p className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-accent">{t('nowPlaying')}</p><h2 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{current.artistName}</h2><p className="mt-2 text-xl text-foreground">{current.songTitle}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">{current.genre}</span><span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">{current.country}</span></div><p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">{current.intro}</p><TrackPlayer key={current.id} url={current.trackUrl} playing={playing} setPlaying={setPlaying} t={t} /></div></div><div className="mt-8 grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => setPlaying((value) => !value)} className="flex items-center justify-center gap-2 rounded-md bg-primary py-4 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/85" data-testid="button-live-play">{playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}{playing ? t('pause') : t('play')}</button><button type="button" disabled={mutation.isPending} onClick={() => status(current.id, 'skipped')} className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/5 py-4 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-primary/10 disabled:opacity-50" data-testid="button-live-next"><SkipForward className="size-5" />{t('next')}</button><button type="button" disabled={mutation.isPending} onClick={() => status(current.id, 'played')} className="flex items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/10 py-4 text-xs font-bold uppercase tracking-wider text-accent hover:bg-accent/15 disabled:opacity-50" data-testid="button-live-mark-played"><Check className="size-5" />{t('markPlayed')}</button></div></> : <div className="py-20 text-center"><ListMusic className="mx-auto size-10 text-primary" /><h2 className="mt-5 font-display text-2xl">{t('emptyQueue')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('emptyQueueBody')}</p></div>}</div><div className="mt-6 rounded-xl border border-border bg-card/25 p-5"><div className="flex items-center justify-between"><h2 className="font-display text-xl">{t('upcoming')}</h2><span className="font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground">{nextItems.length} {t('trackOf')}</span></div><div className="mt-4 divide-y divide-border/70">{nextItems.map((item) => <div key={item.id} className="flex items-center gap-3 py-3" data-testid={`row-live-upcoming-${item.id}`}><span className="w-7 font-mono-ui text-xs text-primary">{String(item.queueNumber).padStart(2, '0')}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.songTitle}</strong><span className="block truncate text-xs text-muted-foreground">{item.artistName}</span></div><span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{item.genre}</span></div>)}</div></div></section><aside className="space-y-5"><div className="rounded-xl border border-border bg-card/35 p-6"><p className="font-mono-ui text-[10px] uppercase tracking-[.24em] text-primary">{t('hostGuide')}</p><div className="mt-5 space-y-4">{[['guide1', 'guideBody1'], ['guide2', 'guideBody2'], ['guide3', 'guideBody3'], ['guide4', 'guideBody4']].map(([title, body], i) => <div className="flex gap-3" key={title}><span className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/50 font-mono-ui text-xs text-primary">{i + 1}</span><div><strong className="text-sm">{t(title)}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(body)}</p></div></div>)}</div></div><div className="rounded-xl border border-accent/25 bg-accent/5 p-6"><Mic2 className="size-5 text-accent" /><p className="mt-4 text-sm leading-6 text-muted-foreground">{t('submitNote')}</p></div></aside></div></main></Shell>;
}

function TrackPlayer({ url, playing, setPlaying, t }: { url: string; playing: boolean; setPlaying: (value: boolean) => void; t: (key: string) => string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const embedUrl = getTrackEmbedUrl(url, playing);
  const isAudio = /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing, setPlaying, url]);
  if (!url) return null;
  if (embedUrl) {
    return <div className="mt-5 overflow-hidden rounded-lg border border-border bg-background/60"><iframe src={embedUrl} title={t('embeddedPlayer')} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className="h-[166px] w-full" data-testid="iframe-live-track" /></div>;
  }
  if (isAudio) {
    return <div className="mt-5"><audio ref={audioRef} src={url} controls onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} className="h-10 w-full" data-testid="audio-live-player" /></div>;
  }
  return <div className="mt-5"><a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/10" data-testid="link-live-track"><ExternalLink className="size-3.5" />{t('openLink')}</a><p className="mt-2 text-xs text-muted-foreground">{t('audioFallback')}</p></div>;
}

function getTrackEmbedUrl(trackUrl: string, playing: boolean): string | null {
  try {
    const url = new URL(trackUrl);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname === 'youtu.be' || hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') {
      const videoId = hostname === 'youtu.be'
        ? url.pathname.split('/').filter(Boolean)[0]
        : url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')
          ? url.pathname.split('/').filter(Boolean)[1]
          : url.searchParams.get('v');
      if (!videoId) return null;
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`);
      embed.searchParams.set('autoplay', playing ? '1' : '0');
      embed.searchParams.set('rel', '0');
      return embed.toString();
    }
    if (hostname === 'open.spotify.com') {
      const match = url.pathname.match(/^\/(track|album|playlist|episode)\/([A-Za-z0-9]+)\/?$/);
      if (!match) return null;
      const embed = new URL(`https://open.spotify.com/embed/${match[1]}/${match[2]}`);
      if (playing) embed.searchParams.set('autoplay', '1');
      return embed.toString();
    }
    if (hostname === 'soundcloud.com' || hostname === 'm.soundcloud.com') {
      const embed = new URL('https://w.soundcloud.com/player/');
      embed.searchParams.set('url', url.toString());
      embed.searchParams.set('color', '#9b6cff');
      embed.searchParams.set('auto_play', String(playing));
      embed.searchParams.set('hide_related', 'true');
      return embed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function AuthPages() {
  const { language, setLanguage, t } = useLanguage();
  const appearance = { theme: shadcn, cssLayerName: 'clerk', options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` }, variables: { colorPrimary: '#9b6cff', colorForeground: '#ecebfa', colorMutedForeground: '#a2a2bd', colorBackground: '#111127', colorInput: '#0b0b1a', colorInputForeground: '#f5f4ff', colorDanger: '#ff607c', colorNeutral: '#343452', fontFamily: 'Manrope, sans-serif', borderRadius: '0.75rem' }, elements: { rootBox: 'w-full flex justify-center', cardBox: 'bg-[#111127] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#343452]', card: '!shadow-none !border-0 !bg-transparent', footer: '!shadow-none !border-0 !bg-transparent', headerTitle: 'text-[#ecebfa]', headerSubtitle: 'text-[#a2a2bd]', formFieldLabel: 'text-[#ecebfa]', footerActionLink: 'text-[#ad7cff]', footerActionText: 'text-[#a2a2bd]', dividerText: 'text-[#a2a2bd]', socialButtonsBlockButtonText: 'text-[#ecebfa]', formButtonPrimary: 'bg-[#9b6cff] text-[#100d20]', formFieldInput: 'bg-[#0b0b1a] text-[#f5f4ff] border-[#343452]', main: 'bg-transparent' } };
  const path = window.location.pathname.includes('/sign-up') ? 'up' : 'in';
  return <div className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"><div className="absolute right-4 top-4"><LanguageSwitcher language={language} setLanguage={setLanguage} t={t} /></div><div><div className="mb-7 flex justify-center"><Brand /></div>{path === 'up' ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={appearance} /> : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={appearance} />}</div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AppRoutes() {
  const [location, setLocation] = useLocation();
  const { t } = useLanguage();
  return <RoutedErrorBoundary><Switch><Route path="/" component={HomePage} /><Route path="/sessions" component={SessionsPage} /><Route path="/submit" component={SubmitPage} /><Route path="/admin"><AuthGate><AdminPage /></AuthGate></Route><Route path="/live/:sessionId">{(params) => <AuthGate><LivePage sessionId={params.sessionId} /></AuthGate>}</Route><Route path="/sign-in/*?" component={AuthPages} /><Route path="/sign-up/*?" component={AuthPages} /><Route component={() => <Shell><main className="mx-auto max-w-xl px-4 py-24 text-center"><AlertCircle className="mx-auto size-10 text-primary" /><h1 className="mt-6 font-display text-3xl">{t('pageNotFound')}</h1><Link href="/" className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary" data-testid="link-not-found-home"><ChevronLeft className="size-4" />{t('back')}</Link></main></Shell>} /></Switch></RoutedErrorBoundary>;
}

function ClerkQueryInvalidator() {
  const queryClient = useQueryClient();
  const { addListener } = useClerk();
  useEffect(() => addListener(() => queryClient.clear()), [addListener, queryClient]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();
  const localization = language === 'fr' ? frFR : language === 'ua' ? ukUA : undefined;
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn }} localization={localization} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={(to: string) => setLocation(stripBase(to))} routerReplace={(to: string) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ClerkQueryInvalidator /><AppRoutes /></QueryClientProvider><Toaster /></ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;