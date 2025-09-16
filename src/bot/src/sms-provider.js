const daisySMS = require('./daisysms');
const smsPool = require('./smspool');
const api21k = require('./api21k');

/**
 * Factory function to get the appropriate SMS provider based on name
 * @param {string} providerName - The SMS provider name ('daisysms' or 'smspool')
 * @returns {Object} The SMS provider module
 */
function getSMSProvider(providerName) {
    switch (providerName.toLowerCase()) {
        case 'daisysms':
            return daisySMS;
        case 'smspool':
            return smsPool;
        case 'api21k':
            return api21k;
        default:
            throw new Error(`Unknown SMS provider: ${providerName}. Supported providers: daisysms, smspool, api21k`);
    }
}

module.exports = {
    getSMSProvider
};