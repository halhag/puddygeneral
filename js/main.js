/**
 * Main entry point - initializes the game
 */

// Global game instance
let game = null;

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.infoPanel = document.getElementById('hex-info');
        this.turnDisplay = document.getElementById('turn-display');

        // Set canvas size
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;

        // Create hex layout
        this.layout = new HexLayout(CONFIG.HEX_SIZE, {
            x: CONFIG.MAP_OFFSET_X,
            y: CONFIG.MAP_OFFSET_Y
        });

        // Create renderer
        this.renderer = new MapRenderer(this.canvas, this.layout);

        // Game state
        this.gameState = null;

        // Auto-save timer
        this.autoSaveTimer = null;

        // Initialize
        this.init();
    }

    init() {
        // Try to load existing game or create new one
        this.gameState = GameStorage.loadCurrentGame();

        if (!this.gameState) {
            this.gameState = GameState.create('Medieval Conquest');
            GameStorage.saveGame(this.gameState);
        }

        // Set up event listeners
        this.setupEventListeners();

        // Start auto-save
        this.startAutoSave();

        // Initialize visibility for fog of war
        this.gameState.updateVisibility();

        // Update highlights based on game phase
        this.updateHighlights();

        // Initial render
        this.render();

        this.logGameState();
    }

    logGameState() {
        console.log('Game initialized');
        console.log(`Phase: ${this.gameState.phase}`);
        if (this.gameState.phase === GamePhase.PLACEMENT) {
            console.log(`Units to place: ${this.gameState.unitsToPlace}`);
            console.log('Click on highlighted hexes (right side) to place your Men-at-Arms');
        } else {
            console.log(`Turn: ${this.gameState.turn}`);
            console.log(`Castles captured: ${this.gameState.capturedCastles.length}/${this.gameState.totalCastles}`);
        }
    }

    setupEventListeners() {
        // Mouse move for hover effect
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Mouse click for selection/placement/movement
        this.canvas.addEventListener('click', (e) => this.handleClick(e));

        // Mouse leave to clear hover
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Sidebar buttons
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.newGame('Medieval Conquest'));
        }

        const toggleGridBtn = document.getElementById('toggle-grid-btn');
        if (toggleGridBtn) {
            toggleGridBtn.addEventListener('click', () => {
                this.gameState.toggleSetting('showGrid');
                this.render();
            });
        }

        const toggleCoordsBtn = document.getElementById('toggle-coords-btn');
        if (toggleCoordsBtn) {
            toggleCoordsBtn.addEventListener('click', () => {
                this.gameState.toggleSetting('showCoordinates');
                this.render();
            });
        }

        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.addEventListener('click', () => {
                if (this.gameState.phase === GamePhase.MOVEMENT) {
                    this.endTurn();
                }
            });
        }
    }

    handleMouseMove(event) {
        const point = this.renderer.getCanvasCoords(event);
        const hex = this.renderer.getHexAtPoint(point);

        // Check if hex exists on map
        if (this.gameState.map.hasCell(hex)) {
            this.renderer.setHoveredHex(hex);
            this.updateInfoPanel(hex);
        } else {
            this.renderer.setHoveredHex(null);
            this.infoPanel.textContent = 'Hover over a hex';
        }

        this.render();
    }

    handleClick(event) {
        const point = this.renderer.getCanvasCoords(event);
        const hex = this.renderer.getHexAtPoint(point);

        if (!this.gameState.map.hasCell(hex)) return;

        switch (this.gameState.phase) {
            case GamePhase.PLACEMENT:
                this.handlePlacementClick(hex);
                break;
            case GamePhase.MOVEMENT:
                this.handleMovementClick(hex);
                break;
            case GamePhase.VICTORY:
                // Game over, do nothing or show message
                console.log('Game over! Start a new game.');
                break;
        }

        this.render();
    }

    handlePlacementClick(hex) {
        const unit = this.gameState.placeUnit(hex);
        if (unit) {
            console.log(`Placed ${unit.getName()} at (${hex.q}, ${hex.r})`);
            console.log(`Units remaining: ${this.gameState.unitsToPlace}`);

            // Update visibility after placing unit
            this.gameState.updateVisibility();

            if (this.gameState.phase === GamePhase.MOVEMENT) {
                console.log('All units placed! Movement phase begins.');
                console.log('Click on a unit to select it, then click on a highlighted hex to move.');
            }

            this.updateHighlights();
        }
    }

    handleMovementClick(hex) {
        const clickedUnit = this.gameState.getUnitAt(hex);

        // If we have a selected unit
        if (this.gameState.selectedUnit) {
            const selectedUnit = this.gameState.units.getUnit(this.gameState.selectedUnit);

            // If clicking on the same unit, deselect
            if (clickedUnit && clickedUnit.id === this.gameState.selectedUnit) {
                this.gameState.deselectUnit();
                this.gameState.deselectHex();
                this.updateHighlights();
                return;
            }

            // If clicking on a valid movement hex, move there
            const validMoves = this.gameState.getValidMovementHexes(selectedUnit);
            const isValidMove = validMoves.some(h => h.equals(hex));

            if (isValidMove) {
                const result = this.gameState.moveUnit(selectedUnit, hex);
                if (result.success) {
                    const actualHex = result.actualHex || hex;
                    console.log(`Moved ${selectedUnit.getName()} to (${actualHex.q}, ${actualHex.r})`);

                    // Check if battle was triggered
                    if (result.battleTriggered) {
                        this.showBattlePopup(selectedUnit, result.enemyUnit);
                        // Unit cannot move further after battle
                        this.gameState.deselectUnit();
                        this.gameState.deselectHex();
                        this.updateHighlights();
                        return;
                    }

                    // Check victory
                    if (this.gameState.phase === GamePhase.VICTORY) {
                        this.showVictory();
                    }

                    // Unit can only move once per turn (hasMoved flag is now set)
                    this.gameState.deselectUnit();
                    this.gameState.deselectHex();
                    this.updateHighlights();
                }
                return;
            }

            // If clicking on another friendly unit, select it instead
            if (clickedUnit && clickedUnit.playerId === this.gameState.currentPlayer) {
                this.gameState.selectUnit(clickedUnit.id);
                this.updateHighlights();
                return;
            }

            // Otherwise, deselect
            this.gameState.deselectUnit();
            this.gameState.deselectHex();
            this.updateHighlights();

        } else {
            // No unit selected - try to select one
            if (clickedUnit && clickedUnit.playerId === this.gameState.currentPlayer) {
                this.gameState.selectUnit(clickedUnit.id);
                this.updateHighlights();
            } else {
                // Just select the hex
                this.gameState.selectHex(hex);
            }
        }
    }

    updateHighlights() {
        this.renderer.clearHighlights();

        switch (this.gameState.phase) {
            case GamePhase.PLACEMENT:
                this.renderer.setPlacementHighlights(this.gameState.getValidPlacementHexes());
                break;
            case GamePhase.MOVEMENT:
                if (this.gameState.selectedUnit) {
                    const unit = this.gameState.units.getUnit(this.gameState.selectedUnit);
                    if (unit && unit.canMove()) {
                        this.renderer.setMovementHighlights(this.gameState.getValidMovementHexes(unit));
                    }
                }
                break;
        }

        this.updateTurnDisplay();
    }

    updateTurnDisplay() {
        if (this.turnDisplay) {
            if (this.gameState.phase === GamePhase.PLACEMENT) {
                this.turnDisplay.textContent = `Place: ${this.gameState.unitsToPlace}`;
            } else if (this.gameState.phase === GamePhase.VICTORY) {
                this.turnDisplay.textContent = 'VICTORY!';
            } else {
                this.turnDisplay.textContent = this.gameState.turn;
            }
        }

        const castleDisplay = document.getElementById('castle-display');
        if (castleDisplay) {
            castleDisplay.textContent = `${this.gameState.capturedCastles.length}/${this.gameState.totalCastles}`;
        }
    }

    showVictory() {
        console.log('=================================');
        console.log('   VICTORY! All castles captured!');
        console.log('=================================');

        // Show custom victory modal
        const modal = document.getElementById('victory-modal');
        if (modal) {
            modal.classList.remove('hidden');

            const okBtn = document.getElementById('victory-ok-btn');
            if (okBtn) {
                okBtn.onclick = () => modal.classList.add('hidden');
            }
        }
    }

    /**
     * Show battle popup and resolve combat
     * @param {Unit} attacker - The attacking unit
     * @param {Unit} defender - The defending unit
     */
    showBattlePopup(attacker, defender) {
        // Capture entrenchment and experience before battle
        const attackerEntrenchBefore = attacker.entrenchment;
        const defenderEntrenchBefore = defender.entrenchment;
        const attackerExpBefore = attacker.experience;
        const defenderExpBefore = defender.experience;

        // Resolve the battle using the battle resolver
        const result = resolveBattle(attacker, defender);

        // Apply damage to units
        attacker.takeDamage(result.attackerDamage);
        defender.takeDamage(result.defenderDamage);

        // Apply experience gains for surviving units
        // Formula: 0.1 + (5% of strength lost) with ±20% variance
        let attackerExpGain = 0;
        let defenderExpGain = 0;
        if (!result.attackerDestroyed) {
            attackerExpGain = attacker.gainExperience(result.attackerDamage);
        }
        if (!result.defenderDestroyed) {
            defenderExpGain = defender.gainExperience(result.defenderDamage);
        }

        // Reduce defender entrenchment after being attacked
        defender.reduceEntrenchment();

        // Capture entrenchment after battle
        const defenderEntrenchAfter = defender.entrenchment;

        // Mark attacker as having attacked
        attacker.performAttack();

        // Log battle results
        console.log('=================================');
        console.log(`   BATTLE: ${attacker.getName()} vs ${defender.getName()}`);
        console.log(`   Power: ${result.attackerPower} vs ${result.defenderPower} (ratio: ${result.powerRatio.toFixed(2)})`);
        console.log(`   Entrenchment: ${attackerEntrenchBefore} vs ${defenderEntrenchBefore} -> ${defenderEntrenchAfter}`);
        console.log(`   Experience: ${attackerExpBefore.toFixed(1)} (+${attackerExpGain.toFixed(2)}) vs ${defenderExpBefore.toFixed(1)} (+${defenderExpGain.toFixed(2)})`);
        console.log(`   Raw Damage: Atk: ${result.attackerDamageRaw.toFixed(1)}, Def: ${result.defenderDamageRaw.toFixed(1)}`);
        console.log(`   Result: ${result.attackerStrengthBefore} -> ${result.attackerStrengthAfter} vs ${result.defenderStrengthBefore} -> ${result.defenderStrengthAfter}`);
        console.log('=================================');

        // Store defender hex for castle capture check
        const defenderHex = defender.hex;

        // Show custom battle modal
        const modal = document.getElementById('battle-modal');
        if (modal) {
            // Update attacker info
            document.getElementById('battle-attacker-name').textContent = attacker.getName();
            document.getElementById('battle-attacker-before').textContent = result.attackerStrengthBefore;
            document.getElementById('battle-attacker-after').textContent = result.attackerStrengthAfter;
            document.getElementById('battle-attacker-damage').textContent =
                result.attackerDamage > 0 ? `-${result.attackerDamage}` : '0';

            // Update defender info
            document.getElementById('battle-defender-name').textContent = defender.getName();
            document.getElementById('battle-defender-before').textContent = result.defenderStrengthBefore;
            document.getElementById('battle-defender-after').textContent = result.defenderStrengthAfter;
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${result.defenderDamage}` : '0';

            // Update status message
            let status = '';
            if (result.attackerDestroyed && result.defenderDestroyed) {
                status = 'Mutual destruction!';
            } else if (result.attackerDestroyed) {
                status = `${attacker.getName()} destroyed!`;
            } else if (result.defenderDestroyed) {
                status = `${defender.getName()} destroyed!`;
            } else {
                status = 'Both units survive.';
            }
            document.getElementById('battle-status').textContent = status;

            // Apply destroyed styling
            const attackerAfter = document.getElementById('battle-attacker-after');
            const defenderAfter = document.getElementById('battle-defender-after');
            attackerAfter.classList.toggle('unit-destroyed', result.attackerDestroyed);
            defenderAfter.classList.toggle('unit-destroyed', result.defenderDestroyed);

            // Update battle details (dev/debug info)
            document.getElementById('battle-power-info').textContent =
                `${result.attackerPower} vs ${result.defenderPower} (ratio: ${result.powerRatio.toFixed(2)})`;
            document.getElementById('battle-entrench-info').textContent =
                `${attackerEntrenchBefore} vs ${defenderEntrenchBefore} → ${defenderEntrenchAfter}`;
            // Show experience before → after with gain
            const atkExpStr = result.attackerDestroyed ? attackerExpBefore.toFixed(1) :
                `${attackerExpBefore.toFixed(1)} → ${attacker.experience.toFixed(1)} (+${attackerExpGain.toFixed(2)})`;
            const defExpStr = result.defenderDestroyed ? defenderExpBefore.toFixed(1) :
                `${defenderExpBefore.toFixed(1)} → ${defender.experience.toFixed(1)} (+${defenderExpGain.toFixed(2)})`;
            document.getElementById('battle-exp-info').textContent =
                `${atkExpStr} vs ${defExpStr}`;
            const attackerInit = attacker.getType().initiative;
            document.getElementById('battle-init-info').textContent =
                `+${attackerInit} (attacker only)`;
            document.getElementById('battle-raw-damage').textContent =
                `Atk: ${result.attackerDamageRaw.toFixed(1)}, Def: ${result.defenderDamageRaw.toFixed(1)}`;

            modal.classList.remove('hidden');

            const okBtn = document.getElementById('battle-ok-btn');
            if (okBtn) {
                okBtn.onclick = () => {
                    modal.classList.add('hidden');

                    // Remove destroyed units
                    this.gameState.units.removeDestroyed();

                    // Check castle capture if defender was destroyed
                    if (result.defenderDestroyed) {
                        this.gameState.checkCastleCapture(defenderHex);

                        // Check victory
                        if (this.gameState.phase === GamePhase.VICTORY) {
                            this.showVictory();
                        }
                    }

                    // Update visibility after battle
                    this.gameState.updateVisibility();

                    this.render();
                };
            }
        }
    }

    handleMouseLeave() {
        this.renderer.setHoveredHex(null);
        this.infoPanel.textContent = 'Hover over a hex';
        this.render();
    }

    handleKeyDown(event) {
        switch (event.key.toLowerCase()) {
            case 'g':
                // Toggle grid
                this.gameState.toggleSetting('showGrid');
                this.render();
                break;
            case 'f':
                // Toggle fog of war
                this.gameState.toggleSetting('fogOfWar');
                this.render();
                break;
            case 'c':
                // Toggle coordinates
                this.gameState.toggleSetting('showCoordinates');
                this.render();
                break;
            case 's':
                // Manual save
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.save();
                }
                break;
            case 'escape':
                // Deselect
                this.gameState.deselectHex();
                this.gameState.deselectUnit();
                this.updateHighlights();
                this.render();
                break;
            case 'e':
                // End turn
                if (this.gameState.phase === GamePhase.MOVEMENT) {
                    this.endTurn();
                }
                break;
        }
    }

    endTurn() {
        this.gameState.endTurn();
        this.updateHighlights();
        this.render();
        console.log(`Turn ${this.gameState.turn} begins`);
    }

    updateInfoPanel(hex) {
        const cell = this.gameState.map.getCell(hex);
        if (!cell) return;

        const terrain = getTerrainProperties(cell.terrain);
        let info = `${terrain.name} (${hex.q}, ${hex.r})`;

        // Check for unit on this hex
        const unit = this.gameState.getUnitAt(hex);
        if (unit) {
            const unitType = unit.getType();
            info = `${unitType.name} [${unit.strength}] - ${terrain.name}`;
            info += ` | Move: ${unit.movementRemaining}/${unitType.movement}`;
        } else {
            // Check for edge features (roads/bridges)
            const edgeFeatures = [];
            let hasBridgeOrRoad = false;
            for (let dir = 0; dir < 6; dir++) {
                const edge = cell.getEdge(dir);
                if (edge === EdgeFeature.BRIDGE || edge === EdgeFeature.ROAD) {
                    hasBridgeOrRoad = true;
                }
                if (edge !== EdgeFeature.NONE) {
                    const edgeProps = getEdgeProperties(edge);
                    if (!edgeFeatures.includes(edgeProps.name)) {
                        edgeFeatures.push(edgeProps.name);
                    }
                }
            }

            // Add movement cost info (roads/bridges always cost 1)
            if (hasBridgeOrRoad) {
                info += ' - Move: 1';
            } else if (terrain.movementCost === Infinity) {
                info += ' - Impassable';
            } else if (terrain.movementCost === 'all') {
                info += ' - Move: all';
            } else {
                info += ` - Move: ${terrain.movementCost}`;
            }

            if (edgeFeatures.length > 0) {
                info += ` | ${edgeFeatures.join(', ')}`;
            }
        }

        // Show captured status for castles
        if (cell.terrain === TerrainType.CASTLE) {
            if (this.gameState.isCastleCaptured(hex)) {
                info += ' [CAPTURED]';
            } else {
                info += ' [Enemy]';
            }
        }

        this.infoPanel.textContent = info;
    }

    render() {
        this.renderer.render(this.gameState);
    }

    save() {
        GameStorage.saveGame(this.gameState);
        console.log('Game saved');
    }

    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        this.autoSaveTimer = setInterval(() => {
            this.save();
        }, CONFIG.AUTOSAVE_INTERVAL_MS);
    }

    // Create a new game
    newGame(name = 'Medieval Conquest') {
        this.gameState = GameState.create(name);
        GameStorage.saveGame(this.gameState);
        this.gameState.updateVisibility();
        this.updateHighlights();
        this.render();
        this.logGameState();
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    game = new Game();

    // Expose some functions to console for debugging
    window.game = game;
    window.newGame = (name) => game.newGame(name);
    window.save = () => game.save();

    console.log('Medieval Conquest loaded!');
    console.log('Keyboard shortcuts:');
    console.log('  G - Toggle grid');
    console.log('  F - Toggle fog of war');
    console.log('  C - Toggle coordinates');
    console.log('  E - End turn');
    console.log('  Ctrl+S - Save');
    console.log('  Escape - Deselect');
});
