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

        // Inspect button
        const inspectBtn = document.getElementById('inspect-btn');
        if (inspectBtn) {
            inspectBtn.addEventListener('click', () => {
                this.toggleInspectMode();
            });
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

        const prestigeDisplay = document.getElementById('prestige-display');
        if (prestigeDisplay) {
            prestigeDisplay.textContent = this.gameState.prestige;
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
     * Toggle inspection mode
     */
    toggleInspectMode() {
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
        document.getElementById('inspect-unit-name').textContent = unitType.name;

        // Status section
        document.getElementById('inspect-strength').textContent = `${unit.strength}/10`;
        document.getElementById('inspect-movement').textContent = `${unit.movementRemaining}/${unitType.movement}`;
        document.getElementById('inspect-ammo').textContent =
            unit.ammo === null ? 'Unlimited' : `${unit.ammo}/${unitType.maxAmmo}`;
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

                document.getElementById('inspect-missing-strength').textContent = costs.missingStrength;

                // Show full cost, and if partial, also show what's affordable
                if (affordableExp.affordableStrength > 0 && affordableExp.affordableStrength < costs.missingStrength) {
                    document.getElementById('rebuild-cost-exp').textContent =
                        `Full: ${costs.withExp} | +${affordableExp.affordableStrength} str: ${affordableExp.cost}`;
                } else {
                    document.getElementById('rebuild-cost-exp').textContent = `Cost: ${costs.withExp}`;
                }

                if (affordableCheap.affordableStrength > 0 && affordableCheap.affordableStrength < costs.missingStrength) {
                    document.getElementById('rebuild-cost-cheap').textContent =
                        `Full: ${costs.cheap} | +${affordableCheap.affordableStrength} str: ${affordableCheap.cost}`;
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
                let msg = `Rebuilt! +${result.strengthGained} str, Cost: ${result.cost}`;
                if (result.expLost > 0) {
                    msg += `, Exp lost: ${result.expLost.toFixed(2)}`;
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
            document.getElementById('battle-attacker-name').textContent = attacker.getName() + ' (Ranged)';
            document.getElementById('battle-attacker-before').textContent = result.attackerStrengthBefore;
            document.getElementById('battle-attacker-after').textContent = result.attackerStrengthAfter;
            document.getElementById('battle-attacker-damage').textContent = '0';

            document.getElementById('battle-defender-name').textContent = defender.getName();
            document.getElementById('battle-defender-before').textContent = result.defenderStrengthBefore;
            document.getElementById('battle-defender-after').textContent = result.defenderStrengthAfter;
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${result.defenderDamage}` : '0';

            let status = result.defenderDestroyed ? `${defender.getName()} destroyed!` : 'Target survives.';
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

                    if (result.defenderDestroyed) {
                        this.gameState.checkCastleCapture(defenderHex);
                        if (this.gameState.phase === GamePhase.VICTORY) {
                            this.showVictory();
                        }
                    }

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
            document.getElementById('battle-attacker-name').textContent = artillery.getName() + ' (Def Fire)';
            document.getElementById('battle-attacker-before').textContent = artillery.strength;
            document.getElementById('battle-attacker-after').textContent = artillery.strength;
            document.getElementById('battle-attacker-damage').textContent = '0';

            document.getElementById('battle-defender-name').textContent = target.getName();
            document.getElementById('battle-defender-before').textContent = result.defenderStrengthBefore;
            document.getElementById('battle-defender-after').textContent = result.defenderStrengthAfter;
            document.getElementById('battle-defender-damage').textContent =
                result.defenderDamage > 0 ? `-${result.defenderDamage}` : '0';

            let status = result.defenderDestroyed ?
                `${target.getName()} destroyed by defensive fire!` :
                `Defensive fire hits for ${result.defenderDamage}`;
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

        // Execute enemy AI actions
        const enemyActions = EnemyAI.executeEnemyTurn(this.gameState);

        // Show enemy action results
        if (enemyActions.length > 0) {
            this.showEnemyActionsSequence(enemyActions, 0);
        } else {
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
    showEnemyActionsSequence(actions, index) {
        if (index >= actions.length) {
            // All actions shown, continue game
            this.updateHighlights();
            this.render();
            console.log(`Turn ${this.gameState.turn} begins`);
            return;
        }

        const action = actions[index];
        this.showEnemyActionModal(action, () => {
            // Show next action after modal is closed
            this.showEnemyActionsSequence(actions, index + 1);
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
        const actionType = type === 'ranged_attack' ? 'fires at' : 'attacks';
        console.log('=================================');
        console.log(`   ENEMY: ${attacker.getName()} ${actionType} ${defender.getName()}`);
        console.log(`   Power: ${result.attackerPower.toFixed(1)} vs ${result.defenderPower.toFixed(1)}`);
        console.log(`   Result: ${result.attackerStrengthBefore} -> ${result.attackerStrengthAfter} vs ${result.defenderStrengthBefore} -> ${result.defenderStrengthAfter}`);
        console.log('=================================');

        // Use the battle modal
        const modal = document.getElementById('battle-modal');
        if (modal) {
            // Update attacker info (enemy)
            document.getElementById('battle-attacker-name').textContent = `Enemy ${attacker.getName()}`;
            document.getElementById('battle-attacker-before').textContent = result.attackerStrengthBefore;
            document.getElementById('battle-attacker-after').textContent = result.attackerStrengthAfter;
            document.getElementById('battle-attacker-damage').textContent =
                result.attackerDamage > 0 ? `-${result.attackerDamage}` : '0';

            // Update defender info (player)
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
                status = `Enemy ${attacker.getName()} destroyed!`;
            } else if (result.defenderDestroyed) {
                status = `Your ${defender.getName()} destroyed!`;
            } else {
                status = 'Both units survive.';
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
            document.getElementById('battle-terrain-info').textContent = type === 'ranged_attack' ? 'Ranged Attack' : 'Melee Attack';
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
