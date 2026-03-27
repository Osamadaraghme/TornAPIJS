/**
 * TornAPIJS - public API.
 * Re-exports services so consumers can require('./src') or require('./src/index.js').
 */

const {
    exportRandomActivePlayerToCsv,
    exportPlayerByIdToCsv,
    exportFactionByHofRankToCsv,
} = require('./controllers/player-stats-csv-controller.js');

module.exports = {
    // CSV-only public API
    getRandomActiveRankedPlayerToCsv: exportRandomActivePlayerToCsv,
    getActiveRankedPlayerByIdToCsv: exportPlayerByIdToCsv,
    getFactionPlayersByHofRankToCsv: exportFactionByHofRankToCsv,
};

