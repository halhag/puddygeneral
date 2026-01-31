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
            fogOfWar: false,
            showGrid: true,
            showCoordinates: false
        };
        // Internal cache for movement costs (set by getValidMovementHexes)
        this._movementCosts = new Map();
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
     * @param {Unit} unit - The unit to check movement for
     * @returns {Array<Hex>} Array of reachable hexes
     */
    getValidMovementHexes(unit) {
        if (!unit || !unit.canMove()) {
            this._movementCosts = new Map();
            return [];
        }

        const reachable = [];
        const visited = new Map(); // hex.key -> cost to reach
        const queue = [{ hex: unit.hex, cost: 0 }];
        visited.set(unit.hex.key, 0);

        while (queue.length > 0) {
            const { hex, cost } = queue.shift();

            // Check all neighbors
            for (let dir = 0; dir < 6; dir++) {
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
                if (occupant) continue;

                // Check if we found a better path
                const prevCost = visited.get(neighbor.key);
                if (prevCost === undefined || totalCost < prevCost) {
                    visited.set(neighbor.key, totalCost);
                    queue.push({ hex: neighbor, cost: totalCost });
                    if (!neighbor.equals(unit.hex)) {
                        reachable.push(neighbor);
                    }
                }
            }
        }

        // Cache movement costs for use by moveUnit
        this._movementCosts = visited;

        return reachable;
    }

    /**
     * Move a unit to a new hex
     * @param {Unit} unit - The unit to move
     * @param {Hex} targetHex - Destination hex
     * @returns {boolean} True if move succeeded
     */
    moveUnit(unit, targetHex) {
        if (!unit || !unit.canMove()) return false;

        // Get valid moves (this also caches movement costs)
        const validMoves = this.getValidMovementHexes(unit);
        const isValid = validMoves.some(h => h.equals(targetHex));
        if (!isValid) return false;

        // Get the cached path cost (calculated by getValidMovementHexes)
        const moveCost = this._movementCosts ? this._movementCosts.get(targetHex.key) : null;

        if (moveCost === null || moveCost === undefined) {
            console.error('Movement cost not found for target hex');
            return false;
        }

        // Move the unit
        unit.hex = targetHex;
        unit.useMovement(moveCost);

        // Check if unit moved onto a castle
        this.checkCastleCapture(targetHex);

        return true;
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
        // Reset all player units for next turn
        this.units.resetTurn(this.currentPlayer);
        this.turn++;
        this.deselectHex();
        this.deselectUnit();
    }
}
