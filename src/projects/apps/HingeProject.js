/**
 * Hinge Dating App Automation Project
 * Migrated from HINGE bot system to Project System
 * @module projects/apps/HingeProject
 */

const { IProject, ProjectResult } = require('../core/interfaces');
const BaseFlow = require('../flows/BaseFlow');
const { SMSProviderFactory } = require('../providers/SMSProvider');
const { ProxyProviderFactory } = require('../providers/ProxyProvider');
const wdio = require('webdriverio');

/**
 * Hinge automation project
 */
class HingeProject extends IProject {
  constructor(config = {}) {
    super();

    this.name = 'Hinge';
    this.version = '2.0.0';
    this.config = {
      device: config.device || null,
      appiumPort: config.appiumPort || 4723,
      wdaPort: config.wdaPort || 8100,
      bundleId: 'co.hinge.mobile.ios',
      locations: config.locations || [],
      proxyConfig: config.proxyConfig || {},
      smsConfig: config.smsConfig || {},
      emailConfig: config.emailConfig || {},
      ...config
    };

    this.driver = null;
    this.flows = new Map();
    this.providers = new Map();
  }

  /**
   * Initialize the project
   */
  async initialize() {
    console.log('[HingeProject] Initializing...');

    // Initialize WebDriverIO
    await this.initializeDriver();

    // Set up providers
    await this.setupProviders();

    // Set up flows
    await this.setupFlows();

    console.log('[HingeProject] Initialization complete');
  }

  /**
   * Initialize WebDriverIO driver
   */
  async initializeDriver() {
    const opts = {
      hostname: '127.0.0.1',
      port: this.config.appiumPort,
      path: '/',
      connectionRetryCount: 3,
      connectionRetryTimeout: 120000,
      logLevel: 'silent',
      capabilities: {
        'appium:platformName': 'iOS',
        'appium:platformVersion': this.config.device?.platformVersion || '16.0',
        'appium:deviceName': this.config.device?.name || 'iPhone',
        'appium:automationName': 'XCUITest',
        'appium:udid': this.config.device?.udid,
        'appium:wdaLocalPort': this.config.wdaPort,
        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:waitForQuiescence': false,
        'appium:useJSONSource': true,
        'appium:shouldUseCompactResponses': true,
        'appium:skipLogCapture': true,
        'appium:maxTypingFrequency': 30,
        'appium:newCommandTimeout': 600
      }
    };

    this.driver = await wdio.remote(opts);
    console.log('[HingeProject] WebDriver initialized');
  }

  /**
   * Set up project providers
   */
  async setupProviders() {
    // SMS Provider
    const smsType = this.config.smsConfig.provider || 'api21k';
    const smsProvider = SMSProviderFactory.createProvider(smsType);
    await smsProvider.initialize(this.config.smsConfig);
    this.providers.set('sms', smsProvider);

    // Proxy Provider
    const proxyType = this.config.proxyConfig.provider || 'marsproxies';
    const proxyProvider = ProxyProviderFactory.createProvider(proxyType);
    await proxyProvider.initialize(this.config.proxyConfig);
    this.providers.set('proxy', proxyProvider);

    // VPN App Provider for on-device proxy
    const vpnProvider = ProxyProviderFactory.createProvider('vpn-app');
    await vpnProvider.initialize({
      driver: this.driver,
      vpnApp: this.config.proxyConfig.vpnApp || 'shadowrocket'
    });
    this.providers.set('vpn', vpnProvider);

    console.log('[HingeProject] Providers configured:', Array.from(this.providers.keys()));
  }

