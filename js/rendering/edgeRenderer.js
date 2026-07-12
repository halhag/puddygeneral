/**
 * Renders edge features (rivers, roads, bridges) between hexes
 *
 * Key: Each edge is shared by two hexes. We only draw from directions 0, 1, 2
 * (East, Northeast, Northwest) to avoid double-drawing.
 *
 * Art style: medieval campaign map - warm earth roads with cobble marks,
 * wooden plank bridges, layered teal rivers. All sizes scale from
 * this.layout.size so zooming stays crisp.
 */

// Local art palette for edge features (richer than EDGE_PROPERTIES colors)
const EDGE_ART = Object.freeze({
    roadFill: '#a8895f',                        // dusty earth
    roadBorder: 'rgba(101, 78, 48, 0.85)',      // packed-earth border
    cobbleDark: 'rgba(122, 95, 63, 0.55)',      // rut / dark cobble
    cobbleLight: 'rgba(233, 210, 172, 0.55)',   // worn light cobble
    bridgeDeck: '#8a6a40',                      // weathered planks
    bridgeDeckLight: '#a07d4d',                 // worn centre of deck
    bridgePlankLine: 'rgba(62, 44, 24, 0.65)',  // seams between planks
    bridgeRail: '#5c4326',                      // side rails / posts
    bridgeShadow: 'rgba(24, 30, 34, 0.32)',     // shadow under deck ends
    outline: 'rgba(40, 28, 16, 0.55)',          // warm dark outline
    riverBank: '#274b61',                       // dark bank line
    riverDeep: '#3a6d8c',                       // deep water body
    riverMid: '#5d93b4',                        // lighter mid-channel
    riverFoam: 'rgba(207, 227, 236, 0.8)'       // sparse foam highlight
});

/**
 * Deterministic per-position hash for hand-made variation.
 * NO Math.random in draw paths - the map redraws every frame while scrolling.
 */
