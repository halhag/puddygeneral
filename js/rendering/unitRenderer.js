/**
 * Renders units on the hex map
 * Medieval miniature style - painted board-game figures matching the
 * illuminated campaign-map terrain. All geometry scales from layout.size.
 */
class UnitRenderer {
    constructor(ctx, layout) {
        this.ctx = ctx;
        this.layout = layout;
    }

    /**
     * Draw all units
     * @param {UnitManager} unitManager
     * @param {GameState} gameState - Used to check visibility
     */
    drawUnits(unitManager, gameState = null) {
        for (const unit of unitManager.getAllUnits()) {
            // If fog of war is enabled, only draw enemy units if visible
            if (gameState && gameState.settings.fogOfWar) {
                // Always draw own units
                if (unit.playerId === gameState.currentPlayer) {
                    this.drawUnit(unit);
                }
                // Only draw enemy units if they're visible
                else if (gameState.isHexVisible(unit.hex)) {
                    this.drawUnit(unit);
                }
            } else {
                // No fog of war, draw all units
                this.drawUnit(unit);
            }
        }
    }

    /**
     * Check if a unit has finished its turn (can't do anything more useful)
     * @param {Unit} unit
     * @returns {boolean}
     */
    isUnitDone(unit) {
        // Unit is done if it has attacked OR has no movement remaining
        if (unit.hasAttacked) return true;
        if (unit.movementRemaining <= 0) return true;
        return false;
    }

    /**
     * Draw a single unit
     * @param {Unit} unit
     */
    drawUnit(unit) {
        const center = this.layout.hexToPixel(unit.hex);
        const size = this.layout.size;
        const unitType = unit.getType();

        // Player heraldry - dimmed if unit is done for the turn
        const isDone = unit.playerId === 0 && this.isUnitDone(unit);  // Only show for player units
        const playerColors = {
            0: { main: '#2e5fa3', dark: '#1e4174', light: '#5b8dd6', trim: '#d9b44a' },  // Royal blue, gold trim
            1: { main: '#a32e2e', dark: '#6b1e1e', light: '#d65b5b', trim: '#2b2622' }   // Crimson, black-iron trim
        };
        let heraldry = playerColors[unit.playerId] || playerColors[0];

        // If unit is done, use desaturated, darker heraldry
        if (isDone) {
            heraldry = { main: '#46566e', dark: '#303c4e', light: '#66788e', trim: '#9a917a' };
        }

        // Full miniature palette (accessory tones mute along with the heraldry)
        const colors = {
            main: heraldry.main,
            dark: heraldry.dark,
            light: heraldry.light,
            trim: heraldry.trim,
            outline: 'rgba(40, 28, 16, 0.78)',
            steel: isDone ? '#82868c' : '#aab1b9',
            steelDark: isDone ? '#5c6065' : '#6e747b',
            skin: isDone ? '#b7a68e' : '#e8c39a',
            mail: isDone ? '#75797f' : '#8b9096',
            wood: isDone ? '#6d5b45' : '#8a6238',
            woodLight: isDone ? '#7e6a50' : '#a07c4c',
            woodDark: isDone ? '#4c4132' : '#5c4126',
            rope: isDone ? '#9a8f76' : '#c9b68a',
            // Player mounts are rich brown; enemy rides dapple grey
            horse: unit.playerId === 1 ? '#a4a49a' : (isDone ? '#6a5847' : '#7a5433'),
            horseDark: unit.playerId === 1 ? '#7e7e76' : (isDone ? '#4e4234' : '#5b3e24')
        };

        this.ctx.save();
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        // Draw based on unit class
        switch (unitType.unitClass) {
            case UnitClass.INFANTRY:
                this.drawInfantry(center, size, colors, unit);
                break;
            case UnitClass.SIEGE:
                this.drawSiege(center, size, colors, unit);
                break;
            case UnitClass.CAVALRY:
                this.drawCavalry(center, size, colors, unit);
                break;
            default:
                this.drawGenericUnit(center, size, colors, unit);
        }

        // Draw strength indicator
        this.drawStrength(center, size, unit.strength);

        // Draw movement indicator if unit has moved but not done
        if (unit.movementRemaining < unitType.movement && !isDone) {
            this.drawMovedIndicator(center, size);
        }

        // Draw "done" indicator for player units that have finished their turn
        if (isDone) {
            this.drawDoneIndicator(center, size);
        }

        this.ctx.restore();
    }