  /**
   * Set up project flows
   */
  async setupFlows() {
    // Create Setup Flow
    const setupFlow = new BaseFlow('setup-flow');

    setupFlow.addStep({
      name: 'Configure Proxy',
      execute: async (context) => {
        console.log('[HingeProject] Configuring proxy...');
        const proxyProvider = this.providers.get('proxy');
        const vpnProvider = this.providers.get('vpn');

        // Get proxy info
        const proxyInfo = await proxyProvider.execute('generateProxyInfo', {
          location: context.location?.country || 'usa'
        });

        // Validate proxy
        const validation = await proxyProvider.execute('validateProxy', proxyInfo);
        if (!validation.acceptable) {
          throw new Error(`Proxy fraud score too high: ${validation.fraudScore}`);
        }

        // Setup proxy on device
        await vpnProvider.execute('setupProxy', { proxyInfo });

        context.proxyInfo = proxyInfo;
        console.log('[HingeProject] Proxy configured successfully');
        return proxyInfo;
      },
      retry: 2,
      timeout: 60000
    });

    setupFlow.addStep({
      name: 'Get Phone Number',
      execute: async (context) => {
        console.log('[HingeProject] Getting phone number...');
        const smsProvider = this.providers.get('sms');

        const phone = await smsProvider.execute('getNumber', {
          service: 'hinge',
          country: context.location?.country || 'usa'
        });

        context.phone = phone;
        console.log('[HingeProject] Got phone number:', phone.number);
        return phone;
      },
      retry: 3,
      timeout: 30000
    });

    this.flows.set('setup', setupFlow);

    // Create Registration Flow
    const registrationFlow = new BaseFlow('registration-flow');

    registrationFlow.addStep({
      name: 'Open Hinge App',
      execute: async (context) => {
        console.log('[HingeProject] Opening Hinge app...');

        // Terminate if already running
        try {
          await this.driver.execute('mobile: terminateApp', {
            bundleId: this.config.bundleId
          });
        } catch (e) {}

        // Launch app
        await this.driver.execute('mobile: launchApp', {
          bundleId: this.config.bundleId
        });

        await this.randomWait(2, 3);
        console.log('[HingeProject] Hinge app opened');
        return { appOpened: true };
      }
    });

    registrationFlow.addStep({
      name: 'Click Create Account',
      execute: async (context) => {
        console.log('[HingeProject] Clicking Create account...');

        const selector = '-ios predicate string:name == "Create account" AND label == "Create account"';
        const element = await this.driver.$(selector);
        await element.click();

        console.log('[HingeProject] Clicked Create account');
        return { accountCreation: 'started' };
      },
      retry: 2,
      timeout: 10000
    });

    registrationFlow.addStep({
      name: 'Enter Phone Number',
      execute: async (context) => {
        console.log('[HingeProject] Entering phone number...');

        const phoneSelector = '-ios predicate string:name == "phone number" AND type == "XCUIElementTypeTextField"';
        const phoneField = await this.driver.$(phoneSelector);
        await phoneField.click();
        await phoneField.setValue(context.phone.number);

        await this.randomWait(1, 2);

        const nextButton = await this.driver.$('-ios predicate string:name == "Next"');
        await nextButton.click();

        console.log('[HingeProject] Phone number entered');
        return { phoneEntered: true };
      }
    });

    registrationFlow.addStep({
      name: 'Enter SMS Code',
      execute: async (context) => {
        console.log('[HingeProject] Waiting for SMS code...');
        const smsProvider = this.providers.get('sms');

        const code = await smsProvider.execute('getCode', {
          orderId: context.phone.orderId
        });

        console.log('[HingeProject] Got SMS code:', code);

        // Enter code
        const codeField = await this.driver.$('-ios predicate string:type == "XCUIElementTypeTextField"');
        await codeField.setValue(code);

        await this.randomWait(1, 2);

        const nextButton = await this.driver.$('-ios predicate string:name == "Next"');
        await nextButton.click();

        console.log('[HingeProject] SMS code entered');
        return { smsVerified: true };
      },
      retry: 2,
      timeout: 120000
    });

    registrationFlow.addStep({
      name: 'Enter Basic Info',
      execute: async (context) => {
        console.log('[HingeProject] Entering basic info...');

        // Click Enter basic info
        const basicInfoBtn = await this.driver.$(
          '-ios predicate string:name == "Enter basic info" AND type == "XCUIElementTypeButton"'
        );
        await basicInfoBtn.click();

        // Enter name
        const firstName = this.generateFirstName();
        const nameField = await this.driver.$('-ios predicate string:type == "XCUIElementTypeTextField"');
        await nameField.setValue(firstName);

        context.profile = { firstName };

        const nextButton = await this.driver.$('-ios predicate string:name == "Next"');
        await nextButton.click();

        console.log('[HingeProject] Basic info entered');
        return { basicInfo: 'completed' };
      }
    });

    this.flows.set('registration', registrationFlow);

    // Create Main Flow
    const mainFlow = new BaseFlow('main-flow');

    mainFlow.addStep({
      name: 'Execute Setup',
      execute: async (context) => {
        const setupFlow = this.flows.get('setup');
        const result = await setupFlow.execute(context);
        return result.data;
      }
    });

    mainFlow.addStep({
      name: 'Execute Registration',
      execute: async (context) => {
        const registrationFlow = this.flows.get('registration');
        const result = await registrationFlow.execute(context);
        return result.data;
      }
    });

    mainFlow.addStep({
      name: 'Complete Profile',
      execute: async (context) => {
        console.log('[HingeProject] Completing profile setup...');
        // Additional profile steps would go here
        return { profileCompleted: true };
      }
    });

    this.flows.set('main', mainFlow);

    console.log('[HingeProject] Flows configured:', Array.from(this.flows.keys()));
  }

