import { exportBackup } from '../lib/actions';
import { useApp, useT } from '../store/store';

/** Persistent warning when the browser cannot store the tournament. Export always works. */
export function StorageBanner() {
  const t = useT();
  const storage = useApp((s) => s.storage);
  const hasData = useApp((s) => s.t !== null);
  if (storage === 'ok') return null;
  return (
    <div className="notice notice-error storage-banner" role="alert" data-testid={`storage-${storage}`}>
      <span>{t(storage === 'full' ? 'storage.full' : 'storage.unavailable')}</span>
      {hasData && (
        <button className="btn btn-white btn-sm" onClick={exportBackup}>
          {t('storage.export')}
        </button>
      )}
    </div>
  );
}
