/**
 * Renders individual hexagons with terrain
 * Style: hand-illuminated medieval campaign map - flat colour shapes,
 * 2-4 shading tones per feature, warm dark outlines instead of black.
 *
 * All geometry derives from this.layout.size so zooming scales cleanly.
 * DETERMINISM: the map redraws every frame while scrolling, so there is
 * NO Math.random() anywhere in here - all per-hex variation comes from
 * hexHash(q, r, salt) below.
 */

/**
 * Deterministic per-hex pseudo-random value in [0, 1).
 * Pure function - safe in draw paths and reusable by other renderers.
 * @param {number} q - hex axial column
 * @param {number} r - hex axial row
 * @param {number} salt - variation channel (use distinct salts per feature)
 * @returns {number} pseudo-random value in [0, 1)
 */
function hexHash(q, r, salt = 0) {
    const s = Math.sin(q * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

class HexRenderer {
    constructor(ctx, layout) {
        this.ctx = ctx;
        this.layout = layout;

        // Pre-mixed tone ramps (no string building in draw paths)
        this.grassShades = ['#6f9347', '#749849', '#7a9e4f', '#7fa354', '#85a95a'];
        this.woodsShades = ['#688b41', '#6d9145', '#719549'];
        this.hillShades = ['#9c8848', '#a28c4c', '#a99150', '#ae9755'];

        // Shared outline tones (warm dark brown, never black)
        this.outline = 'rgba(40, 28, 16, 0.55)';
        this.outlineSoft = 'rgba(40, 28, 16, 0.3)';
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
        const q = cell.hex.q;
        const r = cell.hex.r;

        // Base fill with deterministic per-hex tint variation so the
        // map reads as hand-painted rather than flat tiles
        let fill = props.color;
        switch (cell.terrain) {
            case TerrainType.GRASS:
            case TerrainType.RIVER:
                fill = this.grassShades[Math.floor(hexHash(q, r, 3) * this.grassShades.length)];
                break;
            case TerrainType.WOODS:
                fill = this.woodsShades[Math.floor(hexHash(q, r, 3) * this.woodsShades.length)];
                break;
            case TerrainType.HILL:
                fill = this.hillShades[Math.floor(hexHash(q, r, 3) * this.hillShades.length)];
                break;
        }

        this.drawHexPath(cell.hex);
        this.ctx.fillStyle = fill;
        this.ctx.fill();

        // Draw terrain-specific decorations
        this.drawTerrainIcon(cell, props);
    }

    // Draw terrain-specific icons
    drawTerrainIcon(cell, props) {
        const center = this.layout.hexToPixel(cell.hex);
        const size = this.layout.size;
        const q = cell.hex.q;
        const r = cell.hex.r;

        switch (cell.terrain) {
            case TerrainType.GRASS:
            case TerrainType.RIVER:
                // RIVER shares the grass meadow look - the river line
                // itself is drawn separately by the edge renderer
                this.drawGrass(center, size, q, r);
                break;
            case TerrainType.WOODS:
                this.drawTrees(center, size, q, r);
                break;
            case TerrainType.CASTLE:
                this.drawCastle(center, size, q, r);
                break;
            case TerrainType.MOUNTAIN:
                this.drawMountain(center, size, q, r);
                break;
            case TerrainType.HILL:
                this.drawHill(center, size, q, r);
                break;
            case TerrainType.WATER:
                this.drawWaves(center, size, q, r, cell.hex);
                break;
        }
    }

    // Sparse grass tufts and occasional wildflowers (GRASS and RIVER hexes)
    drawGrass(center, size, q, r) {
        const ctx = this.ctx;
        const tuftCount = 3 + Math.floor(hexHash(q, r, 1) * 4); // 3-6 tufts

        // All tuft blades share one stroked path
        ctx.strokeStyle = 'rgba(74, 104, 40, 0.6)';
        ctx.lineWidth = Math.max(1, size * 0.022);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < tuftCount; i++) {
            const ang = hexHash(q, r, 10 + i) * Math.PI * 2;
            const dist = (0.15 + hexHash(q, r, 20 + i) * 0.5) * size;
            const tx = center.x + Math.cos(ang) * dist;
            const ty = center.y + Math.sin(ang) * dist * 0.85;
            const h = size * (0.08 + hexHash(q, r, 30 + i) * 0.05);
            const w = h * 0.55;
            // Three blades per tuft
            ctx.moveTo(tx - w, ty);
            ctx.quadraticCurveTo(tx - w * 1.4, ty - h * 0.6, tx - w * 1.1, ty - h);
            ctx.moveTo(tx, ty);
            ctx.quadraticCurveTo(tx - w * 0.1, ty - h * 0.8, tx + w * 0.15, ty - h * 1.25);
            ctx.moveTo(tx + w, ty);
            ctx.quadraticCurveTo(tx + w * 1.4, ty - h * 0.6, tx + w * 1.15, ty - h * 0.9);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Tiny wildflower dots on ~15% of hexes
        if (hexHash(q, r, 7) < 0.15) {
            const petal = Math.max(1.2, size * 0.03);
            for (let j = 0; j < 3; j++) {
                const ang = hexHash(q, r, 40 + j) * Math.PI * 2;
                const dist = (0.12 + hexHash(q, r, 50 + j) * 0.45) * size;
                ctx.fillStyle = (j === 1) ? '#e9e4d2' : '#d9b44a';
                ctx.beginPath();
                ctx.arc(
                    center.x + Math.cos(ang) * dist,
                    center.y + Math.sin(ang) * dist * 0.85,
                    petal, 0, Math.PI * 2
                );
                ctx.fill();
            }
        }
    }

    // Mixed woodland: 4-6 overlapping oaks and pines, sorted by y so
    // lower (nearer) trees overlap the ones behind them
    drawTrees(center, size, q, r) {
        const ctx = this.ctx;
        const count = 4 + Math.floor(hexHash(q, r, 1) * 3); // 4-6 trees

        const trees = [];
        for (let i = 0; i < count; i++) {
            const ang = hexHash(q, r, 10 + i) * Math.PI * 2;
            const dist = hexHash(q, r, 20 + i) * 0.52 * size;
            trees.push({
                x: center.x + Math.cos(ang) * dist,
                y: center.y + Math.sin(ang) * dist * 0.8,
                s: size * (0.30 + hexHash(q, r, 30 + i) * 0.14),
                pine: hexHash(q, r, 40 + i) < 0.45
            });
        }
        trees.sort((a, b) => a.y - b.y);

        for (const t of trees) {
            // Ground shadow ellipse
            ctx.fillStyle = 'rgba(40, 28, 16, 0.16)';
            ctx.beginPath();
            ctx.ellipse(t.x, t.y + t.s * 0.42, t.s * 0.42, t.s * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();

            // Trunk
            const tw = Math.max(1.5, t.s * 0.13);
            ctx.fillStyle = '#6b4a2b';
            ctx.fillRect(t.x - tw / 2, t.y + t.s * 0.05, tw, t.s * 0.4);

            if (t.pine) {
                // Pine: dark cone + lighter lit cone toward the west
                ctx.fillStyle = '#2c4f24';
                ctx.beginPath();
                ctx.moveTo(t.x, t.y - t.s * 0.75);
                ctx.lineTo(t.x - t.s * 0.38, t.y + t.s * 0.12);
                ctx.lineTo(t.x + t.s * 0.38, t.y + t.s * 0.12);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#3f6d33';
                ctx.beginPath();
                ctx.moveTo(t.x - t.s * 0.04, t.y - t.s * 0.66);
                ctx.lineTo(t.x - t.s * 0.3, t.y + t.s * 0.06);
                ctx.lineTo(t.x + t.s * 0.14, t.y + t.s * 0.06);
                ctx.closePath();
                ctx.fill();
            } else {
                // Oak: dark canopy blob (two lobes), mid tone, highlight lobe
                ctx.fillStyle = '#2c4f24';
                ctx.beginPath();
                ctx.arc(t.x - t.s * 0.16, t.y - t.s * 0.18, t.s * 0.32, 0, Math.PI * 2);
                ctx.arc(t.x + t.s * 0.18, t.y - t.s * 0.24, t.s * 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#3f6d33';
                ctx.beginPath();
                ctx.arc(t.x - t.s * 0.02, t.y - t.s * 0.3, t.s * 0.26, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#4d7f3e';
                ctx.beginPath();
                ctx.arc(t.x - t.s * 0.12, t.y - t.s * 0.38, t.s * 0.14, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Medieval castle filling most of the hex: curtain wall with
    // crenellations, two round towers with conical terracotta roofs,
    // taller central keep, arched gate with portcullis, pennant flag.
    // Neutral (unowned) pennant stays dark red - ownership flags are
    // drawn elsewhere on top.
    drawCastle(center, size, q, r) {
        const ctx = this.ctx;
        const u = size;
        const x = (f) => center.x + f * u;
        const y = (f) => center.y + f * u;

        // Ground shadow under the whole castle
        ctx.fillStyle = 'rgba(40, 28, 16, 0.18)';
        ctx.beginPath();
        ctx.ellipse(x(0), y(0.54), u * 0.85, u * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- Central keep (drawn first: wall and towers overlap its base)
        ctx.fillStyle = '#989082';
        ctx.fillRect(x(-0.28), y(-0.56), u * 0.56, u * 0.92);
        // Lit west face + shadow east face of the keep
        ctx.fillStyle = '#a8a092';
        ctx.fillRect(x(-0.28), y(-0.56), u * 0.10, u * 0.92);
        ctx.fillStyle = '#655d53';
        ctx.fillRect(x(0.16), y(-0.56), u * 0.12, u * 0.92);
        // Keep outline
        ctx.strokeStyle = this.outline;
        ctx.lineWidth = Math.max(1, u * 0.02);
        ctx.strokeRect(x(-0.28), y(-0.56), u * 0.56, u * 0.92);
        // Keep battlements
        ctx.fillStyle = '#989082';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x(-0.28 + i * 0.155), y(-0.66), u * 0.095, u * 0.11);
        }
        // Keep masonry lines + arrow slits
        ctx.strokeStyle = 'rgba(70, 62, 54, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x(-0.28), y(-0.32));
        ctx.lineTo(x(0.28), y(-0.32));
        ctx.moveTo(x(-0.28), y(-0.12));
        ctx.lineTo(x(0.28), y(-0.12));
        ctx.stroke();
        ctx.fillStyle = '#2f2a24';
        ctx.fillRect(x(-0.11), y(-0.48), Math.max(1, u * 0.04), u * 0.15);
        ctx.fillRect(x(0.05), y(-0.48), Math.max(1, u * 0.04), u * 0.15);

        // --- Curtain wall across the hex
        ctx.fillStyle = '#9a938a';
        ctx.fillRect(x(-0.72), y(-0.04), u * 1.44, u * 0.50);
        // Wall crenellations
        for (let i = 0; i < 7; i++) {
            ctx.fillRect(x(-0.70 + i * 0.212), y(-0.14), u * 0.11, u * 0.11);
        }
        // Darker footing course
        ctx.fillStyle = 'rgba(110, 103, 95, 0.55)';
        ctx.fillRect(x(-0.72), y(0.33), u * 1.44, u * 0.13);
        // Wall masonry lines
        ctx.strokeStyle = 'rgba(70, 62, 54, 0.4)';
        ctx.beginPath();
        ctx.moveTo(x(-0.72), y(0.11));
        ctx.lineTo(x(0.72), y(0.11));
        ctx.moveTo(x(-0.72), y(0.24));
        ctx.lineTo(x(0.72), y(0.24));
        ctx.stroke();
        // Wall outline
        ctx.strokeStyle = this.outline;
        ctx.strokeRect(x(-0.72), y(-0.04), u * 1.44, u * 0.50);

        // --- Arched wooden gate with portcullis
        ctx.fillStyle = '#4a3623';
        ctx.beginPath();
        ctx.moveTo(x(-0.15), y(0.46));
        ctx.lineTo(x(-0.15), y(0.18));
        ctx.quadraticCurveTo(x(0), y(0.01), x(0.15), y(0.18));
        ctx.lineTo(x(0.15), y(0.46));
        ctx.closePath();
        ctx.fill();
        // Stone arch rim (strokes the same path)
        ctx.strokeStyle = '#6e675f';
        ctx.lineWidth = Math.max(1, u * 0.035);
        ctx.stroke();
        // Portcullis bars
        ctx.strokeStyle = 'rgba(24, 18, 12, 0.75)';
        ctx.lineWidth = Math.max(1, u * 0.015);
        ctx.beginPath();
        ctx.moveTo(x(-0.075), y(0.13));
        ctx.lineTo(x(-0.075), y(0.46));
        ctx.moveTo(x(0), y(0.07));
        ctx.lineTo(x(0), y(0.46));
        ctx.moveTo(x(0.075), y(0.13));
        ctx.lineTo(x(0.075), y(0.46));
        ctx.moveTo(x(-0.13), y(0.26));
        ctx.lineTo(x(0.13), y(0.26));
        ctx.moveTo(x(-0.13), y(0.37));
        ctx.lineTo(x(0.13), y(0.37));
        ctx.stroke();

        // --- Round side towers with conical terracotta roofs
        for (let side = -1; side <= 1; side += 2) {
            const tx = side * 0.62;
            // Tower body with light/shadow strips to read as a cylinder
            ctx.fillStyle = '#948d82';
            ctx.fillRect(x(tx - 0.16), y(-0.34), u * 0.32, u * 0.82);
            ctx.fillStyle = '#655d53';
            ctx.fillRect(x(tx + 0.07), y(-0.34), u * 0.09, u * 0.82);
            ctx.fillStyle = '#aaa298';
            ctx.fillRect(x(tx - 0.16), y(-0.34), u * 0.07, u * 0.82);
            // Tower outline
            ctx.strokeStyle = this.outlineSoft;
            ctx.lineWidth = Math.max(1, u * 0.02);
            ctx.strokeRect(x(tx - 0.16), y(-0.34), u * 0.32, u * 0.82);
            // Arrow slit
            ctx.fillStyle = '#2f2a24';
            ctx.fillRect(x(tx - 0.02), y(-0.18), Math.max(1, u * 0.04), u * 0.13);
            // Conical roof: dark base + lit western facet
            ctx.fillStyle = '#8a4a3a';
            ctx.beginPath();
            ctx.moveTo(x(tx - 0.20), y(-0.32));
            ctx.lineTo(x(tx + 0.20), y(-0.32));
            ctx.lineTo(x(tx), y(-0.70));
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#a05c48';
            ctx.beginPath();
            ctx.moveTo(x(tx - 0.20), y(-0.32));
            ctx.lineTo(x(tx - 0.05), y(-0.32));
            ctx.lineTo(x(tx), y(-0.70));
            ctx.closePath();
            ctx.fill();
        }

        // --- Pennant flag on the keep (neutral: dark red)
        ctx.strokeStyle = '#3a3128';
        ctx.lineWidth = Math.max(1, u * 0.025);
        ctx.beginPath();
        ctx.moveTo(x(0), y(-0.66));
        ctx.lineTo(x(0), y(-0.86));
        ctx.stroke();
        ctx.fillStyle = '#a83c30';
        ctx.beginPath();
        ctx.moveTo(x(0), y(-0.86));
        ctx.lineTo(x(0.21), y(-0.79));
        ctx.lineTo(x(0), y(-0.72));
        ctx.closePath();
        ctx.fill();
    }

    // 2-3 overlapping angular peaks with lit/shadow facets split at the
    // ridge, snow cap with jagged bottom on the tallest, scree at the foot
    drawMountain(center, size, q, r) {
        const ctx = this.ctx;
        const baseY = center.y + size * 0.38;

        const peaks = [{
            ax: center.x - size * 0.34,
            w: size * 0.42,
            h: size * (0.5 + hexHash(q, r, 1) * 0.14),
            snow: false
        }];
        if (hexHash(q, r, 4) < 0.65) {
            peaks.push({
                ax: center.x + size * 0.38,
                w: size * 0.36,
                h: size * (0.44 + hexHash(q, r, 2) * 0.14),
                snow: false
            });
        }
        // Front peak: tallest, snow-capped, drawn last to overlap
        peaks.push({
            ax: center.x + size * 0.02,
            w: size * 0.55,
            h: size * (0.74 + hexHash(q, r, 3) * 0.14),
            snow: true
        });

        for (const p of peaks) {
            const apexY = baseY - p.h;
            const footL = p.ax - p.w;
            const footR = p.ax + p.w * 0.85;
            const ridgeX = p.ax + p.w * 0.12; // ridge foot, right of apex

            // Lit (west) face
            ctx.fillStyle = '#7d7468';
            ctx.beginPath();
            ctx.moveTo(p.ax, apexY);
            ctx.lineTo(footL, baseY);
            ctx.lineTo(ridgeX, baseY);
            ctx.closePath();
            ctx.fill();

            // Shadow (east) face
            ctx.fillStyle = '#635b51';
            ctx.beginPath();
            ctx.moveTo(p.ax, apexY);
            ctx.lineTo(ridgeX, baseY);
            ctx.lineTo(footR, baseY);
            ctx.closePath();
            ctx.fill();

            // Silhouette outline
            ctx.strokeStyle = this.outlineSoft;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(footL, baseY);
            ctx.lineTo(p.ax, apexY);
            ctx.lineTo(footR, baseY);
            ctx.stroke();

            if (p.snow) {
                // Snow cap with jagged bottom edge
                const sh = p.h * 0.34;
                const sy = apexY + sh;
                const lX = p.ax - p.w * (sh / p.h);
                const rX = p.ax + p.w * 0.85 * (sh / p.h);
                ctx.fillStyle = '#ece8df';
                ctx.beginPath();
                ctx.moveTo(p.ax, apexY);
                ctx.lineTo(rX, sy);
                ctx.lineTo(p.ax + (rX - p.ax) * 0.55, sy - sh * 0.3);
                ctx.lineTo(p.ax + (rX - p.ax) * 0.2, sy + sh * 0.08);
                ctx.lineTo(p.ax + (lX - p.ax) * 0.35, sy - sh * 0.28);
                ctx.lineTo(p.ax + (lX - p.ax) * 0.75, sy + sh * 0.05);
                ctx.lineTo(lX, sy);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Scree strokes at the foot (single path)
        ctx.strokeStyle = 'rgba(60, 52, 44, 0.45)';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const sx = center.x + (hexHash(q, r, 60 + i) - 0.5) * size;
            const sy = baseY + size * (0.02 + hexHash(q, r, 70 + i) * 0.06);
            ctx.moveTo(sx - size * 0.05, sy);
            ctx.lineTo(sx + size * 0.05, sy - size * 0.02);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // Two soft rounded mounds with lit/shadow tones and contour strokes
    drawHill(center, size, q, r) {
        const ctx = this.ctx;
        const j1 = (hexHash(q, r, 1) - 0.5) * size * 0.12;
        const j2 = (hexHash(q, r, 2) - 0.5) * size * 0.12;

        // Back mound (smaller, up-right), then front mound overlapping it
        this.drawMound(
            center.x + size * 0.22 + j1, center.y - size * 0.06,
            size * 0.34, size * 0.2
        );
        this.drawMound(
            center.x - size * 0.14 + j2, center.y + size * 0.2,
            size * 0.46, size * 0.26
        );

        // Contour grass strokes on the front mound (single path)
        ctx.strokeStyle = 'rgba(96, 78, 34, 0.5)';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const gx = center.x - size * (0.32 - i * 0.16) + j2;
            const gy = center.y + size * (0.08 + hexHash(q, r, 10 + i) * 0.08);
            ctx.moveTo(gx - size * 0.05, gy);
            ctx.quadraticCurveTo(gx, gy - size * 0.06, gx + size * 0.06, gy - size * 0.01);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // One rounded hill mound: shadow dome with lit dome inset up-left
    drawMound(cx, cy, rx, ry) {
        const ctx = this.ctx;

        // Shadow tone (full dome)
        ctx.fillStyle = '#8f7a42';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();

        // Lit tone, slightly smaller and shifted toward the light (west)
        ctx.fillStyle = '#b6a05e';
        ctx.beginPath();
        ctx.ellipse(cx - rx * 0.1, cy, rx * 0.88, ry * 0.86, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();

        // Soft outline
        ctx.strokeStyle = this.outlineSoft;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
    }

    // Deep water: darker vignette toward the hex border plus wave strokes
    drawWaves(center, size, q, r, hex) {
        const ctx = this.ctx;

        // Edge vignette (the one gradient this hex is allowed)
        const grad = ctx.createRadialGradient(
            center.x, center.y, size * 0.15,
            center.x, center.y, size * 1.02
        );
        grad.addColorStop(0, 'rgba(18, 40, 58, 0)');
        grad.addColorStop(1, 'rgba(18, 40, 58, 0.42)');
        this.drawHexPath(hex);
        ctx.fillStyle = grad;
        ctx.fill();

        // Wave rows in one stroked path, phase offset varies per hex
        ctx.strokeStyle = '#5d93b4';
        ctx.lineWidth = Math.max(1, size * 0.035);
        ctx.lineCap = 'round';
        ctx.beginPath();
        const rows = 4;
        for (let i = 0; i < rows; i++) {
            const wy = center.y + (i - (rows - 1) / 2) * size * 0.3;
            const half = size * (0.55 - Math.abs(i - (rows - 1) / 2) * 0.13);
            const phase = (hexHash(q, r, 80 + i) - 0.5) * size * 0.14;
            const x0 = center.x - half + phase;
            const amp = size * 0.05;
            ctx.moveTo(x0, wy);
            ctx.quadraticCurveTo(x0 + half * 0.5, wy - amp, x0 + half, wy);
            ctx.quadraticCurveTo(x0 + half * 1.5, wy + amp, x0 + half * 2, wy);
        }
        ctx.stroke();

        // A single foam crest, sparingly
        const k = Math.floor(hexHash(q, r, 85) * rows);
        const ky = center.y + (k - (rows - 1) / 2) * size * 0.3;
        const kx = center.x + (hexHash(q, r, 86) - 0.5) * size * 0.4;
        ctx.strokeStyle = '#cfe3ec';
        ctx.lineWidth = Math.max(1, size * 0.028);
        ctx.beginPath();
        ctx.moveTo(kx - size * 0.09, ky - size * 0.02);
        ctx.quadraticCurveTo(kx, ky - size * 0.07, kx + size * 0.09, ky - size * 0.02);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // Draw hex grid outline
    drawGridLine(cell) {
        this.drawHexPath(cell.hex);
        this.ctx.strokeStyle = CONFIG.GRID_LINE_COLOR;
        this.ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.ctx.lineJoin = 'miter';
    }

    // Draw selection highlight
    drawSelection(cell) {
        this.drawHexPath(cell.hex);
        this.ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        this.ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.ctx.lineJoin = 'miter';
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
