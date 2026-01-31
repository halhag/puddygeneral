/**
 * HexCell represents a single hex on the map
 * HexMap manages the collection of all hex cells
 */

/**
 * A single hex cell with terrain and edge features
 */
class HexCell {
    constructor(hex, terrain = TerrainType.GRASS) {
        this.hex = hex;
        this.terrain = terrain;
        // Edge features for each of 6 directions (0=East, clockwise)
        this.edges = [
            EdgeFeature.NONE,  // 0: East
            EdgeFeature.NONE,  // 1: Northeast
            EdgeFeature.NONE,  // 2: Northwest
            EdgeFeature.NONE,  // 3: West
            EdgeFeature.NONE,  // 4: Southwest
            EdgeFeature.NONE   // 5: Southeast
        ];
        this.visibility = 'visible';  // 'hidden', 'explored', 'visible'
        this.unitId = null;           // For future unit placement
    }

    setEdge(direction, feature) {
        this.edges[direction] = feature;
    }

    getEdge(direction) {
        return this.edges[direction];
    }

    // Serialize for storage
    toJSON() {
        return {
            q: this.hex.q,
            r: this.hex.r,
            terrain: this.terrain,
            edges: this.edges,
            visibility: this.visibility,
            unitId: this.unitId
        };
    }

    // Deserialize from storage
    static fromJSON(data) {
        const cell = new HexCell(
            new Hex(data.q, data.r),
            data.terrain
        );
        cell.edges = data.edges || Array(6).fill(EdgeFeature.NONE);
        cell.visibility = data.visibility || 'visible';
        cell.unitId = data.unitId || null;
        return cell;
    }
}

/**
 * Collection of hex cells forming the game map
 */
class HexMap {
    constructor() {
        this.cells = new Map();  // Key: "q,r" -> HexCell
        this.bounds = null;
        this.riverPath = [];     // Array of {hex, cornerIndex} for continuous river
    }

    addCell(cell) {
        this.cells.set(cell.hex.key, cell);
        this.updateBounds(cell.hex);
    }

    getCell(hex) {
        return this.cells.get(hex.key);
    }

    hasCell(hex) {
        return this.cells.has(hex.key);
    }

    getAllCells() {
        return Array.from(this.cells.values());
    }

    updateBounds(hex) {
        if (!this.bounds) {
            this.bounds = {
                minQ: hex.q, maxQ: hex.q,
                minR: hex.r, maxR: hex.r
            };
        } else {
            this.bounds.minQ = Math.min(this.bounds.minQ, hex.q);
            this.bounds.maxQ = Math.max(this.bounds.maxQ, hex.q);
            this.bounds.minR = Math.min(this.bounds.minR, hex.r);
            this.bounds.maxR = Math.max(this.bounds.maxR, hex.r);
        }
    }

    // Set edge feature between two adjacent hexes (updates both sides)
    setEdgeBetween(hex1, hex2, feature) {
        const cell1 = this.getCell(hex1);
        const cell2 = this.getCell(hex2);

        if (!cell1 || !cell2) return false;

        // Find direction from hex1 to hex2
        for (let dir = 0; dir < 6; dir++) {
            if (hex1.neighbor(dir).equals(hex2)) {
                cell1.setEdge(dir, feature);
                cell2.setEdge(OPPOSITE_DIRECTION[dir], feature);
                return true;
            }
        }
        return false;
    }

    // Get existing neighbors of a hex
    getNeighbors(hex) {
        return hex.neighbors()
            .filter(n => this.hasCell(n))
            .map(n => this.getCell(n));
    }

    toJSON() {
        return {
            cells: this.getAllCells().map(cell => cell.toJSON()),
            bounds: this.bounds,
            riverPath: this.riverPath
        };
    }

    static fromJSON(data) {
        const map = new HexMap();
        data.cells.forEach(cellData => {
            map.addCell(HexCell.fromJSON(cellData));
        });
        map.riverPath = data.riverPath || [];
        return map;
    }
}

/**
 * Creates a visually rectangular map
 * Uses pixel-based boundaries to ensure the map looks rectangular on screen
 */
