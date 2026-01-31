/**
 * Hex coordinate system using axial coordinates (q, r)
 * Flat-top hexagon orientation (traditional wargame style)
 *
 * Reference: https://www.redblobgames.com/grids/hexagons/
 */

// Direction vectors for flat-top hexagons (clockwise from East)
const HEX_DIRECTIONS = [
    { q: 1, r: 0 },    // 0: East
    { q: 1, r: -1 },   // 1: Northeast
    { q: 0, r: -1 },   // 2: Northwest
    { q: -1, r: 0 },   // 3: West
    { q: -1, r: 1 },   // 4: Southwest
    { q: 0, r: 1 }     // 5: Southeast
];

// Maps direction to opposite direction
const OPPOSITE_DIRECTION = [3, 4, 5, 0, 1, 2];

/**
 * Represents a hex coordinate in axial system
 */
class Hex {
    constructor(q, r) {
        this.q = q;
        this.r = r;
    }

    // Derive cube coordinate s (q + r + s = 0)
    get s() {
        return -this.q - this.r;
    }

    // Create unique string key for Map lookups
    get key() {
        return `${this.q},${this.r}`;
    }

    // Check equality with another hex
    equals(other) {
        return this.q === other.q && this.r === other.r;
    }

    // Add two hex coordinates
    add(other) {
        return new Hex(this.q + other.q, this.r + other.r);
    }

    // Subtract hex coordinates
    subtract(other) {
        return new Hex(this.q - other.q, this.r - other.r);
    }

    // Scale by factor
    scale(factor) {
        return new Hex(this.q * factor, this.r * factor);
    }

    // Calculate distance to another hex
    distanceTo(other) {
        const dq = Math.abs(this.q - other.q);
        const dr = Math.abs(this.r - other.r);
        const ds = Math.abs(this.s - other.s);
        return Math.max(dq, dr, ds);
    }

    // Get neighbor in specific direction (0-5)
    neighbor(direction) {
        const dir = HEX_DIRECTIONS[direction];
        return new Hex(this.q + dir.q, this.r + dir.r);
    }

    // Get all 6 neighbors
    neighbors() {
        return HEX_DIRECTIONS.map((_, i) => this.neighbor(i));
    }

    // Create from key string
    static fromKey(key) {
        const [q, r] = key.split(',').map(Number);
        return new Hex(q, r);
    }
}

/**
 * Handles conversion between hex coordinates and pixel coordinates
 * Uses flat-top orientation
 */
class HexLayout {
    constructor(size, origin = { x: 0, y: 0 }) {
        this.size = size;
        this.origin = origin;

        // Flat-top orientation constants
        // Forward matrix (hex to pixel)
        this.f0 = 3 / 2;
        this.f1 = 0;
        this.f2 = Math.sqrt(3) / 2;
        this.f3 = Math.sqrt(3);

        // Backward matrix (pixel to hex)
        this.b0 = 2 / 3;
        this.b1 = 0;
        this.b2 = -1 / 3;
        this.b3 = Math.sqrt(3) / 3;

        // First corner angle (0 for flat-top)
        this.startAngle = 0;
    }

    // Get hex width (flat-top: width > height)
    get hexWidth() {
        return this.size * 2;
    }

    // Get hex height
    get hexHeight() {
        return this.size * Math.sqrt(3);
    }

    // Convert hex coordinate to pixel center
    hexToPixel(hex) {
        const x = (this.f0 * hex.q + this.f1 * hex.r) * this.size;
        const y = (this.f2 * hex.q + this.f3 * hex.r) * this.size;
        return {
            x: x + this.origin.x,
            y: y + this.origin.y
        };
    }

    // Convert pixel to hex coordinate
    pixelToHex(point) {
        const pt = {
            x: (point.x - this.origin.x) / this.size,
            y: (point.y - this.origin.y) / this.size
        };
        const q = this.b0 * pt.x + this.b1 * pt.y;
        const r = this.b2 * pt.x + this.b3 * pt.y;
        return this.hexRound(q, r);
    }

    // Round fractional hex to nearest valid hex
    hexRound(q, r) {
        const s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);

        const qDiff = Math.abs(rq - q);
        const rDiff = Math.abs(rr - r);
        const sDiff = Math.abs(rs - s);

        // Reset the component with largest rounding error
        if (qDiff > rDiff && qDiff > sDiff) {
            rq = -rr - rs;
        } else if (rDiff > sDiff) {
            rr = -rq - rs;
        }

        return new Hex(rq, rr);
    }

    // Get the 6 corner positions of a hex
    hexCorners(hex) {
        const center = this.hexToPixel(hex);
        const corners = [];
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI * (this.startAngle + i) / 6;
            corners.push({
                x: center.x + this.size * Math.cos(angle),
                y: center.y + this.size * Math.sin(angle)
            });
        }
        return corners;
    }

    // Get the midpoint of an edge in a specific direction
    // Maps neighbor direction to correct corner indices for flat-top hexagons
    getEdgeMidpoint(hex, direction) {
        const corners = this.hexCorners(hex);
        // Direction 0 (East/SE) uses corners 0,1; Direction 5 (South) uses corners 1,2; etc.
        // Formula: corner index = (6 - direction) % 6
        const c1Index = (6 - direction) % 6;
        const c2Index = (c1Index + 1) % 6;
        return {
            x: (corners[c1Index].x + corners[c2Index].x) / 2,
            y: (corners[c1Index].y + corners[c2Index].y) / 2
        };
    }

    // Get the two corner points of an edge
    getEdgeCorners(hex, direction) {
        const corners = this.hexCorners(hex);
        const c1Index = (6 - direction) % 6;
        const c2Index = (c1Index + 1) % 6;
        return [corners[c1Index], corners[c2Index]];
    }
}
