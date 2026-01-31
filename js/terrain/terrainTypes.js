/**
 * Terrain type definitions with properties for gameplay and rendering
 * Uses bright, cartoonish colors for clarity
 */

const TerrainType = Object.freeze({
    GRASS: 'grass',
    WOODS: 'woods',
    CASTLE: 'castle',
    MOUNTAIN: 'mountain',
    HILL: 'hill',
    WATER: 'water',
    RIVER: 'river'
});

// Terrain properties - colors are bright and distinct for clarity
const TERRAIN_PROPERTIES = {
    [TerrainType.GRASS]: {
        name: 'Grassland',
        movementCost: 1,
        defensiveBonus: 0,
        blocksLineOfSight: false,
        color: '#7ed56f',           // Bright green
        borderColor: '#5cb85c',
        iconColor: null
    },
    [TerrainType.WOODS]: {
        name: 'Woods',
        movementCost: 2,
        defensiveBonus: 1,
        blocksLineOfSight: true,
        color: '#28a745',           // Forest green
        borderColor: '#1e7e34',
        iconColor: '#155724'
    },
    [TerrainType.CASTLE]: {
        name: 'Castle',
        movementCost: 1,
        defensiveBonus: 3,
        blocksLineOfSight: false,
        color: '#adb5bd',           // Stone gray
        borderColor: '#6c757d',
        iconColor: '#495057',
        isObjective: true
    },
    [TerrainType.MOUNTAIN]: {
        name: 'Mountain',
        movementCost: Infinity,     // Impassable
        defensiveBonus: 0,
        blocksLineOfSight: true,
        color: '#8b7355',           // Brown
        borderColor: '#6b5344',
        iconColor: '#ffffff',       // Snow cap
        impassable: true
    },
    [TerrainType.HILL]: {
        name: 'Hill',
        movementCost: 2,
        defensiveBonus: 1,
        blocksLineOfSight: false,
        providesHeightBonus: true,
        color: '#c4a35a',           // Sandy brown
        borderColor: '#a08040',
        iconColor: '#8b7355'
    },
    [TerrainType.WATER]: {
        name: 'Water',
        movementCost: Infinity,
        defensiveBonus: 0,
        blocksLineOfSight: false,
        color: '#5dade2',           // Bright blue
        borderColor: '#3498db',
        iconColor: '#85c1e9',
        impassable: true
    },
    [TerrainType.RIVER]: {
        name: 'River',
        movementCost: 'all',        // Costs ALL remaining movement (special rule)
        defensiveBonus: 0,
        blocksLineOfSight: false,
        color: '#7ed56f',           // Same as grass - river line drawn on top
        borderColor: '#5cb85c',
        iconColor: '#85c1e9',
        isRiver: true               // Special flag for river hexes
    }
};

// Edge features (rivers and roads run between hexes)
const EdgeFeature = Object.freeze({
    NONE: 'none',
    RIVER: 'river',
    ROAD: 'road',
    BRIDGE: 'bridge'
});

const EDGE_PROPERTIES = {
    [EdgeFeature.NONE]: {
        movementCostModifier: 0,
        color: null,
        width: 0
    },
    [EdgeFeature.RIVER]: {
        name: 'River',
        movementCostModifier: 2,    // Additional cost to cross
        color: '#3498db',           // Blue
        highlightColor: '#85c1e9',
        width: 6
    },
    [EdgeFeature.ROAD]: {
        name: 'Road',
        movementCostModifier: -0.5, // Reduces movement cost
        color: '#d4a574',           // Tan/dirt
        borderColor: '#8b7355',
        width: 8
    },
    [EdgeFeature.BRIDGE]: {
        name: 'Bridge',
        movementCostModifier: 0,    // Negates river penalty
        color: '#8b7355',           // Wood brown
        borderColor: '#6b5344',
        width: 10
    }
};

/**
 * Get terrain properties by type
 */
function getTerrainProperties(terrainType) {
    return TERRAIN_PROPERTIES[terrainType] || TERRAIN_PROPERTIES[TerrainType.GRASS];
}

/**
 * Get edge properties by feature type
 */
function getEdgeProperties(edgeFeature) {
    return EDGE_PROPERTIES[edgeFeature] || EDGE_PROPERTIES[EdgeFeature.NONE];
}

/**
 * Calculate effective movement cost to enter a hex
 * Rules:
 * - Roads/Bridges always cost 1 (roads trump everything)
 * - River hexes cost ALL remaining movement (unless via bridge)
 * - Otherwise use terrain's base movement cost
 *
 * @param {string} terrain - The terrain type of the destination hex
 * @param {string} edgeFeature - The edge feature being crossed (ROAD, BRIDGE, or NONE)
 * @param {number} remainingMovement - Unit's remaining movement points
 * @returns {number} The movement cost, or Infinity if impassable
 */
function getMovementCost(terrain, edgeFeature, remainingMovement = Infinity) {
    const terrainProps = getTerrainProperties(terrain);

    // Roads and bridges always cost 1 movement
    if (edgeFeature === EdgeFeature.ROAD || edgeFeature === EdgeFeature.BRIDGE) {
        return 1;
    }

    // River without bridge costs ALL remaining movement
    if (terrain === TerrainType.RIVER) {
        return remainingMovement;  // Must use all movement to enter
    }

    // Mountains and water are impassable
    if (terrainProps.impassable) {
        return Infinity;
    }

    // Normal terrain cost
    return terrainProps.movementCost;
}

/**
 * Check if a unit can enter a hex
 * @param {string} terrain - The terrain type
 * @param {string} edgeFeature - The edge feature being crossed
 * @param {number} remainingMovement - Unit's remaining movement
 * @param {number} totalMovement - Unit's total movement per turn
 * @returns {boolean} True if unit can enter
 */
function canEnterHex(terrain, edgeFeature, remainingMovement, totalMovement) {
    const terrainProps = getTerrainProperties(terrain);

    // Roads and bridges - always passable with at least 1 movement
    if (edgeFeature === EdgeFeature.ROAD || edgeFeature === EdgeFeature.BRIDGE) {
        return remainingMovement >= 1;
    }

    // River without bridge - must have ALL movement (not moved yet this turn)
    if (terrain === TerrainType.RIVER) {
        return remainingMovement === totalMovement;
    }

    // Impassable terrain
    if (terrainProps.impassable) {
        return false;
    }

    // Normal terrain - need enough movement
    return remainingMovement >= terrainProps.movementCost;
}
