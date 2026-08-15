import regulariteData from '../data/regularite.json';

export interface Regularite {
  regularite: number;
  ponctualite: number;
}

type RegulariteJson = Record<string, { regularite: number; ponctualite: number }>;

export function getRegularity(): Record<string, Regularite> {
  return regulariteData as RegulariteJson;
}
