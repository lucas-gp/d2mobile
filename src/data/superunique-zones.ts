/**
 * Zones où un super-unique peut apparaître. Les DS1 de D2 répètent certains emplacements de super-uniques (Rakanishu ×10 dans le Champ de pierres, Beetleburst
 * dans cinq zones du désert, Snapchip Shatter dans deux grottes de glace) alors que le jeu n'en crée qu'un seul exemplaire ; le wiki PD2 (page « Zones »,
 * colonne « Super Unique Monsters ») donne la zone : Far Oasis pour Beetleburst, Icy Cellar pour Snapchip Shatter. Absent d'ici = toute zone dont la carte a l'emplacement.
 */
export const SUPER_UNIQUE_ZONES: Record<string, string[]> = {
  beetleburst: ['a2_oasis'],
  'snapchip shatter': ['a5_glacial2'],
};

/** Ce super-unique (nom de preset en minuscules) a-t-il sa place dans cette zone de campagne ? */
export const superUniqueHere = (preset: string, zoneId: string): boolean => !SUPER_UNIQUE_ZONES[preset] || SUPER_UNIQUE_ZONES[preset].includes(zoneId);
