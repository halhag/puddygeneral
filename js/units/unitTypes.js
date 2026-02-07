/**
 * Unit type definitions for medieval units
 * Based on Panzer General II stat system, adapted for medieval theme
 */

// Movement types - determines terrain interaction
const MovementType = Object.freeze({
    LEG: 'leg',         // Infantry on foot
    HORSE: 'horse',     // Mounted cavalry
    WHEEL: 'wheel'      // Siege equipment, wagons
});

// Target types - determines which attack stat applies
const TargetType = Object.freeze({
    SOFT: 'soft',       // Unarmored units (infantry, archers)
    HARD: 'hard'        // Armored units (knights, fortifications)
});

// Unit class categories
const UnitClass = Object.freeze({
    INFANTRY: 'infantry',
    RANGED: 'ranged',
    CAVALRY: 'cavalry',
    SIEGE: 'siege'
});

/**
 * Unit type template
 * Defines base stats for a type of unit (e.g., "Men-at-Arms")
 */
const UNIT_TYPES = {
    /**
     * Men-at-Arms (Basic Infantry)
     * Cheap, versatile foot soldiers. Good defense, moderate attack.
     * Medieval equivalent of PGII's Wehrmacht Infantry
     */
    infantry: {
        id: 'infantry',
        name: 'Men-at-Arms',
        unitClass: UnitClass.INFANTRY,

        // Economy
        cost: 60,

        // Supplies
        maxAmmo: null,          // null = unlimited (melee weapons don't run out)

        // Movement
        movementType: MovementType.LEG,
        movement: 3,            // Hexes per turn

        // Vision
        spotting: 2,            // Can see 2 hexes away

        // Combat range
        range: 0,               // 0 = must be adjacent to attack (melee)

        // Combat initiative (for tie-breaking, future use)
        initiative: 1,

        // Attack values (damage dealt)
        softAttack: 6,          // vs soft targets (other infantry, archers)
        hardAttack: 2,          // vs hard targets (armored knights, fortifications)
        navalAttack: 1,         // vs ships (future use)

        // Defense values (damage reduction)
        groundDefense: 6,       // vs ranged and melee attacks
        closeDefense: 8,        // vs melee attacks specifically

        // Target classification
        targetType: TargetType.SOFT,

        // Display
        icon: 'infantry',       // For future sprite/icon system
        description: 'Basic foot soldiers armed with spears and swords. Reliable and cost-effective.'
    },

    /**
     * Trebuchet (Siege Artillery)
     * Ranged siege weapon. Devastating at range but extremely vulnerable in close combat.
     * Medieval equivalent of PGII's artillery
     */
    trebuchet: {
        id: 'trebuchet',
        name: 'Trebuchet',
        unitClass: UnitClass.SIEGE,

        // Economy
        cost: 84,

        // Supplies
        maxAmmo: 9,             // Uses ammo per attack

        // Movement
        movementType: MovementType.WHEEL,
        movement: 2,            // Slow - siege equipment

        // Vision
        spotting: 1,            // Limited vision

        // Combat range
        range: 2,               // Can attack 1-2 hexes away (ranged)

        // Combat initiative
        initiative: 2,

        // Attack values (damage dealt)
        softAttack: 11,         // Devastating vs infantry
        hardAttack: 5,          // Weak vs armored
        navalAttack: 1,         // vs ships (future use)

        // Defense values (damage reduction)
        groundDefense: 2,       // Very vulnerable
        closeDefense: 0,        // Helpless in melee

        // Target classification
        targetType: TargetType.SOFT,

        // Display
        icon: 'trebuchet',
        description: 'Siege engine that hurls heavy projectiles. Devastating at range but vulnerable in close combat.'
    },

    /**
     * Knights (Heavy Cavalry)
     * Fast, hard-hitting mounted warriors. Strong attack but weak close defense.
     * Medieval equivalent of PGII's Panzer III
     */
    cavalry: {
        id: 'cavalry',
        name: 'Knights',
        unitClass: UnitClass.CAVALRY,

        // Economy
        cost: 120,

        // Supplies
        maxAmmo: null,          // Melee weapons don't run out

        // Movement
        movementType: MovementType.HORSE,
        movement: 5,            // Fast - mounted units

        // Vision
        spotting: 2,            // Good vision from horseback

        // Combat range
        range: 0,               // Melee only

        // Combat initiative
        initiative: 6,          // Very high - charges strike first

        // Attack values (damage dealt)
        softAttack: 3,          // Weak vs soft targets (lance charges scatter infantry less)
        hardAttack: 7,          // Strong vs hard targets (armored charge)
        navalAttack: 0,         // No naval capability

        // Defense values (damage reduction)
        groundDefense: 8,       // Well-armored on open ground
        closeDefense: 2,        // Vulnerable in tight quarters (forests, castles)

        // Target classification
        targetType: TargetType.HARD,  // Armored knights are hard targets

        // Display
        icon: 'cavalry',
        description: 'Heavily armored mounted knights. Devastating charge on open ground but vulnerable in close terrain.'
    }
};

/**
 * Get unit type definition by ID
 * @param {string} typeId - The unit type ID (e.g., 'infantry')
 * @returns {Object} The unit type definition
 */
function getUnitType(typeId) {
    return UNIT_TYPES[typeId] || null;
}

/**
 * Get all available unit types
 * @returns {Array} Array of unit type definitions
 */
function getAllUnitTypes() {
    return Object.values(UNIT_TYPES);
}

/**
 * Get unit types by class
 * @param {string} unitClass - The unit class to filter by
 * @returns {Array} Array of matching unit type definitions
 */
function getUnitTypesByClass(unitClass) {
    return Object.values(UNIT_TYPES).filter(ut => ut.unitClass === unitClass);
}

/**
 * Calculate attack value against a target
 * @param {Object} attackerType - The attacking unit's type definition
 * @param {Object} defenderType - The defending unit's type definition
 * @returns {number} The attack value to use
 */
function getAttackValue(attackerType, defenderType) {
    if (defenderType.targetType === TargetType.HARD) {
        return attackerType.hardAttack;
    }
    return attackerType.softAttack;
}

/**
 * Calculate defense value for a unit based on terrain
 * Close terrain (woods, castle, mountain) uses closeDefense
 * Open terrain (grass, hill, river) uses groundDefense
 * @param {Object} defenderType - The defending unit's type definition
 * @param {boolean} closeTerrain - Whether defender is in close terrain
 * @returns {number} The defense value to use
 */
function getDefenseValue(defenderType, closeTerrain = false) {
    if (closeTerrain && defenderType.closeDefense > 0) {
        return defenderType.closeDefense;
    }
    return defenderType.groundDefense;
}
