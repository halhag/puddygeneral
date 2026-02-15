/**
 * Level 3 - The Mongol Horde
 * Defensive level: protect 3 castles against overwhelming cavalry
 */

const Level3 = {
    id: 3,
    name: "The Mongol Horde",
    description: "Defend your three castles against the invading horde.",
    gameMode: 'defense',

    // Story intro shown when level starts
    introText: `A vast Mongolian horde has crossed the eastern steppes and now threatens your heartland. Their mounted warriors number in the dozens and they bring a great trebuchet to batter your walls.

You must hold your three castles at all costs. The horde will divide and strike at multiple points. Use the river and your fortifications wisely.

Baron Puddy has sent three companies of auxiliary militia to bolster your garrisons, but they are not battle-hardened. Your prestige from previous victories will be needed to recruit proper soldiers.

Hold for 22 days. If even one castle still flies our banner, we win!`,

    // Victory/defeat conditions (defense mode)
    castlesToCapture: 0,
    castlesToDefend: 3,
    turnLimit: 22,
    earlyVictoryBonus: 0,
    defensePrestigePerCastle: 75,
    enemyStartingStrength: 10,

    // Player setup
    playerUnitsToPlace: 0,
    playerStartingPrestige: 0,      // Overridden by carry-over from Level 2
    showMarketplace: true,
    maxUnits: 8,

    // Castle positions (q, vRow format)
    // Player castles on the right side to defend
    castles: {
        player: [
            { q: 16, vRow: 3 },     // Top castle → (16,-5)
            { q: 15, vRow: 8 },     // Center castle → (15,1)
            { q: 16, vRow: 12 }     // Bottom castle → (16,4)
        ],
        enemy: []
    },

    // Auxiliary infantry pre-placed at each castle (strength 8)
    playerUnits: [
        { type: 'infantry', q: 16, vRow: 3, strength: 8, auxiliary: true },
        { type: 'infantry', q: 15, vRow: 8, strength: 8, auxiliary: true },
        { type: 'infantry', q: 16, vRow: 12, strength: 8, auxiliary: true }
    ],

    playerUnitTypes: [],

    // Enemy horde: 18 cavalry on left side
    enemyUnits: [
        // Main force (11 cavalry) targeting center castle
        { type: 'cavalry', q: 2, vRow: 6 },
        { type: 'cavalry', q: 3, vRow: 6 },
        { type: 'cavalry', q: 2, vRow: 7 },
        { type: 'cavalry', q: 3, vRow: 7 },
        { type: 'cavalry', q: 1, vRow: 7 },
        { type: 'cavalry', q: 2, vRow: 8 },
        { type: 'cavalry', q: 3, vRow: 8 },
        { type: 'cavalry', q: 1, vRow: 8 },
        { type: 'cavalry', q: 4, vRow: 7 },
        { type: 'cavalry', q: 1, vRow: 6 },
        { type: 'cavalry', q: 4, vRow: 6 },
        // Raider force (7 cavalry) targeting top castle
        { type: 'cavalry', q: 1, vRow: 3 },
        { type: 'cavalry', q: 2, vRow: 3 },
        { type: 'cavalry', q: 1, vRow: 4 },
        { type: 'cavalry', q: 2, vRow: 4 },
        { type: 'cavalry', q: 3, vRow: 3 },
        { type: 'cavalry', q: 3, vRow: 4 },
        { type: 'cavalry', q: 1, vRow: 2 }
    ],

    // Horde AI configuration
    hordeConfig: {
        // Indices into castles.player
        mainForceTarget: 1,         // Center castle
        raiderTarget: 0,            // Top castle
        // Indices into enemyUnits array
        mainForceUnits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        raiderUnits: [11, 12, 13, 14, 15, 16, 17]
    },

    // Fixed forest positions (q, r in axial coordinates)
    forests: [
        // Cluster between river and top castle
        { q: 12, r: -4 }, { q: 13, r: -5 }, { q: 12, r: -3 },
        { q: 13, r: -4 }, { q: 11, r: -3 },

        // Cluster between river and center castle
        { q: 12, r: 0 }, { q: 11, r: 1 }, { q: 12, r: 1 },
        { q: 13, r: 0 }, { q: 11, r: 2 },

        // Cluster between river and bottom castle
        { q: 12, r: 4 }, { q: 13, r: 4 }, { q: 12, r: 5 },
        { q: 11, r: 5 }, { q: 13, r: 3 },

        // Cluster on horde side (slowing approach)
        { q: 5, r: 1 }, { q: 6, r: 0 }, { q: 5, r: 2 },
        { q: 6, r: 1 }, { q: 4, r: 2 },

        // Lower horde side cluster
        { q: 4, r: 6 }, { q: 5, r: 6 }, { q: 4, r: 7 },
        { q: 5, r: 5 }, { q: 3, r: 7 }
    ],

    // Roads connecting castles
    customRoads: [
        // Road from top castle to center castle
        { from: { q: 16, vRow: 3 }, to: { q: 15, vRow: 8 } },
        // Road from center castle to bottom castle
        { from: { q: 15, vRow: 8 }, to: { q: 16, vRow: 12 } },
        // Road from center castle westward across river
        { from: { q: 15, vRow: 8 }, to: { q: 3, vRow: 7 } }
    ],

    // Terrain regions
    terrainRegions: [
        // Mountains in upper-left (channel the horde)
        {
            bounds: { maxQ: 4, maxVRow: 2 },
            mountainThreshold: 0.50,
            hillThreshold: 0.30,
            noiseFactor1: 2.1,
            noiseFactor2: 1.8
        },
        // Hills near top castle
        {
            bounds: { minQ: 14, maxQ: 19, minVRow: 1, maxVRow: 5 },
            mountainThreshold: 0.90,
            hillThreshold: 0.45,
            noiseFactor1: 1.7,
            noiseFactor2: 2.5
        },
        // Hills near bottom castle
        {
            bounds: { minQ: 14, maxQ: 19, minVRow: 10, maxVRow: 14 },
            mountainThreshold: 0.90,
            hillThreshold: 0.45,
            noiseFactor1: 1.5,
            noiseFactor2: 2.2
        }
    ],

    // River as defensive barrier (roughly vertical around q=8-9)
    riverPath: [
        { q: 9, vRow: 0 },
        { q: 9, vRow: 1 },
        { q: 9, vRow: 2 },
        { q: 9, vRow: 3 },
        { q: 8, vRow: 4 },
        { q: 8, vRow: 5 },
        { q: 8, vRow: 6 },
        { q: 8, vRow: 7 },
        { q: 8, vRow: 8 },
        { q: 8, vRow: 9 },
        { q: 7, vRow: 10 },
        { q: 7, vRow: 11 },
        { q: 7, vRow: 12 },
        { q: 7, vRow: 13 },
        { q: 7, vRow: 14 },
        { q: 7, vRow: 15 }
    ]
};

// Make available globally
if (typeof window !== 'undefined') {
    window.Level3 = Level3;
}
