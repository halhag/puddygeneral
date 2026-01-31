/**
 * Renders individual hexagons with terrain
 * Uses cartoonish, clear visual style
 */
class HexRenderer {
    constructor(ctx, layout) {
        this.ctx = ctx;
        this.layout = layout;
    }

    // Draw a hex path (shared by multiple methods)
    drawHexPath(hex) {
        const corners = this.layout.hexCorners(hex);
        this.ctx.beginPath();
        this.ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            this.ctx.lineTo(corners[i].x, corners[i].y);
        }
        this.ctx.closePath();
    }

    // Draw filled hex with terrain color and decorations
    drawTerrain(cell) {
        const props = getTerrainProperties(cell.terrain);

        // Draw base fill
        this.drawHexPath(cell.hex);
        this.ctx.fillStyle = props.color;
        this.ctx.fill();

        // Draw terrain-specific decorations
        this.drawTerrainIcon(cell, props);
    }

    // Draw terrain-specific icons
    drawTerrainIcon(cell, props) {
        const center = this.layout.hexToPixel(cell.hex);
        const size = this.layout.size;

        switch (cell.terrain) {
            case TerrainType.WOODS:
                this.drawTrees(center, size);
                break;
            case TerrainType.CASTLE:
                this.drawCastle(center, size);
                break;
            case TerrainType.MOUNTAIN:
                this.drawMountain(center, size);
                break;
            case TerrainType.HILL:
                this.drawHill(center, size);
                break;
            case TerrainType.WATER:
                this.drawWaves(center, size);
                break;
            // RIVER hexes have grass background - river line drawn separately
        }
    }

    // Stylized trees for woods (3 simple triangular trees)
    drawTrees(center, size) {
        const positions = [
            { x: 0, y: -size * 0.25 },
            { x: -size * 0.28, y: size * 0.18 },
            { x: size * 0.28, y: size * 0.18 }
        ];

        positions.forEach((pos, i) => {
            const tx = center.x + pos.x;
            const ty = center.y + pos.y;
            const treeSize = size * (0.35 - i * 0.03);

            // Tree trunk
            this.ctx.fillStyle = '#8b4513';
            this.ctx.fillRect(tx - 2, ty + treeSize * 0.3, 4, treeSize * 0.3);

            // Tree foliage (layered triangles)
            this.ctx.fillStyle = '#155724';
            this.ctx.beginPath();
            this.ctx.moveTo(tx, ty - treeSize * 0.4);
            this.ctx.lineTo(tx - treeSize * 0.35, ty + treeSize * 0.3);
            this.ctx.lineTo(tx + treeSize * 0.35, ty + treeSize * 0.3);
            this.ctx.closePath();
            this.ctx.fill();

            // Lighter highlight
            this.ctx.fillStyle = '#1e7e34';
            this.ctx.beginPath();
            this.ctx.moveTo(tx, ty - treeSize * 0.3);
            this.ctx.lineTo(tx - treeSize * 0.2, ty + treeSize * 0.15);
            this.ctx.lineTo(tx + treeSize * 0.2, ty + treeSize * 0.15);
            this.ctx.closePath();
            this.ctx.fill();
        });
    }

    // Castle tower with battlements
    drawCastle(center, size) {
        const s = size * 0.5;

        // Castle base/wall
        this.ctx.fillStyle = '#6c757d';
        this.ctx.fillRect(center.x - s * 0.5, center.y - s * 0.2, s, s * 0.7);

        // Main tower
        this.ctx.fillStyle = '#495057';
        this.ctx.fillRect(center.x - s * 0.25, center.y - s * 0.6, s * 0.5, s * 0.8);

        // Battlements (crenellations)
        const bw = s * 0.12;
        const bh = s * 0.18;
        this.ctx.fillStyle = '#495057';
        for (let i = -2; i <= 2; i++) {
            if (i === 0) continue; // Skip middle for tower
            this.ctx.fillRect(
                center.x + i * bw * 1.5 - bw / 2,
                center.y - s * 0.35,
                bw,
                bh
            );
        }

        // Tower top battlements
        this.ctx.fillRect(center.x - s * 0.2, center.y - s * 0.75, bw, bh);
        this.ctx.fillRect(center.x + s * 0.08, center.y - s * 0.75, bw, bh);

        // Door
        this.ctx.fillStyle = '#3d3d3d';
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y + s * 0.25, s * 0.12, Math.PI, 0, false);
        this.ctx.fill();
        this.ctx.fillRect(center.x - s * 0.12, center.y + s * 0.25, s * 0.24, s * 0.2);

        // Flag on tower
        this.ctx.fillStyle = '#dc3545';
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y - s * 0.75);
        this.ctx.lineTo(center.x, center.y - s * 1.0);
        this.ctx.lineTo(center.x + s * 0.2, center.y - s * 0.88);
        this.ctx.closePath();
        this.ctx.fill();

        // Flagpole
        this.ctx.strokeStyle = '#3d3d3d';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y - s * 0.6);
        this.ctx.lineTo(center.x, center.y - s * 1.0);
        this.ctx.stroke();
    }

    // Mountain peaks with snow
    drawMountain(center, size) {
        // Back mountain (slightly offset)
        this.ctx.fillStyle = '#6b5344';
        this.ctx.beginPath();
        this.ctx.moveTo(center.x + size * 0.15, center.y - size * 0.3);
        this.ctx.lineTo(center.x - size * 0.15, center.y + size * 0.35);
        this.ctx.lineTo(center.x + size * 0.45, center.y + size * 0.35);
        this.ctx.closePath();
        this.ctx.fill();

        // Main mountain
        this.ctx.fillStyle = '#8b7355';
        this.ctx.beginPath();
        this.ctx.moveTo(center.x - size * 0.05, center.y - size * 0.45);
        this.ctx.lineTo(center.x - size * 0.4, center.y + size * 0.35);
        this.ctx.lineTo(center.x + size * 0.3, center.y + size * 0.35);
        this.ctx.closePath();
        this.ctx.fill();

        // Snow cap on main peak
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.moveTo(center.x - size * 0.05, center.y - size * 0.45);
        this.ctx.lineTo(center.x - size * 0.18, center.y - size * 0.15);
        this.ctx.lineTo(center.x + size * 0.08, center.y - size * 0.15);
        this.ctx.closePath();
        this.ctx.fill();

        // Snow highlight
        this.ctx.fillStyle = '#e8e8e8';
        this.ctx.beginPath();
        this.ctx.moveTo(center.x + size * 0.15, center.y - size * 0.3);
        this.ctx.lineTo(center.x + size * 0.05, center.y - size * 0.1);
        this.ctx.lineTo(center.x + size * 0.22, center.y - size * 0.1);
        this.ctx.closePath();
        this.ctx.fill();
    }

    // Rolling hill with contour lines
    drawHill(center, size) {
        // Hill mound
        this.ctx.fillStyle = '#b8956b';
        this.ctx.beginPath();
        this.ctx.ellipse(
            center.x,
            center.y + size * 0.15,
            size * 0.4,
            size * 0.25,
            0, Math.PI, 0, true
        );
        this.ctx.fill();

        // Contour lines
        this.ctx.strokeStyle = '#a08040';
        this.ctx.lineWidth = 2;

        for (let i = 0; i < 3; i++) {
            const yOffset = size * (0.1 - i * 0.08);
            const xScale = 1 - i * 0.25;
            this.ctx.beginPath();
            this.ctx.ellipse(
                center.x,
                center.y + yOffset,
                size * 0.35 * xScale,
                size * 0.12 * xScale,
                0, Math.PI * 0.85, Math.PI * 0.15, true
            );
            this.ctx.stroke();
        }
    }

    // Water waves
    drawWaves(center, size) {
        this.ctx.strokeStyle = '#85c1e9';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';

        const waveCount = 3;
        for (let i = 0; i < waveCount; i++) {
            const y = center.y - size * 0.2 + i * size * 0.2;
            this.ctx.beginPath();
            this.ctx.moveTo(center.x - size * 0.3, y);
            this.ctx.quadraticCurveTo(
                center.x - size * 0.15, y - size * 0.08,
                center.x, y
            );
            this.ctx.quadraticCurveTo(
                center.x + size * 0.15, y + size * 0.08,
                center.x + size * 0.3, y
            );
            this.ctx.stroke();
        }
    }

    // Draw hex grid outline
    drawGridLine(cell) {
        this.drawHexPath(cell.hex);
        this.ctx.strokeStyle = CONFIG.GRID_LINE_COLOR;
        this.ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
        this.ctx.stroke();
    }

    // Draw selection highlight
    drawSelection(cell) {
        this.drawHexPath(cell.hex);
        this.ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        this.ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        this.ctx.stroke();
    }

    // Draw hover highlight
    drawHover(cell) {
        this.drawHexPath(cell.hex);
        this.ctx.fillStyle = CONFIG.HOVER_COLOR;
        this.ctx.fill();
    }

    // Draw coordinate labels (for debugging)
    drawCoordinates(cell) {
        const center = this.layout.hexToPixel(cell.hex);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${cell.hex.q},${cell.hex.r}`, center.x, center.y + this.layout.size * 0.5);
    }
}
