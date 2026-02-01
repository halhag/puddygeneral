/**
 * Battle Resolution System
 * Implements Panzer General II-style combat with Gaussian variance
 */

// Configuration constants
const BATTLE_CONFIG = {
    BASE_TOTAL_DAMAGE: 7,           // Total expected damage for equal forces
    DAMAGE_RATIO_SENSITIVITY: 0.3,  // How much power ratio affects damage split
    MIN_DAMAGE_SHARE: 0.1,          // Minimum damage share (prevents 0 damage)
    MAX_DAMAGE_SHARE: 0.9,          // Maximum damage share (prevents total rout always)
    DAMAGE_STD_DEV: 1.5,            // Standard deviation for damage variance
    MIN_DAMAGE: 0,                  // Minimum damage (floor)
    MAX_DAMAGE: 10,                 // Maximum damage (unit max strength)
    ROUT_THRESHOLD: 3.0             // Power ratio for potential rout (10-0)
};

/**
 * Generate a Gaussian random number using Box-Muller transform
 * This creates a normal distribution (bell curve) for realistic variance
 * @param {number} mean - The expected value
 * @param {number} stdDev - Standard deviation
 * @returns {number} Random value from normal distribution
 */
function gaussianRandom(mean = 0, stdDev = 1) {
    // Avoid log(0) by ensuring u1 > 0
    let u1 = Math.random();
    while (u1 === 0) u1 = Math.random();

    const u2 = Math.random();

    // Box-Muller transform
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    return mean + z0 * stdDev;
}

/**
 * Calculate combat power for an attacker
 * Formula: softAttack (or hardAttack) + strength + initiative + experience
 * @param {Unit} attacker - The attacking unit
 * @param {Unit} defender - The defending unit (to determine soft/hard attack)
 * @returns {number} Attacker's combat power
 */
function calculateAttackerPower(attacker, defender) {
    const attackerType = attacker.getType();
    const defenderType = defender.getType();

    // Choose soft or hard attack based on defender's target type
    const attackValue = getAttackValue(attackerType, defenderType);

    // Initiative only applies to attacker, experience applies to both
    return attackValue + attacker.strength + attackerType.initiative + attacker.experience;
}

/**
 * Calculate combat power for a defender
 * Formula: groundDefense (or closeDefense) + strength + entrenchment + experience
 * @param {Unit} defender - The defending unit
 * @param {boolean} isMelee - Whether this is melee combat (adjacent)
 * @returns {number} Defender's combat power
 */
function calculateDefenderPower(defender, isMelee = true) {
    const defenderType = defender.getType();

    // Use closeDefense for melee, groundDefense otherwise
    const defenseValue = getDefenseValue(defenderType, isMelee);

    return defenseValue + defender.strength + defender.entrenchment + defender.experience;
}

/**
 * Calculate the damage distribution between attacker and defender
 * The power ratio determines how damage is split:
 * - Ratio 1.0 = 50/50 split
 * - Ratio > 1 = attacker deals more, takes less
 * - Ratio < 1 = defender deals more, takes less
 * @param {number} powerRatio - Attacker power / Defender power
 * @returns {Object} { attackerShare, defenderShare }
 */
function calculateDamageDistribution(powerRatio) {
    // attackerShare = portion of BASE_TOTAL_DAMAGE that defender takes
    // When ratio > 1 (attacker stronger), defender takes more
    // When ratio < 1 (defender stronger), attacker takes more

    let attackerShare = 0.5 + BATTLE_CONFIG.DAMAGE_RATIO_SENSITIVITY * (powerRatio - 1);

    // Clamp to valid range
    attackerShare = Math.max(BATTLE_CONFIG.MIN_DAMAGE_SHARE,
                            Math.min(BATTLE_CONFIG.MAX_DAMAGE_SHARE, attackerShare));

    return {
        attackerShare: attackerShare,      // Damage dealt TO defender
        defenderShare: 1 - attackerShare   // Damage dealt TO attacker
    };
}

/**
 * Apply Gaussian variance to a damage value
 * Creates realistic variance with most outcomes near expected value
 * but occasional outliers (upsets)
 * @param {number} baseDamage - The expected damage
 * @param {number} stdDev - Standard deviation
 * @returns {number} Damage with variance applied
 */
function applyDamageVariance(baseDamage, stdDev = BATTLE_CONFIG.DAMAGE_STD_DEV) {
    return gaussianRandom(baseDamage, stdDev);
}

