/**
 * SMS Provider for Project System
 * Migrated from HINGE SMS providers
 * @module projects/providers/SMSProvider
 */

const BaseProvider = require('./BaseProvider');
const axios = require('axios');

/**
 * API21K SMS Provider implementation
 */
class API21KProvider extends BaseProvider {
  constructor() {
    super('api21k-sms', 'sms');
    this.apiUrl = 'https://api21k.net/api/v2';
  }

  async onInitialize(config) {
    this.apiKey = config.apiKey || process.env.SMS_API21K_KEY;
    if (!this.apiKey) {
      throw new Error('API21K API key not configured');
    }
    console.log('[API21K] Provider initialized');
  }

  async onHealthCheck() {
    try {
      const response = await axios.get(`${this.apiUrl}/balance`, {
        headers: { 'X-Api-Key': this.apiKey }
      });
      return response.status === 200;
    } catch (error) {
      console.error('[API21K] Health check failed:', error.message);
      return false;
    }
  }

  async onExecute(action, params) {
    switch (action) {
      case 'getNumber':
        return this.getNumber(params);
      case 'getCode':
        return this.getCode(params.orderId);
      case 'releaseNumber':
        return this.releaseNumber(params.orderId);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async getNumber(params = {}) {
    const { service = 'hinge', country = 'usa' } = params;

    try {
      const response = await axios.post(
        `${this.apiUrl}/purchase`,
        {
          service,
          country,
          max_price: params.maxPrice || 3.0
        },
        {
          headers: { 'X-Api-Key': this.apiKey }
        }
      );

      if (response.data.success) {
        return {
          number: response.data.number,
          orderId: response.data.order_id,
          price: response.data.price
        };
      }
      throw new Error(response.data.message || 'Failed to get number');
    } catch (error) {
      console.error('[API21K] Error getting number:', error.message);
      throw error;
    }
  }

  async getCode(orderId, timeout = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(
          `${this.apiUrl}/status/${orderId}`,
          {
            headers: { 'X-Api-Key': this.apiKey }
          }
        );

        if (response.data.status === 'RECEIVED' && response.data.sms_code) {
          // Extract verification code from SMS
          const code = this.extractCode(response.data.sms_code);
          if (code) {
            return code;
          }
        }

        // Wait 5 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('[API21K] Error checking code:', error.message);
      }
    }

    throw new Error('Timeout waiting for SMS code');
  }

  extractCode(message) {
    // Extract various code formats
    const patterns = [
      /(\d{4,6})/,
      /code:\s*(\d{4,6})/i,
      /verification code:\s*(\d{4,6})/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  async releaseNumber(orderId) {
    try {
      await axios.post(
        `${this.apiUrl}/cancel/${orderId}`,
        {},
        {
          headers: { 'X-Api-Key': this.apiKey }
        }
      );
      console.log('[API21K] Number released');
      return true;
    } catch (error) {
      console.error('[API21K] Error releasing number:', error.message);
      return false;
    }
  }

  async onCleanup() {
    console.log('[API21K] Provider cleaned up');
  }
}

/**
 * DaisySMS Provider implementation
 */
class DaisySMSProvider extends BaseProvider {
  constructor() {
    super('daisysms', 'sms');
    this.apiUrl = 'https://daisysms.com/stubs/handler_api.php';
  }

  async onInitialize(config) {
    this.apiKey = config.apiKey || process.env.SMS_DAISYSMS_KEY;
    if (!this.apiKey) {
      throw new Error('DaisySMS API key not configured');
    }
    console.log('[DaisySMS] Provider initialized');
  }

  async onHealthCheck() {
    try {
      const response = await axios.get(
        `${this.apiUrl}?api_key=${this.apiKey}&action=getBalance`
      );
      return response.data.includes('ACCESS_BALANCE');
    } catch (error) {
      console.error('[DaisySMS] Health check failed:', error.message);
      return false;
    }
  }

  async onExecute(action, params) {
    switch (action) {
      case 'rentNumber':
        return this.rentNumber(params);
      case 'getCode':
        return this.getCode(params.rentId);
      case 'releaseNumber':
        return this.releaseNumber(params.rentId);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async rentNumber(params = {}) {
    const {
      areaCode = null,
      carriers = 'vz,att',
      service = 'oi' // Hinge service code
    } = params;

    let url = `${this.apiUrl}?api_key=${this.apiKey}&action=rentNumber&service=${service}&country=1`;

    if (areaCode) {
      url += `&areacode=${areaCode}`;
    }
    if (carriers) {
      url += `&carrier=${carriers}`;
    }

    try {
      const response = await axios.get(url);
      const data = response.data;

      if (data.startsWith('ACCESS_NUMBER')) {
        const parts = data.split(':');
        return {
          rentId: parts[1],
          number: parts[2],
          expires: parts[3]
        };
      }
      throw new Error(data);
    } catch (error) {
      console.error('[DaisySMS] Error renting number:', error.message);
      throw error;
    }
  }

  async getCode(rentId, timeout = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(
          `${this.apiUrl}?api_key=${this.apiKey}&action=getRentStatus&id=${rentId}`
        );

        if (response.data.includes('STATUS_OK')) {
          const parts = response.data.split(':');
          if (parts[2]) {
            const code = this.extractCode(parts[2]);
            if (code) {
              return code;
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('[DaisySMS] Error checking code:', error.message);
      }
    }

    throw new Error('Timeout waiting for SMS code');
  }

  extractCode(message) {
    const patterns = [
      /(\d{4,6})/,
      /code:\s*(\d{4,6})/i,
      /verification code:\s*(\d{4,6})/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  async releaseNumber(rentId) {
    try {
      await axios.get(
        `${this.apiUrl}?api_key=${this.apiKey}&action=setRentStatus&id=${rentId}&status=6`
      );
      console.log('[DaisySMS] Number released');
      return true;
    } catch (error) {
      console.error('[DaisySMS] Error releasing number:', error.message);
      return false;
    }
  }

  async onCleanup() {
    console.log('[DaisySMS] Provider cleaned up');
  }
}

/**
 * Factory for SMS providers
 */
class SMSProviderFactory {
  static createProvider(type) {
    switch (type) {
      case 'api21k':
        return new API21KProvider();
      case 'daisysms':
        return new DaisySMSProvider();
      default:
        throw new Error(`Unknown SMS provider type: ${type}`);
    }
  }
}

module.exports = {
  API21KProvider,
  DaisySMSProvider,
  SMSProviderFactory
};