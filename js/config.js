/**
 * Game configuration constants
 */
const CONFIG = {
    // Canvas settings
    CANVAS_WIDTH: 1040,
    CANVAS_HEIGHT: 900,

    // Hex geometry (flat-top orientation)
    HEX_SIZE: 32,  // Distance from center to corner

    // Map origin offset (to center the map)
    MAP_OFFSET_X: 60,
    MAP_OFFSET_Y: 50,

    // Rendering
    GRID_LINE_COLOR: 'rgba(255, 255, 255, 0.15)',
    GRID_LINE_WIDTH: 1,
    SELECTION_COLOR: '#ffd700',
    SELECTION_LINE_WIDTH: 3,
    HOVER_COLOR: 'rgba(255, 255, 255, 0.2)',

    // Fog of war
    FOG_HIDDEN_COLOR: 'rgba(10, 10, 30, 0.85)',
    FOG_EXPLORED_COLOR: 'rgba(20, 20, 50, 0.5)',

    // Autosave
    AUTOSAVE_INTERVAL_MS: 30000,

    // LocalStorage keys
    STORAGE_KEY: 'puddygeneral_games',
    CURRENT_GAME_KEY: 'puddygeneral_current'
};