function createDefaultMap() {
    const map = new HexMap();

    // Visual dimensions in pixels (increased for fuller board)
    const visualWidth = 1000;  // pixels
    const visualHeight = 860;  // pixels
    const hexSize = CONFIG.HEX_SIZE;

    // Calculate hex dimensions
    const hexHeight = hexSize * Math.sqrt(3);
    const colSpacing = hexSize * 1.5;
    const rowSpacing = hexHeight;

    // Determine q range (columns)
    const qMin = 0;
    const qMax = Math.floor(visualWidth / colSpacing) + 1;  // +1 for extra column

    // First pass: create all cells with basic terrain
    for (let q = qMin; q <= qMax; q++) {
        const rMin = Math.floor(-q / 2);
        const rMax = Math.floor(visualHeight / rowSpacing - q / 2) + 1;  // +1 for extra row

        for (let r = rMin; r <= rMax; r++) {
            const hex = new Hex(q, r);
            map.addCell(new HexCell(hex, TerrainType.GRASS));
        }
    }

    // Add terrain features
    addCastles(map);
    addMountainsAndHills(map);
    addForestClusters(map);
    addRiverPath(map);
    addRoads(map);

    return map;
}

// Helper: get visual row from q,r coordinates
function getVisualRow(q, r) {
    return q / 2 + r;
}

// Helper: get r from q and visual row
function getRFromVisual(q, vRow) {
    return Math.round(vRow - q / 2);
}

// Add castles at strategic positions
function addCastles(map) {
    const castlePositions = [
        { q: 2, vRow: 2 },      // Top-left
        { q: 17, vRow: 2 },     // Top-right
        { q: 10, vRow: 7 },     // Center
        { q: 3, vRow: 13 },     // Bottom-left
        { q: 16, vRow: 12 }     // Bottom-right
    ];

    for (const pos of castlePositions) {
        const r = getRFromVisual(pos.q, pos.vRow);
        const hex = new Hex(pos.q, r);
        const cell = map.getCell(hex);
        if (cell) {
            cell.terrain = TerrainType.CASTLE;
        }
    }
}

// Add mountains and hills in the right side of map
function addMountainsAndHills(map) {
    const cells = map.getAllCells();

    for (const cell of cells) {
        const q = cell.hex.q;
        const vRow = getVisualRow(q, cell.hex.r);

        // Mountains in upper right corner
        if (vRow < 5 && q > 15) {
            const noise = Math.sin(q * 2.5 + cell.hex.r * 1.7) * 0.5 + 0.5;
            if (noise > 0.5) {
                cell.terrain = TerrainType.MOUNTAIN;
            } else if (noise > 0.3) {
                cell.terrain = TerrainType.HILL;
            }
        }

        // Hills in bottom right area
        if (vRow > 10 && q > 13) {
            const noise = Math.sin(q * 1.8 + cell.hex.r * 2.3) * 0.5 + 0.5;
            if (noise > 0.6) {
                cell.terrain = TerrainType.MOUNTAIN;
            } else if (noise > 0.3) {
                cell.terrain = TerrainType.HILL;
            }
        }
    }
}

// Add forest in clusters (fewer but larger groups)
function addForestClusters(map) {
    // Define forest cluster centers (visual coordinates)
    const forestCenters = [
        { q: 4, vRow: 4 },
        { q: 12, vRow: 3 },
        { q: 6, vRow: 8 },
        { q: 14, vRow: 7 },
        { q: 2, vRow: 10 },
        { q: 8, vRow: 12 },
    ];

    // For each cluster, fill nearby hexes with forest
    for (const center of forestCenters) {
        const centerR = getRFromVisual(center.q, center.vRow);
        const centerHex = new Hex(center.q, centerR);

        // Get hexes within radius 2 of center
        const clusterHexes = getHexesInRadius(centerHex, 2);

        for (const hex of clusterHexes) {
            const cell = map.getCell(hex);
            if (cell && cell.terrain === TerrainType.GRASS) {
                // Random chance decreasing with distance
                const dist = centerHex.distanceTo(hex);
                const chance = 1 - (dist * 0.3);
                if (Math.random() < chance) {
                    cell.terrain = TerrainType.WOODS;
                }
            }
        }
    }
}

