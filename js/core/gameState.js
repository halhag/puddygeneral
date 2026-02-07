/**
 * Game phases
 */
const GamePhase = Object.freeze({
    PLACEMENT: 'placement',
    MOVEMENT: 'movement',
    VICTORY: 'victory',
    DEFEAT: 'defeat'
});

/**
 * Complete game state for save/load
 */
class GameState {
    constructor() {
        this.id = null;
        this.name = 'Untitled';
        this.createdAt = null;
        this.updatedAt = null;
        this.turn = 1;
        this.currentPlayer = 0;
        this.phase = GamePhase.PLACEMENT;
        this.map = null;
        this.units = new UnitManager();
        this.players = [
            { id: 0, name: 'Player 1', faction: 'blue' },
            { id: 1, name: 'Player 2', faction: 'red' }
        ];
        this.selectedHex = null;
        this.selectedUnit = null;
        this.unitsToPlace = 3;          // Units remaining to place
        this.unitTypesToPlace = [];     // Array of unit types to place (e.g., ['infantry', 'infantry', 'trebuchet'])
        this.capturedCastles = [];      // Array of captured castle hex keys
        this.enemyCastleKeys = [];     // Hex keys of enemy castles (only these count for victory)
        this.totalCastles = 3;          // Castles needed to win (enemy castles)
        this.turnLimit = 15;            // Total turns allowed (counts down)
        this.turnsRemaining = 15;       // Turns remaining (starts at turnLimit)
        this.earlyVictoryBonus = 20;    // Prestige per turn remaining on victory
        this.prestige = 150;            // Currency for rebuilding units
        this.settings = {
            fogOfWar: true,     // Fog of war is now ON by default
            showGrid: true,
            showCoordinates: false
        };
        // Current level number (for campaign progression)
        this.currentLevel = 1;
        // Internal cache for movement costs (set by getValidMovementHexes)
        this._movementCosts = new Map();
        // Cache for visible hexes (recalculated when units move)
        this._visibleHexes = new Set();
    }

    // Create a new game with default map
    static create(name = 'New Game', levelId = 1) {
        const state = new GameState();
        state.id = crypto.randomUUID();
        state.name = name;
        state.createdAt = new Date().toISOString();
        state.updatedAt = state.createdAt;
        state.currentLevel = levelId;

        // Get level definition
        const level = LevelManager.getLevel(levelId);
        console.log(`Loading level ${levelId}:`, level ? level.name : 'NOT FOUND');

        if (level) {
            // Create map from level definition (fixed, not random)
            state.map = LevelManager.createMapFromLevel(level);
            state.units = new UnitManager();
            state.phase = GamePhase.PLACEMENT;
            state.unitsToPlace = level.playerUnitsToPlace;
            // IMPORTANT: Create a copy of the array, not a reference, so we don't modify the level definition
            state.unitTypesToPlace = level.playerUnitTypes ? [...level.playerUnitTypes] : Array(level.playerUnitsToPlace).fill('infantry');
            state.totalCastles = level.castlesToCapture;
            state.turnLimit = level.turnLimit || 15;
            state.turnsRemaining = state.turnLimit;
            state.earlyVictoryBonus = level.earlyVictoryBonus || 20;
            state.prestige = level.playerStartingPrestige;
            state.capturedCastles = [];

            // Store enemy castle hex keys so we only count those for victory
            state.enemyCastleKeys = level.castles.enemy.map(pos => {
                const r = LevelManager.vRowToR(pos.q, pos.vRow);
                return new Hex(pos.q, r).key;
            });

            // Place enemy units from level definition
            LevelManager.placeEnemyUnits(state.units, level);

            // Place player's pre-placed units from level definition
            LevelManager.placePlayerUnits(state.units, level);

            // Set initial entrenchment for all units based on terrain
            for (const unit of state.units.getAllUnits()) {
                const cell = state.map.getCell(unit.hex);
                if (cell) {
                    unit.updateEntrenchment(cell.terrain);
                }
            }
        }

        return state;
    }

