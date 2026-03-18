/**
 * TornAPIJS – public API.
 * Re-exports services so consumers can require('./src') or require('./src/index.js').
 */

const { getRandomActiveRankedPlayer } = require('./services/active-ranked-player.js');

module.exports = {
    getRandomActiveRankedPlayer,
};
