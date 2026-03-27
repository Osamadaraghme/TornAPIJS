/**
 * Fetch players from a faction chosen by Hall-of-Fame rank, then append each
 * player's stats as INSERT rows in a .sql file.
 */

const { fetchTorn, fetchFaction } = require('../api/torn-client.js');
const { getActiveRankedPlayerById } = require('./active-ranked-player-by-id.js');
const { appendSqlRow } = require('../utils/sql-append.js');
const { messageForTornError } = require('../utils/errors.js');
const { TORN_FATAL_ERROR_CODES, DEFAULT_FACTION_HOF_STATS_SQL_PATH } = require('../constants.js');
const { CSV_HEADERS, buildPlayerStatsCsvRow } = require('../models/player-stats-csv-model.js');

function asFiniteNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function asPositiveInt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    return Math.floor(n);
}

function firstFiniteNumber(values) {
    for (const v of values) {
        const n = asFiniteNumber(v);
        if (n != null) return n;
    }
    return null;
}

/**
 * Best-effort parser to find a faction by requested HoF rank in Torn payloads.
 * Supports object- and array-based response shapes.
 */
function findFactionByHofRank(payload, desiredRank) {
    const visited = new Set();
    const queue = [{ node: payload, keyHint: null }];

    while (queue.length) {
        const { node, keyHint } = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (visited.has(node)) continue;
        visited.add(node);

        if (Array.isArray(node)) {
            for (const item of node) queue.push({ node: item, keyHint: null });
            continue;
        }

        const rank = firstFiniteNumber([
            node.position,
            node.place,
            node.hof_rank,
            node.hofRank,
            node.rank,
        ]);
        const idFromValue = asPositiveInt(
            node.faction_id ?? node.factionId ?? node.id ?? node.ID ?? null,
        );
        const idFromKey = asPositiveInt(keyHint);
        const factionId = idFromValue ?? idFromKey;

        if (rank === desiredRank && factionId != null) {
            return {
                factionId,
                factionName: node.name ?? node.faction_name ?? null,
                rank,
            };
        }

        for (const [k, v] of Object.entries(node)) {
            if (v && typeof v === 'object') queue.push({ node: v, keyHint: k });
        }
    }

    return null;
}

function extractFactionMembers(payload) {
    const candidates = [
        payload?.members,
        payload?.basic?.members,
        payload?.faction?.members,
        null,
    ];

    for (const members of candidates) {
        if (!members || typeof members !== 'object') continue;

        if (Array.isArray(members)) {
            const ids = members
                .map((m) => asPositiveInt(m?.player_id ?? m?.id ?? m?.ID ?? null))
                .filter((x) => x != null);
            if (ids.length) return [...new Set(ids)];
            continue;
        }

        const ids = Object.entries(members)
            .map(([k, v]) => asPositiveInt(v?.player_id ?? v?.id ?? v?.ID ?? k))
            .filter((x) => x != null);
        if (ids.length) return [...new Set(ids)];
    }

    return [];
}

async function fetchFactionWithMembers(factionId, apiKey, counter) {
    const selectionsToTry = ['basic', 'members', 'basic,members'];
    let lastError = null;

    for (const selections of selectionsToTry) {
        const data = await fetchFaction(factionId, selections, apiKey, counter);
        if (data?.error) {
            lastError = data.error;
            continue;
        }
        const memberIds = extractFactionMembers(data);
        if (memberIds.length) {
            return {
                data,
                memberIds,
                factionName: data?.name ?? data?.basic?.name ?? null,
            };
        }
    }

    if (lastError) {
        const message = messageForTornError(lastError);
        const code = lastError?.code ?? lastError?.error_code;
        if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
            throw new Error(message || `Torn API error (code ${code}).`);
        }
        throw new Error(message || 'Could not fetch faction members from Torn API.');
    }

    throw new Error('Faction found but no members were returned by Torn API.');
}

/**
 * Write one INSERT per member of a faction selected by HoF rank.
 * @param {number|string} factionHofRank - e.g. 1 means HoF faction #1
 * @param {{ sqlPath?: string, csvPath?: string, maxPlayers?: number }} [options]
 * @returns {Promise<object>}
 */
async function getFactionPlayersByHofRankToSql(factionHofRank, options = {}) {
    const apiKey = process.env.TORN_API_KEY;

    const rank = asPositiveInt(factionHofRank);
    if (!rank) throw new Error(`Invalid factionHofRank: ${factionHofRank}`);

    const sqlPath = options.sqlPath
        ?? options.csvPath
        ?? process.env.TORN_FACTION_HOF_STATS_SQL
        ?? process.env.TORN_FACTION_HOF_STATS_CSV
        ?? process.env.TORN_STATS_SQL
        ?? process.env.TORN_STATS_CSV
        ?? DEFAULT_FACTION_HOF_STATS_SQL_PATH;

    const maxPlayers = asPositiveInt(options.maxPlayers ?? process.env.TORN_FACTION_MEMBER_LIMIT);

    const counter = { value: 0 };

    const hofData = await fetchTorn('factionhof', apiKey, counter);
    if (hofData?.error) {
        const message = messageForTornError(hofData.error);
        const code = hofData.error?.code ?? hofData.error?.error_code;
        if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
            throw new Error(message || `Torn API error (code ${code}).`);
        }
        throw new Error(message || 'Could not fetch faction Hall of Fame data.');
    }

    const faction = findFactionByHofRank(hofData, rank);
    if (!faction) {
        throw new Error(`No faction found at Hall-of-Fame rank #${rank}.`);
    }

    const { memberIds, factionName } = await fetchFactionWithMembers(faction.factionId, apiKey, counter);
    const selectedMemberIds = maxPlayers ? memberIds.slice(0, maxPlayers) : memberIds;

    let created = false;
    let rowsWritten = 0;
    let playerApiCallsTotal = 0;
    const players = [];
    let resolvedSqlPath = null;

    for (const playerId of selectedMemberIds) {
        const stats = await getActiveRankedPlayerById(playerId);
        playerApiCallsTotal += Number(stats.tornApiCallsUsed || 0);

        const row = buildPlayerStatsCsvRow(stats, {
            requestedFactionHofRank: rank,
            sourceFactionId: faction.factionId,
            sourceFactionName: factionName ?? faction.factionName ?? null,
        });

        const appendRes = appendSqlRow(sqlPath, CSV_HEADERS, row);
        resolvedSqlPath = appendRes.path;
        if (appendRes.created) created = true;
        rowsWritten++;
        players.push(stats);
    }

    return {
        requestedFactionHofRank: rank,
        sourceFactionId: faction.factionId,
        sourceFactionName: factionName ?? faction.factionName ?? null,
        memberCount: memberIds.length,
        rowsWritten,
        path: resolvedSqlPath ?? sqlPath,
        created,
        players,
        tornApiCallsUsed: counter.value + playerApiCallsTotal,
    };
}

module.exports = {
    getFactionPlayersByHofRankToSql,
    FACTION_SQL_HEADERS: CSV_HEADERS,
    FACTION_CSV_HEADERS: CSV_HEADERS,
};

