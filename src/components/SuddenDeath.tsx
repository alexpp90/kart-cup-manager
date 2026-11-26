import { useState } from 'react';
import { suddenDeathKey } from '../engine/ranking';
import { sound } from '../lib/sound';
import { useApp, useT } from '../store/store';
import { Card } from './Bits';
import { TapOrder } from './TapOrder';

/** Tied players race a shoot-out; the organizer taps the order and saves it. */
export function SuddenDeathCard({ tie, body }: { tie: string[]; body?: string }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const [order, setOrder] = useState<string[]>([]);
  const players = tie.map((id) => tour.players.find((p) => p.id === id)!).filter(Boolean);
  return (
    <Card title={t('finals.suddenDeath')} tone="red" className="sudden">
      <p>{body ?? t('finals.suddenBody', { names: players.map((p) => p.name).join(', ') })}</p>
      <TapOrder players={players} order={order} onChange={setOrder} keyboard={false} />
      <div className="btn-row">
        <button className="btn btn-white btn-sm" onClick={() => setOrder([])}>
          {t('result.clearRace')}
        </button>
        <button
          className="btn btn-green"
          disabled={order.length !== players.length}
          onClick={() => {
            dispatch({ type: 'resolveSuddenDeath', entry: { key: suddenDeathKey(tie), order } });
            setOrder([]);
            sound.success();
          }}
          data-testid="save-sudden"
        >
          {t('finals.suddenSave')}
        </button>
      </div>
    </Card>
  );
}
