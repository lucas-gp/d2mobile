/** Images d'interface indispensables aux écrans de Diablo II (menu, sélection, création) : sans elles l'écran ne peut pas s'afficher */
export const UI_REQUIRED = ['menu-bg', 'select-bg', 'create-bg', 'hero-sorceress-nu1', 'btn-wide'] as const;

/**
 * Revision of the exported interface art (`rev` in ui.json): raised when an image of the interface changes, so that interface art generated
 * on the device by an earlier version is generated again (only the interface, not the rest of the graphics). 2: logo built at its DC6
 * offsets (`logo`, replaces `logo-fire`). 3: the buttons in the menus' sky palette (lot 292d: grey stone, blue gems).
 */
export const UI_REVISION = 3;
