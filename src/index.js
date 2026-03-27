/**
 * TornAPIJS - public API.
 * Re-exports services so consumers can require('./src') or require('./src/index.js').
 */

const {
    exportRandomActivePlayerToSql,
    exportPlayerByIdToSql,
    exportFactionByHofRankToSql,
} = require('./controllers/player-stats-export-controller.js');

module.exports = {
    getRandomActiveRankedPlayerToSql: exportRandomActivePlayerToSql,
    getActiveRankedPlayerByIdToSql: exportPlayerByIdToSql,
    getFactionPlayersByHofRankToSql: exportFactionByHofRankToSql,
};