    /**
     * Draw infantry unit (Men-at-Arms): standing soldier with kettle helm,
     * tunic over mail, tall kite shield with heraldic cross, spear behind.
     */
    drawInfantry(center, size, colors, unit) {
        const ctx = this.ctx;
        const k = size;
        const cx = center.x, cy = center.y;
        const lw = Math.max(1.2, k * 0.03);

        // Spear shaft (diagonal, behind the figure)
        ctx.strokeStyle = colors.wood;
        ctx.lineWidth = Math.max(1.5, k * 0.045);
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.30, cy + k * 0.46);
        ctx.lineTo(cx + k * 0.26, cy - k * 0.42);
        ctx.stroke();
        // Steel spear tip (leaf blade continuing the shaft line)
        ctx.fillStyle = colors.steel;
        ctx.beginPath();
        ctx.moveTo(cx + k * 0.285, cy - k * 0.404);
        ctx.lineTo(cx + k * 0.335, cy - k * 0.545);
        ctx.lineTo(cx + k * 0.234, cy - k * 0.436);
        ctx.closePath();
        ctx.fill();

        // Legs (dark hose, mostly hidden behind the shield)
        ctx.strokeStyle = colors.steelDark;
        ctx.lineWidth = Math.max(2, k * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.05, cy + k * 0.10);
        ctx.lineTo(cx - k * 0.06, cy + k * 0.40);
        ctx.moveTo(cx + k * 0.08, cy + k * 0.10);
        ctx.lineTo(cx + k * 0.10, cy + k * 0.40);
        ctx.stroke();

