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

        // Inspection mode
        this.inspectMode = false;

        // Pending confirmation action
        this.pendingConfirmAction = null;

        // Marketplace state
        this.marketplaceMaxUnits = 6;

        // Touch panning state
        this.panOffset = { x: 0, y: 0 };
        this.isPanning = false;
        this.touchStart = null;
        this.panStartOffset = null;

        // Initialize
        this.init();
    }

    init() {
        // Try to load existing game or create new one
        this.gameState = GameStorage.loadCurrentGame();

        if (!this.gameState) {
            this.gameState = GameState.create('Puddy General');
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

        // Touch events for mobile panning
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Sidebar buttons
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => {
                this.showConfirmDialog(
                    'New Game',
                    'Start a new game? Current progress will be lost.',
                    () => this.newGame('Puddy General')
                );
            });
        }

        // TEMP: Test Level 2 button
        const testLevel2Btn = document.getElementById('test-level2-btn');
        if (testLevel2Btn) {
            testLevel2Btn.addEventListener('click', () => {
                // Simulate winning Level 1 on day 10: 150 start + 50 castle + 5 turns × 20 bonus = 300
                this.newGame('Puddy General', 2, { prestige: 300 });
            });
        }

        // TEMP: Test Level 3 button
        const testLevel3Btn = document.getElementById('test-level3-btn');
        if (testLevel3Btn) {
            testLevel3Btn.addEventListener('click', () => {
                // Simulate winning Level 2 with ~850 prestige
                this.newGame('Puddy General', 3, { prestige: 850 });
            });
        }

        // Rules button
        const rulesBtn = document.getElementById('rules-btn');
        if (rulesBtn) {
            rulesBtn.addEventListener('click', () => this.showRulesModal());
        }

        // Rules modal close button
        const rulesOkBtn = document.getElementById('rules-ok-btn');
        if (rulesOkBtn) {
            rulesOkBtn.addEventListener('click', () => this.hideRulesModal());
        }

        // Level intro modal close button
        const levelIntroOkBtn = document.getElementById('level-intro-ok-btn');
        if (levelIntroOkBtn) {
            levelIntroOkBtn.addEventListener('click', () => this.hideLevelIntroModal());
        }

        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.addEventListener('click', () => {
                if (this.gameState.phase === GamePhase.MOVEMENT) {
                    this.showConfirmDialog(
                        'End Day',
                        'End your day and let the enemy move?',
                        () => this.endTurn()
                    );
                }
            });
        }

        // Inspect button
        const inspectBtn = document.getElementById('inspect-btn');
        if (inspectBtn) {
            inspectBtn.addEventListener('click', () => {
                this.toggleInspectMode();
            });
        }

        // Confirmation modal buttons
        const confirmYesBtn = document.getElementById('confirm-yes-btn');
        if (confirmYesBtn) {
            confirmYesBtn.addEventListener('click', () => this.handleConfirmYes());
        }

        const confirmNoBtn = document.getElementById('confirm-no-btn');
        if (confirmNoBtn) {
            confirmNoBtn.addEventListener('click', () => this.hideConfirmDialog());
        }

        // Inspect modal close button
        const inspectOkBtn = document.getElementById('inspect-ok-btn');
        if (inspectOkBtn) {
            inspectOkBtn.addEventListener('click', () => {
                this.hideInspectModal();
            });
        }

        // Rebuild buttons in inspect modal
        const rebuildExpBtn = document.getElementById('rebuild-with-exp-btn');
        if (rebuildExpBtn) {
            rebuildExpBtn.addEventListener('click', () => this.handleRebuild(true));
        }

        const rebuildCheapBtn = document.getElementById('rebuild-cheap-btn');
        if (rebuildCheapBtn) {
            rebuildCheapBtn.addEventListener('click', () => this.handleRebuild(false));
        }

        // Buy ammo button in inspect modal
        const buyAmmoBtn = document.getElementById('buy-ammo-btn');
        if (buyAmmoBtn) {
            buyAmmoBtn.addEventListener('click', () => this.handleBuyAmmo());
        }

        // Marketplace modal buttons
        const buyInfantryBtn = document.getElementById('buy-infantry-btn');
        if (buyInfantryBtn) {
            buyInfantryBtn.addEventListener('click', () => this.purchaseUnit('infantry'));
        }

        const buyTrebuchetBtn = document.getElementById('buy-trebuchet-btn');
        if (buyTrebuchetBtn) {
            buyTrebuchetBtn.addEventListener('click', () => this.purchaseUnit('trebuchet'));
        }

        const inspectInfantryBtn = document.getElementById('inspect-infantry-btn');
        if (inspectInfantryBtn) {
            inspectInfantryBtn.addEventListener('click', () => this.previewUnitType('infantry'));
        }

        const inspectTrebuchetBtn = document.getElementById('inspect-trebuchet-btn');
        if (inspectTrebuchetBtn) {
            inspectTrebuchetBtn.addEventListener('click', () => this.previewUnitType('trebuchet'));
        }

        const buyCavalryBtn = document.getElementById('buy-cavalry-btn');
        if (buyCavalryBtn) {
            buyCavalryBtn.addEventListener('click', () => this.purchaseUnit('cavalry'));
        }

        const inspectCavalryBtn = document.getElementById('inspect-cavalry-btn');
        if (inspectCavalryBtn) {
            inspectCavalryBtn.addEventListener('click', () => this.previewUnitType('cavalry'));
        }

        const marketplaceDoneBtn = document.getElementById('marketplace-done-btn');
        if (marketplaceDoneBtn) {
            marketplaceDoneBtn.addEventListener('click', () => this.hideMarketplaceModal());
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

        // Handle inspection mode
        if (this.inspectMode) {
            const unit = this.gameState.getUnitAt(hex);
            if (unit) {
                this.showInspectModal(unit);
            }
            // Exit inspect mode after clicking
            this.toggleInspectMode();
            return;
        }

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

            // Check if clicking on a valid ranged target
            if (this.gameState.canRangedAttack(selectedUnit)) {
                const rangedTargets = this.gameState.getValidRangedTargets(selectedUnit);
                const isRangedTarget = rangedTargets.some(h => h.equals(hex));

                if (isRangedTarget && clickedUnit) {
                    // Execute ranged attack
                    const result = this.gameState.executeRangedAttack(selectedUnit, clickedUnit);
                    if (result.success) {
                        console.log(`${selectedUnit.getName()} fires at ${clickedUnit.getName()}!`);
                        this.showRangedBattlePopup(selectedUnit, clickedUnit, result.defenderTerrain);
                        this.gameState.deselectUnit();
                        this.gameState.deselectHex();
                        this.updateHighlights();
                        return;
                    }
                }
            }

            // If clicking on a valid movement hex, move there
            const validMoves = this.gameState.getValidMovementHexes(selectedUnit);
            const isValidMove = validMoves.some(h => h.equals(hex));

            if (isValidMove) {
                const result = this.gameState.moveUnit(selectedUnit, hex);
                if (result.success) {
                    const actualHex = result.actualHex || hex;
                    console.log(`Moved ${selectedUnit.getName()} to (${actualHex.q}, ${actualHex.r})`);

                    // Check if unit was stopped by hidden enemy ZoC
                    if (result.stoppedByHiddenZOC) {
                        console.log('Unit stopped by hidden enemy zone of control!');
                        // Show a brief message or let the player see the newly revealed enemy
                    }

                    // Check if battle was triggered
                    if (result.battleTriggered) {
                        // Check for defensive artillery fire
                        const defensiveArtillery = this.gameState.getDefensiveArtillery(result.enemyUnit.hex);
                        if (defensiveArtillery.length > 0) {
                            // Show defensive fire sequence, then main battle
                            this.showDefensiveFireSequence(selectedUnit, result.enemyUnit, defensiveArtillery, result);
                        } else {
                            // No defensive fire, show main battle
                            this.showBattlePopup(selectedUnit, result.enemyUnit, result.surpriseAttack, result.riverAttack, result.defenderTerrain);
                        }
                        // Unit cannot move further after battle
                        this.gameState.deselectUnit();
                        this.gameState.deselectHex();
                        this.updateHighlights();
                        return;
                    }

                    // Check castle recapture in defense mode
                    this.gameState.checkPlayerCastleRecapture(actualHex);

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
                    if (unit) {
                        // Show movement highlights if unit can move
                        if (unit.canMove()) {
                            this.renderer.setMovementHighlights(this.gameState.getValidMovementHexes(unit));
                        }
                        // Show ranged target highlights if unit can do ranged attack
                        if (this.gameState.canRangedAttack(unit)) {
                            this.renderer.setRangedTargetHighlights(this.gameState.getValidRangedTargets(unit));
                        }
                    }
                }
                break;
        }

        this.updateTurnDisplay();
    }

    updateTurnDisplay() {
        if (this.turnDisplay) {
            if (this.gameState.phase === GamePhase.PLACEMENT) {
                // Show what unit type is next to place
                const nextType = this.gameState.unitTypesToPlace.length > 0
                    ? this.gameState.unitTypesToPlace[0]
                    : 'infantry';
                const typeName = nextType.charAt(0).toUpperCase() + nextType.slice(1);
                this.turnDisplay.textContent = `Place ${typeName} (${this.gameState.unitsToPlace} left)`;
            } else if (this.gameState.phase === GamePhase.VICTORY) {
                this.turnDisplay.textContent = 'VICTORY!';
            } else if (this.gameState.phase === GamePhase.DEFEAT) {
                this.turnDisplay.textContent = 'DEFEAT!';
            } else {
                // Show turns remaining (countdown style)
                this.turnDisplay.textContent = `${this.gameState.turnsRemaining} left`;
            }
        }

        const castleDisplay = document.getElementById('castle-display');
        if (castleDisplay) {
            if (this.gameState.gameMode === 'defense') {
                const held = this.gameState.playerCastleKeys.length - this.gameState.lostCastles.length;
                castleDisplay.textContent = `${held}/${this.gameState.playerCastleKeys.length} held`;
            } else {
                castleDisplay.textContent = `${this.gameState.capturedCastles.length}/${this.gameState.totalCastles}`;
            }
        }

        const prestigeDisplay = document.getElementById('prestige-display');
        if (prestigeDisplay) {
            prestigeDisplay.textContent = this.gameState.prestige;
        }

        // Update level display
        const levelDisplay = document.getElementById('level-display');
        if (levelDisplay) {
            const level = LevelManager.getLevel(this.gameState.currentLevel);
            if (level) {
                levelDisplay.textContent = `Level ${level.id}: ${level.name}`;
            } else {
                levelDisplay.textContent = `Level ${this.gameState.currentLevel}`;
            }
        }
    }

    showVictory() {
        const isDefense = this.gameState.gameMode === 'defense';

        if (isDefense) {
            // Defense mode victory: award prestige based on castles held
            const castlesHeld = this.gameState.playerCastleKeys.length - this.gameState.lostCastles.length;
            const level = LevelManager.getLevel(this.gameState.currentLevel);
            const perCastle = level ? (level.defensePrestigePerCastle || 75) : 75;
            const defenseBonus = castlesHeld * perCastle;
            this.gameState.prestige += defenseBonus;

            console.log('=================================');
            console.log('   VICTORY! You survived the siege!');
            console.log(`   Castles held: ${castlesHeld}/${this.gameState.playerCastleKeys.length}`);
            console.log(`   Defense bonus: +${defenseBonus} prestige (${castlesHeld} × ${perCastle})`);
            console.log('=================================');

            const modal = document.getElementById('victory-modal');
            if (modal) {
                const bonusText = document.getElementById('victory-bonus-text');
                if (bonusText) {
                    bonusText.textContent = `Castles held: ${castlesHeld}/${this.gameState.playerCastleKeys.length} (+${defenseBonus} prestige)`;
                }

                modal.classList.remove('hidden');

                const okBtn = document.getElementById('victory-ok-btn');
                if (okBtn) {
                    const currentLevel = this.gameState.currentLevel;
                    const hasNext = LevelManager.hasNextLevel(currentLevel);

                    if (hasNext) {
                        okBtn.textContent = 'Next Battle!';
                        okBtn.onclick = () => {
                            modal.classList.add('hidden');
                            const prestigeCarryOver = this.gameState.prestige;
                            const nextLevelId = currentLevel + 1;
                            this.newGame('Puddy General', nextLevelId, { prestige: prestigeCarryOver });
                        };
                    } else {
                        okBtn.textContent = 'Long Live the King!';
                        okBtn.onclick = () => modal.classList.add('hidden');
                    }
                }
            }
        } else {
            // Offense mode victory
            console.log('=================================');
            console.log('   VICTORY! All castles captured!');
            console.log(`   Turns remaining: ${this.gameState.turnsRemaining}`);
            console.log(`   Early victory bonus: +${this.gameState.turnsRemaining * this.gameState.earlyVictoryBonus} prestige`);
            console.log('=================================');

            const modal = document.getElementById('victory-modal');
            if (modal) {
                const bonusText = document.getElementById('victory-bonus-text');
                if (bonusText) {
                    const bonus = this.gameState.turnsRemaining * this.gameState.earlyVictoryBonus;
                    bonusText.textContent = `Turns remaining: ${this.gameState.turnsRemaining} (+${bonus} prestige bonus!)`;
                }

                modal.classList.remove('hidden');

                const okBtn = document.getElementById('victory-ok-btn');
                if (okBtn) {
                    const currentLevel = this.gameState.currentLevel;
                    const hasNext = LevelManager.hasNextLevel(currentLevel);

                    if (hasNext) {
                        okBtn.textContent = 'Next Battle!';
                        okBtn.onclick = () => {
                            modal.classList.add('hidden');
                            const prestigeCarryOver = this.gameState.prestige;
                            const nextLevelId = currentLevel + 1;
                            this.newGame('Puddy General', nextLevelId, { prestige: prestigeCarryOver });
                        };
                    } else {
                        okBtn.textContent = 'Long Live the King!';
                        okBtn.onclick = () => modal.classList.add('hidden');
                    }
                }
            }
        }
    }

    showDefeat() {
        const isDefense = this.gameState.gameMode === 'defense';

        if (isDefense) {
            console.log('=================================');
            console.log('   DEFEAT! All your castles have fallen!');
            console.log('=================================');
        } else {
            console.log('=================================');
            console.log('   DEFEAT! Ran out of turns!');
            console.log('=================================');
        }

        // Show defeat modal
        const modal = document.getElementById('defeat-modal');
        if (modal) {
            // Update defeat message for defense mode
            const defeatText = document.getElementById('defeat-text');
            if (defeatText) {
                defeatText.textContent = isDefense
                    ? 'All your castles have fallen to the horde!'
                    : 'You ran out of time to capture all castles!';
            }
            modal.classList.remove('hidden');

            const okBtn = document.getElementById('defeat-ok-btn');
            if (okBtn) {
                okBtn.onclick = () => modal.classList.add('hidden');
            }
        }

        this.updateTurnDisplay();
        this.render();
    }

    /**
     * Show confirmation dialog
     */
    showConfirmDialog(title, message, onConfirm) {
        this.pendingConfirmAction = onConfirm;

        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');

        if (modal && titleEl && messageEl) {
            titleEl.textContent = title;
            messageEl.textContent = message;
            modal.classList.remove('hidden');
        }
    }

    /**
     * Handle confirmation dialog "Yes" button
     */
    handleConfirmYes() {
        const action = this.pendingConfirmAction;
        this.hideConfirmDialog();
        if (action) {
            action();
        }
    }

    /**
     * Hide confirmation dialog
     */
    hideConfirmDialog() {
        const modal = document.getElementById('confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.pendingConfirmAction = null;
    }

    /**
     * Toggle inspection mode, or inspect selected unit directly
     */
    toggleInspectMode() {
        // If a unit is already selected, inspect it directly
        if (this.gameState.selectedUnit) {
            const unit = this.gameState.units.getUnit(this.gameState.selectedUnit);
            if (unit) {
                this.showInspectModal(unit);
                return;
            }
        }

        // Otherwise toggle inspect mode
        this.inspectMode = !this.inspectMode;
        const inspectBtn = document.getElementById('inspect-btn');
        if (inspectBtn) {
            inspectBtn.classList.toggle('active', this.inspectMode);
        }
        console.log(`Inspect mode: ${this.inspectMode ? 'ON' : 'OFF'}`);
    }

    /**
     * Show the unit inspection modal with details
     * @param {Unit} unit - The unit to inspect
     */
    showInspectModal(unit) {
        const modal = document.getElementById('inspect-modal');
        if (!modal) return;

        // Store reference to inspected unit for rebuild actions
        this.inspectedUnit = unit;

        const unitType = unit.getType();

        // Populate unit name
        let inspectName = unitType.name;
        if (unit.isAuxiliary) inspectName += ' (Auxiliary)';
        document.getElementById('inspect-unit-name').textContent = inspectName;

        // Status section
        document.getElementById('inspect-strength').textContent = `${Math.floor(unit.strength)}/10`;
        document.getElementById('inspect-movement').textContent = `${unit.movementRemaining}/${unitType.movement}`;
        document.getElementById('inspect-ammo').textContent =
            unitType.maxAmmo === null ? 'Unlimited' : `${unit.ammo}/${unitType.maxAmmo}`;
        document.getElementById('inspect-experience').textContent = unit.experience.toFixed(2);
        document.getElementById('inspect-entrenchment').textContent = unit.entrenchment;

        // Combat stats section
        document.getElementById('inspect-soft-attack').textContent = unitType.softAttack;
        document.getElementById('inspect-hard-attack').textContent = unitType.hardAttack;
        document.getElementById('inspect-ground-defense').textContent = unitType.groundDefense;
        document.getElementById('inspect-close-defense').textContent = unitType.closeDefense;
        document.getElementById('inspect-initiative').textContent = unitType.initiative;

        // Other section
        document.getElementById('inspect-spotting').textContent = unitType.spotting;
        document.getElementById('inspect-range').textContent =
            unitType.range === 0 ? 'Melee' : unitType.range;
        document.getElementById('inspect-target-type').textContent =
            unitType.targetType === 'hard' ? 'Hard' : 'Soft';

        // Description
        document.getElementById('inspect-description').textContent = unitType.description;

        // Rebuild section - show only for player's wounded units
        const rebuildSection = document.getElementById('inspect-rebuild-section');
        const rebuildStatus = document.getElementById('rebuild-status');

        if (rebuildSection) {
            const canRebuild = RebuildSystem.canRebuild(this.gameState, unit);
            const isPlayerUnit = unit.playerId === this.gameState.currentPlayer;
            const isWounded = unit.strength < 10;

            if (isPlayerUnit && isWounded) {
                rebuildSection.classList.remove('hidden');

                const costs = RebuildSystem.getCosts(unit);
                const prestige = this.gameState.prestige;

                // Calculate what's affordable for each option
                const affordableExp = RebuildSystem.getAffordableRebuild(unit, prestige, true);
                const affordableCheap = RebuildSystem.getAffordableRebuild(unit, prestige, false);

                // Show restorable strength (half of total missing)
                document.getElementById('inspect-missing-strength').textContent =
                    `${Math.floor(costs.missingStrength)} (of ${Math.floor(costs.totalMissing)} missing)`;

                // Show full cost, and if partial, also show what's affordable
                if (affordableExp.affordableStrength > 0 && affordableExp.affordableStrength < costs.missingStrength) {
                    document.getElementById('rebuild-cost-exp').textContent =
                        `Full: ${costs.withExp} | +${Math.floor(affordableExp.affordableStrength)} str: ${affordableExp.cost}`;
                } else {
                    document.getElementById('rebuild-cost-exp').textContent = `Cost: ${costs.withExp}`;
                }

                if (affordableCheap.affordableStrength > 0 && affordableCheap.affordableStrength < costs.missingStrength) {
                    document.getElementById('rebuild-cost-cheap').textContent =
                        `Full: ${costs.cheap} | +${Math.floor(affordableCheap.affordableStrength)} str: ${affordableCheap.cost}`;
                    document.getElementById('rebuild-exp-loss').textContent =
                        `Exp loss: ${affordableCheap.expLoss.toFixed(2)}`;
                } else {
                    document.getElementById('rebuild-cost-cheap').textContent = `Cost: ${costs.cheap}`;
                    document.getElementById('rebuild-exp-loss').textContent = `Exp loss: ${costs.expLoss.toFixed(2)}`;
                }

                const expBtn = document.getElementById('rebuild-with-exp-btn');
                const cheapBtn = document.getElementById('rebuild-cheap-btn');

                // Enable/disable buttons based on conditions
                if (!canRebuild) {
                    expBtn.disabled = true;
                    cheapBtn.disabled = true;
                    const reason = RebuildSystem.getCannotRebuildReason(this.gameState, unit);
                    rebuildStatus.textContent = reason || '';
                    rebuildStatus.className = 'rebuild-status error';
                } else {
                    // Enable buttons if we can afford at least 1 strength point
                    expBtn.disabled = affordableExp.affordableStrength <= 0;
                    cheapBtn.disabled = affordableCheap.affordableStrength <= 0;

                    if (affordableCheap.affordableStrength <= 0) {
                        rebuildStatus.textContent = 'Insufficient prestige (need at least ' +
                            Math.ceil(costs.costPerStrengthCheap) + ')';
                        rebuildStatus.className = 'rebuild-status error';
                    } else if (affordableExp.affordableStrength < costs.missingStrength ||
                               affordableCheap.affordableStrength < costs.missingStrength) {
                        rebuildStatus.textContent = 'Partial rebuild available';
                        rebuildStatus.className = 'rebuild-status';
                    } else {
                        rebuildStatus.textContent = '';
                        rebuildStatus.className = 'rebuild-status';
                    }
                }
            } else {
                rebuildSection.classList.add('hidden');
            }
        }

        // Ammo purchase section - show for player's ammo-using units
        const ammoSection = document.getElementById('inspect-ammo-section');
        if (ammoSection) {
            const isPlayerUnit = unit.playerId === this.gameState.currentPlayer;
            const usesAmmo = unit.getType().maxAmmo !== null;

            if (isPlayerUnit && usesAmmo) {
                ammoSection.classList.remove('hidden');

                // Update ammo display
                document.getElementById('inspect-ammo-detail').textContent =
                    `${unit.ammo}/${unit.getType().maxAmmo}`;

                const buyBtn = document.getElementById('buy-ammo-btn');
                const ammoStatus = document.getElementById('ammo-status');
                const canBuy = RebuildSystem.canBuyAmmo(this.gameState, unit);
                buyBtn.disabled = !canBuy;

                // Show reason if can't buy
                if (unit.strength < 10) {
                    ammoStatus.textContent = 'Must be full strength to resupply';
                    ammoStatus.className = 'rebuild-status error';
                } else if (unit.ammo >= unit.getType().maxAmmo) {
                    ammoStatus.textContent = 'Ammo full';
                    ammoStatus.className = 'rebuild-status';
                } else if (unit.hasMoved || unit.hasAttacked) {
                    ammoStatus.textContent = 'Unit has already acted this turn';
                    ammoStatus.className = 'rebuild-status error';
                } else if (this.gameState.prestige < 8) {
                    ammoStatus.textContent = 'Need 8 prestige';
                    ammoStatus.className = 'rebuild-status error';
                } else {
                    ammoStatus.textContent = '';
                    ammoStatus.className = 'rebuild-status';
                }
            } else {
                ammoSection.classList.add('hidden');
            }
        }

        modal.classList.remove('hidden');
    }

    /**
     * Hide the unit inspection modal
     */
    hideInspectModal() {
        const modal = document.getElementById('inspect-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Show the rules modal
     */
    showRulesModal() {
        const modal = document.getElementById('rules-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * Hide the rules modal
     */
    hideRulesModal() {
        const modal = document.getElementById('rules-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Show the level intro modal with story text
     * @param {Object} level - The level configuration object
     */
    showLevelIntroModal(level) {
        const modal = document.getElementById('level-intro-modal');
        if (!modal || !level) return;

        // Set the title
        const titleEl = document.getElementById('level-intro-title');
        if (titleEl) {
            titleEl.textContent = `Level ${level.id}: ${level.name}`;
        }

        // Set the intro text
        const textEl = document.getElementById('level-intro-text');
        if (textEl) {
            textEl.textContent = level.introText || level.description || '';
        }

        modal.classList.remove('hidden');
    }

    /**
     * Hide the level intro modal
     */
    hideLevelIntroModal() {
        const modal = document.getElementById('level-intro-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Show the marketplace modal
     */
    showMarketplaceModal() {
        const modal = document.getElementById('marketplace-modal');
        if (!modal) return;

        this.updateMarketplaceDisplay();
        modal.classList.remove('hidden');
    }

    /**
     * Hide the marketplace modal and show level intro
     */
    hideMarketplaceModal() {
        const modal = document.getElementById('marketplace-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        // Now show the level intro modal
        const level = LevelManager.getLevel(this.gameState.currentLevel);
        if (level && level.introText) {
            this.showLevelIntroModal(level);
        }
    }

    /**
     * Update the marketplace display with current values
     */
    updateMarketplaceDisplay() {
        // Update prestige display
        const prestigeValue = document.getElementById('marketplace-prestige-value');
        if (prestigeValue) {
            prestigeValue.textContent = this.gameState.prestige;
        }

        // Calculate current unit count (units to place + already placed units)
        const currentUnits = this.gameState.unitsToPlace;
        const maxUnits = this.marketplaceMaxUnits;

        // Update unit count display
        const unitCount = document.getElementById('marketplace-unit-count');
        if (unitCount) {
            unitCount.textContent = `${currentUnits} / ${maxUnits}`;
        }

        // Check if at max units
        const atMaxUnits = currentUnits >= maxUnits;

        // Update infantry button state
        const infantryBtn = document.getElementById('buy-infantry-btn');
        const infantryCost = UNIT_TYPES.infantry.cost;
        if (infantryBtn) {
            const canBuyInfantry = !atMaxUnits && this.gameState.prestige >= infantryCost;
            infantryBtn.disabled = !canBuyInfantry;
            if (atMaxUnits) {
                infantryBtn.textContent = 'Army Full';
            } else if (this.gameState.prestige < infantryCost) {
                infantryBtn.textContent = 'Not Enough Prestige';
            } else {
                infantryBtn.textContent = 'Purchase';
            }
        }

        // Update trebuchet button state
        const trebuchetBtn = document.getElementById('buy-trebuchet-btn');
        const trebuchetCost = UNIT_TYPES.trebuchet.cost;
        if (trebuchetBtn) {
            const canBuyTrebuchet = !atMaxUnits && this.gameState.prestige >= trebuchetCost;
            trebuchetBtn.disabled = !canBuyTrebuchet;
            if (atMaxUnits) {
                trebuchetBtn.textContent = 'Army Full';
            } else if (this.gameState.prestige < trebuchetCost) {
                trebuchetBtn.textContent = 'Not Enough Prestige';
            } else {
                trebuchetBtn.textContent = 'Purchase';
            }
        }

        // Update cavalry button state
        const cavalryBtn = document.getElementById('buy-cavalry-btn');
        const cavalryCost = UNIT_TYPES.cavalry.cost;
        if (cavalryBtn) {
            const canBuyCavalry = !atMaxUnits && this.gameState.prestige >= cavalryCost;
            cavalryBtn.disabled = !canBuyCavalry;
            if (atMaxUnits) {
                cavalryBtn.textContent = 'Army Full';
            } else if (this.gameState.prestige < cavalryCost) {
                cavalryBtn.textContent = 'Not Enough Prestige';
            } else {
                cavalryBtn.textContent = 'Purchase';
            }
        }

        // Update item styling for disabled state
        const infantryItem = document.getElementById('marketplace-infantry');
        const trebuchetItem = document.getElementById('marketplace-trebuchet');
        const cavalryItem = document.getElementById('marketplace-cavalry');
        if (infantryItem) {
            infantryItem.classList.toggle('disabled', infantryBtn?.disabled);
        }
        if (trebuchetItem) {
            trebuchetItem.classList.toggle('disabled', trebuchetBtn?.disabled);
        }
        if (cavalryItem) {
            cavalryItem.classList.toggle('disabled', cavalryBtn?.disabled);
        }
    }

    /**
     * Purchase a unit from the marketplace
     * @param {string} unitType - The unit type to purchase ('infantry' or 'trebuchet')
     */
    purchaseUnit(unitType) {
        const unitDef = UNIT_TYPES[unitType];
        if (!unitDef) return;

        const cost = unitDef.cost;

        // Check if can afford
        if (this.gameState.prestige < cost) {
            console.log(`Cannot afford ${unitType} (need ${cost}, have ${this.gameState.prestige})`);
            return;
        }

        // Check if at max units
        const currentUnits = this.gameState.unitsToPlace;
        if (currentUnits >= this.marketplaceMaxUnits) {
            console.log(`Army at maximum capacity (${this.marketplaceMaxUnits})`);
            return;
        }

        // Deduct cost and add unit to placement queue
        this.gameState.prestige -= cost;
        this.gameState.unitsToPlace++;
        this.gameState.unitTypesToPlace.push(unitType);

        console.log(`Purchased ${unitType} for ${cost} prestige. Now have ${this.gameState.unitsToPlace} units to place.`);

        // Update displays
        this.updateMarketplaceDisplay();
        this.updateTurnDisplay();
    }

    /**
     * Preview a unit type's stats in the inspect modal
     * @param {string} typeId - The unit type ID to preview
     */
    previewUnitType(typeId) {
        const unitType = UNIT_TYPES[typeId];
        if (!unitType) return;

        const modal = document.getElementById('inspect-modal');
        if (!modal) return;

        // Populate unit name
        document.getElementById('inspect-unit-name').textContent = unitType.name;

        // Status section - show base/max values
        document.getElementById('inspect-strength').textContent = '10/10';
        document.getElementById('inspect-movement').textContent = `${unitType.movement}/${unitType.movement}`;
        document.getElementById('inspect-ammo').textContent =
            unitType.maxAmmo === null ? 'Unlimited' : `${unitType.maxAmmo}/${unitType.maxAmmo}`;
        document.getElementById('inspect-experience').textContent = '0.00';
        document.getElementById('inspect-entrenchment').textContent = '0';

        // Combat stats section
        document.getElementById('inspect-soft-attack').textContent = unitType.softAttack;
        document.getElementById('inspect-hard-attack').textContent = unitType.hardAttack;
        document.getElementById('inspect-ground-defense').textContent = unitType.groundDefense;
        document.getElementById('inspect-close-defense').textContent = unitType.closeDefense;
        document.getElementById('inspect-initiative').textContent = unitType.initiative;

        // Other section
        document.getElementById('inspect-spotting').textContent = unitType.spotting;
        document.getElementById('inspect-range').textContent =
            unitType.range === 0 ? 'Melee' : unitType.range;
        document.getElementById('inspect-target-type').textContent =
            unitType.targetType === 'hard' ? 'Hard' : 'Soft';

        // Description
        document.getElementById('inspect-description').textContent = unitType.description;

        // Hide rebuild section (this is just a preview)
        const rebuildSection = document.getElementById('inspect-rebuild-section');
        if (rebuildSection) {
            rebuildSection.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    }

    /**
     * Handle rebuild button click
     * @param {boolean} keepExperience - Whether to keep experience (full price)
     */
    handleRebuild(keepExperience) {
        if (!this.inspectedUnit) return;

        const result = RebuildSystem.rebuild(this.gameState, this.inspectedUnit, keepExperience);

        if (result.success) {
            // Refresh the modal to show updated stats
            this.showInspectModal(this.inspectedUnit);

            // Update displays
            this.updateTurnDisplay();
            this.updateHighlights();
            this.render();

            const rebuildStatus = document.getElementById('rebuild-status');
            if (rebuildStatus) {
                let msg = `Rebuilt! +${Math.floor(result.strengthGained)} str, Cost: ${result.cost}`;
                if (result.expLost > 0) {
                    msg += `, Exp lost: ${result.expLost.toFixed(2)}`;
                }
                if (result.ammoGained > 0) {
                    msg += ', +1 ammo';
                }
                rebuildStatus.textContent = msg;
                rebuildStatus.className = 'rebuild-status success';
            }
        } else if (result.insufficientFunds) {
            const rebuildStatus = document.getElementById('rebuild-status');
            if (rebuildStatus) {
                rebuildStatus.textContent = 'Insufficient prestige!';
                rebuildStatus.className = 'rebuild-status error';
            }
        }
    }

    /**
     * Handle buy ammo button click
     */
    handleBuyAmmo() {
        if (!this.inspectedUnit) return;

        const result = RebuildSystem.buyAmmo(this.gameState, this.inspectedUnit);

        if (result.success) {
            // Refresh the modal to show updated stats
            this.showInspectModal(this.inspectedUnit);

            // Update displays
            this.updateTurnDisplay();
            this.updateHighlights();
            this.render();

            const ammoStatus = document.getElementById('ammo-status');
            if (ammoStatus) {
                ammoStatus.textContent = `Resupplied! +1 ammo, Cost: ${result.cost} prestige`;
                ammoStatus.className = 'rebuild-status success';
            }
        }
    }

    /**
     * Show battle popup and resolve combat
     * @param {Unit} attacker - The attacking unit
     * @param {Unit} defender - The defending unit
     * @param {boolean} surpriseAttack - Whether attacker stumbled into hidden enemy
     * @param {boolean} riverAttack - Whether attacker is on river attacking non-river
     * @param {string} defenderTerrain - The terrain type the defender is on
     */
    showBattlePopup(attacker, defender, surpriseAttack = false, riverAttack = false, defenderTerrain = TerrainType.GRASS) {
        // Capture entrenchment and experience before battle
        const attackerEntrenchBefore = attacker.entrenchment;
        const defenderEntrenchBefore = defender.entrenchment;
        const attackerExpBefore = attacker.experience;
        const defenderExpBefore = defender.experience;

        // Capture fatigue info before performAttack() resets movementRemaining
        const attackerType = attacker.getType();
        const maxMovement = attackerType.movement;
        const movementUsed = maxMovement - attacker.movementRemaining;
        const percentUsed = maxMovement > 0 ? movementUsed / maxMovement : 0;
        const fatigueTiers = Math.min(2, Math.floor(percentUsed / 0.33));
        const penaltyPercent = fatigueTiers * 20;

        // Determine if defender is in close terrain (uses closeDefense)
        const closeTerrain = isCloseTerrain(defenderTerrain);

        // Resolve the battle using the battle resolver
        const result = resolveBattle(attacker, defender, { surpriseAttack, riverAttack, closeTerrain });

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

        // Add prestige from looting (melee attackers who survive and dealt damage)
        let attackerPrestigeGain = 0;
        if (!result.attackerDestroyed && attackerExpGain > 0) {
            attackerPrestigeGain = RebuildSystem.calculateBattlePrestige(attackerExpGain, false);
            this.gameState.prestige += attackerPrestigeGain;
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
            // Update attacker info (player's unit)
            document.getElementById('battle-attacker-name').textContent = `Your ${attacker.getName()}`;
            document.getElementById('battle-attacker-before').textContent = Math.floor(result.attackerStrengthBefore);
            document.getElementById('battle-attacker-after').textContent = Math.floor(result.attackerStrengthAfter);
            document.getElementById('battle-attacker-damage').textContent =
                result.attackerDamage > 0 ? `-${Math.floor(result.attackerDamage)}` : '0';

            // Update defender info (enemy unit)
            document.getElementById('battle-defender-name').textContent = `Enemy ${defender.getName()}`;
            document.getElementById('battle-defender-before').textContent = Math.floor(result.defenderStrengthBefore);
            document.getElementById('battle-defender-after').textContent = Math.floor(result.defenderStrengthAfter);
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${Math.floor(result.defenderDamage)}` : '0';

            // Update status message
            let status = '';
            if (result.attackerDestroyed && result.defenderDestroyed) {
                status = 'Mutual destruction!';
            } else if (result.attackerDestroyed) {
                status = `Your ${attacker.getName()} destroyed!`;
            } else if (result.defenderDestroyed) {
                status = `Enemy ${defender.getName()} destroyed!`;
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
                `${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)} (ratio: ${result.powerRatio.toFixed(2)})`;
            // Display terrain type and which defense was used
            const terrainName = getTerrainProperties(defenderTerrain).name;
            const defenseType = closeTerrain ? 'Close' : 'Ground';
            const defenderType = defender.getType();
            const defenseValue = closeTerrain ? defenderType.closeDefense : defenderType.groundDefense;
            document.getElementById('battle-terrain-info').textContent =
                `${terrainName} (${defenseType} Def: ${defenseValue})`;
            document.getElementById('battle-entrench-info').textContent =
                `${attackerEntrenchBefore} vs ${defenderEntrenchBefore} → ${defenderEntrenchAfter}`;
            // Show experience before → after with gain
            const atkExpStr = result.attackerDestroyed ? attackerExpBefore.toFixed(1) :
                `${attackerExpBefore.toFixed(1)} → ${attacker.experience.toFixed(1)} (+${attackerExpGain.toFixed(2)})`;
            const defExpStr = result.defenderDestroyed ? defenderExpBefore.toFixed(1) :
                `${defenderExpBefore.toFixed(1)} → ${defender.experience.toFixed(1)} (+${defenderExpGain.toFixed(2)})`;
            document.getElementById('battle-exp-info').textContent =
                `${atkExpStr} vs ${defExpStr}`;
            // Display initiative (0 if surprised)
            const baseInit = attacker.getType().initiative;
            // Display initiative (0 if surprised or river attack)
            const lostInitiative = surpriseAttack || riverAttack;
            let initReason = '';
            if (surpriseAttack && riverAttack) initReason = 'surprised + river';
            else if (surpriseAttack) initReason = 'surprised';
            else if (riverAttack) initReason = 'river';
            document.getElementById('battle-init-info').textContent =
                lostInitiative ? `0 (${initReason}, was +${baseInit})` : `+${baseInit} (attacker only)`;

            // Display fatigue (calculated at start of function before performAttack)
            document.getElementById('battle-fatigue-info').textContent =
                fatigueTiers > 0 ? `${fatigueTiers} tier(s) (-${penaltyPercent}% str)` : 'None';

            // Display surprise attack status
            document.getElementById('battle-surprise-info').textContent =
                surpriseAttack ? 'Yes (-20% str, no init)' : 'No';

            // Display river attack status
            document.getElementById('battle-river-info').textContent =
                riverAttack ? 'Yes (-30% str, no init)' : 'No';

            document.getElementById('battle-raw-damage').textContent =
                `Atk: ${result.attackerDamageRaw.toFixed(1)}, Def: ${result.defenderDamageRaw.toFixed(1)}`;

            modal.classList.remove('hidden');

            const okBtn = document.getElementById('battle-ok-btn');
            if (okBtn) {
                okBtn.onclick = () => {
                    modal.classList.add('hidden');

                    // Remove destroyed units
                    this.gameState.units.removeDestroyed();

                    // If defender was destroyed and attacker survived, attacker advances into hex
                    if (result.defenderDestroyed && !result.attackerDestroyed) {
                        // Move attacker to defender's hex (capture the ground)
                        attacker.hex = defenderHex;

                        // Now check castle capture (attacker is in the hex)
                        this.gameState.checkCastleCapture(defenderHex);
                        this.gameState.checkPlayerCastleRecapture(defenderHex);

                        // Check victory
                        if (this.gameState.phase === GamePhase.VICTORY) {
                            this.showVictory();
                        }
                    }

                    // Update visibility after battle
                    this.gameState.updateVisibility();

                    this.updateTurnDisplay();
                    this.render();
                };
            }
        }
    }

    /**
     * Show ranged battle popup (attacker takes no damage)
     * @param {Unit} attacker - The ranged attacking unit
     * @param {Unit} defender - The defending unit
     * @param {string} defenderTerrain - The terrain the defender is on
     */
    showRangedBattlePopup(attacker, defender, defenderTerrain = TerrainType.GRASS) {
        // Capture values before battle
        const attackerExpBefore = attacker.experience;
        const defenderExpBefore = defender.experience;
        const defenderEntrenchBefore = defender.entrenchment;

        // Determine if defender is in close terrain
        const closeTerrain = isCloseTerrain(defenderTerrain);

        // Resolve battle with rangedAttack flag (attacker takes no damage)
        const result = resolveBattle(attacker, defender, { closeTerrain, rangedAttack: true });

        // Apply damage (only defender takes damage in ranged attack)
        defender.takeDamage(result.defenderDamage);

        // Experience gains
        let attackerExpGain = 0;
        let defenderExpGain = 0;
        if (!result.attackerDestroyed) {
            attackerExpGain = attacker.gainExperience(0); // No damage taken
        }
        if (!result.defenderDestroyed) {
            defenderExpGain = defender.gainExperience(result.defenderDamage);
        }

        // Reduce defender entrenchment
        defender.reduceEntrenchment();
        const defenderEntrenchAfter = defender.entrenchment;

        // Store defender hex for castle capture check
        const defenderHex = defender.hex;

        // Log
        console.log('=================================');
        console.log(`   RANGED ATTACK: ${attacker.getName()} fires at ${defender.getName()}`);
        console.log(`   Power: ${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)}`);
        console.log(`   Defender takes ${result.defenderDamage} damage (${result.defenderStrengthBefore} -> ${result.defenderStrengthAfter})`);
        console.log('=================================');

        // Show battle modal
        const modal = document.getElementById('battle-modal');
        if (modal) {
            document.getElementById('battle-attacker-name').textContent = `Your ${attacker.getName()} (Ranged)`;
            document.getElementById('battle-attacker-before').textContent = Math.floor(result.attackerStrengthBefore);
            document.getElementById('battle-attacker-after').textContent = Math.floor(result.attackerStrengthAfter);
            document.getElementById('battle-attacker-damage').textContent = '0';

            document.getElementById('battle-defender-name').textContent = `Enemy ${defender.getName()}`;
            document.getElementById('battle-defender-before').textContent = Math.floor(result.defenderStrengthBefore);
            document.getElementById('battle-defender-after').textContent = Math.floor(result.defenderStrengthAfter);
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${Math.floor(result.defenderDamage)}` : '0';

            let status = result.defenderDestroyed ? `Enemy ${defender.getName()} destroyed!` : 'Target survives.';
            document.getElementById('battle-status').textContent = status;

            const attackerAfter = document.getElementById('battle-attacker-after');
            const defenderAfter = document.getElementById('battle-defender-after');
            attackerAfter.classList.toggle('unit-destroyed', false);
            defenderAfter.classList.toggle('unit-destroyed', result.defenderDestroyed);

            // Update details
            document.getElementById('battle-power-info').textContent =
                `${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)} (ratio: ${result.powerRatio.toFixed(2)})`;
            const terrainName = getTerrainProperties(defenderTerrain).name;
            const defenseType = closeTerrain ? 'Close' : 'Ground';
            const defenderType = defender.getType();
            const defenseValue = closeTerrain ? defenderType.closeDefense : defenderType.groundDefense;
            document.getElementById('battle-terrain-info').textContent =
                `${terrainName} (${defenseType} Def: ${defenseValue})`;
            document.getElementById('battle-entrench-info').textContent =
                `0 vs ${defenderEntrenchBefore} → ${defenderEntrenchAfter}`;
            const atkExpStr = `${attackerExpBefore.toFixed(1)} → ${attacker.experience.toFixed(1)} (+${attackerExpGain.toFixed(2)})`;
            const defExpStr = result.defenderDestroyed ? defenderExpBefore.toFixed(1) :
                `${defenderExpBefore.toFixed(1)} → ${defender.experience.toFixed(1)} (+${defenderExpGain.toFixed(2)})`;
            document.getElementById('battle-exp-info').textContent = `${atkExpStr} vs ${defExpStr}`;
            document.getElementById('battle-init-info').textContent = `+${attacker.getType().initiative} (ranged)`;
            document.getElementById('battle-fatigue-info').textContent = 'N/A (ranged)';
            document.getElementById('battle-surprise-info').textContent = 'No';
            document.getElementById('battle-river-info').textContent = 'No';
            document.getElementById('battle-raw-damage').textContent =
                `Atk: 0 (ranged), Def: ${result.defenderDamageRaw.toFixed(1)}`;

            modal.classList.remove('hidden');

            const okBtn = document.getElementById('battle-ok-btn');
            if (okBtn) {
                okBtn.onclick = () => {
                    modal.classList.add('hidden');
                    this.gameState.units.removeDestroyed();

                    // Note: Ranged attacks do NOT capture castles
                    // A unit must physically move into the castle to capture it

                    this.gameState.updateVisibility();
                    this.updateTurnDisplay();
                    this.render();
                };
            }
        }
    }

    /**
     * Show defensive fire sequence before main battle
     * @param {Unit} attacker - The attacking unit
     * @param {Unit} defender - The defending unit
     * @param {Array<Unit>} artillery - Array of enemy artillery that will fire
     * @param {Object} battleResult - The original battle trigger result
     */
    showDefensiveFireSequence(attacker, defender, artillery, battleResult) {
        // Process defensive fire from each artillery unit
        let artilleryIndex = 0;

        const processNextArtillery = () => {
            if (artilleryIndex >= artillery.length || attacker.isDestroyed()) {
                // All defensive fire done, now show main battle if attacker survived
                if (!attacker.isDestroyed()) {
                    this.showBattlePopup(attacker, defender, battleResult.surpriseAttack, battleResult.riverAttack, battleResult.defenderTerrain);
                } else {
                    // Attacker destroyed by defensive fire
                    this.gameState.units.removeDestroyed();
                    this.gameState.updateVisibility();
                    this.render();
                }
                return;
            }

            const art = artillery[artilleryIndex];
            artilleryIndex++;

            // Execute defensive fire
            const fireResult = this.gameState.executeDefensiveFire(art, attacker);
            if (fireResult.success) {
                this.showDefensiveFirePopup(art, attacker, fireResult.defenderTerrain, processNextArtillery);
            } else {
                // Artillery couldn't fire, move to next
                processNextArtillery();
            }
        };

        processNextArtillery();
    }

    /**
     * Show defensive fire popup (artillery firing at attacker)
     * @param {Unit} artillery - The artillery unit firing
     * @param {Unit} target - The unit being fired upon (the original attacker)
     * @param {string} targetTerrain - The terrain the target is on
     * @param {Function} onClose - Callback when popup is closed
     */
    showDefensiveFirePopup(artillery, target, targetTerrain, onClose) {
        const closeTerrain = isCloseTerrain(targetTerrain);
        const targetExpBefore = target.experience;
        const targetEntrenchBefore = target.entrenchment;

        // Resolve battle (ranged attack - artillery takes no damage)
        const result = resolveBattle(artillery, target, { closeTerrain, rangedAttack: true });

        // Apply damage to target
        target.takeDamage(result.defenderDamage);

        // Experience for target if it survives (they can loot the fallen)
        let targetExpGain = 0;
        if (!result.defenderDestroyed) {
            targetExpGain = target.gainExperience(result.defenderDamage);
            // Defender gains prestige from surviving defensive fire (looting)
            const prestigeGain = RebuildSystem.calculateBattlePrestige(targetExpGain, false);
            this.gameState.prestige += prestigeGain;
        }

        // Reduce entrenchment
        target.reduceEntrenchment();

        console.log(`   DEFENSIVE FIRE: ${artillery.getName()} hits ${target.getName()} for ${result.defenderDamage}`);

        // Show simplified popup for defensive fire
        const modal = document.getElementById('battle-modal');
        if (modal) {
            document.getElementById('battle-attacker-name').textContent = `Enemy ${artillery.getName()} (Def Fire)`;
            document.getElementById('battle-attacker-before').textContent = Math.floor(artillery.strength);
            document.getElementById('battle-attacker-after').textContent = Math.floor(artillery.strength);
            document.getElementById('battle-attacker-damage').textContent = '0';

            document.getElementById('battle-defender-name').textContent = `Your ${target.getName()}`;
            document.getElementById('battle-defender-before').textContent = Math.floor(result.defenderStrengthBefore);
            document.getElementById('battle-defender-after').textContent = Math.floor(result.defenderStrengthAfter);
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${Math.floor(result.defenderDamage)}` : '0';

            let status = result.defenderDestroyed ?
                `Your ${target.getName()} destroyed by defensive fire!` :
                `Defensive fire hits for ${Math.floor(result.defenderDamage)}`;
            document.getElementById('battle-status').textContent = status;

            const attackerAfter = document.getElementById('battle-attacker-after');
            const defenderAfter = document.getElementById('battle-defender-after');
            attackerAfter.classList.toggle('unit-destroyed', false);
            defenderAfter.classList.toggle('unit-destroyed', result.defenderDestroyed);

            // Simplified details for defensive fire
            document.getElementById('battle-power-info').textContent =
                `${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)}`;
            document.getElementById('battle-terrain-info').textContent = 'Defensive Fire';
            document.getElementById('battle-entrench-info').textContent = `${targetEntrenchBefore}`;
            document.getElementById('battle-exp-info').textContent = '-';
            document.getElementById('battle-init-info').textContent = '-';
            document.getElementById('battle-fatigue-info').textContent = '-';
            document.getElementById('battle-surprise-info').textContent = '-';
            document.getElementById('battle-river-info').textContent = '-';
            document.getElementById('battle-raw-damage').textContent = `Def: ${result.defenderDamageRaw.toFixed(1)}`;

            modal.classList.remove('hidden');

            const okBtn = document.getElementById('battle-ok-btn');
            if (okBtn) {
                okBtn.onclick = () => {
                    modal.classList.add('hidden');
                    this.gameState.units.removeDestroyed();
                    this.updateTurnDisplay();
                    this.render();
                    // Continue to next artillery or main battle
                    if (onClose) onClose();
                };
            }
        }
    }

    handleMouseLeave() {
        this.renderer.setHoveredHex(null);
        this.infoPanel.textContent = 'Hover over a hex';
        this.render();
    }

    // --- Touch panning for mobile ---

    handleTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        this.touchStart = { x: touch.clientX, y: touch.clientY };
        this.panStartOffset = { x: this.panOffset.x, y: this.panOffset.y };
        this.isPanning = false;
    }

    handleTouchMove(e) {
        if (!this.touchStart || e.touches.length !== 1) return;
        e.preventDefault(); // Prevent page scroll

        const touch = e.touches[0];
        const dx = touch.clientX - this.touchStart.x;
        const dy = touch.clientY - this.touchStart.y;

        // Only start panning after threshold to distinguish from taps
        if (!this.isPanning && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            this.isPanning = true;
        }

        if (this.isPanning) {
            this.panOffset.x = this.panStartOffset.x + dx;
            this.panOffset.y = this.panStartOffset.y + dy;
            this.clampPanOffset();
            this.applyPanOffset();
        }
    }

    handleTouchEnd(e) {
        if (!this.isPanning && this.touchStart) {
            // Short tap = click at the touch point
            this.handleClick({ clientX: this.touchStart.x, clientY: this.touchStart.y });
        }
        this.touchStart = null;
    }

    applyPanOffset() {
        this.canvas.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
    }

    clampPanOffset() {
        const container = this.canvas.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const minX = rect.width - this.canvas.width;
        const minY = rect.height - this.canvas.height;
        this.panOffset.x = Math.max(minX, Math.min(0, this.panOffset.x));
        this.panOffset.y = Math.max(minY, Math.min(0, this.panOffset.y));
    }

    resetPan() {
        this.panOffset = { x: 0, y: 0 };
        this.applyPanOffset();
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
                // Cancel inspect mode if active, otherwise deselect
                if (this.inspectMode) {
                    this.toggleInspectMode();
                } else {
                    this.gameState.deselectHex();
                    this.gameState.deselectUnit();
                    this.updateHighlights();
                    this.render();
                }
                break;
            case 'i':
                // Toggle inspect mode
                this.toggleInspectMode();
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

        // Check for defeat (ran out of turns in offense, or all castles lost in defense)
        if (this.gameState.phase === GamePhase.DEFEAT) {
            this.showDefeat();
            return;
        }

        // Check for defense victory (survived all turns)
        if (this.gameState.phase === GamePhase.VICTORY) {
            this.showVictory();
            return;
        }

        // Execute enemy AI actions
        const enemyActions = EnemyAI.executeEnemyTurn(this.gameState);

        // Show enemy action results
        if (enemyActions.length > 0) {
            this.showEnemyActionsSequence(enemyActions, 0, () => {
                // After all enemy actions, check for defense defeat (castle captured)
                if (this.gameState.phase === GamePhase.DEFEAT) {
                    this.showDefeat();
                    return;
                }
                // Reset player units for the new turn
                this.gameState.units.resetTurn(0);
                this.updateHighlights();
                this.render();
                console.log(`Turn ${this.gameState.turn} begins`);
            });
        } else {
            // Reset player units for the new turn
            this.gameState.units.resetTurn(0);
            this.updateHighlights();
            this.render();
            console.log(`Turn ${this.gameState.turn} begins`);
        }
    }

    /**
     * Show enemy actions one by one with modals
     * @param {Array} actions - Array of enemy action results
     * @param {number} index - Current action index
     */
    showEnemyActionsSequence(actions, index, onComplete = null) {
        if (index >= actions.length) {
            if (onComplete) {
                onComplete();
            } else {
                // All actions shown, reset player units for the new turn
                this.gameState.units.resetTurn(0);
                this.updateHighlights();
                this.render();
                console.log(`Turn ${this.gameState.turn} begins`);
            }
            return;
        }

        const action = actions[index];

        // Handle castle capture events (no modal needed, just log)
        if (action.type === 'castle_captured') {
            console.log(`Horde captured a castle at (${action.hex.q}, ${action.hex.r})!`);
            this.updateTurnDisplay();
            this.render();
            this.showEnemyActionsSequence(actions, index + 1, onComplete);
            return;
        }

        this.showEnemyActionModal(action, () => {
            // Show next action after modal is closed
            this.showEnemyActionsSequence(actions, index + 1, onComplete);
        });
    }

    /**
     * Show a modal for an enemy action
     * @param {Object} action - The enemy action result
     * @param {Function} onClose - Callback when modal is closed
     */
    showEnemyActionModal(action, onClose) {
        const { attacker, defender, result, type } = action;

        // Log to console
        let actionType = type === 'ranged_attack' ? 'fires at' : 'attacks';
        if (type === 'defensive_fire') actionType = 'defensive fire on';
        console.log('=================================');
        console.log(`   ENEMY: ${attacker.getName()} ${actionType} ${defender.getName()}`);
        console.log(`   Power: ${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)}`);
        console.log(`   Result: ${result.attackerStrengthBefore} -> ${result.attackerStrengthAfter} vs ${result.defenderStrengthBefore} -> ${result.defenderStrengthAfter}`);
        console.log('=================================');

        // Use the battle modal
        const modal = document.getElementById('battle-modal');
        if (modal) {
            // Update attacker info
            if (type === 'defensive_fire') {
                // Defensive fire: attacker is player artillery, defender is enemy unit
                document.getElementById('battle-attacker-name').textContent = `Your ${attacker.getName()} (Def Fire)`;
            } else {
                document.getElementById('battle-attacker-name').textContent = `Enemy ${attacker.getName()}`;
            }
            document.getElementById('battle-attacker-before').textContent = Math.floor(result.attackerStrengthBefore);
            document.getElementById('battle-attacker-after').textContent = Math.floor(result.attackerStrengthAfter);
            document.getElementById('battle-attacker-damage').textContent =
                result.attackerDamage > 0 ? `-${Math.floor(result.attackerDamage)}` : '0';

            // Update defender info
            if (type === 'defensive_fire') {
                document.getElementById('battle-defender-name').textContent = `Enemy ${defender.getName()}`;
            } else {
                document.getElementById('battle-defender-name').textContent = `Your ${defender.getName()}`;
            }
            document.getElementById('battle-defender-before').textContent = Math.floor(result.defenderStrengthBefore);
            document.getElementById('battle-defender-after').textContent = Math.floor(result.defenderStrengthAfter);
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${Math.floor(result.defenderDamage)}` : '0';

            // Update status message
            let status = '';
            if (type === 'defensive_fire') {
                // Defensive fire: attacker=player, defender=enemy
                if (result.attackerDestroyed && result.defenderDestroyed) {
                    status = 'Mutual destruction!';
                } else if (result.defenderDestroyed) {
                    status = `Enemy ${defender.getName()} destroyed!`;
                } else {
                    status = `Defensive fire hits for ${Math.floor(result.defenderDamage)}`;
                }
            } else {
                // Normal enemy attack: attacker=enemy, defender=player
                if (result.attackerDestroyed && result.defenderDestroyed) {
                    status = 'Mutual destruction!';
                } else if (result.attackerDestroyed) {
                    status = `Enemy ${attacker.getName()} destroyed!`;
                } else if (result.defenderDestroyed) {
                    status = `Your ${defender.getName()} destroyed!`;
                } else {
                    status = 'Both units survive.';
                }
            }
            document.getElementById('battle-status').textContent = status;

            // Apply destroyed styling
            const attackerAfter = document.getElementById('battle-attacker-after');
            const defenderAfter = document.getElementById('battle-defender-after');
            attackerAfter.classList.toggle('unit-destroyed', result.attackerDestroyed);
            defenderAfter.classList.toggle('unit-destroyed', result.defenderDestroyed);

            // Update battle details
            document.getElementById('battle-power-info').textContent =
                `${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)} (ratio: ${result.powerRatio.toFixed(2)})`;
            document.getElementById('battle-terrain-info').textContent = type === 'defensive_fire' ? 'Defensive Fire' : (type === 'ranged_attack' ? 'Ranged Attack' : 'Melee Attack');
            document.getElementById('battle-entrench-info').textContent = 'Enemy Turn';
            document.getElementById('battle-exp-info').textContent = '-';

            // Handle surprise/river/fatigue info
            const surpriseInfo = document.getElementById('battle-surprise-info');
            const riverInfo = document.getElementById('battle-river-info');
            const fatigueInfo = document.getElementById('battle-fatigue-info');
            const rawDamage = document.getElementById('battle-raw-damage');

            if (surpriseInfo) surpriseInfo.textContent = 'No';
            if (riverInfo) riverInfo.textContent = 'No';
            if (fatigueInfo) fatigueInfo.textContent = '0%';
            if (rawDamage) rawDamage.textContent = `Atk: ${result.attackerDamageRaw.toFixed(1)}, Def: ${result.defenderDamageRaw.toFixed(1)}`;

            modal.classList.remove('hidden');

            // Re-render to show updated unit states
            this.render();

            // Set up close handler
            const okBtn = document.getElementById('battle-ok-btn');
            const closeHandler = () => {
                modal.classList.add('hidden');
                okBtn.removeEventListener('click', closeHandler);
                onClose();
            };
            okBtn.addEventListener('click', closeHandler);
        } else {
            // No modal, just continue
            onClose();
        }
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

        // Show castle status
        if (cell.terrain === TerrainType.CASTLE) {
            if (this.gameState.gameMode === 'defense') {
                if (this.gameState.playerCastleKeys.includes(hex.key)) {
                    if (this.gameState.lostCastles.includes(hex.key)) {
                        info += ' [LOST]';
                    } else {
                        info += ' [Defending]';
                    }
                }
            } else {
                if (this.gameState.isCastleCaptured(hex)) {
                    info += ' [CAPTURED]';
                } else {
                    info += ' [Enemy]';
                }
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
    newGame(name = 'Puddy General', levelId = 1, options = {}) {
        this.gameState = GameState.create(name, levelId);

        // Apply prestige carry-over from previous level (before marketplace shows)
        if (options.prestige !== undefined) {
            this.gameState.prestige = options.prestige;
        }

        GameStorage.saveGame(this.gameState);
        this.resetPan();
        this.gameState.updateVisibility();
        this.updateHighlights();
        this.updateTurnDisplay();
        this.render();
        this.logGameState();

        // Get level info
        const level = LevelManager.getLevel(levelId);
        if (level) {
            console.log(`Starting Level ${level.id}: ${level.name}`);
            console.log(level.description);

            // Set max units from level config if available
            if (level.maxUnits) {
                this.marketplaceMaxUnits = level.maxUnits;
            }

            // Show marketplace for Level 2+ (when showMarketplace is true)
            if (level.showMarketplace) {
                this.showMarketplaceModal();
            } else if (level.introText) {
                // No marketplace, go straight to level intro
                this.showLevelIntroModal(level);
            }
        }
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    game = new Game();

    // Expose some functions to console for debugging
    window.game = game;
    window.newGame = (name, levelId) => game.newGame(name, levelId);
    window.save = () => game.save();

    console.log('Puddy General loaded!');
    console.log('Keyboard shortcuts:');
    console.log('  G - Toggle grid');
    console.log('  F - Toggle fog of war');
    console.log('  C - Toggle coordinates');
    console.log('  E - End turn');
    console.log('  Ctrl+S - Save');
    console.log('  Escape - Deselect');
});
