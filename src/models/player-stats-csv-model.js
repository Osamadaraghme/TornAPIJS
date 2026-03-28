/**
 * Export model for player stats (SQL INSERT columns; same order as legacy CSV headers).
 */

const CSV_HEADERS = [
    'recordedAt',
    'requestedFactionHofRank',
    'playerId',
    'name',
    'level',
    'ageDays',
    'ageMonths',
    'ageYears',
    'hasFaction',
    'hasCompany',
    'factionName',
    'companyName',
    'hoursSinceLastAction',
    'xanScore',
    'tier',
    'avgXanaxPerDay',
    'allTimeXanaxTaken',
    'xanaxTakenUntilLastMonth',
    'xanaxTakenDuringLastMonth',
    'periodUsed',
    'xanaxMode',
    'tornApiCallsUsed',
];

/**
 * Build one export row object from player stats (keys match `CSV_HEADERS`).
 * @param {object} stats
 * @param {{ requestedFactionHofRank?: number|null }} [context]
 * @returns {object}
 */
function buildPlayerStatsCsvRow(stats, context = {}) {
    return {
        recordedAt: new Date().toISOString(),
        requestedFactionHofRank: context.requestedFactionHofRank ?? null,
        playerId: stats.playerId,
        name: stats.name,
        level: stats.level,
        ageDays: stats.ageDays,
        ageMonths: stats.ageMonths,
        ageYears: stats.ageYears,
        hasFaction: stats.hasFaction,
        hasCompany: stats.hasCompany,
        factionName: stats.factionName,
        companyName: stats.companyName,
        hoursSinceLastAction: stats.hoursSinceLastAction,
        xanScore: stats.xanScore,
        tier: stats.tier,
        avgXanaxPerDay: stats.avgXanaxPerDay,
        allTimeXanaxTaken: stats.allTimeXanaxTaken,
        xanaxTakenUntilLastMonth: stats.xanaxTakenUntilLastMonth,
        xanaxTakenDuringLastMonth: stats.xanaxTakenDuringLastMonth,
        periodUsed: stats.periodUsed,
        xanaxMode: stats.xanaxMode,
        tornApiCallsUsed: stats.tornApiCallsUsed,
    };
}

module.exports = {
    CSV_HEADERS,
    buildPlayerStatsCsvRow,
};
