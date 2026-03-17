/**
 * TornAPIJS – public API.
 * Re-exports services so consumers can require('./src') or require('./src/index.js').
 */

const { getPlayerLevel } = require('./services/player-level.js');
const { getRandomPlayer } = require('./services/random-player.js');
const { getRandomActiveRankedPlayer } = require('./services/active-ranked-player.js');

module.exports = {
    getPlayerLevel,
    getRandomPlayer,
    getRandomActiveRankedPlayer,
};
