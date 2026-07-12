/**
 * Game configuration constants
 */
const CONFIG = {
    // Hex geometry (flat-top orientation)
    // HEX_SIZE is the RENDERED size (distance from center to corner).
    // MAP_GEN_HEX_SIZE is the size the original maps were designed around -
    // map generation derives hex counts from it, so it must stay at 32
    // to keep the maps exactly as they were.
    HEX_SIZE: 64,
    MAP_GEN_HEX_SIZE: 32,

    // Zoom limits (rendered hex size)
    MIN_HEX_SIZE: 36,
    MAX_HEX_SIZE: 120,
    ZOOM_STEP: 1.15,

    // World padding around the hex field (world-space pixels)
    MAP_PADDING: 48,

    // Edge scrolling: pointer within this many px of the map edge
    // (or beyond it) scrolls the camera in that direction.
    EDGE_SCROLL_ZONE: 42,
    EDGE_SCROLL_SPEED: 1000,   // px/sec at full push
    KEY_SCROLL_SPEED: 800,     // px/sec for arrow/WASD scrolling

    // Rendering
    GRID_LINE_COLOR: 'rgba(58, 42, 24, 0.25)',
    GRID_LINE_WIDTH: 1.5,
    SELECTION_COLOR: '#ffd700',
    SELECTION_LINE_WIDTH: 3,
    HOVER_COLOR: 'rgba(255, 244, 214, 0.18)',

    // Fog of war (lighter overlay - terrain visible like a map, but units hidden)
    FOG_HIDDEN_COLOR: 'rgba(24, 18, 34, 0.48)',
    FOG_EXPLORED_COLOR: 'rgba(24, 18, 40, 0.3)',

    // Autosave
    AUTOSAVE_INTERVAL_MS: 30000,

    // LocalStorage keys
    STORAGE_KEY: 'puddygeneral_games',
    CURRENT_GAME_KEY: 'puddygeneral_current'
};