function edgeHash(q, r, salt = 0) {
    const s = Math.sin(q * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

class EdgeRenderer {
    constructor(ctx, layout) {
        this.ctx = ctx;
        this.layout = layout;
    }

    // Draw all edges for a cell (only directions 0, 1, 2 to avoid duplicates)
    drawEdges(cell, map) {
        for (let dir = 0; dir < 3; dir++) {
            const feature = cell.getEdge(dir);
            if (feature === EdgeFeature.NONE) continue;

            switch (feature) {
                case EdgeFeature.RIVER:
                    this.drawRiver(cell.hex, dir);
                    break;
                case EdgeFeature.ROAD:
                    this.drawRoad(cell.hex, dir, map);
                    break;
                case EdgeFeature.BRIDGE:
                    this.drawRiver(cell.hex, dir);
                    this.drawBridge(cell.hex, dir, map);
                    break;
            }
        }
    }

    // Draw only roads and bridges (rivers drawn separately as continuous path)
    drawRoadsOnly(cell, map) {
        for (let dir = 0; dir < 3; dir++) {
            const feature = cell.getEdge(dir);
            if (feature === EdgeFeature.ROAD) {
                this.drawRoad(cell.hex, dir, map);
            } else if (feature === EdgeFeature.BRIDGE) {
                this.drawBridge(cell.hex, dir, map);
            }
        }
    }

    // Draw river along a single hex edge (layered strokes, water palette)
    drawRiver(hex, direction) {
        const ctx = this.ctx;
        const size = this.layout.size;
        const [p1, p2] = this.layout.getEdgeCorners(hex, direction);

        ctx.lineCap = 'round';
        const layers = [
            [EDGE_ART.riverBank, size * 0.30],
            [EDGE_ART.riverDeep, size * 0.22],
            [EDGE_ART.riverMid, size * 0.10],
            [EDGE_ART.riverFoam, size * 0.04]
        ];
        for (const [color, width] of layers) {
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, width);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        ctx.lineCap = 'butt';
    }

    // Draw road connecting hex centers through edge.
    // Both halves (center -> edge midpoint, neighbor center -> edge midpoint)
    // share one path per layer: border stroked first, then the earth fill on
    // top, so no seams appear where the halves meet at the edge midpoint.
    drawRoad(hex, direction, map) {
        const ctx = this.ctx;
        const size = this.layout.size;
        const center = this.layout.hexToPixel(hex);
        const edgeMid = this.layout.getEdgeMidpoint(hex, direction);

        // Roads normally run hex center to hex center, but they must not
        // pave over castle art: inside a castle hex the half is skipped
        // entirely, so the road ends at the hex boundary - at the gates.
        const isCastle = (cellHex) => {
            const cell = map && map.getCell(cellHex);
            return !!cell && cell.terrain === TerrainType.CASTLE;
        };

        const halves = [];
        if (!isCastle(hex)) {
            halves.push([center, edgeMid]);
        }
        const neighbor = hex.neighbor(direction);
        if (map && map.hasCell(neighbor) && !isCastle(neighbor)) {
            halves.push([this.layout.hexToPixel(neighbor), edgeMid]);
        }
        if (halves.length === 0) return;

        const roadW = size * 0.135;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Pass 1: darker packed-earth border (fill covers all but a thin rim)
        ctx.strokeStyle = EDGE_ART.roadBorder;
        ctx.lineWidth = roadW + Math.max(1.5, size * 0.045);
        ctx.beginPath();
        for (const [a, b] of halves) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();

        // Pass 2: warm dusty earth fill
        ctx.strokeStyle = EDGE_ART.roadFill;
        ctx.lineWidth = roadW;
        ctx.beginPath();
        for (const [a, b] of halves) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();

        // Pass 3: sparse cobble dashes / cart ruts along the path direction,
        // seeded on hex position + direction so they never flicker
        ctx.lineWidth = Math.max(1, size * 0.026);
        for (let h = 0; h < halves.length; h++) {
            const [a, b] = halves[h];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;   // perpendicular to path
            const py = ux;

            for (let i = 0; i < 3; i++) {
                const salt = direction * 7 + h * 31 + i * 3;
                const t = 0.30 + 0.25 * i + (edgeHash(hex.q, hex.r, salt) - 0.5) * 0.12;
                const side = (edgeHash(hex.q, hex.r, salt + 1) - 0.5) * roadW * 0.55;
                const cx = a.x + dx * t + px * side;
                const cy = a.y + dy * t + py * side;
                const half = size * 0.038;

                ctx.strokeStyle = edgeHash(hex.q, hex.r, salt + 2) < 0.5
                    ? EDGE_ART.cobbleDark
                    : EDGE_ART.cobbleLight;
                ctx.beginPath();
                ctx.moveTo(cx - ux * half, cy - uy * half);
                ctx.lineTo(cx + ux * half, cy + uy * half);
                ctx.stroke();
            }
        }

        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
    }

    // Draw a wooden plank bridge over a river edge
    drawBridge(hex, direction, map) {
        const ctx = this.ctx;
        const size = this.layout.size;
        const center = this.layout.hexToPixel(hex);
        const edgeMid = this.layout.getEdgeMidpoint(hex, direction);

        // Road drawn first so the deck sits on top of the earth path
        this.drawRoad(hex, direction, map);

        // Deck runs along the road (perpendicular to the river edge)
        const angle = Math.atan2(edgeMid.y - center.y, edgeMid.x - center.x);
        const deckL = size * 0.66;   // spans the river channel
        const deckW = size * 0.30;

        ctx.save();
        ctx.translate(edgeMid.x, edgeMid.y);
        ctx.rotate(angle);

        // Shadow under the bridge ends (grounds the deck on the banks)
        ctx.fillStyle = EDGE_ART.bridgeShadow;
        ctx.fillRect(-deckL / 2 - size * 0.03, -deckW / 2 - size * 0.025, size * 0.10, deckW + size * 0.05);
        ctx.fillRect(deckL / 2 - size * 0.07, -deckW / 2 - size * 0.025, size * 0.10, deckW + size * 0.05);

        // Wooden deck with a lighter worn centre
        ctx.fillStyle = EDGE_ART.bridgeDeck;
        ctx.fillRect(-deckL / 2, -deckW / 2, deckL, deckW);
        ctx.fillStyle = EDGE_ART.bridgeDeckLight;
        ctx.fillRect(-deckL / 2, -deckW * 0.22, deckL, deckW * 0.44);

        // Plank seams across the deck
        ctx.strokeStyle = EDGE_ART.bridgePlankLine;
        ctx.lineWidth = Math.max(1, size * 0.018);
        ctx.beginPath();
        const planks = 6;
        for (let i = 1; i < planks; i++) {
            const x = -deckL / 2 + (deckL / planks) * i;
            ctx.moveTo(x, -deckW / 2);
            ctx.lineTo(x, deckW / 2);
        }
        ctx.stroke();

        // Warm dark outline around the deck
        ctx.strokeStyle = EDGE_ART.outline;
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.strokeRect(-deckL / 2, -deckW / 2, deckL, deckW);

        // Two side rails
        ctx.strokeStyle = EDGE_ART.bridgeRail;
        ctx.lineWidth = Math.max(1.5, size * 0.05);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-deckL / 2, -deckW / 2);
        ctx.lineTo(deckL / 2, -deckW / 2);
        ctx.moveTo(-deckL / 2, deckW / 2);
        ctx.lineTo(deckL / 2, deckW / 2);
        ctx.stroke();

        // Rail end posts
        ctx.fillStyle = EDGE_ART.bridgeRail;
        const postR = Math.max(1.5, size * 0.035);
        for (const sx of [-deckL / 2, deckL / 2]) {
            for (const sy of [-deckW / 2, deckW / 2]) {
                ctx.beginPath();
                ctx.arc(sx, sy, postR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}