    // Serialize for LocalStorage
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            turn: this.turn,
            currentPlayer: this.currentPlayer,
            phase: this.phase,
            currentLevel: this.currentLevel,
            map: this.map ? this.map.toJSON() : null,
            units: this.units ? this.units.toJSON() : [],
            players: this.players,
            selectedHex: this.selectedHex ?
                { q: this.selectedHex.q, r: this.selectedHex.r } : null,
            selectedUnit: this.selectedUnit,
            unitsToPlace: this.unitsToPlace,
            unitTypesToPlace: this.unitTypesToPlace,
            capturedCastles: this.capturedCastles,
            enemyCastleKeys: this.enemyCastleKeys,
            totalCastles: this.totalCastles,
            turnLimit: this.turnLimit,
            turnsRemaining: this.turnsRemaining,
            earlyVictoryBonus: this.earlyVictoryBonus,
            prestige: this.prestige,
            settings: this.settings
        };
    }

    // Deserialize from LocalStorage
    static fromJSON(data) {
        const state = new GameState();
        state.id = data.id;
        state.name = data.name;
        state.createdAt = data.createdAt;
        state.updatedAt = data.updatedAt;
        state.turn = data.turn;
        state.currentPlayer = data.currentPlayer;
        state.phase = data.phase;
        state.map = data.map ? HexMap.fromJSON(data.map) : null;
        state.units = UnitManager.fromJSON(data.units);
        state.players = data.players;
        state.selectedHex = data.selectedHex ?
            new Hex(data.selectedHex.q, data.selectedHex.r) : null;
        state.selectedUnit = data.selectedUnit || null;
        state.unitsToPlace = data.unitsToPlace ?? 0;
        state.unitTypesToPlace = data.unitTypesToPlace || [];
        state.capturedCastles = data.capturedCastles || [];
        state.enemyCastleKeys = data.enemyCastleKeys || [];
        state.totalCastles = data.totalCastles ?? 3;
        state.turnLimit = data.turnLimit ?? 15;
        state.turnsRemaining = data.turnsRemaining ?? data.turnLimit ?? 15;
        state.earlyVictoryBonus = data.earlyVictoryBonus ?? 20;
        state.prestige = data.prestige ?? 150;
        state.currentLevel = data.currentLevel ?? 1;
        state.settings = { ...state.settings, ...data.settings };
        return state;
    }

    // Select a hex
    selectHex(hex) {
        if (this.map && this.map.hasCell(hex)) {
            this.selectedHex = hex;
            return true;
        }
        return false;
    }

    // Deselect current hex
    deselectHex() {
        this.selectedHex = null;
    }

    // Toggle a setting
    toggleSetting(key) {
        if (key in this.settings) {
            this.settings[key] = !this.settings[key];
        }
    }

    // Select a unit
    selectUnit(unitId) {
        const unit = this.units.getUnit(unitId);
        if (unit) {
            this.selectedUnit = unitId;
            this.selectedHex = unit.hex;
            return true;
        }
        return false;
    }

    // Deselect current unit
    deselectUnit() {
        this.selectedUnit = null;
    }

    // Get unit at a hex
    getUnitAt(hex) {
        return this.units.getUnitAt(hex);
    }

    // Add a new unit to the game
    addUnit(typeId, playerId, hex) {
        // Check if hex is valid and unoccupied
        if (!this.map || !this.map.hasCell(hex)) {
            return null;
        }
        if (this.units.getUnitAt(hex)) {
            return null;  // Hex already occupied
        }

        const unit = new Unit(typeId, playerId, hex);
        this.units.addUnit(unit);
        return unit;
    }

    // Start a new turn
    nextTurn() {
        // Switch to next player
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;

        // If we've gone through all players, increment turn counter
        if (this.currentPlayer === 0) {
            this.turn++;
        }

        // Reset units for the new player
        this.units.resetTurn(this.currentPlayer);

        // Clear selections
        this.deselectHex();
        this.deselectUnit();

        this.phase = GamePhase.MOVEMENT;
    }

    /**
     * Check if a hex is within the playable area (excludes partially visible edge hexes)
     * @param {Hex} hex
     * @returns {boolean}
     */
    isHexPlayable(hex) {
        // Calculate visual row (used for top/bottom bounds)
        const vRow = hex.q / 2 + hex.r;

        // Exclude:
        // - Rightmost column (q >= 20) as it's partially outside visible area
        // - Top edge hexes (vRow < 0) like (1,-1), (3,-2), (5,-3)
        // - Bottom edge hexes (vRow >= 15) like (0,15), (2,14), (4,13)
        return hex.q < 20 && vRow >= 0 && vRow < 15;
    }

    /**
     * Get valid hexes for unit placement (right edge of map, passable terrain)
     * @returns {Array<Hex>}
     */
    getValidPlacementHexes() {
        if (!this.map) return [];

        const validHexes = [];
        const cells = this.map.getAllCells();

        // Valid placement is in columns 18-19 (rightmost fully visible columns)
        for (const cell of cells) {
            if (cell.hex.q >= 18 && cell.hex.q <= 19) {
                const terrain = getTerrainProperties(cell.terrain);
                // Must be passable and unoccupied
                if (!terrain.impassable && !this.units.getUnitAt(cell.hex)) {
                    validHexes.push(cell.hex);
                }
            }
        }

        return validHexes;
    }

    /**
     * Place a unit during placement phase
     * @param {Hex} hex - Where to place the unit
     * @returns {Unit|null} The placed unit or null if invalid
     */
    placeUnit(hex) {
        if (this.phase !== GamePhase.PLACEMENT) return null;
        if (this.unitsToPlace <= 0) return null;

        const validHexes = this.getValidPlacementHexes();
        const isValid = validHexes.some(h => h.equals(hex));
        if (!isValid) return null;

        // Get the next unit type to place (peek first, don't remove yet)
        const unitType = this.unitTypesToPlace.length > 0
            ? this.unitTypesToPlace[0]
            : 'infantry';

        const unit = this.addUnit(unitType, this.currentPlayer, hex);
        if (unit) {
            // Only remove from array after successful placement
            if (this.unitTypesToPlace.length > 0) {
                this.unitTypesToPlace.shift();
            }
            this.unitsToPlace--;
            // If all units placed, switch to movement phase
            if (this.unitsToPlace <= 0) {
                this.phase = GamePhase.MOVEMENT;
                this.turn = 1;
            }
        }
        return unit;
    }

    /**
     * Get hexes a unit can move to
     * Accounts for zone of control (must stop when entering enemy ZOC)
     * @param {Unit} unit - The unit to check movement for
     * @returns {Array<Hex>} Array of reachable hexes
     */
    getValidMovementHexes(unit) {
        if (!unit || !unit.canMove()) {
            this._movementCosts = new Map();
            return [];
        }

        const reachable = [];
        const visited = new Map(); // hex.key -> { cost, stoppedByZOC }
        const queue = [{ hex: unit.hex, cost: 0, stoppedByZOC: false }];
        visited.set(unit.hex.key, { cost: 0, stoppedByZOC: false });

        while (queue.length > 0) {
            const { hex, cost, stoppedByZOC } = queue.shift();

            // Check all neighbors
            for (let dir = 0; dir < 6; dir++) {
                // If we're stopped by ZOC, we can ONLY attack adjacent enemies
                // We cannot move to other hexes from here
                if (stoppedByZOC) {
                    const neighbor = hex.neighbor(dir);
                    const occupant = this.units.getUnitAt(neighbor);
                    if (occupant && occupant.playerId !== this.currentPlayer) {
                        // Found an adjacent enemy - this is a valid attack target
                        const prev = visited.get(neighbor.key);
                        // Always add to reachable if not already there
                        if (prev === undefined) {
                            visited.set(neighbor.key, { cost: cost + 1, stoppedByZOC: true });
                        }
                        // Add to reachable if not already in the list
                        if (!reachable.some(h => h.equals(neighbor))) {
                            reachable.push(neighbor);
                        }
                    }
                    continue; // Don't process other movement from ZOC hex
                }
                const neighbor = hex.neighbor(dir);
                if (!this.map.hasCell(neighbor)) continue;

                // Exclude hexes outside playable area
                if (!this.isHexPlayable(neighbor)) continue;

                const cell = this.map.getCell(neighbor);
                const terrain = cell.terrain;

                // Get edge feature between current and neighbor
                const currentCell = this.map.getCell(hex);
                const edgeFeature = currentCell.getEdge(dir);

                // Special rule for rivers without bridges:
                // Can only enter if starting adjacent (cost must be 0)
                // This enforces "must use ALL movement" rule
                if (terrain === TerrainType.RIVER && edgeFeature !== EdgeFeature.BRIDGE) {
                    if (cost > 0) continue;
                }

                // Calculate movement cost
                const moveCost = getMovementCost(terrain, edgeFeature, unit.movementRemaining - cost);

                // Check if we can enter
                if (moveCost === Infinity) continue;

                const totalCost = cost + moveCost;
                if (totalCost > unit.movementRemaining) continue;

                // Check if occupied by another unit
                const occupant = this.units.getUnitAt(neighbor);
                if (occupant) {
                    // Can't move into friendly units
                    if (occupant.playerId === this.currentPlayer) {
                        continue;
                    }
                    // Enemy unit: allow as destination (clicking = attack intent)
                    // But can't path THROUGH enemy hex, so mark as stopped and don't explore further
                    const prev = visited.get(neighbor.key);
                    if (prev === undefined || totalCost < prev.cost) {
                        visited.set(neighbor.key, { cost: totalCost, stoppedByZOC: true });
                        // DON'T add to queue - can't move through enemy
                        if (!neighbor.equals(unit.hex)) {
                            reachable.push(neighbor);
                        }
                    }
                    continue;
                }

                // Check if this hex enters enemy zone of control (visible enemies only)
                const entersZOC = this.isInEnemyZOC(neighbor);

                // Check if we found a better path
                const prev = visited.get(neighbor.key);
                if (prev === undefined || totalCost < prev.cost) {
                    visited.set(neighbor.key, { cost: totalCost, stoppedByZOC: entersZOC });
                    queue.push({ hex: neighbor, cost: totalCost, stoppedByZOC: entersZOC });
                    if (!neighbor.equals(unit.hex)) {
                        reachable.push(neighbor);
                    }
                }
            }
        }

        // Cache movement costs for use by moveUnit (just the costs)
        this._movementCosts = new Map();
        for (const [key, data] of visited) {
            this._movementCosts.set(key, data.cost);
        }

        return reachable;
    }

    /**
     * Move a unit to a new hex
     * Battle only triggers when clicking on enemy's hex (visible or hidden)
     * @param {Unit} unit - The unit to move
     * @param {Hex} targetHex - Destination hex
     * @returns {Object} Result: { success, battleTriggered, enemyUnit, actualHex, stoppedByHiddenZOC }
     */
    moveUnit(unit, targetHex) {
        if (!unit || !unit.canMove()) {
            return { success: false, battleTriggered: false, enemyUnit: null, actualHex: null };
        }

        // Get valid moves (this also caches movement costs)
        const validMoves = this.getValidMovementHexes(unit);
        const isValid = validMoves.some(h => h.equals(targetHex));
        if (!isValid) {
            return { success: false, battleTriggered: false, enemyUnit: null, actualHex: null };
        }

        // Check for enemy at target hex (visible or hidden)
        // This is the ONLY way battle is triggered - clicking on enemy's hex
        const enemyAtTarget = this.units.getUnitAt(targetHex);
        if (enemyAtTarget && enemyAtTarget.playerId !== this.currentPlayer) {
            // Check if enemy was visible BEFORE we move (for surprise attack detection)
            // If enemy hex was not visible to any of our units, it's a surprise attack
            const enemyWasVisible = this.isHexVisible(targetHex);

            // Player clicked on enemy's hex = attack intent
            // Unit stops adjacent to enemy, then battle commences
            const stopHex = this.findStopHexBeforeEnemy(unit, targetHex);
            if (stopHex) {
                const moveCost = this._movementCosts.get(stopHex.key);
                unit.hex = stopHex;
                unit.useMovement(moveCost, stopHex);
                this.updateVisibility();

                // Check for river attack penalty
                // Attacker on river attacking someone NOT on river = disadvantage
                const attackerCell = this.map.getCell(stopHex);
                const defenderCell = this.map.getCell(targetHex);
                const attackerOnRiver = attackerCell && attackerCell.terrain === TerrainType.RIVER;
                const defenderOnRiver = defenderCell && defenderCell.terrain === TerrainType.RIVER;
                const riverAttack = attackerOnRiver && !defenderOnRiver;

                // Get defender terrain for close defense calculation
                const defenderTerrain = defenderCell ? defenderCell.terrain : TerrainType.GRASS;

                return {
                    success: true,
                    battleTriggered: true,
                    enemyUnit: enemyAtTarget,
                    actualHex: stopHex,
                    surpriseAttack: !enemyWasVisible,
                    riverAttack: riverAttack,
                    defenderTerrain: defenderTerrain
                };
            } else {
                // Can't find a valid stop hex (shouldn't happen normally)
                return { success: false, battleTriggered: false, enemyUnit: null, actualHex: null };
            }
        }

        // Get the cached path cost (calculated by getValidMovementHexes)
        const moveCost = this._movementCosts ? this._movementCosts.get(targetHex.key) : null;

        if (moveCost === null || moveCost === undefined) {
            console.error('Movement cost not found for target hex');
            return { success: false, battleTriggered: false, enemyUnit: null, actualHex: null };
        }

        // Reconstruct path and check for hidden enemy ZoC
        const path = this.reconstructPath(unit.hex, targetHex);
        let actualDestination = targetHex;
        let stoppedByHiddenZOC = false;

        // Walk the path and stop if we enter hidden enemy ZoC
        for (let i = 1; i < path.length; i++) {
            const pathHex = path[i];
            // Check if this hex is in ZoC of a hidden enemy
            if (this.isInHiddenEnemyZOC(pathHex)) {
                // Stop at this hex
                actualDestination = pathHex;
                stoppedByHiddenZOC = true;
                console.log(`Unit stopped at hidden enemy ZoC at (${pathHex.q}, ${pathHex.r})`);
                break;
            }
        }

        // Get actual movement cost for where we stopped
        const actualMoveCost = this._movementCosts.get(actualDestination.key);

        // Move the unit to actual destination
        unit.hex = actualDestination;
        unit.useMovement(actualMoveCost, actualDestination);

        // Update visibility after movement
        this.updateVisibility();

        // If unit is now in enemy ZoC, they can't move further
        // Zero out remaining movement so they show as "done" (checkmark, not yellow dot)
        if (this.isInAnyEnemyZOCIncludingHidden(actualDestination)) {
            unit.movementRemaining = 0;
        }

        // NOTE: Moving into ZOC does NOT trigger battle - only clicking on enemy hex does
        // Unit simply stops in ZOC (handled by getValidMovementHexes preventing further movement)

        // Check if unit moved onto a castle
        this.checkCastleCapture(actualDestination);

        return {
            success: true,
            battleTriggered: false,
            enemyUnit: null,
            actualHex: actualDestination,
            stoppedByHiddenZOC: stoppedByHiddenZOC
        };
    }

    /**
     * Reconstruct the path from start to target using cached movement costs
     * Uses a simple backtracking approach from target to start
     */
    reconstructPath(startHex, targetHex) {
        const path = [targetHex];
        let current = targetHex;

        while (!current.equals(startHex)) {
            const currentCost = this._movementCosts.get(current.key);
            let bestNeighbor = null;
            let bestCost = currentCost;

            // Find neighbor with lower cost that leads back to start
            for (let dir = 0; dir < 6; dir++) {
                const neighbor = current.neighbor(dir);
                const neighborCost = this._movementCosts.get(neighbor.key);

                if (neighborCost !== undefined && neighborCost < bestCost) {
                    bestCost = neighborCost;
                    bestNeighbor = neighbor;
                }
            }

            if (bestNeighbor) {
                path.unshift(bestNeighbor);
                current = bestNeighbor;
            } else {
                // Couldn't find path back (shouldn't happen)
                break;
            }
        }

        return path;
    }

    /**
     * Check if hex is in ZoC of a HIDDEN enemy only
     * @param {Hex} hex - The hex to check
     * @returns {boolean}
     */
    isInHiddenEnemyZOC(hex) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = hex.neighbor(dir);
            const unit = this.units.getUnitAt(neighbor);
            if (unit && unit.playerId !== this.currentPlayer) {
                // Only count if this enemy is NOT visible
                if (!this.isHexVisible(neighbor)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Find a hex adjacent to the enemy where the unit can stop
     * Used when encountering a hidden enemy
     * @param {Unit} unit - The moving unit
     * @param {Hex} enemyHex - The hex with the hidden enemy
     * @returns {Hex|null} The hex to stop at, or null if none found
     */
    findStopHexBeforeEnemy(unit, enemyHex) {
        let bestHex = null;
        let bestCost = Infinity;

        // Check all hexes adjacent to the enemy
        for (let dir = 0; dir < 6; dir++) {
            const adjacentHex = enemyHex.neighbor(dir);

            // Must be a valid move target (in our cached costs)
            const cost = this._movementCosts.get(adjacentHex.key);
            if (cost === undefined) continue;

            // Must not be occupied
            const occupant = this.units.getUnitAt(adjacentHex);
            if (occupant && !occupant.hex.equals(unit.hex)) continue;

            // Must be closer to our starting position (prefer lower cost)
            if (cost < bestCost) {
                bestCost = cost;
                bestHex = adjacentHex;
            }
        }

        return bestHex;
    }

    /**
     * Check if a castle was captured and update state
     * @param {Hex} hex - The hex to check
     */
    checkCastleCapture(hex) {
        const cell = this.map.getCell(hex);
        if (!cell || cell.terrain !== TerrainType.CASTLE) return;

        const key = hex.key;
        // Only count enemy castles toward victory
        if (!this.enemyCastleKeys.includes(key)) return;

        if (!this.capturedCastles.includes(key)) {
            this.capturedCastles.push(key);

            // Gain prestige for capturing castle
            this.prestige += 50;
            console.log(`Castle captured! +50 prestige (${this.capturedCastles.length}/${this.totalCastles})`);

            // Check victory
            if (this.capturedCastles.length >= this.totalCastles) {
                // Award early victory bonus
                const bonus = this.turnsRemaining * this.earlyVictoryBonus;
                this.prestige += bonus;
                console.log(`Early victory bonus: ${this.turnsRemaining} turns × ${this.earlyVictoryBonus} = +${bonus} prestige`);

                this.phase = GamePhase.VICTORY;
                console.log('VICTORY! All castles captured!');
            }
        }
    }

    /**
     * Check if a castle is captured
     * @param {Hex} hex - The castle hex to check
     * @returns {boolean}
     */
    isCastleCaptured(hex) {
        return this.capturedCastles.includes(hex.key);
    }

    /**
     * End the current turn manually
     */
    endTurn() {
        // Update entrenchment for all units before ending turn
        // Units in enemy ZOC cannot build entrenchment
        this.updateAllEntrenchments();

        // Decrement turns remaining (countdown)
        this.turnsRemaining--;
        this.turn++;  // Keep track of current turn number for display

        // Check for defeat (ran out of turns)
        if (this.turnsRemaining <= 0 && this.phase === GamePhase.MOVEMENT) {
            this.phase = GamePhase.DEFEAT;
            console.log('DEFEAT! Ran out of turns!');
        }

        this.deselectHex();
        this.deselectUnit();

        // Recalculate visibility for the current player
        this.updateVisibility();
    }

    /**
     * Update entrenchment for all units
     * Units in enemy ZOC cannot gain entrenchment (can't build when enemy is watching)
     */
    updateAllEntrenchments() {
        for (const unit of this.units.getAllUnits()) {
            // Check if this unit is in ZOC of any enemy
            const inEnemyZOC = this.isUnitInAnyEnemyZOC(unit);

            if (inEnemyZOC) {
                // Can't build entrenchment when in enemy ZOC
                // Reset stationary counter since they can't dig in
                unit.turnsStationary = 0;
            } else {
                // Update entrenchment based on terrain and time stationary
                const cell = this.map.getCell(unit.hex);
                if (cell) {
                    unit.updateEntrenchment(cell.terrain);
                }
            }
        }
    }

    /**
     * Check if a unit is in ZOC of any enemy unit (regardless of visibility)
     * Used for entrenchment calculation - can't dig in when enemies are adjacent
     * @param {Unit} unit - The unit to check
     * @returns {boolean}
     */
    isUnitInAnyEnemyZOC(unit) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = unit.hex.neighbor(dir);
            const adjacentUnit = this.units.getUnitAt(neighbor);
            if (adjacentUnit && adjacentUnit.playerId !== unit.playerId) {
                return true;
            }
        }
        return false;
    }

    // ==================== RANGED ATTACK ====================

    /**
     * Check if a unit can perform a ranged attack
     * Requires: range > 0, has ammo, hasn't moved, hasn't attacked
     * @param {Unit} unit - The unit to check
     * @returns {boolean}
     */
    canRangedAttack(unit) {
        if (!unit) return false;
        const unitType = unit.getType();
        return unitType.range > 0 &&
               !unit.hasMoved &&
               unit.hasAmmo() &&
               !unit.hasAttacked;
    }

    /**
     * Get valid ranged attack targets for a unit
     * Returns enemy hexes within unit's range that are visible
     * @param {Unit} unit - The ranged unit
     * @returns {Array<Hex>} Array of valid target hexes
     */
    getValidRangedTargets(unit) {
        if (!this.canRangedAttack(unit)) return [];

        const unitType = unit.getType();
        const range = unitType.range;
        const targets = [];

        // Get all hexes within range
        const hexesInRange = this.getHexesInRange(unit.hex, range);

        for (const hex of hexesInRange) {
            // Skip own hex
            if (hex.equals(unit.hex)) continue;

            // Must be visible
            if (!this.isHexVisible(hex)) continue;

            // Must have enemy unit
            const targetUnit = this.units.getUnitAt(hex);
            if (targetUnit && targetUnit.playerId !== this.currentPlayer) {
                targets.push(hex);
            }
        }

        return targets;
    }

    /**
     * Perform a ranged attack
     * @param {Unit} attacker - The attacking ranged unit
     * @param {Unit} defender - The defending unit
     * @returns {Object} Result with defender terrain info
     */
    executeRangedAttack(attacker, defender) {
        if (!this.canRangedAttack(attacker)) {
            return { success: false };
        }

        const defenderCell = this.map.getCell(defender.hex);
        const defenderTerrain = defenderCell ? defenderCell.terrain : TerrainType.GRASS;

        // Mark unit as having attacked (uses all movement and ammo)
        attacker.performAttack();

        return {
            success: true,
            defenderTerrain: defenderTerrain
        };
    }

    // ==================== DEFENSIVE FIRE ====================

    /**
     * Get enemy artillery units that can provide defensive fire
     * These are enemy ranged units adjacent to the defender (in defender's ZoC)
     * @param {Hex} defenderHex - The hex being defended
     * @returns {Array<Unit>} Array of enemy artillery units that will fire
     */
    getDefensiveArtillery(defenderHex) {
        const artillery = [];

        // Check all hexes adjacent to defender
        for (let dir = 0; dir < 6; dir++) {
            const adjacentHex = defenderHex.neighbor(dir);
            const unit = this.units.getUnitAt(adjacentHex);

            // Must be enemy unit with range > 0 and ammo
            if (unit &&
                unit.playerId !== this.currentPlayer &&
                unit.getType().range > 0 &&
                unit.hasAmmo()) {
                artillery.push(unit);
            }
        }

        return artillery;
    }

    /**
     * Execute defensive fire from artillery
     * Artillery fires at attacker, using ammo but taking no damage
     * @param {Unit} artillery - The artillery unit providing defensive fire
     * @param {Unit} attacker - The attacking unit being fired upon
     * @returns {Object} Result with terrain info
     */
    executeDefensiveFire(artillery, attacker) {
        if (!artillery.hasAmmo()) {
            return { success: false };
        }

        const attackerCell = this.map.getCell(attacker.hex);
        const attackerTerrain = attackerCell ? attackerCell.terrain : TerrainType.GRASS;

        // Use 1 ammo (but don't mark as attacked - defensive fire is free action)
        if (artillery.ammo !== null) {
            artillery.ammo--;
        }

        return {
            success: true,
            defenderTerrain: attackerTerrain  // Attacker is the "defender" of defensive fire
        };
    }

    // ==================== FOG OF WAR ====================

    /**
     * Update visibility based on current player's units
     * Each unit can see hexes within their spotting range
     */
    updateVisibility() {
        this._visibleHexes = new Set();

        const playerUnits = this.units.getPlayerUnits(this.currentPlayer);
        for (const unit of playerUnits) {
            const spotting = unit.getType().spotting;
            const visibleFromUnit = this.getHexesInRange(unit.hex, spotting);
            for (const hex of visibleFromUnit) {
                this._visibleHexes.add(hex.key);
            }
        }
    }

    /**
     * Get all hexes within a certain range of a center hex
     * @param {Hex} center - The center hex
     * @param {number} range - The range in hexes
     * @returns {Array<Hex>} Array of hexes within range
     */
    getHexesInRange(center, range) {
        const hexes = [center];
        const visited = new Set([center.key]);

        let frontier = [center];
        for (let r = 0; r < range; r++) {
            const nextFrontier = [];
            for (const hex of frontier) {
                for (let dir = 0; dir < 6; dir++) {
                    const neighbor = hex.neighbor(dir);
                    if (!visited.has(neighbor.key) && this.map.hasCell(neighbor)) {
                        visited.add(neighbor.key);
                        hexes.push(neighbor);
                        nextFrontier.push(neighbor);
                    }
                }
            }
            frontier = nextFrontier;
        }

        return hexes;
    }

    /**
     * Check if a hex is visible to the current player
     * @param {Hex} hex - The hex to check
     * @returns {boolean}
     */
    isHexVisible(hex) {
        if (!this.settings.fogOfWar) return true;
        return this._visibleHexes.has(hex.key);
    }

    /**
     * Check if an enemy unit at a hex is visible to the current player
     * @param {Hex} hex - The hex to check
     * @returns {boolean}
     */
    isEnemyVisible(hex) {
        return this.isHexVisible(hex);
    }

    // ==================== ZONE OF CONTROL ====================

    /**
     * Check if a hex is in an enemy's zone of control (adjacent to VISIBLE enemy unit)
     * Hidden enemies don't project ZOC - you can't know about them!
     * @param {Hex} hex - The hex to check
     * @returns {boolean}
     */
    isInEnemyZOC(hex) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = hex.neighbor(dir);
            const unit = this.units.getUnitAt(neighbor);
            if (unit && unit.playerId !== this.currentPlayer) {
                // Only VISIBLE enemies create ZOC for display purposes
                if (this.isHexVisible(neighbor)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if hex is in zone of control of ANY enemy (including hidden)
     * Used during actual movement to stop units at hidden ZoC
     * @param {Hex} hex - The hex to check
     * @returns {boolean}
     */
    isInAnyEnemyZOCIncludingHidden(hex) {
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = hex.neighbor(dir);
            const unit = this.units.getUnitAt(neighbor);
            if (unit && unit.playerId !== this.currentPlayer) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get enemy units adjacent to a hex
     * @param {Hex} hex - The hex to check
     * @returns {Array<Unit>} Array of adjacent enemy units
     */
    getAdjacentEnemies(hex) {
        const enemies = [];
        for (let dir = 0; dir < 6; dir++) {
            const neighbor = hex.neighbor(dir);
            const unit = this.units.getUnitAt(neighbor);
            if (unit && unit.playerId !== this.currentPlayer) {
                enemies.push(unit);
            }
        }
        return enemies;
    }

    /**
     * Check if a hex contains a visible enemy unit
     * @param {Hex} hex - The hex to check
     * @returns {Unit|null} The enemy unit if visible, null otherwise
     */
    getVisibleEnemyAt(hex) {
        const unit = this.units.getUnitAt(hex);
        if (unit && unit.playerId !== this.currentPlayer && this.isEnemyVisible(hex)) {
            return unit;
        }
        return null;
    }
}
