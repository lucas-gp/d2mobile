/**
 * Cœur du jeu regroupé en un point d'entrée unique, chargé par import() depuis app.ts : tout ce qui n'est pas nécessaire
 * à l'écran de sélection (simulation, données d'objets, rendu, HUD, panneaux, sons) est dans ce chunk.
 */
export { Game } from './sim/game';
export { DT } from './sim/constants';
export { shiftEvent } from './sim/events';
export { GameRenderer, QUALITY_PRESETS } from './render/renderer';
export { Hud } from './ui/hud';
export { Tips } from './ui/tips';
export { Panels } from './ui/panels';
export { Controls } from './input/controls';
export { AudioEngine, Haptics } from './platform/audio';
export { installDebugHook } from './debug/hook';
export { BotBrain } from './sim/bot/brain';
export { addXp, xpToReach } from './sim/progression';
export { QUESTS } from './data/quests';
export { campaignMapIds, loadCampaignMaps, loadD2Maps } from './data/d2map-load';
export { openSkillPicker } from './ui/skillpicker';
export { openNpcDialog } from './ui/npcdialog';
export { downloadPack, packRealState } from './platform/packs';
export { applyLootPreset } from './data/rates';
export { setDurabilityEnabled } from './sim/durability';
export { withDefaultSettings } from './sim/save';
