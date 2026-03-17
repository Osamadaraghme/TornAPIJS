/**
 * Extract fields from Torn API responses.
 * API response shape can vary (top-level vs nested under "profile"), so we normalise here.
 */

/**
 * Last action timestamp (seconds since epoch). Handles multiple response shapes.
 * @param {object} profileData - User profile response (or full response with profile nested)
 * @returns {number|null}
 */
function extractLastActionTimestampSeconds(profileData) {
    const p = profileData?.profile ?? profileData;
    const la = p?.last_action;
    if (typeof la === 'number') return la;
    if (typeof la?.timestamp === 'number') return la.timestamp;
    if (typeof la?.time === 'number') return la.time;
    if (typeof la?.unix === 'number') return la.unix;
    return null;
}

/** @param {object} data - User or profile object */
function extractLevel(data) {
    const level = data?.level ?? data?.profile?.level ?? null;
    return level != null ? Number(level) : null;
}

/** @param {object} data - User or profile object */
function extractName(data) {
    const name = data?.name ?? data?.profile?.name ?? null;
    return typeof name === 'string' ? name : null;
}

/** @param {object} profileData - User profile (or full response with profile nested) */
function extractAgeDays(profileData) {
    const p = profileData?.profile ?? profileData;
    const age = p?.age ?? null;
    return age != null ? Number(age) : null;
}

/** Whether the user has a faction (ID or nested object). */
function hasFactionFromProfile(profileData) {
    const p = profileData?.profile ?? profileData;
    const fid = p?.faction_id ?? p?.faction?.faction_id ?? p?.faction?.ID ?? null;
    if (fid != null && Number(fid) > 0) return true;
    const f = p?.faction;
    return Boolean(f && typeof f === 'object' && Object.keys(f).length > 0);
}

/** Whether the user has a company/job. */
function hasCompanyFromProfile(profileData) {
    const p = profileData?.profile ?? profileData;
    const cid = p?.company_id ?? p?.job?.company_id ?? p?.job?.company ?? null;
    if (cid != null && Number(cid) > 0) return true;
    const j = p?.job;
    return Boolean(j && typeof j === 'object' && Object.keys(j).length > 0);
}

/** @returns {number|null} Faction ID or null */
function extractFactionId(profileData) {
    const p = profileData?.profile ?? profileData;
    const fid = p?.faction_id ?? p?.faction?.faction_id ?? p?.faction?.ID ?? null;
    return fid != null && Number(fid) > 0 ? Number(fid) : null;
}

/** @returns {number|null} Company ID or null */
function extractCompanyId(profileData) {
    const p = profileData?.profile ?? profileData;
    const cid = p?.company_id ?? p?.job?.company_id ?? p?.job?.company ?? null;
    return cid != null && Number(cid) > 0 ? Number(cid) : null;
}

/**
 * Company name from user profile/job if present (avoids extra company API call).
 * @returns {string|null}
 */
function extractCompanyNameFromProfile(profileData) {
    const job = profileData?.job ?? profileData?.profile?.job ?? null;
    if (job && typeof job === 'string' && job.length > 0) return job;
    if (!job || typeof job !== 'object') return null;
    const name = job.company_name ?? job.company_name_short ?? job.company ?? job.name ?? job.position ?? job.job_title ?? job.title ?? null;
    return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Total xanax taken from personalstats (lifetime). Handles different field names. */
function extractXanaxTaken(personalstatsData) {
    const v = personalstatsData?.xantaken ?? personalstatsData?.xanax_taken ?? personalstatsData?.xanaxTaken ?? null;
    return v != null ? Number(v) : null;
}

module.exports = {
    extractLastActionTimestampSeconds,
    extractLevel,
    extractName,
    extractAgeDays,
    hasFactionFromProfile,
    hasCompanyFromProfile,
    extractFactionId,
    extractCompanyId,
    extractCompanyNameFromProfile,
    extractXanaxTaken,
};
