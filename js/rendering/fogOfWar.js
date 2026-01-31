/**
 * Fog of War overlay renderer
 *
 * Visibility states:
 * - 'hidden': Never seen, completely dark
 * - 'explored': Previously seen but no unit nearby, dimmed
 * - 'visible': Currently visible by a unit, full brightness
 */
class FogOfWarRenderer {
    constructor(ctx, layout) {
        this.ctx = ctx;
        this.layout = layout;
    }

    // Draw fog overlay for a cell based on visibility
    drawFog(cell) {
        if (cell.visibility === 'visible') return;

        const corners = this.layout.hexCorners(cell.hex);

        this.ctx.beginPath();
        this.ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            this.ctx.lineTo(corners[i].x, corners[i].y);
        }
        this.ctx.closePath();

        if (cell.visibility === 'hidden') {
            this.ctx.fillStyle = CONFIG.FOG_HIDDEN_COLOR;
        } else if (cell.visibility === 'explored') {
            this.ctx.fillStyle = CONFIG.FOG_EXPLORED_COLOR;
        }

        this.ctx.fill();
    }
}
