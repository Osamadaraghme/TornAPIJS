/**
 * Application and Torn API constants.
 * Built-in defaults live in `constants-defaults.js`.
 * Effective values (defaults + DB overrides) from `getMergedConstants()`.
 */

const defaults = require('./constants-defaults');
const runtime = require('./runtime-config');

module.exports = Object.assign({}, defaults, {
    getMergedConstants: () => runtime.getMergedConstants(),
    invalidateRuntimeSettingsCache: () => runtime.invalidateRuntimeSettingsCache(),
});
