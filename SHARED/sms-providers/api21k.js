const axios = require('axios');
const { log } = require('../utils/utils');

const BASE_URL = 'https://www.api21k.com';
const API_KEY = '3A304382FED3C89A39F316B8375F';

class Api21kError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = 'Api21kError';
  }
}

// Client axios authentifié selon la doc (Authorization en header)
function api() {
  if (!API_KEY) throw new Api21kError('Missing API21K_API_KEY', 'NO_API_KEY');
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    },
    timeout: 20000
  });
}

async function findHingeAppId() {
  const client = api();
  const resp = await client.post('/api/v1/app/list', { type: 1, name: 'Hinge' });
  if (resp.data?.code !== 1) throw new Api21kError(resp.data?.msg || 'Failed to list apps', 'APP_LIST_FAILED');
  const list = resp.data?.data?.list || [];
  const match = list.find(a => (a.name || '').toLowerCase().includes('hinge')) || list[0];
  if (!match) throw new Api21kError('No app found for Hinge', 'APP_NOT_FOUND');
  return match.id;
}

async function buyNumber(appId, options) {
  const client = api();
  const body = {
    app_id: appId,
    type: 1,
    num: 1,
    expiry: 0
  };
  if (options?.prefix) body.prefix = options.prefix;
  const resp = await client.post('/api/v1/buy/create', body);
  if (resp.data?.code !== 1) throw new Api21kError(resp.data?.msg || 'Buy failed', 'BUY_FAILED');
  return resp.data?.data; // { ordernum, api_count }
}

async function getOrderApi(ordernum) {
  const client = api();
  const resp = await client.post('/api/v1/order/api', { ordernum });
  if (resp.data?.code !== 1) throw new Api21kError(resp.data?.msg || 'Order api failed', 'ORDER_API_FAILED');
  return resp.data?.data; // { url_list, list: [{tel, token, api, ...}], total }
}

/**
 * Loue un numéro pour Hinge via l’API REST.
 * @returns {Promise<{number: string, id: string, apiUrl?: string}>}
 */
async function rentNumber(area_code, carriers, service, hints = {}) {
  try {
    const appId = await findHingeAppId();
    const buy = await buyNumber(appId, { prefix: undefined });
    const ordernum = buy.ordernum;
    const order = await getOrderApi(ordernum);
    const item = (order.list || [])[0];
    if (!item || !item.tel) throw new Api21kError('No number returned', 'NO_NUMBER');
    return { number: item.tel, id: ordernum, apiUrl: item.api };
  } catch (error) {
    if (error instanceof Api21kError) throw error;
    const msg = error?.response?.data?.msg || error?.response?.data || error.message;
    throw new Api21kError(`API request failed: ${msg}`, 'API_ERROR');
  }
}

/**
 * Récupère le code OTP.
 * @param {string} id
 * @returns {Promise<string>}
 */
async function getCode(id) {
  while (true) {
    try {
      const order = await getOrderApi(id);
      const items = order.list || [];
      for (const it of items) {
        if (it.api) {
          try {
            const res = await axios.get(it.api, { timeout: 15000 });
            const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            const m = text.match(/\b(\d{4,8})\b/);
            if (m) return m[1];
          } catch (_) { /* ignore and continue polling */ }
        }
      }
      await new Promise(r => setTimeout(r, 3000));
    } catch (error) {
      if (error instanceof Api21kError) throw error;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

module.exports = {
  rentNumber,
  getCode,
  Api21kError,
};

