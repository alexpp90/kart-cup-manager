import { useEffect, useState } from 'react';
import { Card } from '../components/Bits';
import { Confetti } from '../components/Confetti';
import { PodiumStage } from '../components/PodiumStage';
import { finalResults } from '../engine/tournament';
import { sound } from '../lib/sound';
import { useApp, useT } from '../store/store';
import { FinalTable } from './Standings';

export function Podium() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const rows = finalResults(tour);
  const [burst, setBurst] = useState(1);
  useEffect(() => {
    if (rows) sound.fanfare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst]);
  if (!rows) {
    return (
      <Card>
        <p className="empty">{t('podium.notYet')}</p>
      </Card>
    );
  }
  return (
    <div className="podium-page">
      <Confetti burst={burst} />
      <h1 className="display page-title center">{tour.settings.name}</h1>
      <PodiumStage tour={tour} rows={rows} />
      <div className="center">
        <button className="btn btn-gold btn-lg" onClick={() => setBurst(burst + 1)} data-testid="confetti-again">
          🎉 {t('podium.replay')}
        </button>
      </div>
      <h2 className="display section-title">{t('podium.final')}</h2>
      <FinalTable tour={tour} />
    </div>
  );
}
