/** Campagnes : un acte entier, zone par zone (portails entre zones, zones découvertes en les traversant). */
import { ACT1_STEPS, act1Available } from './zones/act1';
import { ACT2_STEPS, act2Available } from './zones/act2';
import { ACT3_STEPS, act3Available } from './zones/act3';
import { ACT5_STEPS, act5Available } from './zones/act5';
import { ACT4_STEPS, act4Available } from './zones/act4';

export interface Campaign {
  id: string;
  name: string;
  /** première zone (celle qu'on rejoint depuis le point de passage) et libellés des zones, dans l'ordre */
  steps: { id: string; name: string }[];
  available: () => boolean;
}

export const CAMPAIGNS: Campaign[] = [
  { id: 'act1', name: 'Acte I', steps: ACT1_STEPS, available: act1Available },
  { id: 'act2', name: 'Acte II', steps: ACT2_STEPS, available: act2Available },
  { id: 'act3', name: 'Acte III', steps: ACT3_STEPS, available: act3Available },
  { id: 'act4', name: 'Acte IV', steps: ACT4_STEPS, available: act4Available },
  { id: 'act5', name: 'Acte V', steps: ACT5_STEPS, available: act5Available },
];
