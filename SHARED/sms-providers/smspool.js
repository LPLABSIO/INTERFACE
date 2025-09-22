const axios = require('axios');
const { log } = require('../utils/utils');

// Configuration des headers par défaut pour contourner la protection Cloudflare
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
};

const BASE_URL = 'https://api.smspool.net/stubs/handler_api';
const TINDER_SERVICE = 'oi'; // Service name for Tinder on SMSPool
const UK_COUNTRY_CODE = '16';
const US_COUNTRY_CODE = '1';
const MAX_RETRIES = 3;
const RETRY_DELAY = 10000; // 10 seconds
const POLL_INTERVAL = 3000; // 3 seconds
//const API_KEY = 'B7dXRXIvgD1c8OElxLC6LQKWkEV2i6XU'; // Replace with your SMSPool API key

class SMSPoolError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'SMSPoolError';
    }
}

/**
 * Rent a phone number from SMSPool
 * @param {string} area_code - Area code for the phone number
 * @returns {Promise<{number: string, id: string}>} The rented phone number and activation ID
 */
async function rentNumber(area_code) {
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
        try {
            let url = `${BASE_URL}?api_key=${API_KEY}&action=getNumber&service=${TINDER_SERVICE}&country=${US_COUNTRY_CODE}&max_price=0.5&pricing_option=1`;

            if (area_code) {
                url += `&areas=${area_code}`;
            }

            const response = await axios.get(url, { headers });
            const data = response.data;

            if (data.includes('ACCESS_NUMBER')) {
                let [_, id, number] = data.split(':');
                // Remove the first 2 characters of the number
                number = number.slice(2);
                return { number, id };
            } else if (data === 'NO_NUMBERS') {
                log(`No numbers available, retrying in ${RETRY_DELAY / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                retryCount++;
                continue;
            } else {
                throw new SMSPoolError(`Unknown error: ${data}`, 'UNKNOWN');
            }
        } catch (error) {
            if (error.response.data === 'NO_NUMBERS') {
                log(`No numbers available, retrying in ${RETRY_DELAY / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                retryCount++;
                continue;
            } else if (error.response.data === 'NO_MONEY') {
                throw new DaisySMSError('Insufficient balance', 'NO_MONEY');
            } else if (error.response.data === 'MAX_PRICE_EXCEEDED') {
                throw new DaisySMSError('Price exceeds maximum allowed', 'MAX_PRICE_EXCEEDED');
            }
            throw new DaisySMSError(`API request failed: ${error.response.data}`, 'API_ERROR');
        }
    }

    throw new SMSPoolError('No numbers available after maximum retries', 'MAX_RETRIES_EXCEEDED');
}

/**
 * Get the verification code for a rented number
 * @param {string} id - The activation ID from rentNumber
 * @returns {Promise<string>} The verification code
 */
async function getCode(id) {
    while (true) {
        try {
            const response = await axios.get(`${BASE_URL}?api_key=${API_KEY}&action=getStatus&id=${id}`, { headers });
            const data = response.data;

            if (data.includes('STATUS_OK')) {
                const code = data.split(':')[1];
                return code;
            } else if (data === 'STATUS_WAIT_CODE') {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                continue;
            } else if (data === 'STATUS_CANCEL') {
                throw new SMSPoolError('Activation was cancelled', 'STATUS_CANCEL');
            } else if (data === 'NO_ACTIVATION') {
                throw new SMSPoolError('Invalid activation ID', 'NO_ACTIVATION');
            }
            // Wait 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            if (error instanceof SMSPoolError) {
                throw error;
            }
            throw new SMSPoolError(`API request failed: ${error.message}`, 'API_ERROR');
        }
    }
}

/**
 * Cancel an SMS order
 * @param {string} id - The activation ID to cancel
 * @returns {Promise<boolean>} True if successful
 */
async function cancelOrder(id) {
    try {
        const response = await axios.get(`${BASE_URL}?api_key=${API_KEY}&action=setStatus&status=8&id=${id}`, { headers });
        const data = response.data;

        if (data === 'SUCCESS') {
            return true;
        } else {
            throw new SMSPoolError(`Failed to cancel order: ${data}`, 'CANCEL_FAILED');
        }
    } catch (error) {
        if (error instanceof SMSPoolError) {
            throw error;
        }
        throw new SMSPoolError(`API request failed: ${error.message}`, 'API_ERROR');
    }
}

module.exports = {
    rentNumber,
    getCode,
    cancelOrder,
    SMSPoolError
}; 