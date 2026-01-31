/**
 * LocalStorage wrapper for game persistence
 */
const GameStorage = {
    // Get list of saved games (metadata only)
    getGameList() {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!data) return [];

        try {
            const games = JSON.parse(data);
            return games.map(g => ({
                id: g.id,
                name: g.name,
                createdAt: g.createdAt,
                updatedAt: g.updatedAt,
                turn: g.turn
            }));
        } catch (e) {
            console.error('Failed to parse game list:', e);
            return [];
        }
    },

    // Save a game state
    saveGame(gameState) {
        gameState.updatedAt = new Date().toISOString();

        let games = this.getAllGames();
        const index = games.findIndex(g => g.id === gameState.id);

        if (index >= 0) {
            games[index] = gameState.toJSON();
        } else {
            games.push(gameState.toJSON());
        }

        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(games));
            localStorage.setItem(CONFIG.CURRENT_GAME_KEY, gameState.id);
            return true;
        } catch (e) {
            console.error('Failed to save game:', e);
            return false;
        }
    },

    // Load a game by ID
    loadGame(gameId) {
        const games = this.getAllGames();
        const gameData = games.find(g => g.id === gameId);

        if (!gameData) return null;

        localStorage.setItem(CONFIG.CURRENT_GAME_KEY, gameId);
        return GameState.fromJSON(gameData);
    },

    // Load the last played game
    loadCurrentGame() {
        const currentId = localStorage.getItem(CONFIG.CURRENT_GAME_KEY);
        if (!currentId) return null;
        return this.loadGame(currentId);
    },

    // Delete a game
    deleteGame(gameId) {
        let games = this.getAllGames();
        games = games.filter(g => g.id !== gameId);

        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(games));

            if (localStorage.getItem(CONFIG.CURRENT_GAME_KEY) === gameId) {
                localStorage.removeItem(CONFIG.CURRENT_GAME_KEY);
            }
            return true;
        } catch (e) {
            console.error('Failed to delete game:', e);
            return false;
        }
    },

    // Get all raw game data
    getAllGames() {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        try {
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Failed to parse games:', e);
            return [];
        }
    },

    // Check if any saved games exist
    hasSavedGames() {
        return this.getGameList().length > 0;
    }
};
