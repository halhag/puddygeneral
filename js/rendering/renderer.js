/**
 * Main renderer - orchestrates all drawing operations
 *
 * Owns the camera: a world-space offset {x, y} describing which part of the
 * (larger-than-screen) map is visible. All map layers are drawn in world
 * space inside a translated context; screen-space decorations (frame,
 * vignette) are drawn afterwards.
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

        // Camera (world coords of the viewport's top-left corner, CSS px)
        this.camera = { x: 0, y: 0 };

        // Viewport size in CSS px and device pixel ratio (set via resize())
        this.viewWidth = canvas.width;
        this.viewHeight = canvas.height;
        this.dpr = 1;

        // World bounds of the current map (computed lazily per map + zoom)
        this.worldBounds = null;
        this.boundsMap = null;
        this.boundsHexSize = 0;

        // Currently hovered hex
        this.hoveredHex = null;

        // Highlight arrays (set by game logic)
        this.placementHighlights = [];
        this.movementHighlights = [];
        this.rangedTargetHighlights = [];
    }

    // --- Viewport / camera management ---

    /**
     * Resize the canvas backing store for the given CSS size and pixel ratio.
     */
    resize(cssWidth, cssHeight, dpr = window.devicePixelRatio || 1) {
        this.viewWidth = Math.max(1, cssWidth);
        this.viewHeight = Math.max(1, cssHeight);
        this.dpr = dpr;
        this.canvas.width = Math.round(this.viewWidth * dpr);
        this.canvas.height = Math.round(this.viewHeight * dpr);
        this.clampCamera();
    }

    /**
     * Compute the pixel-space bounding box of the whole map (plus padding).
     */
    computeWorldBounds(map) {
        const cells = map.getAllCells();
        if (cells.length === 0) {
            this.worldBounds = { minX: 0, minY: 0, maxX: this.viewWidth, maxY: this.viewHeight };
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const halfW = this.layout.hexWidth / 2;
        const halfH = this.layout.hexHeight / 2;

        for (const cell of cells) {
            const c = this.layout.hexToPixel(cell.hex);
            if (c.x - halfW < minX) minX = c.x - halfW;
            if (c.x + halfW > maxX) maxX = c.x + halfW;
            if (c.y - halfH < minY) minY = c.y - halfH;
            if (c.y + halfH > maxY) maxY = c.y + halfH;
        }

        const pad = CONFIG.MAP_PADDING;
        this.worldBounds = {
            minX: minX - pad,
            minY: minY - pad,
            maxX: maxX + pad,
            maxY: maxY + pad
        };
        this.boundsMap = map;
        this.boundsHexSize = this.layout.size;
    }

    // Ensure bounds match the current map and zoom level
    ensureWorldBounds(map) {
        if (!this.worldBounds || this.boundsMap !== map || this.boundsHexSize !== this.layout.size) {
            this.computeWorldBounds(map);
            this.clampCamera();
        }
    }

    /**
     * Keep the camera inside the world bounds.
     * If the world is smaller than the viewport along an axis, center it.
     */
    clampCamera() {
        const b = this.worldBounds;
        if (!b) return;

        const worldW = b.maxX - b.minX;
        const worldH = b.maxY - b.minY;

        if (worldW <= this.viewWidth) {
            this.camera.x = b.minX - (this.viewWidth - worldW) / 2;
        } else {
            this.camera.x = Math.max(b.minX, Math.min(b.maxX - this.viewWidth, this.camera.x));
        }

        if (worldH <= this.viewHeight) {
            this.camera.y = b.minY - (this.viewHeight - worldH) / 2;
        } else {
            this.camera.y = Math.max(b.minY, Math.min(b.maxY - this.viewHeight, this.camera.y));
        }
    }

    // Move the camera by a delta (world px). Returns true if it actually moved.
    panBy(dx, dy) {
        const oldX = this.camera.x;
        const oldY = this.camera.y;
        this.camera.x += dx;
        this.camera.y += dy;
        this.clampCamera();
        return this.camera.x !== oldX || this.camera.y !== oldY;
    }

    // Center the camera on a world point
    centerOnWorld(pt) {
        this.camera.x = pt.x - this.viewWidth / 2;
        this.camera.y = pt.y - this.viewHeight / 2;
        this.clampCamera();
    }

    // Center the camera on a hex
    centerOnHex(hex) {
        this.centerOnWorld(this.layout.hexToPixel(hex));
    }

    /**
     * Change the rendered hex size (zoom), keeping the world point under
     * the given screen anchor fixed. Anchor defaults to viewport center.
     */
    setHexSize(newSize, anchorScreen = null) {
        const clamped = Math.max(CONFIG.MIN_HEX_SIZE, Math.min(CONFIG.MAX_HEX_SIZE, newSize));
        if (clamped === this.layout.size) return false;

        const anchor = anchorScreen || { x: this.viewWidth / 2, y: this.viewHeight / 2 };
        const worldBefore = this.screenToWorld(anchor);
        const scale = clamped / this.layout.size;

        this.layout.size = clamped;

        // Layout origin is (0,0), so world coords scale linearly with size
        this.camera.x = worldBefore.x * scale - anchor.x;
        this.camera.y = worldBefore.y * scale - anchor.y;

        // Bounds are stale now; recomputed on next render via ensureWorldBounds
        this.worldBounds = null;
        return true;
    }

    // Convert screen (canvas CSS px) coords to world coords
    screenToWorld(pt) {
        return { x: pt.x + this.camera.x, y: pt.y + this.camera.y };
    }

    // Convert mouse event to canvas coordinates (CSS px)
    getCanvasCoords(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    // Get hex at a screen point (applies camera)
    getHexAtPoint(point) {
        return this.layout.pixelToHex(this.screenToWorld(point));
    }

    // --- Rendering ---

    // Main render loop
    render(gameState) {
        const ctx = this.ctx;

        // Reset any transform, then scale for device pixel ratio
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.clear();

        if (!gameState || !gameState.map) return;

        this.ensureWorldBounds(gameState.map);

        // Everything below is drawn in world space
        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        // Cull to cells near the viewport
        const cells = gameState.map.getAllCells();
        const margin = this.layout.size * 2;
        const vx0 = this.camera.x - margin;
        const vy0 = this.camera.y - margin;
        const vx1 = this.camera.x + this.viewWidth + margin;
        const vy1 = this.camera.y + this.viewHeight + margin;

        const visibleCells = [];
        for (const cell of cells) {
            const c = this.layout.hexToPixel(cell.hex);
            if (c.x >= vx0 && c.x <= vx1 && c.y >= vy0 && c.y <= vy1) {
                visibleCells.push(cell);
            }
        }

        // Layer 1: Base terrain
        visibleCells.forEach(cell => {
            this.hexRenderer.drawTerrain(cell);
        });

        // Layer 2: Rivers (drawn as continuous path)
        if (gameState.map.riverPath && gameState.map.riverPath.length > 0) {
            this.drawRiverPath(gameState.map.riverPath);
        }

        // Layer 3: Roads and bridges
        visibleCells.forEach(cell => {
            this.edgeRenderer.drawRoadsOnly(cell, gameState.map);
        });

        // Layer 4: Captured castle overlay
        this.drawCapturedCastles(gameState);

        // Layer 5: Grid lines
        if (gameState.settings.showGrid) {
            visibleCells.forEach(cell => {
                this.hexRenderer.drawGridLine(cell);
            });
        }

        // Layer 6: Fog of war overlay
        if (gameState.settings.fogOfWar) {
            visibleCells.forEach(cell => {
                // Use gameState visibility system
                if (!gameState.isHexVisible(cell.hex)) {
                    this.fogRenderer.drawFogOverlay(cell);
                }
            });
        }

        // Layer 7: Placement/Movement/Ranged highlights
        if (this.placementHighlights.length > 0) {
            this.unitRenderer.drawPlacementHighlights(this.placementHighlights);
        }
        if (this.movementHighlights.length > 0) {
            this.unitRenderer.drawMovementHighlights(this.movementHighlights);
        }
        if (this.rangedTargetHighlights.length > 0) {
            this.unitRenderer.drawRangedTargetHighlights(this.rangedTargetHighlights);
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

        // Layer 10: Units (visibility handled inside)
        this.unitRenderer.drawUnits(gameState.units, gameState);

        // Layer 11: Selected unit highlight
        if (gameState.selectedUnit) {
            const unit = gameState.units.getUnit(gameState.selectedUnit);
            if (unit) {
                this.unitRenderer.drawUnitSelection(unit);
            }
        }

        // Layer 12: Coordinates (debug mode)
        if (gameState.settings.showCoordinates) {
            visibleCells.forEach(cell => {
                this.hexRenderer.drawCoordinates(cell);
            });
        }

        // Back to screen space
        ctx.restore();

        // Screen-space decoration (subtle vignette around the edges)
        this.drawVignette();
    }

    // Draw river as a path connecting hex centers.
    // Each segment keeps the center -> shared-edge-midpoint -> center shape.
    // Layers are stroked for ALL segments before the next layer so the
    // joints between consecutive segments never show.
    drawRiverPath(riverPath) {
        if (riverPath.length < 2) return;

        const ctx = this.ctx;
        const size = this.layout.size;

        // Build segment polylines once
        const segments = [];
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
                segments.push([center1, edgeMid, center2]);
            }
        }
        if (segments.length === 0) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Medieval water palette: dark bank line, deep body, lighter
        // mid-channel, thin foam highlight offset toward the light
        const layers = [
            { color: '#274b61', width: size * 0.42, dx: 0, dy: 0 },
            { color: '#3a6d8c', width: size * 0.34, dx: 0, dy: 0 },
            { color: '#5d93b4', width: size * 0.16, dx: 0, dy: 0 },
            { color: 'rgba(207, 227, 236, 0.75)', width: size * 0.06, dx: -size * 0.025, dy: -size * 0.035 }
        ];

        for (const layer of layers) {
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = Math.max(1, layer.width);
            ctx.beginPath();
            for (const [a, m, b] of segments) {
                ctx.moveTo(a.x + layer.dx, a.y + layer.dy);
                ctx.lineTo(m.x + layer.dx, m.y + layer.dy);
                ctx.lineTo(b.x + layer.dx, b.y + layer.dy);
            }
            ctx.stroke();
        }

        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
    }

    // Clear the canvas (screen space) - aged war-table backdrop
    clear() {
        const grad = this.ctx.createLinearGradient(0, 0, 0, this.viewHeight);
        grad.addColorStop(0, '#171310');
        grad.addColorStop(1, '#241c14');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    }

    // Subtle vignette so the map edges fade pleasantly (screen space)
    drawVignette() {
        const ctx = this.ctx;
        const w = this.viewWidth;
        const h = this.viewHeight;
        const grad = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.55,
            w / 2, h / 2, Math.max(w, h) * 0.75
        );
        grad.addColorStop(0, 'rgba(23, 13, 5, 0)');
        grad.addColorStop(1, 'rgba(23, 13, 5, 0.38)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    // Set hovered hex
    setHoveredHex(hex) {
        this.hoveredHex = hex;
    }

    // Set placement highlights
    setPlacementHighlights(hexes) {
        this.placementHighlights = hexes || [];
    }

    // Set movement highlights
    setMovementHighlights(hexes) {
        this.movementHighlights = hexes || [];
    }

    // Set ranged target highlights
    setRangedTargetHighlights(hexes) {
        this.rangedTargetHighlights = hexes || [];
    }

    // Clear all highlights
    clearHighlights() {
        this.placementHighlights = [];
        this.movementHighlights = [];
        this.rangedTargetHighlights = [];
    }

    // Draw captured castle overlay: a royal-blue glowing hex outline
    // plus a planted player banner (no more full hex tint)
    drawCapturedCastles(gameState) {
        if (!gameState.capturedCastles || gameState.capturedCastles.length === 0) return;

        const ctx = this.ctx;
        const size = this.layout.size;

        for (const key of gameState.capturedCastles) {
            const hex = Hex.fromKey(key);
            const center = this.layout.hexToPixel(hex);
            const corners = this.layout.hexCorners(hex);

            // Slightly inset hex path so the glow sits inside the hex border
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const px = center.x + (corners[i].x - center.x) * 0.92;
                const py = center.y + (corners[i].y - center.y) * 0.92;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();

            ctx.lineJoin = 'round';
            // Wide translucent glow
            ctx.strokeStyle = 'rgba(91, 141, 214, 0.35)';
            ctx.lineWidth = Math.max(3, size * 0.14);
            ctx.stroke();
            // Thin solid royal-blue line (same path, stroked again)
            ctx.strokeStyle = '#2e5fa3';
            ctx.lineWidth = Math.max(1.5, size * 0.04);
            ctx.stroke();

            this.drawCaptureFlag(center);
        }

        ctx.lineJoin = 'miter';
    }

    // Draw the player's banner planted at the top-right of a captured hex:
    // pole with gold finial, waving swallow-tail cloth with gold trim
    drawCaptureFlag(center) {
        const ctx = this.ctx;
        const size = this.layout.size;

        const baseX = center.x + size * 0.34;
        const baseY = center.y - size * 0.06;
        const poleTop = baseY - size * 0.82;

        // Pole
        ctx.strokeStyle = '#4a3a28';
        ctx.lineWidth = Math.max(1.5, size * 0.045);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(baseX, poleTop);
        ctx.stroke();

        // Gold finial
        ctx.fillStyle = '#d9b44a';
        ctx.beginPath();
        ctx.arc(baseX, poleTop - size * 0.03, Math.max(1.5, size * 0.05), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 28, 16, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Swallow-tail banner cloth with a slight wave
        const y0 = poleTop + size * 0.06;   // top of cloth at the pole
        const h = size * 0.30;              // cloth height at the pole
        const len = size * 0.58;            // fly length
        const wave = size * 0.05;

        const flyTopX = baseX + len;
        const flyTopY = y0 + wave * 0.6;
        const notchX = baseX + len * 0.60;
        const notchY = y0 + h * 0.5 + wave * 0.2;
        const flyBotX = baseX + len;
        const flyBotY = y0 + h - wave * 0.2;

        ctx.beginPath();
        ctx.moveTo(baseX, y0);
        ctx.quadraticCurveTo(baseX + len * 0.45, y0 - wave, flyTopX, flyTopY);
        ctx.lineTo(notchX, notchY);
        ctx.lineTo(flyBotX, flyBotY);
        ctx.quadraticCurveTo(baseX + len * 0.45, y0 + h + wave, baseX, y0 + h);
        ctx.closePath();

        ctx.fillStyle = '#2e5fa3';
        ctx.fill();

        // Gold fringe/trim traced around the cloth and tail edges
        ctx.strokeStyle = '#d9b44a';
        ctx.lineWidth = Math.max(1, size * 0.025);
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Lighter blue wave highlight across the cloth
        ctx.strokeStyle = '#5b8dd6';
        ctx.lineWidth = Math.max(1, size * 0.05);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseX + size * 0.05, y0 + h * 0.32);
        ctx.quadraticCurveTo(baseX + len * 0.40, y0 + h * 0.32 - wave, baseX + len * 0.66, y0 + h * 0.35);
        ctx.stroke();

        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
    }
}
