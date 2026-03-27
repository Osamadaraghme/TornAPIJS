/**
 * CLI view helpers.
 * Keeps presentation/output formatting separate from controllers/services.
 */

function printSuccess(payload) {
    console.log(JSON.stringify(payload, null, 2));
}

function printError(error) {
    console.error(error?.message || error);
}

module.exports = {
    printSuccess,
    printError,
};
