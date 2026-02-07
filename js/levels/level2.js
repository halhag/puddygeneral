/**
 * Level 2 - Baron von Flussburg
 * Two castles to capture - one easy, one behind a river
 */

const Level2 = {
    id: 2,
    name: "Baron von Flussburg",
    description: "Cross the river and capture both enemy castles.",

    // Story intro shown when level starts
    introText: `Baron von Flussburg has built his domain around the great river Pudda. His two castles control the trade routes through the region.

The first castle sits on open ground near the river crossing. It should fall quickly. But the second castle lies beyond the river Pudda itself. Your men will need to find a way across.

Baron von Flussburg is known for his love of fishing and his hatred of uninvited guests. He has garrisoned both castles and will not surrender without a fight.

You have 20 days. Take both castles and the river trade routes are ours!`,

    // Victory/defeat conditions
    castlesToCapture: 2,
    turnLimit: 20,
    earlyVictoryBonus: 15,
    enemyStartingStrength: 10,

    // Player setup
    playerUnitsToPlace: 4,
    playerStartingPrestige: 250,
    showMarketplace: true,
    maxUnits: 6,

    // Castle positions (q, vRow format)
    castles: {
        player: [],
        enemy: [
            { q: 13, vRow: 7 },     // Center-right - "easy" castle, player's side of river
            { q: 3, vRow: 5 }       // Left side - "hard" castle, behind the river
        ]
    },

    // Fixed forest positions (q, r in axial coordinates)
    forests: [
        // Cluster 1: South of hard castle (cover for river-crossing approach)
        { q: 2, r: 5 }, { q: 3, r: 5 }, { q: 2, r: 6 },
        { q: 4, r: 5 }, { q: 3, r: 6 },

        // Cluster 2: West of river, mid-section
        { q: 5, r: 2 }, { q: 6, r: 2 }, { q: 5, r: 3 },
        { q: 6, r: 3 }, { q: 4, r: 3 },

        // Cluster 3: Central area between river and easy castle
        { q: 11, r: -1 }, { q: 12, r: -2 }, { q: 11, r: 0 },
        { q: 12, r: -1 }, { q: 13, r: -2 },

        // Cluster 4: Upper-right area near player start
        { q: 15, r: -4 }, { q: 16, r: -5 }, { q: 16, r: -4 },
        { q: 15, r: -3 }, { q: 14, r: -3 },

        // Cluster 5: Lower-center
        { q: 10, r: 5 }, { q: 11, r: 4 }, { q: 10, r: 6 },
        { q: 11, r: 5 }, { q: 9, r: 6 }
    ],

    // Enemy unit placements
    enemyUnits: [
        { type: 'infantry', q: 13, vRow: 7 },   // Garrison at easy castle → (13,1)
        { type: 'infantry', q: 8, vRow: 5 },    // Infantry near river → (8,1)
        { type: 'trebuchet', q: 7, vRow: 5 },   // Trebuchet next to infantry → (7,2)
        { type: 'trebuchet', q: 2, vRow: 6 },   // Trebuchet near hard castle → (2,5)
        { type: 'infantry', q: 3, vRow: 5 },    // Garrison at hard castle → (3,4)
        { type: 'cavalry', q: 7, vRow: 8 }      // Cavalry west of river → (7,5)
    ],

    // Player's pre-placed units (none - player places all units)
    playerUnits: [],

    // Player units available to place: 3 infantry + 1 trebuchet (same base as Level 1)
    playerUnitTypes: ['infantry', 'infantry', 'infantry', 'trebuchet'],

    // Custom road paths
    customRoads: [
        // Road from upper player castle to easy castle
        { from: { q: 18, vRow: 3 }, to: { q: 13, vRow: 7 } },
        // Road from lower player castle to easy castle
        { from: { q: 17, vRow: 12 }, to: { q: 13, vRow: 7 } },
        // Road from easy castle across river to hard castle (creates bridge)
        { from: { q: 13, vRow: 7 }, to: { q: 3, vRow: 5 } }
    ],

    // Terrain regions (generic system for mountains and hills)
    terrainRegions: [
        // Mountains in upper-left area (different from Level 1's upper-right)
        {
            bounds: { maxQ: 6, maxVRow: 4 },
            mountainThreshold: 0.55,
            hillThreshold: 0.3,
            noiseFactor1: 2.3,
            noiseFactor2: 1.9
        },
        // Hills in center-south area (different from Level 1's bottom-right)
        {
            bounds: { minQ: 11, maxQ: 16, minVRow: 9, maxVRow: 13 },
            mountainThreshold: 0.85,
            hillThreshold: 0.35,
            noiseFactor1: 1.6,
            noiseFactor2: 2.8
        }
    ],

    // River path (q, vRow format) - diagonal flow from upper-center to lower-left
    riverPath: [
        { q: 10, vRow: 0 },
        { q: 10, vRow: 1 },
        { q: 10, vRow: 2 },
        { q: 10, vRow: 3 },    // Bridge hex (10,-2) connecting to (9, vRow=3)
        { q: 9, vRow: 3 },
        { q: 9, vRow: 4 },
        { q: 9, vRow: 5 },
        { q: 8, vRow: 6 },
        { q: 8, vRow: 7 },
        { q: 8, vRow: 8 },
        { q: 8, vRow: 9 },     // Bridge hex (8,5) connecting to (7, vRow=9)
        { q: 7, vRow: 9 },
        { q: 7, vRow: 10 },
        { q: 6, vRow: 11 },
        { q: 6, vRow: 12 },
        { q: 5, vRow: 12 },    // Bridge hex (5,10) connecting to (5, vRow=13)
        { q: 5, vRow: 13 },
        { q: 5, vRow: 14 },
        { q: 5, vRow: 15 }
    ]
};

// Make available globally
if (typeof window !== 'undefined') {
    window.Level2 = Level2;
}
