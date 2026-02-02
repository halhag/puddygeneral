/**
 * Unit Rebuild System
 * Handles unit replenishment mechanics with prestige costs
 */

const RebuildSystem = {
    /**
     * Check if a unit can be rebuilt
     * @param {GameState} gameState - The current game state
     * @param {Unit} unit - The unit to check
     * @returns {boolean}
     */
    canRebuild(gameState, unit) {
        if (!unit) return false;
        if (unit.playerId !== gameState.currentPlayer) return false;
        if (unit.strength >= 10) return false;
        if (unit.hasMoved || unit.hasAttacked) return false;
        if (gameState.isUnitInAnyEnemyZOC(unit)) return false;
        return true;
    },

    /**
     * Calculate rebuild costs for a unit
     * @param {Unit} unit - The unit to rebuild
     * @returns {Object} { withExp, cheap, expLoss, missingStrength }
     */
    getCosts(unit) {
        const unitType = unit.getType();
        const missingStrength = 10 - unit.strength;
        const missingRatio = missingStrength / 10;

        // Cost with experience = proportional to missing strength
        const withExp = Math.ceil(missingRatio * unitType.cost);

        // Cheap cost = half price
        const cheap = Math.ceil(withExp / 2);

        // Experience loss = proportional to missing strength
        const expLoss = missingRatio * unit.experience;

        return { withExp, cheap, expLoss, missingStrength };
    },

    /**
     * Rebuild a unit to full strength
     * @param {GameState} gameState - The current game state
     * @param {Unit} unit - The unit to rebuild
     * @param {boolean} keepExperience - If true, pay full price; if false, lose exp
     * @returns {Object} { success, cost, expLost, insufficientFunds }
     */
    rebuild(gameState, unit, keepExperience) {
        if (!this.canRebuild(gameState, unit)) {
            return { success: false, cost: 0, expLost: 0 };
        }

        const costs = this.getCosts(unit);
        const cost = keepExperience ? costs.withExp : costs.cheap;

        if (gameState.prestige < cost) {
            return { success: false, cost: 0, expLost: 0, insufficientFunds: true };
        }

        // Deduct prestige
        gameState.prestige -= cost;

        // Calculate experience loss if choosing cheap option
        let expLost = 0;
        if (!keepExperience) {
            expLost = costs.expLoss;
            unit.experience = Math.max(0, unit.experience - expLost);
        }

        // Restore strength to full
        unit.strength = 10;

        // Mark unit as having acted (can't move or attack this turn)
        unit.hasMoved = true;
        unit.hasAttacked = true;

        // Reset entrenchment (new troops need to dig in)
        unit.entrenchment = 0;
        unit.turnsStationary = 0;

        console.log(`Unit rebuilt! Cost: ${cost}, Exp lost: ${expLost.toFixed(2)}`);

        return { success: true, cost, expLost };
    },

    /**
     * Calculate prestige gain from battle (looting)
     * Formula: experience gain * 25, rounded up
     * @param {number} expGain - The experience gained from battle
     * @param {boolean} isRangedAttacker - Whether this unit was a ranged attacker
     * @returns {number} Prestige to gain
     */
    calculateBattlePrestige(expGain, isRangedAttacker = false) {
        // Ranged attackers (trebuchets) don't loot - too far away
        if (isRangedAttacker) return 0;

        // Prestige = experience gain * 25, rounded up
        return Math.ceil(expGain * 25);
    },

    /**
     * Get reason why unit cannot be rebuilt
     * @param {GameState} gameState - The current game state
     * @param {Unit} unit - The unit to check
     * @returns {string|null} Reason string or null if can rebuild
     */
    getCannotRebuildReason(gameState, unit) {
        if (!unit) return 'No unit selected';
        if (unit.playerId !== gameState.currentPlayer) return 'Not your unit';
        if (unit.strength >= 10) return 'Unit is at full strength';
        if (unit.hasMoved || unit.hasAttacked) return 'Unit has already acted this turn';
        if (gameState.isUnitInAnyEnemyZOC(unit)) return 'Cannot rebuild in enemy Zone of Control';
        return null;
    }
};
