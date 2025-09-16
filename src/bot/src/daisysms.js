const axios = require('axios');
const { log } = require('./utils');

const BASE_URL = 'https://daisysms.com/stubs/handler_api.php';
const POLL_INTERVAL = 3000; // 3 seconds
const API_KEY = 'ChJQgVK5H2HAAA6tlA8m7xlzp6EOHP'; // Remplacez par votre clé API DaisySMS

class DaisySMSError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'DaisySMSError';
    }
}

/**
 * Rent a phone number from DaisySMS
 * @param {string} area_code - Area code for the phone number
 * @returns {Promise<{number: string, id: string}>} The rented phone number and activation ID
 */
async function rentNumber(area_code, carrier, service) {
    try {
        let url = `${BASE_URL}?api_key=${API_KEY}&action=getNumber&service=${service}&max_price=5`;

        if (area_code) {
            url += `&areas=${area_code}`;
        }

        if (carrier) {
            url += `&carriers=${carrier}`;
        }

        const response = await axios.get(url);
        const data = response.data;

        if (data.includes('ACCESS_NUMBER')) {
            var [_, id, number] = data.split(':');
            number = number.slice(1);
            return { number, id };
        } else {
            throw new DaisySMSError(`Unknown error: ${data}`, 'UNKNOWN');
        }
    } catch (error) {
        if (error.response.data === 'NO_NUMBERS') {
            log(`No numbers available`);
        } else if (error.response.data === 'NO_MONEY') {
            throw new DaisySMSError('Insufficient balance', 'NO_MONEY');
        } else if (error.response.data === 'MAX_PRICE_EXCEEDED') {
            throw new DaisySMSError('Price exceeds maximum allowed', 'MAX_PRICE_EXCEEDED');
        }
        throw new DaisySMSError(`API request failed: ${error.response.data}`, 'API_ERROR');
    }
}

/**
 * Get the verification code for a rented number
 * @param {string} id - The activation ID from rentNumber
 * @returns {Promise<string>} The verification code
 */
async function getCode(id) {
    while (true) {
        try {
            const response = await axios.get(`${BASE_URL}?api_key=${API_KEY}&action=getStatus&id=${id}`);
            const data = response.data;

            if (data.includes('STATUS_OK')) {
                const code = data.split(':')[1];
                return code;
            } else if (data === 'STATUS_WAIT_CODE') {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                continue;
            } else if (data === 'STATUS_CANCEL') {
                throw new DaisySMSError('Activation was cancelled', 'STATUS_CANCEL');
            } else if (data === 'NO_ACTIVATION') {
                throw new DaisySMSError('Invalid activation ID', 'NO_ACTIVATION');
            }
        } catch (error) {
            if (error instanceof DaisySMSError) {
                throw error;
            }
            throw new DaisySMSError(`API request failed: ${error.message}`, 'API_ERROR');
        }
    }
}

module.exports = {
    rentNumber,
    getCode,
    DaisySMSError
};
