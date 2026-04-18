/**
 * Ranked wars overlapping the rolling "last month" window (same length as AVG_DAYS_PER_MONTH),
 * counting only wars where the player was already in the faction (from members.days_in_faction).
 * One faction API call: selections=rankedwars,basic
 */

const { fetchFaction } = require('../api/torn-client.js');
const { messageForTornError } = require('./errors.js');
const { getMergedConstants } = require('../constants.js');

function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function throwOnTornError(errorObj) {
    if (!errorObj) return;
    const message = messageForTornError(errorObj);
    const code = errorObj?.code ?? errorObj?.error_code;
    const { TORN_FATAL_ERROR_CODES } = getMergedConstants();
    if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
        throw new Error(message || `Torn API error (code ${code}).`);
    }
    throw new Error(message || 'Torn API error.');
}

/**
 * @param {object} factionPayload - JSON from faction?selections=rankedwars,basic (or basic-only)
 * @param {number|string} playerId
 * @returns {number|null} days_in_faction for that member, or null if unknown
 */
function extractDaysInFactionForPlayer(factionPayload, playerId) {
    const pid = Number(playerId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const members =
        factionPayload?.members
        ?? factionPayload?.basic?.members
        ?? null;
    if (!members || typeof members !== 'object') return null;

    const direct = members[String(pid)] ?? members[pid];
    let rec = direct && typeof direct === 'object' ? direct : null;
    if (!rec) {
        for (const m of Object.values(members)) {
            if (!m || typeof m !== 'object') continue;
            const mid = Number(m.id ?? m.player_id ?? m.ID ?? null);
            if (mid === pid) {
                rec = m;
                break;
            }
        }
    }
    if (!rec) return null;
    return toFiniteNumber(rec.days_in_faction);
}

/**
 * Lower bound (epoch seconds) when the member joined the faction, from days_in_faction at `nowSeconds`.
 * @param {number} daysInFaction
 * @param {number} nowSeconds
 */
function estimateJoinedFactionAtSeconds(daysInFaction, nowSeconds) {
    const d = toFiniteNumber(daysInFaction);
    if (d == null || d < 0) return null;
    return Math.floor(nowSeconds - d * 86400);
}

function isProbableRankedWarEntry(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    const w = x.war ?? x;
    return toFiniteNumber(w?.start ?? w?.start_time) != null;
}

function extractRankedWarsArray(factionPayload) {
    const rw =
        factionPayload?.rankedwars
        ?? factionPayload?.ranked_wars
        ?? factionPayload?.basic?.ranked_wars
        ?? factionPayload?.basic?.rankedwars
        ?? null;
    if (!rw) return [];
    if (Array.isArray(rw)) return rw.filter(isProbableRankedWarEntry);
    if (typeof rw === 'object') {
        if (Array.isArray(rw.wars)) return rw.wars.filter(isProbableRankedWarEntry);
        return Object.values(rw).filter(isProbableRankedWarEntry);
    }
    return [];
}

function extractFactionIdsFromWarEntry(entry) {
    const facs = entry?.factions ?? entry?.war?.factions ?? null;
    if (!facs || typeof facs !== 'object') return [];
    if (Array.isArray(facs)) {
        return facs
            .map((f) => toFiniteNumber(f?.id ?? f?.faction_id ?? f?.ID))
            .filter((x) => x != null);
    }
    return Object.values(facs)
        .map((f) => toFiniteNumber(f?.id ?? f?.faction_id ?? f?.ID))
        .filter((x) => x != null);
}

function warBounds(entry, nowSeconds) {
    const war = entry?.war ?? entry;
    const start = toFiniteNumber(war?.start ?? war?.start_time);
    let end = toFiniteNumber(war?.end ?? war?.end_time);
    if (start == null) return null;
    if (end == null || end === 0) end = nowSeconds;
    return { start, end };
}

/**
 * Count ranked wars where: (1) this faction is a side, (2) war timeline overlaps [windowStart, windowEnd],
 * (3) the player had joined on or before the war ended (estimated from days_in_faction).
 *
 * @param {object[]} wars
 * @param {number} ourFactionId
 * @param {number|null} joinedFactionAtSeconds - null if unknown → returns null
 * @param {number} windowStartSeconds
 * @param {number} windowEndSeconds
 * @param {number} nowSeconds
 * @returns {number|null}
 */
function countParticipatedInWindow(wars, ourFactionId, joinedFactionAtSeconds, windowStartSeconds, windowEndSeconds, nowSeconds) {
    if (joinedFactionAtSeconds == null) return null;
    const fid = Number(ourFactionId);
    if (!Number.isFinite(fid) || fid <= 0) return null;

    let count = 0;
    for (const entry of wars) {
        const bounds = warBounds(entry, nowSeconds);
        if (!bounds) continue;
        const { start: warStart, end: warEnd } = bounds;

        const sideIds = extractFactionIdsFromWarEntry(entry);
        if (sideIds.length && !sideIds.includes(fid)) continue;

        const participationStart = Math.max(warStart, joinedFactionAtSeconds);
        const participationEnd = warEnd;
        const overlapStart = Math.max(windowStartSeconds, participationStart);
        const overlapEnd = Math.min(windowEndSeconds, participationEnd);
        if (overlapStart < overlapEnd) count++;
    }
    return count;
}

/**
 * @param {object} params
 * @param {number|string|null|undefined} params.factionId
 * @param {number|string} params.playerId
 * @param {string|string[]|undefined} params.apiKey
 * @param {{ value: number }} params.counter
 * @param {number} params.windowStartSeconds - inclusive rolling window start (e.g. month ago)
 * @param {number} params.windowEndSeconds - inclusive end (usually now)
 * @returns {Promise<number|null>} null if no faction, member not listed, or API error (non-fatal: returns null)
 */
async function fetchRankedWarsParticipatedLastMonth(params) {
    const {
        factionId,
        playerId,
        apiKey,
        counter,
        windowStartSeconds,
        windowEndSeconds,
    } = params;

    const fid = toFiniteNumber(factionId);
    const pid = toFiniteNumber(playerId);
    if (fid == null || fid <= 0 || pid == null || pid <= 0) return null;

    const nowSeconds = Math.floor(Number(windowEndSeconds));
    const w0 = Math.floor(Number(windowStartSeconds));
    if (!Number.isFinite(nowSeconds) || !Number.isFinite(w0) || w0 >= nowSeconds) return null;

    let data;
    try {
        data = await fetchFaction(fid, 'rankedwars,basic', apiKey, counter);
    } catch {
        return null;
    }
    if (data?.error) {
        const code = data.error?.code ?? data.error?.error_code;
        const { TORN_FATAL_ERROR_CODES } = getMergedConstants();
        if (code != null && TORN_FATAL_ERROR_CODES.has(Number(code))) {
            throwOnTornError(data.error);
        }
        return null;
    }

    const days = extractDaysInFactionForPlayer(data, pid);
    if (days == null) return null;
    const joinedAt = estimateJoinedFactionAtSeconds(days, nowSeconds);
    if (joinedAt == null) return null;

    const wars = extractRankedWarsArray(data);
    return countParticipatedInWindow(wars, fid, joinedAt, w0, nowSeconds, nowSeconds);
}

module.exports = {
    fetchRankedWarsParticipatedLastMonth,
    extractDaysInFactionForPlayer,
    estimateJoinedFactionAtSeconds,
    extractRankedWarsArray,
};