/**
 * Clamp damage to valid range
 * @param {number} damage - Raw damage value
 * @param {number} maxStrength - Maximum damage (usually unit's current strength)
 * @returns {number} Clamped damage value
 */
function clampDamage(damage, maxStrength) {
    return Math.max(BATTLE_CONFIG.MIN_DAMAGE,
                   Math.min(damage, maxStrength, BATTLE_CONFIG.MAX_DAMAGE));
}

/**
 * Resolve a battle between two units
 * @param {Unit} attacker - The attacking unit
 * @param {Unit} defender - The defending unit
 * @param {Object} options - Optional parameters
 * @param {boolean} options.isMelee - Whether this is melee combat (default: true)
 * @returns {BattleResult} The battle outcome
 */
function resolveBattle(attacker, defender, options = {}) {
    const isMelee = options.isMelee !== undefined ? options.isMelee : true;

    // Store initial strengths
    const attackerStrengthBefore = attacker.strength;
    const defenderStrengthBefore = defender.strength;

    // Calculate combat powers
    const attackerPower = calculateAttackerPower(attacker, defender);
    const defenderPower = calculateDefenderPower(defender, isMelee);

    // Calculate power ratio (prevent division by zero)
    const powerRatio = defenderPower > 0 ? attackerPower / defenderPower :
                       BATTLE_CONFIG.ROUT_THRESHOLD;

    // Get damage distribution based on power ratio
    const distribution = calculateDamageDistribution(powerRatio);

    // Calculate base expected damage for each side
    const baseDefenderDamage = BATTLE_CONFIG.BASE_TOTAL_DAMAGE * distribution.attackerShare;
    const baseAttackerDamage = BATTLE_CONFIG.BASE_TOTAL_DAMAGE * distribution.defenderShare;

    // Apply Gaussian variance for realistic randomness
    let defenderDamageRaw = applyDamageVariance(baseDefenderDamage);
    let attackerDamageRaw = applyDamageVariance(baseAttackerDamage);

    // Check for extreme mismatch (potential rout)
    if (powerRatio >= BATTLE_CONFIG.ROUT_THRESHOLD) {
        // Attacker vastly superior - chance of total rout
        const routChance = (powerRatio - BATTLE_CONFIG.ROUT_THRESHOLD) / 4;
        if (Math.random() < routChance) {
            defenderDamageRaw = defenderStrengthBefore; // Total destruction
            attackerDamageRaw = 0;
        }
    } else if (powerRatio <= 1 / BATTLE_CONFIG.ROUT_THRESHOLD) {
        // Defender vastly superior - chance of total rout of attacker
        const routChance = (1/powerRatio - BATTLE_CONFIG.ROUT_THRESHOLD) / 4;
        if (Math.random() < routChance) {
            attackerDamageRaw = attackerStrengthBefore; // Total destruction
            defenderDamageRaw = 0;
        }
    }

    // Clamp to valid ranges (can't deal more damage than unit has strength)
    defenderDamageRaw = clampDamage(defenderDamageRaw, defenderStrengthBefore);
    attackerDamageRaw = clampDamage(attackerDamageRaw, attackerStrengthBefore);

    // Round to integers for display and application
    const defenderDamage = Math.round(defenderDamageRaw);
    const attackerDamage = Math.round(attackerDamageRaw);

    // Calculate final strengths
    const attackerStrengthAfter = Math.max(0, attackerStrengthBefore - attackerDamage);
    const defenderStrengthAfter = Math.max(0, defenderStrengthBefore - defenderDamage);

    return {
        // Rounded integer damage (for display and application)
        attackerDamage: attackerDamage,
        defenderDamage: defenderDamage,

        // Raw float damage (for debugging/logging)
        attackerDamageRaw: attackerDamageRaw,
        defenderDamageRaw: defenderDamageRaw,

        // Combat stats
        attackerPower: attackerPower,
        defenderPower: defenderPower,
        powerRatio: powerRatio,

        // Outcome flags
        attackerDestroyed: attackerStrengthAfter <= 0,
        defenderDestroyed: defenderStrengthAfter <= 0,

        // Strength tracking
        attackerStrengthBefore: attackerStrengthBefore,
        defenderStrengthBefore: defenderStrengthBefore,
        attackerStrengthAfter: attackerStrengthAfter,
        defenderStrengthAfter: defenderStrengthAfter
    };
}
