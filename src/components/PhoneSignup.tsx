// Organizer card: start phone sign-up, show the QR code and the link, stop it.
import { useEffect, useState } from 'react';
import { registrationOpen } from '../engine/tournament';
import { joinUrl, serverMode, startPhoneSignUp, stopPhoneSignUp, usePhone, wifiQr } from '../lib/server';
import { useApp, useT } from '../store/store';
import { confirmDialog } from '../store/ui';
import { Card } from './Bits';
import { JoinQrs } from './JoinQrs';
import { Glyph } from './Glyphs';

export function PhoneSignupCard() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const { status, session, info } = usePhone();
  const [big, setBig] = useState(false);
  if (!serverMode()) {
    return (
      <Card title={t('phone.title')} tone="navy" className="phone-card">
        <p className="muted" data-testid="phone-offline-hint">{t('phone.needsServer')}</p>
      </Card>
    );
  }
  const open = registrationOpen(tour);
  if (!session) {
    return (
      <Card title={t('phone.title')} tone="navy" className="phone-card">
        <p className="muted">{t('phone.intro')}</p>
        <button className="btn btn-sky" onClick={() => void startPhoneSignUp()} disabled={status === 'starting'} data-testid="phone-start">
          <Glyph name="phone" size={20} /> {t('phone.start')}
        </button>
      </Card>
    );
  }
  const url = joinUrl(session);
  return (
    <Card title={t('phone.title')} tone="navy" className="phone-card">
      <div className="phone-live">
        <JoinQrs join={url} wifi={wifiQr(info)} ssid={info?.wifi?.ssid} password={info?.wifi?.password} size={168} />
        {big && <QrOverlay title={tour.settings.name} join={url} onClose={() => setBig(false)} />}
        <div className="phone-info">
          <span className={`chip ${status === 'live' ? 'chip-ok' : 'chip-warn'}`} data-testid="phone-status">
            {t(`phone.status.${status === 'live' ? 'live' : status === 'offline' ? 'offline' : 'starting'}`)}
          </span>
          <div className="phone-code">
            {t('phone.code')} <b data-testid="phone-code">{session.code}</b>
          </div>
          <code className="phone-url" data-testid="phone-url">{url}</code>
          {!open && <p className="notice notice-warn">{t('phone.closedNow')}</p>}
          <button className="btn btn-gold" onClick={() => setBig(true)} data-testid="phone-show-qr">
            <Glyph name="zoom" size={20} /> {t('phone.showQr')}
          </button>
          <p className="muted">{t('phone.tvHint')}</p>
          <button
            className="btn btn-sm btn-white btn-danger-text"
            onClick={async () => {
              if (await confirmDialog({ title: t('phone.stop'), body: t('phone.stopConfirm') })) await stopPhoneSignUp();
            }}
            data-testid="phone-stop"
          >
            {t('phone.stop')}
          </button>
        </div>
      </div>
    </Card>
  );
}

/** The QR codes across the whole screen, for guests to scan from this screen. */
function QrOverlay({ title, join, onClose }: { title: string; join: string; onClose: () => void }) {
  const t = useT();
  const info = usePhone((s) => s.info);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label={t('phone.showQr')} onClick={onClose} data-testid="qr-overlay">
      <h2 className="display">{title}</h2>
      <p className="qr-overlay-sub">{t('big.scanToJoin')}</p>
      <JoinQrs join={join} wifi={wifiQr(info)} ssid={info?.wifi?.ssid} password={info?.wifi?.password} size={320} variant="big" />
      <button className="btn btn-white btn-lg" onClick={onClose} autoFocus data-testid="qr-overlay-close">
        {t('common.close')}
      </button>
    </div>
  );
}
