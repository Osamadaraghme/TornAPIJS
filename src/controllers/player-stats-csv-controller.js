/**
 * Controller layer for CSV-only player stats APIs.
 * Controllers orchestrate service calls and keep runner wiring simple.
 */

const { getRandomActiveRankedPlayerToCsv } = require('../services/random-active-ranked-player-csv.js');
const { getActiveRankedPlayerByIdToCsv } = require('../services/active-ranked-player-by-id-csv.js');
const { getFactionPlayersByHofRankToCsv } = require('../services/faction-hof-rank-player-stats-csv.js');

function exportRandomActivePlayerToCsv(apiKey, options = {}) {
    return getRandomActiveRankedPlayerToCsv(apiKey, options);
}

function exportPlayerByIdToCsv(playerId, options = {}) {
    return getActiveRankedPlayerByIdToCsv(playerId, options);
}

function exportFactionByHofRankToCsv(hofRank, options = {}) {
    return getFactionPlayersByHofRankToCsv(hofRank, options);
}

module.exports = {
    exportRandomActivePlayerToCsv,
    exportPlayerByIdToCsv,
    exportFactionByHofRankToCsv,
};
