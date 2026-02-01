/**
 * Game phases
 */
const GamePhase = Object.freeze({
    PLACEMENT: 'placement',
    MOVEMENT: 'movement',
    VICTORY: 'victory'
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
        this.capturedCastles = [];      // Array of captured castle hex keys
        this.totalCastles = 3;          // Castles needed to win (enemy castles)
        this.settings = {
            fogOfWar: true,     // Fog of war is now ON by default
            showGrid: true,
            showCoordinates: false
        };
        // Internal cache for movement costs (set by getValidMovementHexes)
        this._movementCosts = new Map();
        // Cache for visible hexes (recalculated when units move)
        this._visibleHexes = new Set();
    }

    // Create a new game with default map
    static create(name = 'New Game') {
        const state = new GameState();
        state.id = crypto.randomUUID();
        state.name = name;
        state.createdAt = new Date().toISOString();
        state.updatedAt = state.createdAt;
        state.map = createDefaultMap();
        state.units = new UnitManager();
        state.phase = GamePhase.PLACEMENT;
        state.unitsToPlace = 3;
        state.capturedCastles = [];

        // Place enemy units in the 3 enemy castles (left side of map)
        state.placeEnemyUnits();

        // Place a player trebuchet for testing ranged attacks
        // Position on right side of map (q=17, vRow=7)
        const playerTrebuchetPos = { q: 17, vRow: 7 };
        const playerTrebuchetR = playerTrebuchetPos.vRow - Math.floor(playerTrebuchetPos.q / 2);
        const playerTrebuchetHex = new Hex(playerTrebuchetPos.q, playerTrebuchetR);
        const playerTrebuchet = new Unit('trebuchet', 0, playerTrebuchetHex);
        state.units.addUnit(playerTrebuchet);

        return state;
    }

    /**
     * Place enemy units in their starting castles
     * Enemy castles are on the left side of the map
     */
    placeEnemyUnits() {
        // Enemy castle positions (q, vRow) - convert to axial
        const enemyCastles = [
            { q: 2, vRow: 2 },      // Top-left castle
            { q: 10, vRow: 7 },     // Center castle
            { q: 3, vRow: 13 }      // Bottom-left castle
        ];

        // Add an enemy near the river for testing river attacks
        // Position q=6, vRow=8 is adjacent to river at q=7, vRow=8
        const riverTestPos = { q: 6, vRow: 8 };
        const riverTestR = riverTestPos.vRow - Math.floor(riverTestPos.q / 2);
        const riverTestHex = new Hex(riverTestPos.q, riverTestR);
        const riverTestUnit = new Unit('infantry', 1, riverTestHex);
        this.units.addUnit(riverTestUnit);

        // Add enemy trebuchet near center castle for testing defensive fire
        // Position adjacent to center castle (q=11, vRow=7)
        const trebuchetPos = { q: 11, vRow: 7 };
        const trebuchetR = trebuchetPos.vRow - Math.floor(trebuchetPos.q / 2);
        const trebuchetHex = new Hex(trebuchetPos.q, trebuchetR);
        const trebuchetUnit = new Unit('trebuchet', 1, trebuchetHex);
        this.units.addUnit(trebuchetUnit);

        for (const pos of enemyCastles) {
            // Convert visual row to axial r: r = vRow - floor(q/2)
            const r = pos.vRow - Math.floor(pos.q / 2);
            const hex = new Hex(pos.q, r);

            // Create enemy infantry (player 1 = enemy/red)
            const unit = new Unit('infantry', 1, hex);
            this.units.addUnit(unit);

            // Set initial entrenchment based on terrain (castle = 3 minimum)
            const cell = this.map.getCell(hex);
            if (cell) {
                unit.updateEntrenchment(cell.terrain);
            }
        }
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
            map: this.map ? this.map.toJSON() : null,
            units: this.units ? this.units.toJSON() : [],
            players: this.players,
            selectedHex: this.selectedHex ?
                { q: this.selectedHex.q, r: this.selectedHex.r } : null,
            selectedUnit: this.selectedUnit,
            unitsToPlace: this.unitsToPlace,
            capturedCastles: this.capturedCastles,
            totalCastles: this.totalCastles,
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
        state.capturedCastles = data.capturedCastles || [];
        state.totalCastles = data.totalCastles ?? 3;
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

        const unit = this.addUnit('infantry', this.currentPlayer, hex);
        if (unit) {
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
     * @returns {Object} Result: { success, battleTriggered, enemyUnit, actualHex }
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

        // Move the unit to target (no battle - just movement)
        unit.hex = targetHex;
        unit.useMovement(moveCost, targetHex);

        // Update visibility after movement
        this.updateVisibility();

        // NOTE: Moving into ZOC does NOT trigger battle - only clicking on enemy hex does
        // Unit simply stops in ZOC (handled by getValidMovementHexes preventing further movement)

        // Check if unit moved onto a castle
        this.checkCastleCapture(targetHex);

        return { success: true, battleTriggered: false, enemyUnit: null, actualHex: targetHex };
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
        if (!this.capturedCastles.includes(key)) {
            this.capturedCastles.push(key);
            console.log(`Castle captured! (${this.capturedCastles.length}/${this.totalCastles})`);

            // Check victory
            if (this.capturedCastles.length >= this.totalCastles) {
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
        // Update entrenchment for all units before resetting turn
        // Units in enemy ZOC cannot build entrenchment
        this.updateAllEntrenchments();

        // Reset all player units for next turn
        this.units.resetTurn(this.currentPlayer);
        this.turn++;
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
                // Only VISIBLE enemies create ZOC
                if (this.isHexVisible(neighbor)) {
                    return true;
                }
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
