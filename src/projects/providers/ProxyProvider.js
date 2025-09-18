/**
 * Proxy Provider for Project System
 * Migrated from HINGE proxy system
 * @module projects/providers/ProxyProvider
 */

const BaseProvider = require('./BaseProvider');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');

/**
 * MarsProxies Provider implementation
 */
class MarsProxiesProvider extends BaseProvider {
  constructor() {
    super('marsproxies', 'proxy');
    this.apiUrl = 'https://api.marsproxies.com/v2';
  }

  async onInitialize(config) {
    this.credentials = {
      username: config.username || process.env.MARSPROXIES_USERNAME,
      password: config.password || process.env.MARSPROXIES_PASSWORD
    };

    if (!this.credentials.username || !this.credentials.password) {
      throw new Error('MarsProxies credentials not configured');
    }

    console.log('[MarsProxies] Provider initialized');
  }

  async onHealthCheck() {
    try {
      // Test proxy connectivity
      const proxyInfo = await this.generateProxyInfo();
      const agent = new SocksProxyAgent(proxyInfo.url);

      const response = await axios.get('http://httpbin.org/ip', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 10000
      });

      return response.status === 200;
    } catch (error) {
      console.error('[MarsProxies] Health check failed:', error.message);
      return false;
    }
  }

  async onExecute(action, params) {
    switch (action) {
      case 'getProxy':
        return this.getProxy(params);
      case 'generateProxyInfo':
        return this.generateProxyInfo(params);
      case 'validateProxy':
        return this.validateProxy(params);
      case 'checkFraud':
        return this.checkFraudScore(params.ip);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async getProxy(params = {}) {
    const { location = 'usa', sticky = true } = params;

    // Generate rotating proxy credentials
    const sessionId = sticky ? this.generateSessionId() : null;
    const username = sessionId
      ? `${this.credentials.username}_session-${sessionId}_country-${location}`
      : `${this.credentials.username}_country-${location}`;

    return {
      host: 'proxy.marsproxies.com',
      port: 1080,
      username,
      password: this.credentials.password,
      protocol: 'socks5'
    };
  }

  async generateProxyInfo(params = {}) {
    const proxy = await this.getProxy(params);

    return {
      url: `socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`,
      domain: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      protocol: proxy.protocol
    };
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 12);
  }

  async validateProxy(proxyInfo) {
    try {
      const agent = new SocksProxyAgent(proxyInfo.url);

      const response = await axios.get('http://httpbin.org/ip', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 10000
      });

      const ip = response.data.origin;
      console.log(`[MarsProxies] Proxy IP: ${ip}`);

      // Check fraud score
      const fraudScore = await this.checkFraudScore(ip);

      return {
        valid: true,
        ip,
        fraudScore,
        acceptable: fraudScore < 75
      };
    } catch (error) {
      console.error('[MarsProxies] Proxy validation failed:', error.message);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async checkFraudScore(ip) {
    try {
      // Use ipqualityscore.com API (requires API key)
      const apiKey = process.env.IPQUALITYSCORE_API_KEY;
      if (!apiKey) {
        console.log('[MarsProxies] Fraud check skipped - no API key');
        return 0;
      }

      const response = await axios.get(
        `https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}`,
        { timeout: 5000 }
      );

      const fraudScore = response.data.fraud_score || 0;
      const vpnDetected = response.data.vpn || false;
      const proxyDetected = response.data.proxy || false;

      console.log(`[MarsProxies] Fraud Score: ${fraudScore}, VPN: ${vpnDetected}, Proxy: ${proxyDetected}`);

      return fraudScore;
    } catch (error) {
      console.error('[MarsProxies] Fraud check failed:', error.message);
      return 0;
    }
  }

  async onCleanup() {
    console.log('[MarsProxies] Provider cleaned up');
  }
}

/**
 * VPNApp Provider for managing VPN apps on device
 */
class VPNAppProvider extends BaseProvider {
  constructor() {
    super('vpn-app', 'proxy');
    this.supportedApps = ['shadowrocket', 'ghost', 'orbit', 'crane', 'geranium'];
  }

  async onInitialize(config) {
    this.driver = config.driver;
    this.activeApp = config.vpnApp || 'shadowrocket';

    if (!this.supportedApps.includes(this.activeApp)) {
      throw new Error(`Unsupported VPN app: ${this.activeApp}`);
    }

    console.log(`[VPNApp] Using ${this.activeApp} for proxy configuration`);
  }

  async onHealthCheck() {
    // Check if VPN app is installed
    try {
      const bundleId = this.getBundleId(this.activeApp);
      await this.driver.execute('mobile: launchApp', { bundleId });
      await this.driver.execute('mobile: terminateApp', { bundleId });
      return true;
    } catch (error) {
      console.error(`[VPNApp] ${this.activeApp} not available:`, error.message);
      return false;
    }
  }

  async onExecute(action, params) {
    switch (action) {
      case 'setupProxy':
        return this.setupProxy(params.proxyInfo);
      case 'enableProxy':
        return this.enableProxy();
      case 'disableProxy':
        return this.disableProxy();
      case 'checkConnection':
        return this.checkConnection();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async setupProxy(proxyInfo) {
    const bundleId = this.getBundleId(this.activeApp);

    console.log(`[VPNApp] Configuring ${this.activeApp} with proxy`);

    // Terminate app if running
    try {
      await this.driver.execute('mobile: terminateApp', { bundleId });
    } catch (e) {}

    // Launch app
    await this.driver.execute('mobile: launchApp', { bundleId });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // App-specific configuration
    switch (this.activeApp) {
      case 'shadowrocket':
        await this.configureShadowrocket(proxyInfo);
        break;
      case 'ghost':
        await this.configureGhost(proxyInfo);
        break;
      case 'orbit':
        await this.configureOrbit(proxyInfo);
        break;
      case 'crane':
        await this.configureCrane(proxyInfo);
        break;
      case 'geranium':
        await this.configureGeranium(proxyInfo);
        break;
    }

    return true;
  }

  async configureShadowrocket(proxyInfo) {
    // Implementation for Shadowrocket configuration
    // This would contain the UI automation steps
    console.log('[VPNApp] Configuring Shadowrocket');
    // Add specific UI automation here
  }

  async configureGhost(proxyInfo) {
    // Implementation for Ghost configuration
    console.log('[VPNApp] Configuring Ghost');
    // Add specific UI automation here
  }

  async configureOrbit(proxyInfo) {
    // Implementation for Orbit configuration
    console.log('[VPNApp] Configuring Orbit');
    // Add specific UI automation here
  }

  async configureCrane(proxyInfo) {
    // Implementation for Crane configuration
    console.log('[VPNApp] Configuring Crane');
    // Add specific UI automation here
  }

  async configureGeranium(proxyInfo) {
    // Implementation for Geranium configuration
    console.log('[VPNApp] Configuring Geranium');
    // Add specific UI automation here
  }

  async enableProxy() {
    const bundleId = this.getBundleId(this.activeApp);
    await this.driver.execute('mobile: launchApp', { bundleId });
    // App-specific enable logic
    console.log(`[VPNApp] Proxy enabled via ${this.activeApp}`);
    return true;
  }

  async disableProxy() {
    const bundleId = this.getBundleId(this.activeApp);
    await this.driver.execute('mobile: launchApp', { bundleId });
    // App-specific disable logic
    console.log(`[VPNApp] Proxy disabled`);
    return true;
  }

  async checkConnection() {
    // Check if VPN is connected
    // This would check system VPN status or app status
    return true;
  }

  getBundleId(app) {
    const bundleIds = {
      shadowrocket: 'com.liguangming.Shadowrocket',
      ghost: 'com.ghost.ios',
      orbit: 'com.orbit.vpn',
      crane: 'com.crane.app',
      geranium: 'com.geranium.proxy'
    };
    return bundleIds[app];
  }

  async onCleanup() {
    // Disable proxy and close app
    await this.disableProxy();
    const bundleId = this.getBundleId(this.activeApp);
    await this.driver.execute('mobile: terminateApp', { bundleId });
    console.log('[VPNApp] Provider cleaned up');
  }
}

/**
 * Factory for Proxy providers
 */
class ProxyProviderFactory {
  static createProvider(type) {
    switch (type) {
      case 'marsproxies':
        return new MarsProxiesProvider();
      case 'vpn-app':
        return new VPNAppProvider();
      default:
        throw new Error(`Unknown proxy provider type: ${type}`);
    }
  }
}

module.exports = {
  MarsProxiesProvider,
  VPNAppProvider,
  ProxyProviderFactory
};