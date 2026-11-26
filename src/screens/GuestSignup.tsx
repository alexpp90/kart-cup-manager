// Sign-up for guests: on a phone (#/s/CODE, after scanning the QR code) and on
// the station at the server's own screen (#/desk, mouse and keyboard). Both
// send the sign-up to the server; the organizer's app adds the player.
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Flag, ItemBox } from '../components/Icons';
import { PlayerForm, type PlayerDraft } from '../components/PlayerForm';
import { JoinQrs } from '../components/JoinQrs';
import { COLORS } from '../data/colors';
import { localSession, sessionInfo, signUp, type GuestError } from '../lib/server';
import { sound } from '../lib/sound';
import { useApp, useT } from '../store/store';

const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const emptyDraft = (): PlayerDraft => ({ name: '', tag: '', color: randomColor() });

function LangToggle() {
  const lang = useApp((s) => s.prefs.lang);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <button className="tool-btn guest-lang" onClick={() => setPrefs({ lang: lang === 'en' ? 'de' : 'en' })} aria-label={lang === 'en' ? 'Deutsch' : 'English'}>
      {lang === 'en' ? 'DE' : 'EN'}
    </button>
  );
}

function GuestForm({ code, via, onDone }: { code: string; via: 'phone' | 'desk'; onDone: (r: { name: string; color: string }) => void }) {
  const t = useT();
  const [draft, setDraft] = useState<PlayerDraft>(emptyDraft);
  const [error, setError] = useState<GuestError | null>(null);
  const [sending, setSending] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const r = await signUp(code, { name: draft.name, tag: draft.tag, color: draft.color }, via);
    setSending(false);
    if (r.ok) {
      sound.fanfare();
      setDraft(emptyDraft());
      setError(null);
      onDone(r);
    } else {
      sound.error();
      setError(r.error);
    }
  };
  const nameError = error && ['name-required', 'name-too-long', 'name-taken'].includes(error) ? t(`guest.err.${error}`) : undefined;
  return (
    <form className="guest-form card" onSubmit={(e) => void submit(e)}>
      <PlayerForm draft={draft} onChange={(d) => { setDraft(d); setError(null); }} error={nameError} big={via === 'desk'} autoFocus />
      {error && !nameError && (
        <p className="notice notice-error" role="alert" data-testid="guest-error">
          {t(`guest.err.${error}`)}
        </p>
      )}
      <button type="submit" className="btn btn-red btn-xl btn-block" disabled={sending} data-testid="guest-submit">
        {t('kiosk.submit')} 🏁
      </button>
    </form>
  );
}

function Welcome({ who, onAnother }: { who: { name: string; color: string }; onAnother?: () => void }) {
  const t = useT();
  return (
    <div className="guest-welcome card" role="status" data-testid="guest-welcome">
      <Avatar name={who.name} color={who.color} size={120} className="pop-in" />
      <p>{t('kiosk.welcome')}</p>
      <strong className="display">{who.name}!</strong>
      <small>{t('guest.welcomeBody')}</small>
      {onAnother && (
        <button className="btn btn-white" onClick={onAnother} data-testid="guest-another">
          {t('guest.another')}
        </button>
      )}
    </div>
  );
}

/** #/s/CODE on a phone. */
export function PhoneJoin({ code }: { code: string }) {
  const t = useT();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof sessionInfo>> | null>(null);
  const [joined, setJoined] = useState<{ name: string; color: string } | null>(null);
  useEffect(() => {
    if (code) void sessionInfo(code).then(setInfo);
  }, [code]);
  return (
    <div className="guest guest-phone">
      <LangToggle />
      <header className="guest-head">
        <ItemBox size={48} />
        <div>
          <h1 className="display">{t('kiosk.title')}</h1>
          {info?.ok && info.title && <p className="guest-title">{info.title}</p>}
        </div>
      </header>
      {!code ? (
        <p className="notice" data-testid="guest-not-started">{t('guest.notStarted')}</p>
      ) : !info ? (
        <p className="muted">…</p>
      ) : !info.ok ? (
        <p className="notice notice-error" data-testid="guest-error">{t(`guest.err.${info.error}`)}</p>
      ) : joined ? (
        <Welcome who={joined} onAnother={() => setJoined(null)} />
      ) : !info.open ? (
        <p className="notice notice-warn" data-testid="guest-closed">{t('kiosk.closed')}</p>
      ) : (
        <>
          <p className="guest-sub">{t('kiosk.subtitle')}</p>
          <GuestForm code={code} via="phone" onDone={setJoined} />
        </>
      )}
    </div>
  );
}

/** #/desk on the server's own screen: the form, plus the QR code for phones. */
export function DeskSignup() {
  const t = useT();
  const [session, setSession] = useState<Awaited<ReturnType<typeof localSession>> | undefined>(undefined);
  const [open, setOpen] = useState(true);
  const [welcome, setWelcome] = useState<{ name: string; color: string } | null>(null);
  useEffect(() => {
    let stop = false;
    const look = async () => {
      const s = await localSession();
      if (stop) return;
      setSession(s);
      if (s && s !== 'not-local') {
        const i = await sessionInfo(s.code);
        if (!stop && i.ok) setOpen(i.open);
      }
    };
    void look();
    const id = window.setInterval(() => void look(), 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (!welcome) return;
    const id = window.setTimeout(() => setWelcome(null), 4000);
    return () => window.clearTimeout(id);
  }, [welcome]);

  let body;
  if (session === undefined) body = <p className="muted">…</p>;
  else if (session === 'not-local') body = <p className="notice notice-warn" data-testid="desk-not-local">{t('desk.notLocal')}</p>;
  else if (session === null) body = <p className="notice" data-testid="desk-waiting">{t('desk.waiting')}</p>;
  else if (!open) body = <p className="notice notice-warn" data-testid="guest-closed">{t('kiosk.closed')}</p>;
  else
    body = (
      <div className="desk-body">
        <GuestForm key={welcome ? 'w' : 'f'} code={session.code} via="desk" onDone={setWelcome} />
        <aside className="desk-side card">
          <p className="desk-scan">{t('desk.scan')}</p>
          <JoinQrs join={`${session.base}/#/s/${session.code}`} wifi={session.wifi?.qr ?? null} ssid={session.wifi?.ssid} password={session.wifi?.password} size={200} variant="small" />
          <p className="muted">{t('phone.code')} <b>{session.code}</b></p>
        </aside>
      </div>
    );
  return (
    <div className="guest guest-desk" data-testid="desk">
      <LangToggle />
      <header className="guest-head">
        <Flag size={56} />
        <div>
          <h1 className="display">{t('kiosk.title')}</h1>
          <p className="guest-sub">{t('kiosk.subtitle')}</p>
        </div>
      </header>
      {body}
      {welcome && (
        <div className="kiosk-welcome" onClick={() => setWelcome(null)}>
          <Welcome who={welcome} />
        </div>
      )}
    </div>
  );
}
