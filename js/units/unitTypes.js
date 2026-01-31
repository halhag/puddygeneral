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
 * Calculate defense value for a unit
 * @param {Object} defenderType - The defending unit's type definition
 * @param {boolean} isMelee - Whether this is a melee (adjacent) attack
 * @returns {number} The defense value to use
 */
function getDefenseValue(defenderType, isMelee = false) {
    if (isMelee && defenderType.closeDefense > 0) {
        return defenderType.closeDefense;
    }
    return defenderType.groundDefense;
}
