// How a round is raced on the console: Grand Prix (a cup of 4 races) or VS
// races, and the engine class. Plain words only, no game artwork.
import type { EngineClass, RaceSetup } from '../engine/types';
import type { Key, Params } from '../i18n';
import { useT } from '../store/store';
import { ChoiceCards, Stepper } from './Bits';
import { Glyph } from './Glyphs';

type T = (key: Key, params?: Params) => string;

export const ccLabel = (t: T, cc: EngineClass) => (cc === 'mirror' ? t('race.mirror') : `${cc}cc`);

export function raceText(t: T, r: RaceSetup): string {
  return r.kind === 'gp' ? t('race.chipGp', { cc: ccLabel(t, r.cc) }) : t('race.chipVs', { n: r.races, cc: ccLabel(t, r.cc) });
}

export function RaceChip({ race }: { race: RaceSetup }) {
  const t = useT();
  return (
    <span className="chip race-chip" data-testid="race-chip">
      <Glyph name={race.kind === 'gp' ? 'trophy' : 'flag'} size={18} /> {raceText(t, race)}
    </span>
  );
}

export function RaceFields({ race, onChange, name = 'race' }: { race: RaceSetup; onChange: (r: RaceSetup) => void; name?: string }) {
  const t = useT();
  return (
    <div className="form-stack race-fields">
      <ChoiceCards
        name={`${name}-kind`}
        value={race.kind}
        onChange={(kind) => onChange(kind === 'gp' ? { ...race, kind, races: 4 } : { ...race, kind, races: race.kind === 'vs' ? race.races : 4 })}
        options={[
          { value: 'gp', label: t('race.gp'), hint: t('race.gpHint'), icon: <Glyph name="trophy" size={30} /> },
          { value: 'vs', label: t('race.vs'), hint: t('race.vsHint'), icon: <Glyph name="flag" size={30} /> },
        ]}
      />
      <div className="form-grid form-grid-tight">
        {race.kind === 'vs' && (
          <div className="field">
            <span>{t('race.races')}</span>
            <Stepper value={race.races} min={1} max={32} onChange={(races) => onChange({ ...race, races })} label={t('race.races')} />
          </div>
        )}
        <div className="field">
          <span>{t('race.cc')}</span>
          <ChoiceCards<EngineClass>
            name={`${name}-cc`}
            value={race.cc}
            onChange={(cc) => onChange({ ...race, cc })}
            options={(['50', '100', '150', '200', 'mirror'] as const).map((cc) => ({ value: cc, label: ccLabel(t, cc) }))}
          />
        </div>
      </div>
    </div>
  );
}
