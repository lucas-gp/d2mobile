/**
 * Extensions non standard ou récentes de `navigator` et `window` que le jeu détecte (toutes optionnelles : absentes sur une partie des
 * navigateurs), et points d'accroche de débogage posés sur `window`. Remplace les conversions `as unknown as { … }` répétées.
 */
export {};

declare global {
  interface Navigator {
    /** Mémoire de l'appareil en Go, arrondie (Chrome, Android) */
    readonly deviceMemory?: number;
    /** Application ajoutée à l'écran d'accueil (iOS Safari) */
    readonly standalone?: boolean;
    readonly msDoNotTrack?: string | null;
    /** Global Privacy Control */
    readonly globalPrivacyControl?: boolean;
    /** WebGPU disponible (le type complet n'est pas utile ici) */
    readonly gpu?: unknown;
    /** Économiseur de données (Network Information API) */
    readonly connection?: { readonly saveData?: boolean };
    /** Batterie (Chrome) */
    getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener(t: string, f: () => void): void }>;
    /** Catégorie audio de la page (Safari 16.4+) : `ambient` laisse la musique des autres applications */
    audioSession?: { type: string };
  }

  interface Window {
    /** Ancien constructeur audio de Safari */
    webkitAudioContext?: typeof AudioContext;
    /** Do Not Track d'anciens navigateurs */
    readonly doNotTrack?: string | null;
    /** Points d'accroche de débogage (src/debug, ?bench=1, ?sync-debug, mode local) */
    __arpg?: unknown;
    __bench?: unknown;
    __sync?: unknown;
    __d2audio?: unknown;
    __d2local?: unknown;
  }
}