        // Mail undersleeves (grey, slightly wider than the tunic)
        ctx.fillStyle = colors.mail;
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.22, cy - k * 0.26);
        ctx.lineTo(cx + k * 0.22, cy - k * 0.26);
        ctx.lineTo(cx + k * 0.17, cy + k * 0.14);
        ctx.lineTo(cx - k * 0.17, cy + k * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = lw;
        ctx.stroke();

        // Tunic in player color over the mail
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.16, cy - k * 0.28);
        ctx.lineTo(cx + k * 0.16, cy - k * 0.28);
        ctx.lineTo(cx + k * 0.13, cy + k * 0.12);
        ctx.lineTo(cx - k * 0.13, cy + k * 0.12);
        ctx.closePath();
        ctx.fill();
        // Shaded right side of the tunic (2-tone)
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.moveTo(cx + k * 0.04, cy - k * 0.28);
        ctx.lineTo(cx + k * 0.16, cy - k * 0.28);
        ctx.lineTo(cx + k * 0.13, cy + k * 0.12);
        ctx.lineTo(cx + k * 0.02, cy + k * 0.12);
        ctx.closePath();
        ctx.fill();

        // Head (skin) under a steel kettle helm
        ctx.fillStyle = colors.skin;
        ctx.beginPath();
        ctx.arc(cx + k * 0.01, cy - k * 0.36, k * 0.095, 0, Math.PI * 2);
        ctx.fill();
        // Helm dome
        ctx.fillStyle = colors.steel;
        ctx.beginPath();
        ctx.arc(cx + k * 0.01, cy - k * 0.395, k * 0.105, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        // Wide kettle brim
        ctx.beginPath();
        ctx.ellipse(cx + k * 0.01, cy - k * 0.39, k * 0.155, k * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.steelDark;
        ctx.lineWidth = Math.max(1, k * 0.015);
        ctx.stroke();

        // Tall kite shield held in front (left of body)
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.30, cy - k * 0.08);
        ctx.quadraticCurveTo(cx - k * 0.13, cy - k * 0.20, cx + k * 0.04, cy - k * 0.08);
        ctx.quadraticCurveTo(cx + k * 0.05, cy + k * 0.22, cx - k * 0.13, cy + k * 0.50);
        ctx.quadraticCurveTo(cx - k * 0.31, cy + k * 0.22, cx - k * 0.30, cy - k * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = Math.max(1.4, k * 0.032);
        ctx.stroke();
        // Shaded right half of shield (2-tone)
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.13, cy - k * 0.155);
        ctx.lineTo(cx - k * 0.13, cy + k * 0.49);
        ctx.quadraticCurveTo(cx + k * 0.04, cy + k * 0.22, cx + k * 0.03, cy - k * 0.075);
        ctx.quadraticCurveTo(cx - k * 0.04, cy - k * 0.14, cx - k * 0.13, cy - k * 0.155);
        ctx.closePath();
        ctx.fill();
        // Contrasting heraldic cross on the shield
        ctx.strokeStyle = colors.trim;
        ctx.lineWidth = Math.max(2, k * 0.05);
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.13, cy - k * 0.10);
        ctx.lineTo(cx - k * 0.13, cy + k * 0.36);
        ctx.moveTo(cx - k * 0.25, cy + k * 0.04);
        ctx.lineTo(cx - k * 0.01, cy + k * 0.04);
        ctx.stroke();
    }

    /**
     * Draw siege unit (Trebuchet): side-view wooden frame with A-frame
     * supports, pivoted throwing arm, counterweight box, sling and wheels.
     * Faces toward the enemy side.
     */
    drawSiege(center, size, colors, unit) {
        const ctx = this.ctx;
        const k = size;
        const f = unit.playerId === 1 ? -1 : 1;  // face the opposing army
        const X = (dx) => center.x + dx * k * f;
        const Y = (dy) => center.y + dy * k;

        // Rear A-frame (darker wood, drawn first for depth)
        ctx.strokeStyle = colors.woodDark;
        ctx.lineWidth = Math.max(2, k * 0.05);
        ctx.beginPath();
        ctx.moveTo(X(-0.24), Y(0.36));
        ctx.lineTo(X(0.01), Y(-0.13));
        ctx.lineTo(X(0.28), Y(0.36));
        ctx.stroke();

        // Ground beam with a plank line
        ctx.fillStyle = colors.wood;
        ctx.beginPath();
        ctx.moveTo(X(-0.52), Y(0.32));
        ctx.lineTo(X(0.52), Y(0.32));
        ctx.lineTo(X(0.52), Y(0.40));
        ctx.lineTo(X(-0.52), Y(0.40));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = Math.max(1, k * 0.02);
        ctx.stroke();
        ctx.strokeStyle = colors.woodDark;
        ctx.beginPath();
        ctx.moveTo(X(-0.48), Y(0.36));
        ctx.lineTo(X(0.48), Y(0.36));
        ctx.stroke();

        // Small wooden wheels
        ctx.fillStyle = colors.woodDark;
        ctx.strokeStyle = colors.outline;
        ctx.beginPath();
        ctx.arc(X(-0.40), Y(0.42), k * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(0.40), Y(0.42), k * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = colors.woodLight;
        ctx.beginPath();
        ctx.arc(X(-0.40), Y(0.42), k * 0.03, 0, Math.PI * 2);
        ctx.arc(X(0.40), Y(0.42), k * 0.03, 0, Math.PI * 2);
        ctx.fill();

        // Front A-frame with cross-brace
        ctx.strokeStyle = colors.wood;
        ctx.lineWidth = Math.max(2.2, k * 0.055);
        ctx.beginPath();
        ctx.moveTo(X(-0.30), Y(0.36));
        ctx.lineTo(X(-0.04), Y(-0.14));
        ctx.lineTo(X(0.24), Y(0.36));
        ctx.moveTo(X(-0.19), Y(0.14));
        ctx.lineTo(X(0.13), Y(0.14));
        ctx.stroke();

        // Player-color pennant on the frame apex
        ctx.strokeStyle = colors.woodDark;
        ctx.lineWidth = Math.max(1, k * 0.018);
        ctx.beginPath();
        ctx.moveTo(X(-0.04), Y(-0.16));
        ctx.lineTo(X(-0.04), Y(-0.36));
        ctx.stroke();
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.moveTo(X(-0.04), Y(-0.36));
        ctx.lineTo(X(-0.20), Y(-0.31));
        ctx.lineTo(X(-0.04), Y(-0.26));
        ctx.closePath();
        ctx.fill();

        // Throwing arm: short counterweight end low, long sling end high
        ctx.strokeStyle = colors.wood;
        ctx.lineWidth = Math.max(2.4, k * 0.06);
        ctx.beginPath();
        ctx.moveTo(X(-0.30), Y(0.11));
        ctx.lineTo(X(0.32), Y(-0.48));
        ctx.stroke();
        // Lighter grain line along the arm (2-tone wood)
        ctx.strokeStyle = colors.woodLight;
        ctx.lineWidth = Math.max(1, k * 0.02);
        ctx.beginPath();
        ctx.moveTo(X(-0.26), Y(0.065));
        ctx.lineTo(X(0.28), Y(-0.445));
        ctx.stroke();

        // Pivot axle
        ctx.fillStyle = colors.steelDark;
        ctx.beginPath();
        ctx.arc(X(-0.04), Y(-0.14), k * 0.035, 0, Math.PI * 2);
        ctx.fill();

        // Counterweight box hanging from the short end
        ctx.strokeStyle = colors.woodDark;
        ctx.lineWidth = Math.max(1, k * 0.02);
        ctx.beginPath();
        ctx.moveTo(X(-0.30), Y(0.11));
        ctx.lineTo(X(-0.34), Y(0.20));
        ctx.moveTo(X(-0.30), Y(0.11));
        ctx.lineTo(X(-0.24), Y(0.20));
        ctx.stroke();
        ctx.fillStyle = colors.woodDark;
        ctx.beginPath();
        ctx.moveTo(X(-0.37), Y(0.20));
        ctx.lineTo(X(-0.21), Y(0.20));
        ctx.lineTo(X(-0.20), Y(0.34));
        ctx.lineTo(X(-0.38), Y(0.34));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.stroke();

        // Sling strap drooping from the long end, with pouch
        ctx.strokeStyle = colors.rope;
        ctx.lineWidth = Math.max(1, k * 0.018);
        ctx.beginPath();
        ctx.moveTo(X(0.32), Y(-0.48));
        ctx.quadraticCurveTo(X(0.36), Y(-0.36), X(0.44), Y(-0.35));
        ctx.moveTo(X(0.32), Y(-0.48));
        ctx.quadraticCurveTo(X(0.42), Y(-0.44), X(0.44), Y(-0.35));
        ctx.stroke();
        ctx.fillStyle = colors.woodDark;
        ctx.beginPath();
        ctx.arc(X(0.44), Y(-0.35), k * 0.035, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draw cavalry unit (Knights): side-view knight on horseback with
     * caparison in player color, great-helm rider, couched lance and
     * teardrop shield. Faces toward the opposing army.
     */
    drawCavalry(center, size, colors, unit) {
        const ctx = this.ctx;
        const k = size;
        const f = unit.playerId === 1 ? -1 : 1;  // face the opposing army
        const X = (dx) => center.x + dx * k * f;
        const Y = (dy) => center.y + dy * k;
        const lw = Math.max(1.2, k * 0.03);

        // Far legs and tail (darker tone, behind the body)
        ctx.strokeStyle = colors.horseDark;
        ctx.lineWidth = Math.max(2, k * 0.055);
        ctx.beginPath();
        ctx.moveTo(X(-0.20), Y(0.20));
        ctx.lineTo(X(-0.25), Y(0.46));
        ctx.moveTo(X(0.14), Y(0.20));
        ctx.lineTo(X(0.19), Y(0.46));
        ctx.moveTo(X(-0.33), Y(0.06));
        ctx.quadraticCurveTo(X(-0.42), Y(0.14), X(-0.41), Y(0.30));
        ctx.stroke();

        // Horse body
        ctx.fillStyle = colors.horse;
        ctx.beginPath();
        ctx.ellipse(X(-0.02), Y(0.12), k * 0.34, k * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = lw;
        ctx.stroke();

        // Neck and head
        ctx.fillStyle = colors.horse;
        ctx.beginPath();
        ctx.moveTo(X(0.12), Y(0.12));
        ctx.lineTo(X(0.26), Y(-0.24));
        ctx.lineTo(X(0.28), Y(-0.33));
        ctx.lineTo(X(0.33), Y(-0.26));
        ctx.lineTo(X(0.46), Y(-0.15));
        ctx.lineTo(X(0.44), Y(-0.09));
        ctx.lineTo(X(0.30), Y(-0.05));
        ctx.lineTo(X(0.24), Y(0.12));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Near legs (body tone, in front)
        ctx.strokeStyle = colors.horse;
        ctx.lineWidth = Math.max(2, k * 0.055);
        ctx.beginPath();
        ctx.moveTo(X(-0.13), Y(0.24));
        ctx.lineTo(X(-0.15), Y(0.48));
        ctx.moveTo(X(0.21), Y(0.24));
        ctx.lineTo(X(0.25), Y(0.48));
        ctx.stroke();

        // Caparison (cloth drape in player color across the body)
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.moveTo(X(-0.37), Y(0.00));
        ctx.lineTo(X(0.20), Y(-0.01));
        ctx.lineTo(X(0.26), Y(0.10));
        ctx.lineTo(X(0.23), Y(0.30));
        ctx.lineTo(X(-0.35), Y(0.30));
        ctx.closePath();
        ctx.fill();
        // Shaded rear of the caparison (2-tone)
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.moveTo(X(-0.37), Y(0.00));
        ctx.lineTo(X(-0.10), Y(0.00));
        ctx.lineTo(X(-0.12), Y(0.30));
        ctx.lineTo(X(-0.35), Y(0.30));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(X(-0.37), Y(0.00));
        ctx.lineTo(X(0.20), Y(-0.01));
        ctx.lineTo(X(0.26), Y(0.10));
        ctx.lineTo(X(0.23), Y(0.30));
        ctx.lineTo(X(-0.35), Y(0.30));
        ctx.closePath();
        ctx.stroke();
        // Trim band along the hem
        ctx.strokeStyle = colors.trim;
        ctx.lineWidth = Math.max(1, k * 0.02);
        ctx.beginPath();
        ctx.moveTo(X(-0.34), Y(0.26));
        ctx.lineTo(X(0.235), Y(0.26));
        ctx.stroke();

        // Rider torso (lighter surcoat, leaning slightly forward)
        ctx.fillStyle = colors.light;
        ctx.beginPath();
        ctx.moveTo(X(-0.03), Y(-0.08));
        ctx.lineTo(X(0.01), Y(-0.34));
        ctx.lineTo(X(0.15), Y(-0.34));
        ctx.lineTo(X(0.16), Y(-0.08));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = lw;
        ctx.stroke();

        // Great-helm (flat-topped steel) with eye slit
        ctx.fillStyle = colors.steel;
        ctx.beginPath();
        ctx.moveTo(X(0.03), Y(-0.47));
        ctx.lineTo(X(0.15), Y(-0.47));
        ctx.lineTo(X(0.15), Y(-0.33));
        ctx.lineTo(X(0.03), Y(-0.33));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = colors.steelDark;
        ctx.lineWidth = Math.max(1, k * 0.018);
        ctx.beginPath();
        ctx.moveTo(X(0.045), Y(-0.405));
        ctx.lineTo(X(0.145), Y(-0.405));
        ctx.stroke();

        // Couched lance angling forward with steel tip
        ctx.strokeStyle = colors.wood;
        ctx.lineWidth = Math.max(1.5, k * 0.035);
        ctx.beginPath();
        ctx.moveTo(X(-0.16), Y(0.02));
        ctx.lineTo(X(0.52), Y(-0.38));
        ctx.stroke();
        ctx.fillStyle = colors.steel;
        ctx.beginPath();
        ctx.moveTo(X(0.533), Y(-0.358));
        ctx.lineTo(X(0.607), Y(-0.431));
        ctx.lineTo(X(0.507), Y(-0.402));
        ctx.closePath();
        ctx.fill();

        // Small teardrop shield at the rider's side
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.arc(X(0.20), Y(-0.17), k * 0.07, Math.PI, 0);
        ctx.quadraticCurveTo(X(0.265), Y(-0.05), X(0.20), Y(0.02));
        ctx.quadraticCurveTo(X(0.135), Y(-0.05), X(0.13), Y(-0.17));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colors.trim;
        ctx.lineWidth = Math.max(1, k * 0.022);
        ctx.stroke();
    }

    /**
     * Draw generic unit: a round shield with player-color field,
     * gold boss and rim.
     */
    drawGenericUnit(center, size, colors, unit) {
        const ctx = this.ctx;
        const cx = center.x, cy = center.y;

        // Shield field
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = Math.max(1.4, size * 0.032);
        ctx.stroke();

        // Offset lighter field (painted highlight)
        ctx.fillStyle = colors.light;
        ctx.beginPath();
        ctx.arc(cx - size * 0.04, cy - size * 0.04, size * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // Gold rim
        ctx.strokeStyle = colors.trim;
        ctx.lineWidth = Math.max(1.5, size * 0.035);
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
        ctx.stroke();

        // Gold boss
        ctx.fillStyle = colors.trim;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = Math.max(1, size * 0.015);
        ctx.stroke();
    }

    /**
     * Draw strength number on a small heater-shield badge (parchment fill)
     */
    drawStrength(center, size, strength) {
        const ctx = this.ctx;
        const x = center.x + size * 0.34;
        const y = center.y + size * 0.34;
        const w = size * 0.17;   // half width
        const h = size * 0.22;   // half height

        // Heater shield shape: flat top, sides curving to a bottom point
        ctx.fillStyle = '#e8dcc0';
        ctx.beginPath();
        ctx.moveTo(x - w, y - h * 0.7);
        ctx.lineTo(x + w, y - h * 0.7);
        ctx.quadraticCurveTo(x + w, y + h * 0.15, x, y + h * 0.9);
        ctx.quadraticCurveTo(x - w, y + h * 0.15, x - w, y - h * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 28, 16, 0.85)';
        ctx.lineWidth = Math.max(1, size * 0.022);
        ctx.stroke();

        // Strength number (dark inks readable on parchment)
        ctx.fillStyle = strength > 5 ? '#2f6b27' : (strength > 2 ? '#9c6b12' : '#9e2b25');
        ctx.font = `bold ${Math.max(9, Math.round(size * 0.24))}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.floor(strength).toString(), x, y - h * 0.02);
    }

    /**
     * Draw indicator that unit has already moved (small gold diamond)
     */
    drawMovedIndicator(center, size) {
        const ctx = this.ctx;
        const x = center.x - size * 0.35;
        const y = center.y - size * 0.35;
        const d = size * 0.1;

        ctx.fillStyle = '#d9b44a';
        ctx.beginPath();
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d * 0.7, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d * 0.7, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 28, 16, 0.7)';
        ctx.lineWidth = Math.max(1, size * 0.015);
        ctx.stroke();
    }

    /**
     * Draw indicator that unit has finished its turn
     * (checkmark on a small parchment disc)
     */
    drawDoneIndicator(center, size) {
        const ctx = this.ctx;
        const x = center.x - size * 0.35;
        const y = center.y - size * 0.35;
        const checkSize = size * 0.12;

        // Parchment disc
        ctx.fillStyle = '#e8dcc0';
        ctx.beginPath();
        ctx.arc(x, y, checkSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 28, 16, 0.7)';
        ctx.lineWidth = Math.max(1, size * 0.015);
        ctx.stroke();

        // Checkmark in dark green ink
        ctx.strokeStyle = '#3c7d32';
        ctx.lineWidth = Math.max(1.5, size * 0.03);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x - checkSize * 0.5, y);
        ctx.lineTo(x - checkSize * 0.1, y + checkSize * 0.4);
        ctx.lineTo(x + checkSize * 0.5, y - checkSize * 0.4);
        ctx.stroke();
    }

    /**
     * Draw selection ring around a unit: double gold ring with 4 corner ticks
     * @param {Unit} unit
     */
    drawUnitSelection(unit) {
        const ctx = this.ctx;
        const center = this.layout.hexToPixel(unit.hex);
        const size = this.layout.size;

        ctx.save();
        ctx.lineCap = 'round';

        // Outer gold ring
        ctx.strokeStyle = '#d9b44a';
        ctx.lineWidth = Math.max(2, size * 0.04);
        ctx.beginPath();
        ctx.arc(center.x, center.y, size * 0.56, 0, Math.PI * 2);
        ctx.stroke();

        // Inner, fainter ring
        ctx.strokeStyle = 'rgba(217, 180, 74, 0.55)';
        ctx.lineWidth = Math.max(1, size * 0.018);
        ctx.beginPath();
        ctx.arc(center.x, center.y, size * 0.48, 0, Math.PI * 2);
        ctx.stroke();

        // Four small corner ticks crossing the outer ring
        ctx.strokeStyle = '#d9b44a';
        ctx.lineWidth = Math.max(2, size * 0.035);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = Math.PI / 4 + i * Math.PI / 2;
            const c = Math.cos(angle), s = Math.sin(angle);
            ctx.moveTo(center.x + c * size * 0.50, center.y + s * size * 0.50);
            ctx.lineTo(center.x + c * size * 0.64, center.y + s * size * 0.64);
        }
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Draw highlight on hexes where units can be placed (green)
     * @param {Array<Hex>} hexes - Array of valid placement hexes
     */
    drawPlacementHighlights(hexes) {
        for (const hex of hexes) {
            const center = this.layout.hexToPixel(hex);
            const corners = this.layout.hexCorners(hex);

            // Soft green fill
            this.ctx.fillStyle = 'rgba(130, 235, 100, 0.25)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Strong green border
            this.ctx.strokeStyle = 'rgba(120, 235, 90, 0.95)';
            this.ctx.lineWidth = Math.max(2, this.layout.size * 0.04);
            this.ctx.stroke();

            // Inner inset trim line
            this.ctx.strokeStyle = 'rgba(190, 255, 160, 0.6)';
            this.ctx.lineWidth = Math.max(1, this.layout.size * 0.02);
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const ix = center.x + (corners[i].x - center.x) * 0.86;
                const iy = center.y + (corners[i].y - center.y) * 0.86;
                if (i === 0) this.ctx.moveTo(ix, iy);
                else this.ctx.lineTo(ix, iy);
            }
            this.ctx.closePath();
            this.ctx.stroke();
        }
    }

    /**
     * Draw highlight on hexes where selected unit can move (blue)
     * @param {Array<Hex>} hexes - Array of reachable hexes
     */
    drawMovementHighlights(hexes) {
        for (const hex of hexes) {
            const center = this.layout.hexToPixel(hex);
            const corners = this.layout.hexCorners(hex);

            // Soft blue fill
            this.ctx.fillStyle = 'rgba(90, 140, 220, 0.20)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Strong blue border
            this.ctx.strokeStyle = 'rgba(65, 115, 200, 0.85)';
            this.ctx.lineWidth = Math.max(2, this.layout.size * 0.04);
            this.ctx.stroke();

            // Inner inset trim line
            this.ctx.strokeStyle = 'rgba(150, 190, 255, 0.5)';
            this.ctx.lineWidth = Math.max(1, this.layout.size * 0.02);
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const ix = center.x + (corners[i].x - center.x) * 0.86;
                const iy = center.y + (corners[i].y - center.y) * 0.86;
                if (i === 0) this.ctx.moveTo(ix, iy);
                else this.ctx.lineTo(ix, iy);
            }
            this.ctx.closePath();
            this.ctx.stroke();
        }
    }

    /**
     * Draw highlight on hexes that can be targeted by ranged attack (orange)
     * @param {Array<Hex>} hexes - Array of targetable hexes
     */
    drawRangedTargetHighlights(hexes) {
        for (const hex of hexes) {
            const center = this.layout.hexToPixel(hex);
            const corners = this.layout.hexCorners(hex);

            // Soft orange fill (distinct from movement blue)
            this.ctx.fillStyle = 'rgba(235, 120, 50, 0.25)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Strong orange border
            this.ctx.strokeStyle = 'rgba(215, 100, 35, 0.9)';
            this.ctx.lineWidth = Math.max(2, this.layout.size * 0.04);
            this.ctx.stroke();

            // Target reticle: small ring with four ticks
            const s = this.layout.size;
            this.ctx.strokeStyle = 'rgba(245, 140, 60, 0.95)';
            this.ctx.lineWidth = Math.max(1.5, s * 0.03);
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, s * 0.15, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(center.x - s * 0.26, center.y);
            this.ctx.lineTo(center.x - s * 0.10, center.y);
            this.ctx.moveTo(center.x + s * 0.10, center.y);
            this.ctx.lineTo(center.x + s * 0.26, center.y);
            this.ctx.moveTo(center.x, center.y - s * 0.26);
            this.ctx.lineTo(center.x, center.y - s * 0.10);
            this.ctx.moveTo(center.x, center.y + s * 0.10);
            this.ctx.lineTo(center.x, center.y + s * 0.26);
            this.ctx.stroke();
        }
    }
}