  /**
   * Execute the project
   */
  async execute(context = {}) {
    console.log('[HingeProject] Starting execution');

    const result = new ProjectResult(true, {});
    const startTime = Date.now();

    try {
      // Get location from queue
      const location = context.location || this.getNextLocation();
      if (!location) {
        throw new Error('No locations available');
      }

      context.location = location;
      console.log(`[HingeProject] Using location: ${location.city}, ${location.state}`);

      // Execute main flow
      const mainFlow = this.flows.get('main');
      const flowResult = await mainFlow.execute(context);

      result.flows.push({
        name: 'main',
        result: flowResult
      });

      result.data = {
        location: location.city,
        phone: context.phone?.number,
        profile: context.profile,
        ...flowResult.data
      };

      result.success = flowResult.success;

      if (flowResult.success) {
        console.log('[HingeProject] Account created successfully');
      } else {
        console.error('[HingeProject] Account creation failed');
      }
    } catch (error) {
      console.error('[HingeProject] Execution failed:', error);
      result.success = false;
      result.error = error.message;

      // Try recovery flow if available
      if (this.flows.has('recovery')) {
        console.log('[HingeProject] Attempting recovery...');
        const recoveryFlow = this.flows.get('recovery');
        const recoveryResult = await recoveryFlow.execute(context);

        result.flows.push({
          name: 'recovery',
          result: recoveryResult
        });
      }
    } finally {
      result.executionTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Validate project configuration
   */
  async validate() {
    console.log('[HingeProject] Validating configuration');

    // Check required config
    if (!this.config.device) {
      console.error('[HingeProject] No device configured');
      return false;
    }

    if (!this.config.locations || this.config.locations.length === 0) {
      console.error('[HingeProject] No locations configured');
      return false;
    }

    // Check providers health
    for (const [name, provider] of this.providers) {
      const healthy = await provider.checkHealth();
      if (!healthy) {
        console.error(`[HingeProject] Provider '${name}' is unhealthy`);
        return false;
      }
    }

    // Check driver connection
    if (!this.driver) {
      console.error('[HingeProject] WebDriver not initialized');
      return false;
    }

    return true;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('[HingeProject] Cleaning up');

    // Close app
    if (this.driver) {
      try {
        await this.driver.execute('mobile: terminateApp', {
          bundleId: this.config.bundleId
        });
      } catch (e) {}

      // Close driver session
      await this.driver.deleteSession();
      this.driver = null;
    }

    // Clean up providers
    for (const [name, provider] of this.providers) {
      await provider.cleanup();
    }

    // Reset flows
    for (const [name, flow] of this.flows) {
      flow.reset();
    }

    console.log('[HingeProject] Cleanup complete');
  }

  // Helper methods
  getNextLocation() {
    if (this.config.locations && this.config.locations.length > 0) {
      return this.config.locations.shift();
    }
    return null;
  }

  generateFirstName() {
    const names = ['Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Mia', 'Charlotte', 'Amelia'];
    return names[Math.floor(Math.random() * names.length)];
  }

  async randomWait(min, max) {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }
}

module.exports = HingeProject;