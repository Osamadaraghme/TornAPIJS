/**
 * TornAPIJS – public API.
 * Re-exports services so consumers can require('./src') or require('./src/index.js').
 */

const { getRandomActiveRankedPlayer } = require('./services/random-active-ranked-player.js');
const { getActiveRankedPlayerById } = require('./services/active-ranked-player-by-id.js');

module.exports = {
    getRandomActiveRankedPlayer,
    getActiveRankedPlayerById,
};
