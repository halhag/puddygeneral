/**
 * Unit Rebuild System
 * Handles unit replenishment mechanics with prestige costs
 * Rebuild restores only HALF the missing strength per rebuild action.
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
     * Only half the missing strength can be restored per rebuild.
     * @param {Unit} unit - The unit to rebuild
     * @returns {Object} { withExp, cheap, expLoss, missingStrength, totalMissing, costPerStrength, costPerStrengthCheap }
     */
    getCosts(unit) {
        const unitType = unit.getType();
        const totalMissing = 10 - unit.strength;
        const missingStrength = totalMissing / 2;  // Can only restore half
        const missingRatio = missingStrength / 10;

        // Cost per strength point
        const costPerStrength = unitType.cost / 10;
        const costPerStrengthCheap = costPerStrength / 2;

        // Cost with experience = proportional to restorable strength
        const withExp = Math.ceil(missingRatio * unitType.cost);

        // Cheap cost = half price
        const cheap = Math.ceil(withExp / 2);

        // Experience loss = proportional to restorable strength
        const expLoss = missingRatio * unit.experience;

        return { withExp, cheap, expLoss, missingStrength, totalMissing, costPerStrength, costPerStrengthCheap };
    },

    /**
     * Calculate how much strength can be afforded with available prestige
     * Capped at half the missing strength.
     * @param {Unit} unit - The unit to rebuild
     * @param {number} availablePrestige - Available prestige
     * @param {boolean} keepExperience - If true, use full price; if false, use cheap price
     * @returns {Object} { affordableStrength, cost, expLoss }
     */
    getAffordableRebuild(unit, availablePrestige, keepExperience) {
        const unitType = unit.getType();
        const totalMissing = 10 - unit.strength;
        const maxRestore = totalMissing / 2;  // Half-strength cap
        const costPerStrength = keepExperience ? (unitType.cost / 10) : (unitType.cost / 20);

        // How many strength points can we afford (capped at half missing)?
        const affordableByPrestige = availablePrestige / costPerStrength;
        const affordableStrength = Math.min(maxRestore, affordableByPrestige);

        if (affordableStrength <= 0) {
            return { affordableStrength: 0, cost: 0, expLoss: 0 };
        }

        // Calculate actual cost
        const cost = Math.ceil(affordableStrength * costPerStrength);

        // Experience loss is proportional to strength being rebuilt (for cheap option)
        let expLoss = 0;
        if (!keepExperience) {
            const rebuiltRatio = affordableStrength / 10;
            expLoss = rebuiltRatio * unit.experience;
        }

        return { affordableStrength, cost, expLoss };
    },

    /**
     * Rebuild a unit (partial based on half-strength cap and available prestige)
     * @param {GameState} gameState - The current game state
     * @param {Unit} unit - The unit to rebuild
     * @param {boolean} keepExperience - If true, pay full price; if false, lose exp
     * @returns {Object} { success, cost, expLost, strengthGained }
     */
    rebuild(gameState, unit, keepExperience) {
        if (!this.canRebuild(gameState, unit)) {
            return { success: false, cost: 0, expLost: 0, strengthGained: 0 };
        }

        // Calculate what we can afford (already capped at half missing)
        const affordable = this.getAffordableRebuild(unit, gameState.prestige, keepExperience);

        if (affordable.affordableStrength <= 0) {
            return { success: false, cost: 0, expLost: 0, strengthGained: 0, insufficientFunds: true };
        }

        // Deduct prestige
        gameState.prestige -= affordable.cost;

        // Calculate experience loss if choosing cheap option
        let expLost = 0;
        if (!keepExperience) {
            expLost = affordable.expLoss;
            unit.experience = Math.max(0, unit.experience - expLost);
        }

        // Restore strength (capped at half missing)
        const oldStrength = unit.strength;
        unit.strength = Math.min(10, unit.strength + affordable.affordableStrength);
        const strengthGained = unit.strength - oldStrength;

        // Trebuchets get +1 ammo on rebuild
        let ammoGained = 0;
        if (unit.getType().maxAmmo !== null) {
            const maxAmmo = unit.getType().maxAmmo;
            const oldAmmo = unit.ammo;
            unit.ammo = Math.min(unit.ammo + 1, maxAmmo);
            ammoGained = unit.ammo - oldAmmo;
        }

        // Mark unit as having acted (can't move or attack this turn)
        unit.hasMoved = true;
        unit.hasAttacked = true;

        // Reset entrenchment (new troops need to dig in)
        unit.entrenchment = 0;
        unit.turnsStationary = 0;

        console.log(`Unit rebuilt! Strength +${strengthGained.toFixed(1)}, Cost: ${affordable.cost}, Exp lost: ${expLost.toFixed(2)}${ammoGained > 0 ? ', +1 ammo' : ''}`);

        return { success: true, cost: affordable.cost, expLost, strengthGained, ammoGained };
    },

    /**
     * Check if a unit can buy ammo
     * Only full-strength units with ammo that haven't acted can buy.
     * @param {GameState} gameState
     * @param {Unit} unit
     * @returns {boolean}
     */
    canBuyAmmo(gameState, unit) {
        if (!unit) return false;
        if (unit.playerId !== gameState.currentPlayer) return false;
        if (unit.getType().maxAmmo === null) return false;
        if (unit.ammo >= unit.getType().maxAmmo) return false;
        if (unit.strength < 10) return false;
        if (unit.hasMoved || unit.hasAttacked) return false;
        if (gameState.prestige < 8) return false;
        return true;
    },

    /**
     * Buy 1 ammo for 8 prestige (costs the unit's turn)
     * @param {GameState} gameState
     * @param {Unit} unit
     * @returns {Object} { success, cost }
     */
    buyAmmo(gameState, unit) {
        if (!this.canBuyAmmo(gameState, unit)) {
            return { success: false };
        }

        gameState.prestige -= 8;
        unit.ammo = Math.min(unit.ammo + 1, unit.getType().maxAmmo);

        // Costs the unit's turn
        unit.hasMoved = true;
        unit.hasAttacked = true;

        console.log(`Ammo purchased! Ammo: ${unit.ammo}/${unit.getType().maxAmmo}, Cost: 8 prestige`);

        return { success: true, cost: 8 };
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
