/**
 * Unit class - represents a single unit instance on the map
 * Each unit has a type (template) and instance-specific state
 */

class Unit {
    /**
     * Create a new unit
     * @param {string} typeId - The unit type ID (e.g., 'infantry')
     * @param {number} playerId - Which player owns this unit (0 or 1)
     * @param {Hex} hex - Starting position
     */
    constructor(typeId, playerId, hex) {
        this.id = crypto.randomUUID();
        this.typeId = typeId;
        this.playerId = playerId;
        this.hex = hex;

        // Get type definition
        const unitType = getUnitType(typeId);
        if (!unitType) {
            throw new Error(`Unknown unit type: ${typeId}`);
        }

        // Instance state
        this.strength = 10;         // Current health (0-10, like PGII)
        this.ammo = unitType.maxAmmo;  // Current ammo (null if unlimited)
        this.experience = 0;        // Veterancy level (0-5)
        this.entrenchment = 0;      // Dig-in level (0-8)
        this.suppression = 0;       // Suppression value (ignored for now)

        // Turn state (reset each turn)
        this.movementRemaining = unitType.movement;
        this.hasAttacked = false;
        this.hasMoved = false;      // Can only move once per turn

        // Tracking for entrenchment
        this.turnsStationary = 0;   // Turns without moving (for entrenchment calculation)
        this.lastHex = hex;         // Track last position for movement detection
    }

    /**
     * Get the unit's type definition
     * @returns {Object} The unit type definition
     */
    getType() {
        return getUnitType(this.typeId);
    }

    /**
     * Get display name
     * @returns {string} The unit's display name
     */
    getName() {
        return this.getType().name;
    }

    /**
     * Check if unit can still move this turn
     * Units can only move once per turn (not multiple small moves)
     * @returns {boolean}
     */
    canMove() {
        return !this.hasMoved && this.movementRemaining > 0 && this.strength > 0;
    }

    /**
     * Check if unit can attack this turn
     * @returns {boolean}
     */
    canAttack() {
        return !this.hasAttacked && this.strength > 0;
    }

    /**
     * Check if unit has ammo (or unlimited ammo)
     * @returns {boolean}
     */
    hasAmmo() {
        return this.ammo === null || this.ammo > 0;
    }

    /**
     * Use movement points
     * @param {number} cost - Movement cost
     * @param {Hex} newHex - The hex unit moved to
     * @returns {boolean} True if movement was successful
     */
    useMovement(cost, newHex = null) {
        if (cost > this.movementRemaining) {
            return false;
        }
        this.movementRemaining -= cost;
        this.hasMoved = true;

        // Moving resets entrenchment and stationary counter
        this.turnsStationary = 0;
        this.entrenchment = 0;

        if (newHex) {
            this.lastHex = newHex;
        }

        return true;
    }

    /**
     * Perform an attack (uses remaining movement and marks as attacked)
     * @returns {boolean} True if attack was initiated
     */
    performAttack() {
        if (!this.canAttack()) {
            return false;
        }

        // Attacking uses all remaining movement
        this.movementRemaining = 0;
        this.hasAttacked = true;

        // Use ammo if applicable
        if (this.ammo !== null && this.ammo > 0) {
            this.ammo--;
        }

        return true;
    }

    /**
     * Take damage
     * @param {number} damage - Strength points to lose
     */
    takeDamage(damage) {
        this.strength = Math.max(0, this.strength - damage);
    }

    /**
     * Heal/reinforce unit
     * @param {number} amount - Strength points to restore
     */
    heal(amount) {
        this.strength = Math.min(10, this.strength + amount);
    }

    /**
     * Check if unit is destroyed
     * @returns {boolean}
     */
    isDestroyed() {
        return this.strength <= 0;
    }

    /**
     * Reset turn state (call at start of each turn)
     */
    resetTurn() {
        const unitType = this.getType();
        this.movementRemaining = unitType.movement;
        this.hasAttacked = false;
        this.hasMoved = false;

        // Increment stationary counter if unit didn't move last turn
        // Entrenchment is calculated separately based on terrain
        this.turnsStationary++;
    }

    /**
     * Calculate and update entrenchment based on terrain and time
     * @param {string} terrainType - The terrain type the unit is on
     */
    updateEntrenchment(terrainType) {
        // Get terrain-specific entrenchment rules
        const rules = getEntrenchmentRules(terrainType);

        // Calculate base entrenchment from turns stationary (1 level per 2 turns)
        const earnedEntrenchment = Math.floor(this.turnsStationary / 2);

        // Apply terrain minimum and maximum
        let newEntrenchment = Math.max(rules.minimum, earnedEntrenchment);
        newEntrenchment = Math.min(newEntrenchment, rules.maximum);

        this.entrenchment = newEntrenchment;
    }

    /**
     * Reduce entrenchment when attacked
     */
    reduceEntrenchment() {
        this.entrenchment = Math.max(0, this.entrenchment - 1);
    }

