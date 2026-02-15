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
        // Dispatch to horde AI for defense levels
        const level = LevelManager.getLevel(gameState.currentLevel);
        if (level && level.gameMode === 'defense') {
            return this.executeHordeTurn(gameState, level);
        }

        const actions = [];

        // Get all enemy units (player 1)
        const enemyUnits = gameState.units.getPlayerUnits(1);

        // Rule 1: Enemy trebuchets fire at player units in range
        const trebuchetActions = this.executeTrebuchetAttacks(gameState, enemyUnits);
        actions.push(...trebuchetActions);

        // Rule 2: Enemy cavalry charges spotted player units
        const cavalryActions = this.executeCavalryCharges(gameState, enemyUnits);
        actions.push(...cavalryActions);

        // Rule 3: Enemy Men-at-Arms attack adjacent player trebuchets
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
                // Execute melee attack with defensive fire
                const dfActions = this.executeAttackWithDefensiveFire(gameState, unit, target);
                actions.push(...dfActions);
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
     * Execute cavalry charges toward spotted player units
     * Cavalry charges if ANY enemy unit spots a player unit.
     * Cavalry will not move into river hexes, but will attack a unit in the river.
     * @param {GameState} gameState - The current game state
     * @param {Array<Unit>} enemyUnits - All enemy units
     * @returns {Array} Array of action results
     */
    executeCavalryCharges(gameState, enemyUnits) {
        const actions = [];

        // Find all player units spotted by ANY enemy unit
        const spottedPlayerHexKeys = new Set();
        for (const unit of enemyUnits) {
            if (unit.strength <= 0) continue;
            const spotting = unit.getType().spotting;
            const visibleHexes = gameState.getHexesInRange(unit.hex, spotting);
            for (const hex of visibleHexes) {
                const target = gameState.units.getUnitAt(hex);
                if (target && target.playerId === 0 && target.strength > 0) {
                    spottedPlayerHexKeys.add(hex.key);
                }
            }
        }

        if (spottedPlayerHexKeys.size === 0) return actions;

        // Get cavalry units
        const cavalryUnits = enemyUnits.filter(unit =>
            unit.typeId === 'cavalry' &&
            unit.strength > 0
        );

        for (const cav of cavalryUnits) {
            // Find the closest spotted player unit
            const target = this.findCavalryTarget(gameState, cav, spottedPlayerHexKeys);
            if (!target) continue;

            // Check if already adjacent — attack immediately
            const dist = cav.hex.distanceTo(target.hex);
            if (dist === 1) {
                const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, target);
                actions.push(...dfActions);
                continue;
            }

            // Move toward target (avoiding river), then attack if adjacent
            this.moveCavalryToward(gameState, cav, target.hex);
            if (cav.strength > 0) {
                // Check if now adjacent to target (and target still alive)
                const newDist = cav.hex.distanceTo(target.hex);
                if (newDist === 1 && target.strength > 0) {
                    const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, target);
                    actions.push(...dfActions);
                }
            }
        }

        return actions;
    },

    /**
     * Find the closest spotted player unit for cavalry to charge
     * @param {GameState} gameState - The current game state
     * @param {Unit} cavalry - The cavalry unit
     * @param {Set} spottedPlayerHexKeys - Set of hex keys with spotted player units
     * @returns {Unit|null} Target unit or null
     */
    findCavalryTarget(gameState, cavalry, spottedPlayerHexKeys) {
        let bestTarget = null;
        let bestDist = Infinity;

        const allPlayerUnits = gameState.units.getPlayerUnits(0);
        for (const pu of allPlayerUnits) {
            if (pu.strength > 0 && spottedPlayerHexKeys.has(pu.hex.key)) {
                const dist = cavalry.hex.distanceTo(pu.hex);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = pu;
                }
            }
        }

        return bestTarget;
    },

    /**
     * Move cavalry toward a target hex, avoiding river hexes.
     * Uses greedy step-by-step movement up to the unit's movement points.
     * @param {GameState} gameState - The current game state
     * @param {Unit} cavalry - The cavalry unit
     * @param {Hex} targetHex - The hex to move toward
     */
    moveCavalryToward(gameState, cavalry, targetHex) {
        const unitType = cavalry.getType();
        let movementLeft = unitType.movement;

        while (movementLeft > 0) {
            let bestNeighbor = null;
            let bestDist = cavalry.hex.distanceTo(targetHex);
            let bestCost = Infinity;

            for (let dir = 0; dir < 6; dir++) {
                const neighbor = cavalry.hex.neighbor(dir);
                if (!gameState.map.hasCell(neighbor)) continue;

                const cell = gameState.map.getCell(neighbor);
                if (!cell) continue;

                // Never move into river, mountain, or water
                if (cell.terrain === TerrainType.RIVER ||
                    cell.terrain === TerrainType.MOUNTAIN ||
                    cell.terrain === TerrainType.WATER) continue;

                // Check movement cost
                const currentCell = gameState.map.getCell(cavalry.hex);
                const edgeFeature = currentCell.getEdge(dir);
                const moveCost = getMovementCost(cell.terrain, edgeFeature, movementLeft);
                if (moveCost === Infinity || moveCost > movementLeft) continue;

                // Can't move into occupied hex
                const occupant = gameState.units.getUnitAt(neighbor);
                if (occupant) continue;

                // Pick the neighbor that gets closest to target
                const dist = neighbor.distanceTo(targetHex);
                if (dist < bestDist || (dist === bestDist && moveCost < bestCost)) {
                    bestDist = dist;
                    bestNeighbor = neighbor;
                    bestCost = moveCost;
                }
            }

            if (!bestNeighbor) break;

            cavalry.hex = bestNeighbor;
            movementLeft -= bestCost;

            // Stop if adjacent to target
            if (bestDist <= 1) break;
        }
    },

    /**
     * Execute a melee attack for enemy AI
     * @param {GameState} gameState - The current game state
     * @param {Unit} attacker - The attacking unit
     * @param {Unit} defender - The target unit
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
    },

    // ==================== HORDE AI (Defense Mode) ====================

    /**
     * Execute the horde's turn (defense mode)
     * Main loop: rebuild check → trebuchet → cavalry → castle capture → reassignment
     * @param {GameState} gameState - The current game state
     * @param {Object} level - The level definition
     * @returns {Array} Array of action results
     */
    executeHordeTurn(gameState, level) {
        const actions = [];
        const hordeState = gameState.hordeState;
        if (!hordeState) return actions;

        const enemyUnits = gameState.units.getPlayerUnits(1);

        // Phase 1: Rebuild check — heal all surviving units if in rebuild mode
        if (hordeState.rebuildMode) {
            this.processHordeRebuild(gameState, enemyUnits);
            hordeState.rebuildMode = false;
            // During rebuild turn, only full-strength units act
            const fullStrengthUnits = enemyUnits.filter(u => u.strength >= 10);
            // Trebuchets fire if at full strength
            const trebActions = this.executeHordeTrebuchet(gameState, fullStrengthUnits);
            actions.push(...trebActions);
            // Full-strength cavalry act
            const cavActions = this.executeHordeCavalry(gameState, fullStrengthUnits, hordeState, level);
            actions.push(...cavActions);
        } else {
            // Phase 2: Trebuchet fires
            const trebActions = this.executeHordeTrebuchet(gameState, enemyUnits);
            actions.push(...trebActions);

            // Phase 3: Cavalry actions
            const cavActions = this.executeHordeCavalry(gameState, enemyUnits, hordeState, level);
            actions.push(...cavActions);
        }

        // Phase 4: Check for castle captures
        const captureActions = this.checkHordeCastleCaptures(gameState, hordeState, level);
        actions.push(...captureActions);

        return actions;
    },

    /**
     * Rebuild phase: heal all surviving horde units to full strength
     * @param {GameState} gameState
     * @param {Array<Unit>} enemyUnits
     */
    processHordeRebuild(gameState, enemyUnits) {
        for (const unit of enemyUnits) {
            if (unit.strength > 0 && unit.strength < 10) {
                unit.strength = 10;
                console.log(`Horde rebuild: ${unit.typeId} healed to full strength`);
            }
        }
    },

    /**
     * Execute horde trebuchet actions
     * Fires at player units in range, prioritizing castle defenders
     * If no target, moves toward the main cavalry force
     * @param {GameState} gameState
     * @param {Array<Unit>} enemyUnits - Units that can act this turn
     * @returns {Array} Action results
     */
    executeHordeTrebuchet(gameState, enemyUnits) {
        const actions = [];
        const trebuchets = enemyUnits.filter(u =>
            u.typeId === 'trebuchet' && u.strength > 0 && u.hasAmmo()
        );

        for (const treb of trebuchets) {
            // Find targets in range, prioritize castle defenders
            const target = this.findHordeTrebuchetTarget(gameState, treb);
            if (target) {
                const result = this.executeRangedAttack(gameState, treb, target);
                actions.push({
                    type: 'ranged_attack',
                    attacker: treb,
                    defender: target,
                    result: result
                });
            } else {
                // No target — move toward main cavalry force
                this.moveTrebuchetTowardMainForce(gameState, treb, enemyUnits);
            }
        }

        return actions;
    },

    /**
     * Find best target for horde trebuchet, prioritizing units on castles
     * @param {GameState} gameState
     * @param {Unit} trebuchet
     * @returns {Unit|null}
     */
    findHordeTrebuchetTarget(gameState, trebuchet) {
        const range = trebuchet.getType().range;
        const hexesInRange = gameState.getHexesInRange(trebuchet.hex, range);

        let bestTarget = null;
        let bestPriority = -1;

        for (const hex of hexesInRange) {
            if (hex.equals(trebuchet.hex)) continue;
            const unit = gameState.units.getUnitAt(hex);
            if (!unit || unit.playerId !== 0 || unit.strength <= 0) continue;

            // Priority: castle defender > trebuchet > other
            const cell = gameState.map.getCell(hex);
            let priority = 1;
            if (cell && cell.terrain === TerrainType.CASTLE) {
                priority = 3; // Castle defenders are highest priority
            } else if (unit.typeId === 'trebuchet') {
                priority = 2; // Player trebuchets are high priority
            }

            if (priority > bestPriority) {
                bestPriority = priority;
                bestTarget = unit;
            }
        }

        return bestTarget;
    },

    /**
     * Move trebuchet toward the center of the main cavalry force
     * @param {GameState} gameState
     * @param {Unit} trebuchet
     * @param {Array<Unit>} enemyUnits
     */
    moveTrebuchetTowardMainForce(gameState, trebuchet, enemyUnits) {
        // Find the average position of cavalry units
        const cavalry = enemyUnits.filter(u => u.typeId === 'cavalry' && u.strength > 0);
        if (cavalry.length === 0) return;

        let avgQ = 0, avgR = 0;
        for (const cav of cavalry) {
            avgQ += cav.hex.q;
            avgR += cav.hex.r;
        }
        avgQ = Math.round(avgQ / cavalry.length);
        avgR = Math.round(avgR / cavalry.length);

        const targetHex = new Hex(avgQ, avgR);

        // Use greedy movement (same as cavalry but slower)
        const unitType = trebuchet.getType();
        let movementLeft = unitType.movement;

        while (movementLeft > 0) {
            let bestNeighbor = null;
            let bestDist = trebuchet.hex.distanceTo(targetHex);
            let bestCost = Infinity;

            for (let dir = 0; dir < 6; dir++) {
                const neighbor = trebuchet.hex.neighbor(dir);
                if (!gameState.map.hasCell(neighbor)) continue;

                const cell = gameState.map.getCell(neighbor);
                if (!cell) continue;

                // Avoid impassable terrain
                if (cell.terrain === TerrainType.RIVER ||
                    cell.terrain === TerrainType.MOUNTAIN ||
                    cell.terrain === TerrainType.WATER) continue;

                const currentCell = gameState.map.getCell(trebuchet.hex);
                const edgeFeature = currentCell.getEdge(dir);
                const moveCost = getMovementCost(cell.terrain, edgeFeature, movementLeft);
                if (moveCost === Infinity || moveCost > movementLeft) continue;

                const occupant = gameState.units.getUnitAt(neighbor);
                if (occupant) continue;

                const dist = neighbor.distanceTo(targetHex);
                if (dist < bestDist || (dist === bestDist && moveCost < bestCost)) {
                    bestDist = dist;
                    bestNeighbor = neighbor;
                    bestCost = moveCost;
                }
            }

            if (!bestNeighbor) break;
            trebuchet.hex = bestNeighbor;
            movementLeft -= bestCost;
        }
    },

    /**
     * Execute all horde cavalry actions using priority decision tree
     * @param {GameState} gameState
     * @param {Array<Unit>} enemyUnits - Units that can act this turn
     * @param {Object} hordeState - The horde AI state
     * @param {Object} level - The level definition
     * @returns {Array} Action results
     */
    executeHordeCavalry(gameState, enemyUnits, hordeState, level) {
        const actions = [];
        const cavalry = enemyUnits.filter(u =>
            u.typeId === 'cavalry' && u.strength > 0
        );

        for (const cav of cavalry) {
            // Skip garrison units (they stay on captured castles)
            if (hordeState.garrisonUnits && hordeState.garrisonUnits[cav.id]) continue;

            // Get this cavalry's assigned target castle
            const targetCastleKey = hordeState.assignments[cav.id];
            if (!targetCastleKey) continue;

            const parts = targetCastleKey.split(',');
            const targetCastleHex = new Hex(parseInt(parts[0]), parseInt(parts[1]));

            const cavActions = this.executeSingleCavalryTurn(gameState, cav, targetCastleHex);
            actions.push(...cavActions);
        }

        return actions;
    },

    /**
     * Execute a single cavalry unit's turn using priority decision tree:
     * 1. Adjacent to player trebuchet? → Attack
     * 2. Adjacent to castle defender? → Attack
     * 3. Adjacent to player unit on open ground with strength advantage? → Attack
     * 4. Otherwise → Move toward assigned castle, then attack if adjacent after move
     * @param {GameState} gameState
     * @param {Unit} cav - The cavalry unit
     * @param {Hex} targetCastleHex - The castle this unit is heading toward
     * @returns {Array} Action results
     */
    executeSingleCavalryTurn(gameState, cav, targetCastleHex) {
        const actions = [];

        // Priority 1: Attack adjacent player trebuchet (easy kill, high value)
        const adjTrebuchet = this.findAdjacentPlayerUnit(gameState, cav, 'trebuchet');
        if (adjTrebuchet) {
            const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, adjTrebuchet);
            actions.push(...dfActions);
            return actions;
        }

        // Priority 2: Attack adjacent castle defender
        const adjCastleDefender = this.findAdjacentCastleDefender(gameState, cav);
        if (adjCastleDefender) {
            const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, adjCastleDefender);
            actions.push(...dfActions);
            return actions;
        }

        // Priority 3: Attack adjacent player unit on open ground if we have strength advantage
        const adjOpenTarget = this.findAdjacentOpenGroundTarget(gameState, cav);
        if (adjOpenTarget) {
            const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, adjOpenTarget);
            actions.push(...dfActions);
            return actions;
        }

        // Priority 4: Move toward assigned castle
        if (cav.strength > 0) {
            this.moveHordeCavalryToward(gameState, cav, targetCastleHex);

            // After moving, check if adjacent to any attackable target
            if (cav.strength > 0) {
                // Re-check priorities after moving
                const postMoveTreb = this.findAdjacentPlayerUnit(gameState, cav, 'trebuchet');
                if (postMoveTreb) {
                    const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, postMoveTreb);
                    actions.push(...dfActions);
                    return actions;
                }

                const postMoveCastle = this.findAdjacentCastleDefender(gameState, cav);
                if (postMoveCastle) {
                    const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, postMoveCastle);
                    actions.push(...dfActions);
                    return actions;
                }

                const postMoveOpen = this.findAdjacentOpenGroundTarget(gameState, cav);
                if (postMoveOpen) {
                    const dfActions = this.executeAttackWithDefensiveFire(gameState, cav, postMoveOpen);
                    actions.push(...dfActions);
                    return actions;
                }
            }
        }

        return actions;
    },

    /**
     * Find an adjacent player unit of a specific type
     * @param {GameState} gameState
     * @param {Unit} unit - The searching unit
     * @param {string} typeId - The type to look for
     * @returns {Unit|null}
     */
    findAdjacentPlayerUnit(gameState, unit, typeId) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = unit.hex.neighbor(dir);
            const adj = gameState.units.getUnitAt(neighbor);
            if (adj && adj.playerId === 0 && adj.typeId === typeId && adj.strength > 0) {
                return adj;
            }
        }
        return null;
    },

    /**
     * Find an adjacent player unit that is defending a castle
     * @param {GameState} gameState
     * @param {Unit} unit
     * @returns {Unit|null}
     */
    findAdjacentCastleDefender(gameState, unit) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = unit.hex.neighbor(dir);
            const adj = gameState.units.getUnitAt(neighbor);
            if (adj && adj.playerId === 0 && adj.strength > 0) {
                const cell = gameState.map.getCell(neighbor);
                if (cell && cell.terrain === TerrainType.CASTLE) {
                    return adj;
                }
            }
        }
        return null;
    },

    /**
     * Find an adjacent player unit on open ground where cavalry has strength advantage
     * @param {GameState} gameState
     * @param {Unit} cav - The cavalry unit
     * @returns {Unit|null}
     */
    findAdjacentOpenGroundTarget(gameState, cav) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = cav.hex.neighbor(dir);
            const adj = gameState.units.getUnitAt(neighbor);
            if (adj && adj.playerId === 0 && adj.strength > 0) {
                const cell = gameState.map.getCell(neighbor);
                if (cell && !isCloseTerrain(cell.terrain) && cav.strength >= adj.strength) {
                    return adj;
                }
            }
        }
        return null;
    },

    /**
     * Move horde cavalry toward a target hex using greedy pathfinding.
     * Avoids river, mountain, water. Discourages moving adjacent to defenders in close terrain.
     * @param {GameState} gameState
     * @param {Unit} cav - The cavalry unit
     * @param {Hex} targetHex - Destination hex
     */
    moveHordeCavalryToward(gameState, cav, targetHex) {
        const unitType = cav.getType();
        let movementLeft = unitType.movement;

        while (movementLeft > 0) {
            let bestNeighbor = null;
            let bestScore = Infinity;
            let bestCost = Infinity;

            for (let dir = 0; dir < 6; dir++) {
                const neighbor = cav.hex.neighbor(dir);
                if (!gameState.map.hasCell(neighbor)) continue;

                const cell = gameState.map.getCell(neighbor);
                if (!cell) continue;

                // Never move into river, mountain, or water
                if (cell.terrain === TerrainType.RIVER ||
                    cell.terrain === TerrainType.MOUNTAIN ||
                    cell.terrain === TerrainType.WATER) continue;

                const currentCell = gameState.map.getCell(cav.hex);
                const edgeFeature = currentCell.getEdge(dir);
                const moveCost = getMovementCost(cell.terrain, edgeFeature, movementLeft);
                if (moveCost === Infinity || moveCost > movementLeft) continue;

                // Can't move into occupied hex (unless it's the target castle with no defender)
                const occupant = gameState.units.getUnitAt(neighbor);
                if (occupant) continue;

                // Calculate score: distance to target + penalty for adjacent close-terrain defenders
                let score = neighbor.distanceTo(targetHex);

                // Only apply close-terrain penalty when far from target (>3 hexes)
                // At close range, cavalry should charge toward castle regardless
                if (cav.hex.distanceTo(targetHex) > 3) {
                    for (let d2 = 0; d2 < 6; d2++) {
                        const n2 = neighbor.neighbor(d2);
                        const adj = gameState.units.getUnitAt(n2);
                        if (adj && adj.playerId === 0 && adj.strength > 0) {
                            const adjCell = gameState.map.getCell(n2);
                            if (adjCell && isCloseTerrain(adjCell.terrain)) {
                                score += 3; // Heavy penalty for close-terrain defenders
                            }
                        }
                    }
                }

                if (score < bestScore || (score === bestScore && moveCost < bestCost)) {
                    bestScore = score;
                    bestNeighbor = neighbor;
                    bestCost = moveCost;
                }
            }

            if (!bestNeighbor) break;

            // Don't move if it doesn't get us closer (avoid oscillating)
            if (bestScore >= cav.hex.distanceTo(targetHex) + 4) break;

            cav.hex = bestNeighbor;
            movementLeft -= bestCost;

            // Stop if on the target castle
            if (cav.hex.equals(targetHex)) break;

            // Stop if adjacent to target and target is occupied (need to attack)
            if (cav.hex.distanceTo(targetHex) <= 1) {
                const defender = gameState.units.getUnitAt(targetHex);
                if (defender && defender.playerId === 0) break;
            }
        }
    },

    /**
     * Check if any horde cavalry has moved onto an undefended player castle
     * If so: mark castle captured, assign garrison, trigger rebuild
     * @param {GameState} gameState
     * @param {Object} hordeState
     * @param {Object} level
     * @returns {Array} Action results (capture events)
     */
    checkHordeCastleCaptures(gameState, hordeState, level) {
        const actions = [];

        for (const castleKey of gameState.playerCastleKeys) {
            // Skip already-lost castles
            if (gameState.lostCastles.includes(castleKey)) continue;

            const parts = castleKey.split(',');
            const castleHex = new Hex(parseInt(parts[0]), parseInt(parts[1]));

            // Check if an enemy cavalry is on this castle
            const occupant = gameState.units.getUnitAt(castleHex);
            if (!occupant || occupant.playerId !== 1) continue;

            // Check no player unit is also on this castle (shouldn't be possible, but safety check)
            // Castle is captured!
            const captured = gameState.checkEnemyCastleCapture(castleHex);
            if (captured) {
                actions.push({
                    type: 'castle_captured',
                    hex: castleHex,
                    unit: occupant
                });

                // Assign this cavalry as garrison
                if (!hordeState.garrisonUnits) hordeState.garrisonUnits = {};
                hordeState.garrisonUnits[occupant.id] = castleKey;

                // Trigger rebuild mode for next turn
                hordeState.rebuildMode = true;

                // Reassign remaining cavalry to next uncaptured castle
                this.reassignHordeUnits(gameState, hordeState, level);
            }
        }

        return actions;
    },

    /**
     * Reassign horde cavalry that were targeting a captured castle
     * to the next uncaptured player castle
     * @param {GameState} gameState
     * @param {Object} hordeState
     * @param {Object} level
     */
    reassignHordeUnits(gameState, hordeState, level) {
        // Find uncaptured player castles
        const uncapturedCastles = gameState.playerCastleKeys.filter(
            key => !gameState.lostCastles.includes(key)
        );

        if (uncapturedCastles.length === 0) return;

        // Find nearest uncaptured castle for reassignment
        const enemyUnits = gameState.units.getPlayerUnits(1);
        for (const unit of enemyUnits) {
            if (unit.typeId !== 'cavalry' || unit.strength <= 0) continue;
            if (hordeState.garrisonUnits && hordeState.garrisonUnits[unit.id]) continue;

            const currentTarget = hordeState.assignments[unit.id];

            // If current target is captured, reassign
            if (currentTarget && gameState.lostCastles.includes(currentTarget)) {
                // Find nearest uncaptured castle
                let bestCastle = uncapturedCastles[0];
                let bestDist = Infinity;

                for (const castleKey of uncapturedCastles) {
                    const parts = castleKey.split(',');
                    const castleHex = new Hex(parseInt(parts[0]), parseInt(parts[1]));
                    const dist = unit.hex.distanceTo(castleHex);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestCastle = castleKey;
                    }
                }

                hordeState.assignments[unit.id] = bestCastle;
                console.log(`Horde cavalry reassigned to castle ${bestCastle}`);
            }
        }
    },

    /**
     * Find player artillery (ranged units with ammo) adjacent to a defender hex.
     * Used for defensive fire when enemy AI attacks a player unit.
     * @param {GameState} gameState
     * @param {Hex} defenderHex - The hex of the unit being defended
     * @returns {Array<Unit>} Array of player artillery units that can fire defensively
     */
    getPlayerDefensiveArtillery(gameState, defenderHex) {
        const artillery = [];
        for (let dir = 0; dir < 6; dir++) {
            const adjacentHex = defenderHex.neighbor(dir);
            const unit = gameState.units.getUnitAt(adjacentHex);
            if (unit && unit.playerId === 0 &&
                unit.getType().range > 0 && unit.hasAmmo()) {
                artillery.push(unit);
            }
        }
        return artillery;
    },

    /**
     * Execute a melee attack with defensive fire from player artillery.
     * Player trebuchets adjacent to the defender fire at the attacker first,
     * then the melee resolves (if attacker survives).
     * @param {GameState} gameState
     * @param {Unit} attacker - The enemy unit attacking
     * @param {Unit} defender - The player unit being attacked
     * @returns {Array} Array of action results (defensive_fire + melee_attack)
     */
    executeAttackWithDefensiveFire(gameState, attacker, defender) {
        const actions = [];

        // Find player artillery adjacent to the defender
        const defArtillery = this.getPlayerDefensiveArtillery(gameState, defender.hex);

        // Execute defensive fire (each trebuchet fires at the attacker)
        for (const art of defArtillery) {
            if (attacker.isDestroyed()) break;
            const result = this.executeRangedAttack(gameState, art, attacker);
            actions.push({ type: 'defensive_fire', attacker: art, defender: attacker, result });
        }

        // If attacker survived defensive fire, execute melee
        if (!attacker.isDestroyed()) {
            const result = this.executeMeleeAttack(gameState, attacker, defender);
            actions.push({ type: 'melee_attack', attacker, defender, result });
        }

        return actions;
    }
};