// Get all hexes within a radius of a center hex
function getHexesInRadius(center, radius) {
    const results = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            results.push(new Hex(center.q + dq, center.r + dr));
        }
    }
    return results;
}

// Add river as terrain hexes flowing from top to bottom
function addRiverPath(map) {
    // River flows from top to bottom, column around q=8
    // Store the path of hex coordinates for rendering
    const riverPath = [];

    // Define river path using visual row positions
    // River starts at top and flows down with slight meandering
    // IMPORTANT: Each consecutive pair must be adjacent hexes!
    const riverPoints = [
        { q: 8, vRow: 0 },
        { q: 8, vRow: 1 },
        { q: 8, vRow: 2 },
        { q: 8, vRow: 3 },
        { q: 8, vRow: 4 },
        { q: 8, vRow: 5 },
        { q: 8, vRow: 6 },   // Bridge hex - needed for adjacency
        { q: 7, vRow: 6 },   // Bend slightly west (adjacent to 8,vRow6)
        { q: 7, vRow: 7 },
        { q: 7, vRow: 8 },
        { q: 7, vRow: 9 },
        { q: 6, vRow: 10 },  // Bend more west
        { q: 6, vRow: 11 },
        { q: 6, vRow: 12 },
        { q: 6, vRow: 13 },
        { q: 6, vRow: 14 },
        { q: 6, vRow: 15 },
    ];

    // Set river terrain and build path
    for (const point of riverPoints) {
        const r = getRFromVisual(point.q, point.vRow);
        const hex = new Hex(point.q, r);
        const cell = map.getCell(hex);

        if (cell) {
            cell.terrain = TerrainType.RIVER;
            riverPath.push({ q: point.q, r: r });
        }
    }

    // Store river path for rendering
    map.riverPath = riverPath;
}

// Add roads connecting castles
function addRoads(map) {
    // Castle positions (must match addCastles)
    const castles = [
        new Hex(2, getRFromVisual(2, 2)),       // Top-left
        new Hex(17, getRFromVisual(17, 2)),     // Top-right
        new Hex(10, getRFromVisual(10, 7)),     // Center
        new Hex(3, getRFromVisual(3, 13)),      // Bottom-left
        new Hex(16, getRFromVisual(16, 12))     // Bottom-right
    ];

    // Connect all castles to center
    connectWithRoad(map, castles[0], castles[2]);  // Top-left to Center
    connectWithRoad(map, castles[1], castles[2]);  // Top-right to Center
    connectWithRoad(map, castles[2], castles[3]);  // Center to Bottom-left
    connectWithRoad(map, castles[2], castles[4]);  // Center to Bottom-right
}

// Create road path between two hexes
function connectWithRoad(map, start, end) {
    let current = start;
    const visited = new Set();
    visited.add(current.key);

    while (!current.equals(end)) {
        let bestDir = -1;
        let bestDist = Infinity;

        for (let dir = 0; dir < 6; dir++) {
            const neighbor = current.neighbor(dir);
            if (!map.hasCell(neighbor)) continue;
            if (visited.has(neighbor.key)) continue;

            const dist = neighbor.distanceTo(end);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = dir;
            }
        }

        if (bestDir === -1) break;

        const next = current.neighbor(bestDir);
        visited.add(next.key);

        // Check if crossing a river hex - mark as bridge
        const nextCell = map.getCell(next);
        const currentCell = map.getCell(current);

        if (nextCell && nextCell.terrain === TerrainType.RIVER) {
            // Road enters a river hex - this is a bridge
            map.setEdgeBetween(current, next, EdgeFeature.BRIDGE);
        } else if (currentCell && currentCell.terrain === TerrainType.RIVER) {
            // Road exits a river hex - this is a bridge
            map.setEdgeBetween(current, next, EdgeFeature.BRIDGE);
        } else {
            // Normal road
            map.setEdgeBetween(current, next, EdgeFeature.ROAD);
        }

        current = next;
    }
}
