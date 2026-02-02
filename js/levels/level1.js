/**
 * Level 1 - Baron von Dunkhauzen
 * A fixed introductory level for the campaign
 */

const Level1 = {
    id: 1,
    name: "Baron von Dunkhauzen",
    description: "Capture the enemy castle to secure the region.",

    // Victory/defeat conditions
    castlesToCapture: 1,  // Number of enemy castles player must capture to win
    turnLimit: 15,        // Turns to complete the mission (counts down)
    earlyVictoryBonus: 20, // Prestige per turn remaining on victory

    // Player setup
    playerUnitsToPlace: 4,  // 3 infantry + 1 trebuchet
    playerStartingPrestige: 150,

    // Castle positions (q, vRow format)
    // Player castles are on the right, enemy castles on the left
    castles: {
        player: [
            { q: 17, vRow: 2 },     // Top-right
            { q: 16, vRow: 12 }     // Bottom-right
        ],
        enemy: [
            { q: 10, vRow: 7 }      // Center - only enemy castle for Level 1
        ]
    },

    // Fixed forest positions (q, r in axial coordinates)
    // These are predetermined for a consistent level 1 experience
    forests: [
        // Cluster near top-left
        { q: 3, r: 2 }, { q: 4, r: 2 }, { q: 4, r: 1 },
        { q: 5, r: 1 }, { q: 3, r: 3 }, { q: 5, r: 2 },

        // Cluster near top-center
        { q: 11, r: -3 }, { q: 12, r: -4 }, { q: 12, r: -3 },
        { q: 13, r: -4 }, { q: 11, r: -2 }, { q: 13, r: -3 },

        // Cluster center-left (near river)
        { q: 5, r: 5 }, { q: 6, r: 4 }, { q: 5, r: 6 },
        { q: 4, r: 6 }, { q: 6, r: 5 },

        // Cluster center-right
        { q: 13, r: 0 }, { q: 14, r: -1 }, { q: 14, r: 0 },
        { q: 15, r: -1 }, { q: 13, r: 1 }, { q: 15, r: 0 },

        // Cluster bottom-left
        { q: 1, r: 9 }, { q: 2, r: 8 }, { q: 2, r: 9 },
        { q: 3, r: 8 }, { q: 1, r: 10 },

        // Cluster bottom-center
        { q: 7, r: 8 }, { q: 8, r: 7 }, { q: 8, r: 8 },
        { q: 9, r: 7 }, { q: 7, r: 9 }, { q: 9, r: 8 }
    ],

    // Enemy unit placements
    // Each entry: { type, q, vRow }
    enemyUnits: [
        // Garrison in center castle
        { type: 'infantry', q: 10, vRow: 7 },
        // Unit north of castle
        { type: 'infantry', q: 10, vRow: 6 },
        // Unit in woods to the east
        { type: 'infantry', q: 13, vRow: 6 },
        // Trebuchet in the north (grid coord 9, 2)
        { type: 'trebuchet', q: 9, vRow: 6 }
    ],

    // Player's pre-placed units (none for level 1 - player places all units)
    playerUnits: [],

    // Player units available to place: 3 infantry + 1 trebuchet
    playerUnitTypes: ['infantry', 'infantry', 'infantry', 'trebuchet'],

    // Custom road paths - roads extend off-screen where castles were removed
    // Each path is an array of {q, vRow} points to connect
    customRoads: [
        // Road from center castle going northwest off map (where top-left castle was)
        { from: { q: 10, vRow: 7 }, to: { q: 0, vRow: 2 } },
        // Road from center castle going southwest off map (where bottom-left castle was)
        { from: { q: 10, vRow: 7 }, to: { q: 0, vRow: 13 } },
        // Road from center castle to top-right player castle
        { from: { q: 10, vRow: 7 }, to: { q: 17, vRow: 2 } },
        // Road from center castle to bottom-right player castle
        { from: { q: 10, vRow: 7 }, to: { q: 16, vRow: 12 } }
    ],

    // Mountain positions (q, vRow) - uses noise-like pattern
    // Upper right mountains
    mountainsUpperRight: {
        region: { minQ: 15, maxVRow: 5 },
        pattern: 'noise'  // Uses deterministic noise based on position
    },

    // Hills in bottom right
    hillsBottomRight: {
        region: { minQ: 13, minVRow: 10 },
        pattern: 'noise'
    },

    // River path (q, vRow format)
    riverPath: [
        { q: 8, vRow: 0 },
        { q: 8, vRow: 1 },
        { q: 8, vRow: 2 },
        { q: 8, vRow: 3 },
        { q: 8, vRow: 4 },
        { q: 8, vRow: 5 },
        { q: 8, vRow: 6 },
        { q: 7, vRow: 6 },
        { q: 7, vRow: 7 },
        { q: 7, vRow: 8 },
        { q: 7, vRow: 9 },
        { q: 6, vRow: 10 },
        { q: 6, vRow: 11 },
        { q: 6, vRow: 12 },
        { q: 6, vRow: 13 },
        { q: 6, vRow: 14 },
        { q: 6, vRow: 15 }
    ]
};

// Make available globally
if (typeof window !== 'undefined') {
    window.Level1 = Level1;
}
