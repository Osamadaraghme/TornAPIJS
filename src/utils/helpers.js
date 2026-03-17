/**
 * Small pure helpers used across services.
 */

/**
 * Random integer in [min, max] (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
    randomIntInclusive,
};
