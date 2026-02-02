/**
 * Level Manager - Handles loading and managing level definitions
 */

const LevelManager = {
    // Registry of all available levels
    levels: {},

    /**
     * Register a level definition
     */
    register(level) {
        this.levels[level.id] = level;
    },

    /**
     * Get a level by ID
     */
    getLevel(id) {
        const level = this.levels[id] || null;
        if (!level) {
            console.warn(`Level ${id} not found. Registered levels:`, Object.keys(this.levels));
        }
        return level;
    },

    /**
     * Get the first level (for new games)
     */
    getFirstLevel() {
        return this.levels[1] || null;
    },

    /**
     * Get the next level after the given level ID
     */
    getNextLevel(currentLevelId) {
        const nextId = currentLevelId + 1;
        return this.levels[nextId] || null;
    },

    /**
     * Check if there's a next level
     */
    hasNextLevel(currentLevelId) {
        return this.levels[currentLevelId + 1] !== undefined;
    },

    /**
     * Get all level IDs in order
     */
    getAllLevelIds() {
        return Object.keys(this.levels)
            .map(id => parseInt(id))
            .sort((a, b) => a - b);
    },

    /**
     * Convert visual row to axial r coordinate
     */
    vRowToR(q, vRow) {
        return Math.round(vRow - q / 2);
    },

    /**
     * Create a map from a level definition
     */
    createMapFromLevel(level) {
        const map = new HexMap();

        // Visual dimensions in pixels
        const visualWidth = 1000;
        const visualHeight = 860;
        const hexSize = CONFIG.HEX_SIZE;

        // Calculate hex dimensions
        const hexHeight = hexSize * Math.sqrt(3);
        const colSpacing = hexSize * 1.5;
        const rowSpacing = hexHeight;

        // Determine q range (columns)
        const qMin = 0;
        const qMax = Math.floor(visualWidth / colSpacing) + 1;

        // First pass: create all cells with grass
        for (let q = qMin; q <= qMax; q++) {
            const rMin = Math.floor(-q / 2);
            const rMax = Math.floor(visualHeight / rowSpacing - q / 2) + 1;

            for (let r = rMin; r <= rMax; r++) {
                const hex = new Hex(q, r);
                map.addCell(new HexCell(hex, TerrainType.GRASS));
            }
        }

        // Add castles
        this.addCastlesFromLevel(map, level);

        // Add mountains and hills (deterministic based on position)
        this.addMountainsAndHills(map, level);

        // Add forests from fixed positions
        this.addForestsFromLevel(map, level);

        // Add river
        this.addRiverFromLevel(map, level);

        // Add roads connecting castles
        this.addRoadsFromLevel(map, level);

        return map;
    },

    /**
     * Add castles from level definition
     */
    addCastlesFromLevel(map, level) {
        const allCastles = [
            ...level.castles.player,
            ...level.castles.enemy
        ];

        for (const pos of allCastles) {
            const r = this.vRowToR(pos.q, pos.vRow);
            const hex = new Hex(pos.q, r);
            const cell = map.getCell(hex);
            if (cell) {
                cell.terrain = TerrainType.CASTLE;
            }
        }
    },

    /**
     * Add mountains and hills using deterministic noise
     */
    addMountainsAndHills(map, level) {
        const cells = map.getAllCells();

        for (const cell of cells) {
            const q = cell.hex.q;
            const vRow = q / 2 + cell.hex.r;

            // Mountains in upper right corner
            if (level.mountainsUpperRight) {
                const region = level.mountainsUpperRight.region;
                if (vRow < region.maxVRow && q > region.minQ) {
                    // Deterministic noise based on position
                    const noise = Math.sin(q * 2.5 + cell.hex.r * 1.7) * 0.5 + 0.5;
                    if (noise > 0.5) {
                        cell.terrain = TerrainType.MOUNTAIN;
                    } else if (noise > 0.3) {
                        cell.terrain = TerrainType.HILL;
                    }
                }
            }

            // Hills in bottom right area
            if (level.hillsBottomRight) {
                const region = level.hillsBottomRight.region;
                if (vRow > region.minVRow && q > region.minQ) {
                    const noise = Math.sin(q * 1.8 + cell.hex.r * 2.3) * 0.5 + 0.5;
                    if (noise > 0.6) {
                        cell.terrain = TerrainType.MOUNTAIN;
                    } else if (noise > 0.3) {
                        cell.terrain = TerrainType.HILL;
                    }
                }
            }
        }
    },

    /**
     * Add forests from fixed level positions
     */
    addForestsFromLevel(map, level) {
        for (const pos of level.forests) {
            const hex = new Hex(pos.q, pos.r);
            const cell = map.getCell(hex);
            if (cell && cell.terrain === TerrainType.GRASS) {
                cell.terrain = TerrainType.WOODS;
            }
        }
    },

    /**
     * Add river from level definition
     */
    addRiverFromLevel(map, level) {
        const riverPath = [];

        for (const point of level.riverPath) {
            const r = this.vRowToR(point.q, point.vRow);
            const hex = new Hex(point.q, r);
            const cell = map.getCell(hex);

            if (cell) {
                cell.terrain = TerrainType.RIVER;
                riverPath.push({ q: point.q, r: r });
            }
        }

        map.riverPath = riverPath;
    },

    /**
     * Add roads connecting castles
     */
    addRoadsFromLevel(map, level) {
        // Check if level has custom road definitions
        if (level.customRoads && level.customRoads.length > 0) {
            // Use custom road paths
            for (const road of level.customRoads) {
                const fromHex = new Hex(road.from.q, this.vRowToR(road.from.q, road.from.vRow));
                const toHex = new Hex(road.to.q, this.vRowToR(road.to.q, road.to.vRow));
                this.connectWithRoad(map, fromHex, toHex);
            }
        } else {
            // Default behavior: connect all castles to center castle
            const allCastles = [
                ...level.castles.player,
                ...level.castles.enemy
            ].map(pos => new Hex(pos.q, this.vRowToR(pos.q, pos.vRow)));

            // Find center castle (approximately)
            let centerCastle = allCastles[0];
            let minTotalDist = Infinity;

            for (const castle of allCastles) {
                let totalDist = 0;
                for (const other of allCastles) {
                    totalDist += castle.distanceTo(other);
                }
                if (totalDist < minTotalDist) {
                    minTotalDist = totalDist;
                    centerCastle = castle;
                }
            }

            // Connect all castles to center
            for (const castle of allCastles) {
                if (!castle.equals(centerCastle)) {
                    this.connectWithRoad(map, castle, centerCastle);
                }
            }
        }
    },

    /**
     * Create road path between two hexes
     */
    connectWithRoad(map, start, end) {
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

            const nextCell = map.getCell(next);
            const currentCell = map.getCell(current);

            if (nextCell && nextCell.terrain === TerrainType.RIVER) {
                map.setEdgeBetween(current, next, EdgeFeature.BRIDGE);
            } else if (currentCell && currentCell.terrain === TerrainType.RIVER) {
                map.setEdgeBetween(current, next, EdgeFeature.BRIDGE);
            } else {
                map.setEdgeBetween(current, next, EdgeFeature.ROAD);
            }

            current = next;
        }
    },

    /**
     * Place enemy units from level definition
     */
    placeEnemyUnits(units, level) {
        for (const enemyDef of level.enemyUnits) {
            const r = this.vRowToR(enemyDef.q, enemyDef.vRow);
            const hex = new Hex(enemyDef.q, r);
            const unit = new Unit(enemyDef.type, 1, hex);  // Player 1 = enemy
            // Apply level-specific enemy starting strength if defined
            if (level.enemyStartingStrength !== undefined) {
                unit.strength = level.enemyStartingStrength;
            }
            units.addUnit(unit);
        }
    },

    /**
     * Place player's pre-placed units from level definition
     */
    placePlayerUnits(units, level) {
        for (const playerDef of level.playerUnits) {
            const r = this.vRowToR(playerDef.q, playerDef.vRow);
            const hex = new Hex(playerDef.q, r);
            const unit = new Unit(playerDef.type, 0, hex);  // Player 0 = player
            units.addUnit(unit);
        }
    }
};

// Register Level 1 (using window.Level1 since const is file-scoped)
if (typeof window !== 'undefined' && window.Level1) {
    LevelManager.register(window.Level1);
} else {
    console.error('Level1 not found! Make sure level1.js is loaded before levelManager.js');
}

// Make available globally
if (typeof window !== 'undefined') {
    window.LevelManager = LevelManager;
}
