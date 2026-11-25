import { Card } from '../components/Bits';
import { Logo } from '../components/TopBar';
import { importErrorText } from '../lib/actions';
import { downloadText, pickFile } from '../lib/files';
import { parseBackup } from '../store/persist';
import { useApp, useT } from '../store/store';
import { confirmDialog, toast } from '../store/ui';

/** Shown instead of the app when the stored data cannot be read. Nothing is overwritten until the organizer chooses. */
export function Recovery() {
  const t = useT();
  const recovery = useApp((s) => s.recovery)!;
  const resolve = useApp((s) => s.resolveRecovery);

  const download = () => downloadText(`kart-cup-manager-damaged-${new Date().toISOString().slice(0, 10)}.json`, recovery.raw, 'application/json');
  const importFile = async () => {
    const text = await pickFile('application/json,.json');
    if (!text) return;
    const r = parseBackup(text);
    if (!r.ok) {
      toast(importErrorText(r), 'error');
      return;
    }
    resolve(r.t);
    toast(t('settings.imported'), 'success');
  };
  const fresh = async () => {
    if (await confirmDialog({ title: t('recovery.fresh'), body: t('recovery.freshConfirm'), danger: true, confirmLabel: t('recovery.fresh') })) resolve(null);
  };

  return (
    <div className="welcome recovery" data-testid="recovery">
      <div className="welcome-hero">
        <Logo />
        <Card title={t('recovery.title')} tone="red">
          <p>{t(`recovery.body.${recovery.reason}`)}</p>
          <p className="muted">{t('recovery.kept')}</p>
          <div className="btn-row">
            <button className="btn btn-gold" onClick={download} data-testid="recovery-download">
              {t('recovery.download')}
            </button>
            <button className="btn btn-sky" onClick={() => void importFile()} data-testid="recovery-import">
              {t('recovery.import')}
            </button>
            <button className="btn btn-white" onClick={() => void fresh()} data-testid="recovery-fresh">
              {t('recovery.fresh')}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
