/**
 * Application and Torn API constants.
 * Centralised so URLs and error messages stay consistent across the codebase.
 */

/** Base URL for all Torn API requests. */
const API_BASE = 'https://api.torn.com';

/** Average days per month used for xanax scoring when period is "month". */
const AVG_DAYS_PER_MONTH = 30.4375;

/**
 * Torn API error code → human-readable message.
 * @see https://www.torn.com/api.html
 */
const TORN_ERROR_MESSAGES = {
    0: 'Torn API returned an unknown error.',
    1: 'API key is empty. Set TORN_API_KEY or pass a valid key.',
    2: 'Invalid API key or wrong format. Check your key at Torn Preferences → API.',
    3: 'Wrong request type sent to Torn API.',
    4: 'Invalid API selection or fields requested.',
    5: 'Too many requests: Torn allows 100 calls per minute. Wait a moment and try again.',
    6: 'Invalid ID in request (e.g. user/faction/company does not exist).',
    7: 'Access denied: this data is private to the key owner or entity.',
    8: 'Your IP is temporarily blocked by Torn for too many invalid requests.',
    9: 'Torn API is temporarily disabled.',
    10: 'Key owner is in federal jail; API cannot be used until released.',
    16: 'API key access level is too low for this selection. Use a key with higher access.',
    17: 'Torn backend error. Try again later.',
    18: 'API key has been paused by the owner. Unpause it in Torn Preferences → API.',
};

/** Error codes that mean "stop immediately" (e.g. bad key, rate limit). No point retrying. */
const TORN_FATAL_ERROR_CODES = new Set([1, 2, 5, 8, 9, 10, 18]);

module.exports = {
    API_BASE,
    AVG_DAYS_PER_MONTH,
    TORN_ERROR_MESSAGES,
    TORN_FATAL_ERROR_CODES,
};
