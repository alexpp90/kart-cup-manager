import { heatCountOf } from '../engine/finals';
import type { StageConfig } from '../engine/types';
import type { Key, Params } from '../i18n';
import { stageName } from '../lib/labels';

type T = (key: Key, params?: Params) => string;

/** Human readable one-liners for a list of stages. */
export function describeStages(t: T, stages: StageConfig[]): string[] {
  return stages.map((s, i) => {
    const name = stageName(t, s.name);
    const last = i === stages.length - 1;
    let line = last
      ? `${name}: ${t('stage.describeFinal', { size: s.fieldSize, name })}`
      : `${name}: ${t('stage.describe', { field: s.fieldSize, heats: heatCountOf(s), size: s.heatSize, adv: s.advancePerHeat })}`;
    if (s.wildcards > 0) line += ` ${t('stage.describeWild', { n: s.wildcards })}`;
    return line;
  });
}
