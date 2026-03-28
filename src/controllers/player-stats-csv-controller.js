/**
 * Controller layer for SQL export player stats APIs.
 * Controllers orchestrate service calls and keep runner wiring simple.
 */

const { getRandomActiveRankedPlayerToSql } = require('../services/random-active-ranked-player.js');
const { getActiveRankedPlayerByIdToSql } = require('../services/active-ranked-player-by-id.js');
const { getFactionPlayersByHofRankToSql } = require('../services/faction-hof-rank-player-stats-csv.js');

function exportRandomActivePlayerToSql(apiKey, options = {}) {
    return getRandomActiveRankedPlayerToSql(apiKey, options);
}

function exportPlayerByIdToSql(playerId, options = {}) {
    return getActiveRankedPlayerByIdToSql(playerId, options);
}

function exportFactionByHofRankToSql(hofRank, options = {}) {
    return getFactionPlayersByHofRankToSql(hofRank, options);
}

module.exports = {
    exportRandomActivePlayerToSql,
    exportPlayerByIdToSql,
    exportFactionByHofRankToSql,
};
