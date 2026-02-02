/**
 * Enemy AI System
 * Handles automatic actions for enemy units at the end of player's turn
 */

const EnemyAI = {
    /**
     * Execute all enemy AI actions
     * Called at the end of the player's turn
     * @param {GameState} gameState - The current game state
     * @returns {Array} Array of action results for display/logging
     */
    executeEnemyTurn(gameState) {
        const actions = [];

        // Get all enemy units (player 1)
        const enemyUnits = gameState.units.getPlayerUnits(1);

        // Rule 1: Enemy trebuchets fire at player units in range
        const trebuchetActions = this.executeTrebuchetAttacks(gameState, enemyUnits);
        actions.push(...trebuchetActions);

        // Rule 2: Enemy Men-at-Arms attack adjacent player trebuchets
        const infantryActions = this.executeInfantryAttacks(gameState, enemyUnits);
        actions.push(...infantryActions);

        return actions;
    },

    /**
     * Execute trebuchet ranged attacks against player units
     * @param {GameState} gameState - The current game state
     * @param {Array<Unit>} enemyUnits - All enemy units
     * @returns {Array} Array of action results
     */
    executeTrebuchetAttacks(gameState, enemyUnits) {
        const actions = [];

        // Filter to only trebuchets with ammo
        const trebuchets = enemyUnits.filter(unit =>
            unit.typeId === 'trebuchet' &&
            unit.hasAmmo() &&
            unit.strength > 0
        );

        for (const trebuchet of trebuchets) {
            const target = this.findTrebuchetTarget(gameState, trebuchet);
            if (target) {
                // Execute the ranged attack
                const result = this.executeRangedAttack(gameState, trebuchet, target);
                actions.push({
                    type: 'ranged_attack',
                    attacker: trebuchet,
                    defender: target,
                    result: result
                });
            }
        }

        return actions;
    },

    /**
     * Find a valid target for an enemy trebuchet
     * @param {GameState} gameState - The current game state
     * @param {Unit} trebuchet - The enemy trebuchet
     * @returns {Unit|null} Target unit or null if none found
     */
    findTrebuchetTarget(gameState, trebuchet) {
        const unitType = trebuchet.getType();
        const range = unitType.range;

        // Get all hexes within range
        const hexesInRange = gameState.getHexesInRange(trebuchet.hex, range);

        // Find player units in range
        const playerUnits = [];
        for (const hex of hexesInRange) {
            // Skip own hex
            if (hex.equals(trebuchet.hex)) continue;

            // Check for player unit (player 0)
            const unit = gameState.units.getUnitAt(hex);
            if (unit && unit.playerId === 0 && unit.strength > 0) {
                playerUnits.push(unit);
            }
        }

        // If multiple targets, prioritize (for now, just pick the first one)
        // Could add priority logic: wounded units, high-value targets, etc.
        return playerUnits.length > 0 ? playerUnits[0] : null;
    },

    /**
     * Execute a ranged attack for enemy AI
     * @param {GameState} gameState - The current game state
     * @param {Unit} attacker - The attacking trebuchet
     * @param {Unit} defender - The target unit
     * @returns {Object} Battle result
     */
    executeRangedAttack(gameState, attacker, defender) {
        // Get defender terrain
        const defenderCell = gameState.map.getCell(defender.hex);
        const defenderTerrain = defenderCell ? defenderCell.terrain : TerrainType.GRASS;
        const closeTerrain = isCloseTerrain(defenderTerrain);

        // Use ammo
        if (attacker.ammo !== null) {
            attacker.ammo--;
        }

        // Resolve battle (ranged = no return fire)
        const result = resolveBattle(attacker, defender, {
            closeTerrain: closeTerrain,
            rangedAttack: true
        });

        // Apply damage to defender only (ranged attack)
        defender.takeDamage(result.defenderDamage);

        // Experience gain for surviving units
        // Player units (defender) gain prestige when they survive and gain exp
        let defenderExpGain = 0;
        if (!result.defenderDestroyed) {
            defenderExpGain = defender.gainExperience(result.defenderDamage);
            // Player gains prestige from surviving (looting fallen enemies)
            if (defender.playerId === 0) {
                const prestigeGain = RebuildSystem.calculateBattlePrestige(defenderExpGain, false);
                gameState.prestige += prestigeGain;
            }
        }
        if (!result.attackerDestroyed) {
            attacker.gainExperience(0); // Minimal exp for ranged (no risk)
        }

        // Reduce defender entrenchment
        defender.reduceEntrenchment();

        // Remove destroyed units
        if (result.defenderDestroyed) {
            gameState.units.removeUnit(defender.id);
        }

        return result;
    },

    /**
     * Execute infantry attacks against adjacent player trebuchets
     * @param {GameState} gameState - The current game state
     * @param {Array<Unit>} enemyUnits - All enemy units
     * @returns {Array} Array of action results
     */
    executeInfantryAttacks(gameState, enemyUnits) {
        const actions = [];

        // Filter to only infantry (Men-at-Arms)
        const infantry = enemyUnits.filter(unit =>
            unit.typeId === 'infantry' &&
            unit.strength > 0
        );

        for (const unit of infantry) {
            const target = this.findInfantryTarget(gameState, unit);
            if (target) {
                // Execute melee attack
                const result = this.executeMeleeAttack(gameState, unit, target);
                actions.push({
                    type: 'melee_attack',
                    attacker: unit,
                    defender: target,
                    result: result
                });
            }
        }

        return actions;
    },

    /**
     * Find an adjacent player trebuchet to attack
     * @param {GameState} gameState - The current game state
     * @param {Unit} infantry - The enemy infantry unit
     * @returns {Unit|null} Target trebuchet or null if none adjacent
     */
    findInfantryTarget(gameState, infantry) {
        // Check all 6 adjacent hexes
        for (let dir = 0; dir < 6; dir++) {
            const adjacentHex = infantry.hex.neighbor(dir);
            const unit = gameState.units.getUnitAt(adjacentHex);

            // Looking for player trebuchets
            if (unit &&
                unit.playerId === 0 &&
                unit.typeId === 'trebuchet' &&
                unit.strength > 0) {
                return unit;
            }
        }

        return null;
    },

    /**
     * Execute a melee attack for enemy AI
     * @param {GameState} gameState - The current game state
     * @param {Unit} attacker - The attacking infantry
     * @param {Unit} defender - The target unit (trebuchet)
     * @returns {Object} Battle result
     */
    executeMeleeAttack(gameState, attacker, defender) {
        // Get defender terrain
        const defenderCell = gameState.map.getCell(defender.hex);
        const defenderTerrain = defenderCell ? defenderCell.terrain : TerrainType.GRASS;
        const closeTerrain = isCloseTerrain(defenderTerrain);

        // Resolve battle (melee = both take damage)
        const result = resolveBattle(attacker, defender, {
            closeTerrain: closeTerrain
        });

        // Apply damage to both units
        attacker.takeDamage(result.attackerDamage);
        defender.takeDamage(result.defenderDamage);

        // Experience gain for surviving units
        // Player units (defender) gain prestige when they survive and gain exp
        if (!result.attackerDestroyed) {
            attacker.gainExperience(result.attackerDamage);
        }
        let defenderExpGain = 0;
        if (!result.defenderDestroyed) {
            defenderExpGain = defender.gainExperience(result.defenderDamage);
            // Player gains prestige from surviving melee (looting)
            if (defender.playerId === 0) {
                const prestigeGain = RebuildSystem.calculateBattlePrestige(defenderExpGain, false);
                gameState.prestige += prestigeGain;
            }
        }

        // Reduce defender entrenchment
        defender.reduceEntrenchment();

        // Remove destroyed units
        if (result.attackerDestroyed) {
            gameState.units.removeUnit(attacker.id);
        }
        if (result.defenderDestroyed) {
            gameState.units.removeUnit(defender.id);
        }

        return result;
    }
};
