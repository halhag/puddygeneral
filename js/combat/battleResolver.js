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
    DAMAGE_STD_DEV: 1.25,           // Standard deviation for damage variance
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
 * Formula: softAttack (or hardAttack) + (strength/2) + initiative + experience
 * Strength is halved, then reduced by movement fatigue (20% per tier, max 2 tiers)
 * Surprise attacks lose all initiative and additional 20% strength
 * River attacks (from river to non-river) lose all initiative and 30% strength
 * @param {Unit} attacker - The attacking unit
 * @param {Unit} defender - The defending unit (to determine soft/hard attack)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.surpriseAttack - Whether attacker stumbled into hidden enemy
 * @param {boolean} options.riverAttack - Whether attacker is on river attacking non-river
 * @returns {number} Attacker's combat power
 */
function calculateAttackerPower(attacker, defender, options = {}) {
    const attackerType = attacker.getType();
    const defenderType = defender.getType();

    // Choose soft or hard attack based on defender's target type
    const attackValue = getAttackValue(attackerType, defenderType);

    // Calculate movement fatigue
    // Each 33% of movement used = 1 tier, max 2 tiers
    // 20% strength reduction per tier (max 40%)
    const maxMovement = attackerType.movement;
    const movementUsed = maxMovement - attacker.movementRemaining;
    const percentUsed = maxMovement > 0 ? movementUsed / maxMovement : 0;
    const fatigueTiers = Math.min(2, Math.floor(percentUsed / 0.33));
    let strengthMultiplier = 1 - (fatigueTiers * 0.20);  // 1.0, 0.8, or 0.6

    // Apply surprise penalty (stacks with fatigue)
    let effectiveInitiative = attackerType.initiative;
    if (options.surpriseAttack) {
        strengthMultiplier -= 0.20;  // Additional 20% strength loss
        effectiveInitiative = 0;     // Lose all initiative when surprised
    }

    // Apply river attack penalty (attacking from river to non-river)
    if (options.riverAttack) {
        strengthMultiplier -= 0.30;  // 30% strength loss from fighting in river
        effectiveInitiative = 0;     // Lose all initiative - hard to coordinate from water
    }

    // Ensure multiplier doesn't go below 20% (minimum effective strength)
    strengthMultiplier = Math.max(0.2, strengthMultiplier);

    // Apply penalties to strength component
    // Strength is halved to reduce its dominance in combat calculations
    const effectiveStrength = (attacker.strength / 2) * strengthMultiplier;

    // Initiative only applies to attacker (0 if surprised), experience applies to both
    return attackValue + effectiveStrength + effectiveInitiative + attacker.experience;
}

/**
 * Calculate combat power for a defender
 * Formula: groundDefense (or closeDefense) + (strength/2) + entrenchment + experience
 * Strength is halved to reduce its dominance in combat
 * Uses closeDefense in close terrain (woods, castle, mountain)
 * Uses groundDefense in open terrain (grass, hill, river)
 * @param {Unit} defender - The defending unit
 * @param {boolean} closeTerrain - Whether defender is in close terrain
 * @returns {number} Defender's combat power
 */
function calculateDefenderPower(defender, closeTerrain = false) {
    const defenderType = defender.getType();

    // Use closeDefense in close terrain, groundDefense in open terrain
    const defenseValue = getDefenseValue(defenderType, closeTerrain);

    // Strength is halved to reduce its dominance in combat calculations
    return defenseValue + (defender.strength / 2) + defender.entrenchment + defender.experience;
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
 * @param {boolean} options.closeTerrain - Whether defender is in close terrain (woods, castle, mountain)
 * @param {boolean} options.surpriseAttack - Whether attacker stumbled into hidden enemy
 * @param {boolean} options.riverAttack - Whether attacker is on river attacking non-river
 * @returns {BattleResult} The battle outcome
 */
function resolveBattle(attacker, defender, options = {}) {
    const closeTerrain = options.closeTerrain || false;

    // Store initial strengths
    const attackerStrengthBefore = attacker.strength;
    const defenderStrengthBefore = defender.strength;

    // Calculate combat powers (pass surprise option to attacker power calc)
    const attackerPower = calculateAttackerPower(attacker, defender, options);
    const defenderPower = calculateDefenderPower(defender, closeTerrain);

    // Calculate power ratio (prevent division by zero)
    const powerRatio = defenderPower > 0 ? attackerPower / defenderPower :
                       BATTLE_CONFIG.ROUT_THRESHOLD;

    // Get damage distribution based on power ratio
    const distribution = calculateDamageDistribution(powerRatio);

    // Scale down total damage when both units are weak
    // Total damage should not exceed 75% of combined remaining strength
    const combinedStrength = attackerStrengthBefore + defenderStrengthBefore;
    const maxTotalDamage = combinedStrength * 0.75;
    const effectiveTotalDamage = Math.min(BATTLE_CONFIG.BASE_TOTAL_DAMAGE, maxTotalDamage);

    // Calculate base expected damage for each side
    const baseDefenderDamage = effectiveTotalDamage * distribution.attackerShare;
    const baseAttackerDamage = effectiveTotalDamage * distribution.defenderShare;

    // Apply Gaussian variance for realistic randomness
    let defenderDamageRaw = applyDamageVariance(baseDefenderDamage);
    let attackerDamageRaw = applyDamageVariance(baseAttackerDamage);

    // Ranged attacks: attacker takes no return fire, damage scales with strength
    if (options.rangedAttack) {
        attackerDamageRaw = 0;
        // Scale ranged damage by attacker's strength (half-scale reduction)
        // Missing 60% strength = 30% damage penalty
        const missingStrengthPercent = (10 - attackerStrengthBefore) / 10;
        const strengthPenalty = missingStrengthPercent * 0.5;
        defenderDamageRaw = defenderDamageRaw * (1 - strengthPenalty);
    }

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
        closeTerrain: closeTerrain,     // Whether close defense was used

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
