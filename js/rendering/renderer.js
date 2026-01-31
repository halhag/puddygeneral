/**
 * Main renderer - orchestrates all drawing operations
 */
class MapRenderer {
    constructor(canvas, hexLayout) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.layout = hexLayout;

        this.hexRenderer = new HexRenderer(this.ctx, this.layout);
        this.edgeRenderer = new EdgeRenderer(this.ctx, this.layout);
        this.fogRenderer = new FogOfWarRenderer(this.ctx, this.layout);
        this.unitRenderer = new UnitRenderer(this.ctx, this.layout);

        // Currently hovered hex
        this.hoveredHex = null;

        // Highlight arrays (set by game logic)
        this.placementHighlights = [];
        this.movementHighlights = [];
    }

    // Main render loop
    render(gameState) {
        this.clear();

        if (!gameState || !gameState.map) return;

        const cells = gameState.map.getAllCells();

        // Set clipping region for clean rectangular edges
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(
            CONFIG.MAP_OFFSET_X - 10,
            CONFIG.MAP_OFFSET_Y - 10,
            CONFIG.CANVAS_WIDTH - CONFIG.MAP_OFFSET_X - 20,
            CONFIG.CANVAS_HEIGHT - CONFIG.MAP_OFFSET_Y - 20
        );
        this.ctx.clip();

        // Layer 1: Base terrain
        cells.forEach(cell => {
            this.hexRenderer.drawTerrain(cell);
        });

        // Layer 2: Rivers (drawn as continuous path)
        if (gameState.map.riverPath && gameState.map.riverPath.length > 0) {
            this.drawRiverPath(gameState.map.riverPath);
        }

        // Layer 3: Roads and bridges
        cells.forEach(cell => {
            this.edgeRenderer.drawRoadsOnly(cell, gameState.map);
        });

        // Layer 4: Captured castle overlay
        this.drawCapturedCastles(gameState);

        // Layer 5: Grid lines
        if (gameState.settings.showGrid) {
            cells.forEach(cell => {
                this.hexRenderer.drawGridLine(cell);
            });
        }

        // Layer 6: Fog of war overlay
        if (gameState.settings.fogOfWar) {
            cells.forEach(cell => {
                this.fogRenderer.drawFog(cell);
            });
        }

        // Layer 7: Placement/Movement highlights
        if (this.placementHighlights.length > 0) {
            this.unitRenderer.drawPlacementHighlights(this.placementHighlights);
        }
        if (this.movementHighlights.length > 0) {
            this.unitRenderer.drawMovementHighlights(this.movementHighlights);
        }

        // Layer 8: Hover highlight
        if (this.hoveredHex) {
            const hoveredCell = gameState.map.getCell(this.hoveredHex);
            if (hoveredCell) {
                this.hexRenderer.drawHover(hoveredCell);
            }
        }

        // Layer 9: Selection highlight
        if (gameState.selectedHex) {
            const selectedCell = gameState.map.getCell(gameState.selectedHex);
            if (selectedCell) {
                this.hexRenderer.drawSelection(selectedCell);
            }
        }

        // Layer 10: Units
        this.unitRenderer.drawUnits(gameState.units);

        // Layer 11: Selected unit highlight
        if (gameState.selectedUnit) {
            const unit = gameState.units.getUnit(gameState.selectedUnit);
            if (unit) {
                this.unitRenderer.drawUnitSelection(unit);
            }
        }

        // Layer 12: Coordinates (debug mode)
        if (gameState.settings.showCoordinates) {
            cells.forEach(cell => {
                this.hexRenderer.drawCoordinates(cell);
            });
        }

        // Restore context (remove clipping)
        this.ctx.restore();

        // Draw border around map area
        this.ctx.strokeStyle = '#4a4a6a';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            CONFIG.MAP_OFFSET_X - 10,
            CONFIG.MAP_OFFSET_Y - 10,
            CONFIG.CANVAS_WIDTH - CONFIG.MAP_OFFSET_X - 20,
            CONFIG.CANVAS_HEIGHT - CONFIG.MAP_OFFSET_Y - 20
        );
    }

    // Draw river as a path connecting hex centers
    drawRiverPath(riverPath) {
        if (riverPath.length < 2) return;

        const ctx = this.ctx;

        // Draw connections between consecutive river hexes
        for (let i = 0; i < riverPath.length - 1; i++) {
            const hex1 = new Hex(riverPath[i].q, riverPath[i].r);
            const hex2 = new Hex(riverPath[i + 1].q, riverPath[i + 1].r);

            const center1 = this.layout.hexToPixel(hex1);
            const center2 = this.layout.hexToPixel(hex2);

            // Find the edge midpoint between the two hexes
            let edgeMid = null;
            for (let dir = 0; dir < 6; dir++) {
                if (hex1.neighbor(dir).equals(hex2)) {
                    edgeMid = this.layout.getEdgeMidpoint(hex1, dir);
                    break;
                }
            }

            if (edgeMid) {
                // Draw from center1 to edge midpoint to center2
                // This creates straight segments, not zigzag

                // River outline
                ctx.strokeStyle = '#1565c0';
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                ctx.beginPath();
                ctx.moveTo(center1.x, center1.y);
                ctx.lineTo(edgeMid.x, edgeMid.y);
                ctx.lineTo(center2.x, center2.y);
                ctx.stroke();

                // River main color
                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.moveTo(center1.x, center1.y);
                ctx.lineTo(edgeMid.x, edgeMid.y);
                ctx.lineTo(center2.x, center2.y);
                ctx.stroke();

                // River highlight
                ctx.strokeStyle = '#85c1e9';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(center1.x, center1.y);
                ctx.lineTo(edgeMid.x, edgeMid.y);
                ctx.lineTo(center2.x, center2.y);
                ctx.stroke();
            }
        }
    }

    // Clear the canvas
    clear() {
        // Dark background
        this.ctx.fillStyle = '#16213e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Map area background (slightly different shade)
        this.ctx.fillStyle = '#1a2540';
        this.ctx.fillRect(
            CONFIG.MAP_OFFSET_X - 10,
            CONFIG.MAP_OFFSET_Y - 10,
            CONFIG.CANVAS_WIDTH - CONFIG.MAP_OFFSET_X - 20,
            CONFIG.CANVAS_HEIGHT - CONFIG.MAP_OFFSET_Y - 20
        );
    }

    // Set hovered hex
    setHoveredHex(hex) {
        this.hoveredHex = hex;
    }

    // Convert mouse position to canvas coordinates
    getCanvasCoords(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    // Get hex at mouse position
    getHexAtPoint(point) {
        return this.layout.pixelToHex(point);
    }

    // Set placement highlights
    setPlacementHighlights(hexes) {
        this.placementHighlights = hexes || [];
    }

    // Set movement highlights
    setMovementHighlights(hexes) {
        this.movementHighlights = hexes || [];
    }

    // Clear all highlights
    clearHighlights() {
        this.placementHighlights = [];
        this.movementHighlights = [];
    }

    // Draw captured castle overlay
    drawCapturedCastles(gameState) {
        if (!gameState.capturedCastles || gameState.capturedCastles.length === 0) return;

        for (const key of gameState.capturedCastles) {
            const hex = Hex.fromKey(key);
            const corners = this.layout.hexCorners(hex);

            // Draw blue tint over captured castle
            this.ctx.fillStyle = 'rgba(74, 144, 217, 0.4)';
            this.ctx.beginPath();
            this.ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 6; i++) {
                this.ctx.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();

            // Draw flag/banner to indicate capture
            const center = this.layout.hexToPixel(hex);
            this.drawCaptureFlag(center);
        }
    }

    // Draw a small flag to show castle is captured
    drawCaptureFlag(center) {
        const x = center.x + this.layout.size * 0.3;
        const y = center.y - this.layout.size * 0.4;

        // Pole
        this.ctx.strokeStyle = '#4a4a4a';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y - this.layout.size * 0.4);
        this.ctx.stroke();

        // Flag
        this.ctx.fillStyle = '#4a90d9';
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - this.layout.size * 0.4);
        this.ctx.lineTo(x + this.layout.size * 0.25, y - this.layout.size * 0.3);
        this.ctx.lineTo(x, y - this.layout.size * 0.2);
        this.ctx.closePath();
        this.ctx.fill();
    }
}
