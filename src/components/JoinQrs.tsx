// The QR codes guests scan. With the Pi's own Wi-Fi: one code that joins the
// Wi-Fi (the sign-up page then opens by itself) and a small one for phones that
// are on it already. Without: one code with the sign-up link.
import { useT } from '../store/store';
import { QrCode } from './QrCode';

export function JoinQrs({ join, wifi, ssid, password, size = 180, variant = 'card' }: { join: string; wifi: string | null; ssid?: string; password?: string; size?: number; variant?: 'card' | 'big' | 'small' }) {
  const t = useT();
  const shortLink = join.replace(/^https?:\/\//, '').replace(/\/#\/s\/[A-Z0-9]+$/, '');
  if (!wifi) {
    return (
      <div className={`join-qrs join-qrs-${variant}`}>
        <figure className="join-qr">
          <QrCode text={join} size={size} label={t('phone.qrLabel', { url: join })} />
        </figure>
      </div>
    );
  }
  return (
    <div className={`join-qrs join-qrs-${variant}`} data-testid="join-qrs">
      <figure className="join-qr join-qr-wifi">
        <QrCode text={wifi} size={size} label={t('wifi.qrLabel', { ssid: ssid ?? '' })} />
        <figcaption>
          <b>
            <span className="step-num">1</span> {t('wifi.scan')}
          </b>
          <span>{t('wifi.scanHint', { ssid: ssid ?? '' })}</span>
          {password && <small className="wifi-pass" data-testid="wifi-password">{t('wifi.password', { ssid: ssid ?? '', pw: password })}</small>}
        </figcaption>
      </figure>
      <figure className="join-qr join-qr-link">
        <QrCode text={join} size={Math.round(size * 0.55)} label={t('phone.qrLabel', { url: join })} />
        <figcaption>
          <span>{t('wifi.already')}</span>
          <b>{shortLink}</b>
        </figcaption>
      </figure>
    </div>
  );
}
