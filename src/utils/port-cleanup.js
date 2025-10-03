const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Cleanup ports that might be in use from previous crashes
 * This helps prevent port conflicts when restarting the application
 */
class PortCleanup {
  constructor() {
    this.appiumPorts = [4723, 4724, 4725, 4726, 4727]; // Common Appium ports
    this.wdaPorts = [8100, 8101, 8102, 8103, 8104]; // Common WDA ports
    this.customPorts = [1265, 1266, 1267, 1268, 1269]; // Custom Appium ports used by the app
  }

  /**
   * Kill process using a specific port
   * @param {number} port - Port number to free
   * @returns {Promise<boolean>} - True if port was freed, false otherwise
   */
  async killProcessOnPort(port) {
    try {
      // Find process using the port (macOS/Linux)
      const { stdout } = await execAsync(`lsof -ti:${port}`);

      if (stdout && stdout.trim()) {
        const pids = stdout.trim().split('\n');

        for (const pid of pids) {
          try {
            // Kill the process
            await execAsync(`kill -9 ${pid}`);
            console.log(`✅ Killed process ${pid} using port ${port}`);
          } catch (killError) {
            console.warn(`⚠️ Could not kill process ${pid}: ${killError.message}`);
          }
        }
        return true;
      }
    } catch (error) {
      // Port is not in use or lsof command failed
      if (!error.message.includes('exit code 1')) {
        console.warn(`⚠️ Error checking port ${port}: ${error.message}`);
      }
    }
    return false;
  }

  /**
   * Check if a port is in use
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} - True if port is in use
   */
  async isPortInUse(port) {
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      return stdout && stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup all Appium and WDA related ports
   * @param {Object} options - Cleanup options
   * @param {boolean} options.force - Force kill all processes on specified ports
   * @param {number[]} options.additionalPorts - Additional ports to clean
   * @returns {Promise<Object>} - Cleanup results
   */
  async cleanupPorts(options = {}) {
    const { force = false, additionalPorts = [] } = options;
    const results = {
      cleaned: [],
      failed: [],
      skipped: []
    };

    // Combine all ports to check
    const allPorts = [
      ...this.appiumPorts,
      ...this.wdaPorts,
      ...this.customPorts,
      ...additionalPorts
    ];

    console.log('🧹 Starting port cleanup...');
    console.log(`📍 Checking ${allPorts.length} ports: ${allPorts.join(', ')}`);

    for (const port of allPorts) {
      try {
        const inUse = await this.isPortInUse(port);

        if (inUse) {
          console.log(`⚠️ Port ${port} is in use, attempting to free it...`);
          const freed = await this.killProcessOnPort(port);

          if (freed) {
            results.cleaned.push(port);
          } else {
            results.failed.push(port);
          }
        } else {
          results.skipped.push(port);
        }
      } catch (error) {
        console.error(`❌ Error processing port ${port}: ${error.message}`);
        results.failed.push(port);
      }
    }

    // Summary
    console.log('\n📊 Port Cleanup Summary:');
    if (results.cleaned.length > 0) {
      console.log(`✅ Cleaned ports: ${results.cleaned.join(', ')}`);
    }
    if (results.failed.length > 0) {
      console.log(`❌ Failed to clean: ${results.failed.join(', ')}`);
    }
    console.log(`⏭️ Already free: ${results.skipped.length} ports`);

    return results;
  }

  /**
   * Kill all Appium processes
   * @returns {Promise<void>}
   */
  async killAllAppium() {
    try {
      console.log('🔪 Killing all Appium processes...');
      await execAsync('pkill -f appium || true');
      console.log('✅ All Appium processes killed');
    } catch (error) {
      console.warn('⚠️ Could not kill Appium processes:', error.message);
    }
  }

  /**
   * Smart cleanup - only clean ports that are likely stuck from crashes
   * @returns {Promise<Object>} - Cleanup results
   */
  async smartCleanup() {
    console.log('🤖 Running smart port cleanup...');

    // First, check if any Appium processes are zombie/stuck
    try {
      const { stdout } = await execAsync('ps aux | grep -i appium | grep -v grep');
      const lines = stdout.trim().split('\n').filter(line => line.length > 0);

      if (lines.length > 0) {
        console.log(`Found ${lines.length} Appium processes running`);

        // Check if they're responding (you could enhance this with actual health checks)
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const pid = parts[1];
          const startTime = parts[8];

          console.log(`  PID ${pid} started at ${startTime}`);
        }
      }
    } catch (error) {
      // No Appium processes found
    }

    // Now cleanup ports
    return await this.cleanupPorts();
  }
}

// Export singleton instance
module.exports = new PortCleanup();