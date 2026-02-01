/**
 * Renders units on the hex map
 * Simple iconic style matching the terrain
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
     * Draw a single unit
     * @param {Unit} unit
     */
    drawUnit(unit) {
        const center = this.layout.hexToPixel(unit.hex);
        const size = this.layout.size;
        const unitType = unit.getType();

        // Player colors
        const playerColors = {
            0: { main: '#4a90d9', dark: '#2d5a8a', light: '#7ab8f5' },  // Blue
            1: { main: '#d94a4a', dark: '#8a2d2d', light: '#f57a7a' }   // Red
        };
        const colors = playerColors[unit.playerId] || playerColors[0];

        // Draw based on unit class
        switch (unitType.unitClass) {
            case UnitClass.INFANTRY:
                this.drawInfantry(center, size, colors, unit);
                break;
            case UnitClass.SIEGE:
                this.drawSiege(center, size, colors, unit);
                break;
            default:
                this.drawGenericUnit(center, size, colors, unit);
        }

        // Draw strength indicator
        this.drawStrength(center, size, unit.strength);

        // Draw movement indicator if unit has moved
        if (unit.movementRemaining < unitType.movement) {
            this.drawMovedIndicator(center, size);
        }
    }

    /**
     * Draw infantry unit (shield and spear icon)
     */
    drawInfantry(center, size, colors, unit) {
        const s = size * 0.4;

        // Shield shape
        this.ctx.fillStyle = colors.main;
        this.ctx.beginPath();
        this.ctx.moveTo(center.x - s * 0.5, center.y - s * 0.6);
        this.ctx.lineTo(center.x + s * 0.5, center.y - s * 0.6);
        this.ctx.lineTo(center.x + s * 0.5, center.y + s * 0.2);
        this.ctx.lineTo(center.x, center.y + s * 0.6);
        this.ctx.lineTo(center.x - s * 0.5, center.y + s * 0.2);
        this.ctx.closePath();
        this.ctx.fill();

        // Shield border
        this.ctx.strokeStyle = colors.dark;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Shield emblem (simple cross or line)
        this.ctx.strokeStyle = colors.light;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y - s * 0.4);
        this.ctx.lineTo(center.x, center.y + s * 0.3);
        this.ctx.moveTo(center.x - s * 0.3, center.y - s * 0.1);
        this.ctx.lineTo(center.x + s * 0.3, center.y - s * 0.1);
        this.ctx.stroke();
    }

    /**
     * Draw siege unit (trebuchet icon)
     */
    drawSiege(center, size, colors, unit) {
        const s = size * 0.4;

        // Draw base/platform
        this.ctx.fillStyle = colors.dark;
        this.ctx.fillRect(center.x - s * 0.6, center.y + s * 0.2, s * 1.2, s * 0.3);

        // Draw throwing arm
        this.ctx.strokeStyle = colors.main;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(center.x - s * 0.1, center.y + s * 0.2);
        this.ctx.lineTo(center.x - s * 0.4, center.y - s * 0.5);
        this.ctx.stroke();

        // Draw counterweight
        this.ctx.fillStyle = colors.main;
        this.ctx.beginPath();
        this.ctx.arc(center.x + s * 0.2, center.y + s * 0.1, s * 0.25, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = colors.dark;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw projectile (small circle at end of arm)
        this.ctx.fillStyle = colors.light;
        this.ctx.beginPath();
        this.ctx.arc(center.x - s * 0.4, center.y - s * 0.5, s * 0.15, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * Draw generic unit (circle)
     */
    drawGenericUnit(center, size, colors, unit) {
        const radius = size * 0.35;

        this.ctx.fillStyle = colors.main;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = colors.dark;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    /**
     * Draw strength number
     */
    drawStrength(center, size, strength) {
        // Background circle
        const x = center.x + size * 0.35;
        const y = center.y + size * 0.35;
        const radius = size * 0.2;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = '#4a4a6a';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // Strength number
        this.ctx.fillStyle = strength > 5 ? '#7ed56f' : (strength > 2 ? '#f0ad4e' : '#d9534f');
        this.ctx.font = `bold ${size * 0.25}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(strength.toString(), x, y);
    }

    /**
     * Draw indicator that unit has already moved
     */
    drawMovedIndicator(center, size) {
        const x = center.x - size * 0.35;
        const y = center.y - size * 0.35;

        this.ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, size * 0.1, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * Draw selection ring around a unit
     * @param {Unit} unit
     */
    drawUnitSelection(unit) {
        const center = this.layout.hexToPixel(unit.hex);
        const size = this.layout.size;

        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, size * 0.5, 0, Math.PI * 2);
        this.ctx.stroke();

        // Pulsing effect (simplified - just a second ring)
        this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, size * 0.6, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    /**
     * Draw highlight on hexes where units can be placed
     * @param {Array<Hex>} hexes - Array of valid placement hexes
     */
    drawPlacementHighlights(hexes) {
        for (const hex of hexes) {
            const center = this.layout.hexToPixel(hex);
            const corners = this.layout.hexCorners(hex);

            // Semi-transparent green fill
            this.ctx.fillStyle = 'rgba(100, 255, 100, 0.3)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Green border
            this.ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    /**
     * Draw highlight on hexes where selected unit can move
     * @param {Array<Hex>} hexes - Array of reachable hexes
     */
    drawMovementHighlights(hexes) {
        for (const hex of hexes) {
            const corners = this.layout.hexCorners(hex);

            // Semi-transparent blue fill
            this.ctx.fillStyle = 'rgba(100, 150, 255, 0.25)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Blue border
            this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.6)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    /**
     * Draw highlight on hexes that can be targeted by ranged attack
     * @param {Array<Hex>} hexes - Array of targetable hexes
     */
    drawRangedTargetHighlights(hexes) {
        for (const hex of hexes) {
            const corners = this.layout.hexCorners(hex);

            // Semi-transparent orange/red fill (different from movement)
            this.ctx.fillStyle = 'rgba(255, 120, 50, 0.35)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Orange border
            this.ctx.strokeStyle = 'rgba(255, 120, 50, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw crosshair icon to indicate ranged target
            const center = this.layout.hexToPixel(hex);
            const s = this.layout.size * 0.2;
            this.ctx.strokeStyle = 'rgba(255, 120, 50, 0.9)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            // Horizontal line
            this.ctx.moveTo(center.x - s, center.y);
            this.ctx.lineTo(center.x + s, center.y);
            // Vertical line
            this.ctx.moveTo(center.x, center.y - s);
            this.ctx.lineTo(center.x, center.y + s);
            this.ctx.stroke();
        }
    }
}