    /**
     * Gain experience from combat
     * Formula: 0.1 + (5% of strength lost) with ±20% Gaussian variance
     * @param {number} strengthLost - How much strength this unit lost in combat
     * @returns {number} The actual experience gained (for display)
     */
    gainExperience(strengthLost) {
        // Base experience: 0.1 + 5% of strength lost
        const baseExp = 0.1 + (strengthLost * 0.05);

        // Apply ±20% Gaussian variance (stdDev of ~10% gives ~20% range at 2 sigma)
        // Using simple random variance since gaussianRandom is in battleResolver
        const variance = 1 + (Math.random() - 0.5) * 0.4;  // 0.8 to 1.2
        const expGain = baseExp * variance;

        this.experience += expGain;
        return expGain;
    }

    /**
     * Get effective attack value against a target
     * @param {Unit} target - The target unit
     * @returns {number} Attack value modified by strength
     */
    getEffectiveAttack(target) {
        const myType = this.getType();
        const targetType = target.getType();
        const baseAttack = getAttackValue(myType, targetType);

        // Scale by current strength (10 strength = 100%)
        return Math.round(baseAttack * (this.strength / 10));
    }

    /**
     * Get effective defense value
     * @param {boolean} isMelee - Whether this is a melee attack
     * @returns {number} Defense value modified by strength
     */
    getEffectiveDefense(isMelee = false) {
        const myType = this.getType();
        const baseDefense = getDefenseValue(myType, isMelee);

        // Scale by current strength
        return Math.round(baseDefense * (this.strength / 10));
    }

    /**
     * Serialize for storage
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            typeId: this.typeId,
            playerId: this.playerId,
            hex: { q: this.hex.q, r: this.hex.r },
            strength: this.strength,
            ammo: this.ammo,
            experience: this.experience,
            entrenchment: this.entrenchment,
            suppression: this.suppression,
            movementRemaining: this.movementRemaining,
            hasAttacked: this.hasAttacked,
            hasMoved: this.hasMoved,
            turnsStationary: this.turnsStationary
        };
    }

    /**
     * Deserialize from storage
     * @param {Object} data - Serialized unit data
     * @returns {Unit}
     */
    static fromJSON(data) {
        const unit = new Unit(data.typeId, data.playerId, new Hex(data.hex.q, data.hex.r));
        unit.id = data.id;
        unit.strength = data.strength;
        unit.ammo = data.ammo;
        unit.experience = data.experience || 0;
        unit.entrenchment = data.entrenchment || 0;
        unit.suppression = data.suppression || 0;
        unit.movementRemaining = data.movementRemaining;
        unit.hasAttacked = data.hasAttacked;
        unit.hasMoved = data.hasMoved || false;
        unit.turnsStationary = data.turnsStationary || 0;
        return unit;
    }
}

/**
 * Unit manager - tracks all units in the game
 */
class UnitManager {
    constructor() {
        this.units = new Map();  // id -> Unit
    }

    /**
     * Add a unit to the game
     * @param {Unit} unit
     */
    addUnit(unit) {
        this.units.set(unit.id, unit);
    }

    /**
     * Remove a unit from the game
     * @param {string} unitId
     */
    removeUnit(unitId) {
        this.units.delete(unitId);
    }

    /**
     * Get unit by ID
     * @param {string} unitId
     * @returns {Unit|undefined}
     */
    getUnit(unitId) {
        return this.units.get(unitId);
    }

    /**
     * Get unit at a specific hex
     * @param {Hex} hex
     * @returns {Unit|undefined}
     */
    getUnitAt(hex) {
        for (const unit of this.units.values()) {
            if (unit.hex.equals(hex)) {
                return unit;
            }
        }
        return undefined;
    }

    /**
     * Get all units for a player
     * @param {number} playerId
     * @returns {Array<Unit>}
     */
    getPlayerUnits(playerId) {
        return Array.from(this.units.values()).filter(u => u.playerId === playerId);
    }

    /**
     * Get all units
     * @returns {Array<Unit>}
     */
    getAllUnits() {
        return Array.from(this.units.values());
    }

    /**
     * Reset all units for a new turn
     * @param {number} playerId - Optional: only reset units for this player
     */
    resetTurn(playerId = null) {
        for (const unit of this.units.values()) {
            if (playerId === null || unit.playerId === playerId) {
                unit.resetTurn();
            }
        }
    }

    /**
     * Remove destroyed units
     * @returns {Array<Unit>} The removed units
     */
    removeDestroyed() {
        const destroyed = [];
        for (const unit of this.units.values()) {
            if (unit.isDestroyed()) {
                destroyed.push(unit);
                this.units.delete(unit.id);
            }
        }
        return destroyed;
    }

    /**
     * Serialize for storage
     * @returns {Array}
     */
    toJSON() {
        return this.getAllUnits().map(u => u.toJSON());
    }

    /**
     * Deserialize from storage
     * @param {Array} data
     * @returns {UnitManager}
     */
    static fromJSON(data) {
        const manager = new UnitManager();
        if (data && Array.isArray(data)) {
            for (const unitData of data) {
                manager.addUnit(Unit.fromJSON(unitData));
            }
        }
        return manager;
    }
}
