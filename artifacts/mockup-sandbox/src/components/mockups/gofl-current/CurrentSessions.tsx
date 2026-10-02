import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import './_group.css';
import { GoflLanguageProvider, GoflShell, QueuePreview, SectionHeading, SessionCard, sessionFixture, useGoflLanguage, type GoFLSession } from './_shared';

export function CurrentSessions() {
  return <GoflLanguageProvider><CurrentSessionsContent /></GoflLanguageProvider>;
}

function CurrentSessionsContent() {
  const [selected, setSelected] = useState<GoFLSession | null>(null);
  const { language, t } = useGoflLanguage();
  return <GoflShell current="sessions"><main className="mx-auto max-w-[1440px] px-4 py-12 sm:px-7 sm:py-16">
    <SectionHeading eyebrow={t('liveNow')} title={t('sessionsTitle')} body={t('sessionsBody')} />
    {selected && <div className="mt-7 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground" role="status">{t('selected')}: {t(selected.sessionType === 'artist_spotlight' ? 'artistSpotlight' : selected.sessionType === 'genre_showcase' ? 'genreShowcase' : 'weekendTakeover')} · {selected.available} {t('spacesRemaining')}</div>}
    <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{sessionFixture.length ? sessionFixture.map((session) => <SessionCard key={session.id} session={session} onJoin={setSelected} />) : <div className="col-span-full rounded-xl border border-dashed border-border p-14 text-center"><CalendarDays className="mx-auto size-8 text-primary" /><p className="mt-4 text-sm font-semibold">{t('noSessions')}</p><p className="mt-2 text-sm text-muted-foreground">{t('noSessionsBody')}</p></div>}</div>
     {sessionFixture.length > 0 && <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1fr]"><QueuePreview /><div className="rounded-xl border border-border bg-card/35 p-6"><p className="font-mono-ui text-[10px] uppercase tracking-[.24em] text-primary">{t('howItWorks')}</p><div className="mt-7 space-y-5">{([['step1', 'step1Body'], ['step2', 'step2Body'], ['step3', 'step3Body']] as const).map(([title, body], index) => <div className="flex gap-4" key={title}><span className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/50 font-mono-ui text-xs text-primary">{index + 1}</span><div><h3 className="text-sm font-bold">{t(title)}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{t(body)}</p></div></div>)}</div></div></div>}
  </main></GoflShell>;
}

export default CurrentSessions;