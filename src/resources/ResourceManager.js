/**
 * Resource Manager
 * Manages shared resources (emails, locations, proxies) across multiple devices
 * Ensures no conflicts and tracks resource usage
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class ResourceManager extends EventEmitter {
    constructor() {
        super();
        this.pools = {
            emails: [],
            locations: [],
            proxies: [],
            phoneNumbers: []
        };

        this.allocated = {
            emails: new Map(),      // email -> deviceId
            locations: new Map(),    // location -> deviceId
            proxies: new Map(),      // proxy -> deviceId
            phoneNumbers: new Map()  // number -> deviceId
        };

        this.locks = {
            emails: new Set(),
            locations: new Set(),
            proxies: new Set(),
            phoneNumbers: new Set()
        };

        this.resourceDir = path.join(__dirname, '../../data/resources');
        this.initialize();
    }

    async initialize() {
        console.log('[ResourceManager] Initializing...');

        // Create resource directory if it doesn't exist
        try {
            await fs.mkdir(this.resourceDir, { recursive: true });
        } catch (error) {
            console.error('[ResourceManager] Error creating resource directory:', error);
        }

        // Load resources from files
        await this.loadResources();

        console.log('[ResourceManager] Initialization complete');
    }

    async loadResources() {
        try {
            // Load emails
            const emailsPath = path.join(this.resourceDir, 'emails.txt');
            try {
                const emailsContent = await fs.readFile(emailsPath, 'utf8');
                this.pools.emails = emailsContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && line.includes('@'));
                console.log(`[ResourceManager] Loaded ${this.pools.emails.length} emails`);
            } catch (error) {
                console.warn('[ResourceManager] No emails file found, creating empty one');
                await fs.writeFile(emailsPath, '');
            }

            // Load locations
            const locationsPath = path.join(this.resourceDir, 'locations.txt');
            try {
                const locationsContent = await fs.readFile(locationsPath, 'utf8');
                this.pools.locations = locationsContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line);
                console.log(`[ResourceManager] Loaded ${this.pools.locations.length} locations`);
            } catch (error) {
                console.warn('[ResourceManager] No locations file found, using defaults');
                this.pools.locations = [
                    'New York, NY',
                    'Los Angeles, CA',
                    'Chicago, IL',
                    'Houston, TX',
                    'Phoenix, AZ',
                    'Philadelphia, PA',
                    'San Antonio, TX',
                    'San Diego, CA',
                    'Dallas, TX',
                    'San Jose, CA'
                ];
                await fs.writeFile(locationsPath, this.pools.locations.join('\n'));
            }

        } catch (error) {
            console.error('[ResourceManager] Error loading resources:', error);
        }
    }

    /**
     * Allocate resources for a device
     * @param {string} deviceId - Device UDID
     * @param {Object} requirements - Resource requirements
     * @returns {Object} Allocated resources or null if failed
     */
    async allocateForDevice(deviceId, requirements = {}) {
        const {
            emails = 1,
            location = true,
            proxy = true,
            phoneNumber = false
        } = requirements;

        const allocated = {
            deviceId,
            emails: [],
            location: null,
            proxy: null,
            phoneNumber: null,
            timestamp: Date.now()
        };

        try {
            // Allocate emails
            if (emails > 0) {
                allocated.emails = await this.allocateEmails(deviceId, emails);
                if (allocated.emails.length < emails) {
                    throw new Error(`Not enough emails available. Requested: ${emails}, Available: ${allocated.emails.length}`);
                }
            }

            // Allocate location
            if (location) {
                allocated.location = await this.allocateLocation(deviceId);
                if (!allocated.location) {
                    throw new Error('No locations available');
                }
            }

            // Allocate proxy
            if (proxy) {
                allocated.proxy = await this.allocateProxy(deviceId, allocated.location);
            }

            // Allocate phone number if needed
            if (phoneNumber) {
                allocated.phoneNumber = await this.allocatePhoneNumber(deviceId);
            }

            this.emit('resources-allocated', {
                deviceId,
                resources: allocated
            });

            return allocated;

        } catch (error) {
            console.error(`[ResourceManager] Failed to allocate for ${deviceId}:`, error);
            // Rollback on failure
            await this.releaseForDevice(deviceId, allocated);
            return null;
        }
    }

    /**
     * Allocate emails for a device
     */
    async allocateEmails(deviceId, count) {
        const allocated = [];

        for (let i = 0; i < count; i++) {
            // Find first available email
            const availableEmail = this.pools.emails.find(email =>
                !this.allocated.emails.has(email) &&
                !this.locks.emails.has(email)
            );

            if (availableEmail) {
                // Lock and allocate
                this.locks.emails.add(availableEmail);
                this.allocated.emails.set(availableEmail, deviceId);
                allocated.push(availableEmail);
            }
        }

        return allocated;
    }

    /**
     * Allocate a unique location for a device
     */
    async allocateLocation(deviceId) {
        // Find first available location
        const availableLocation = this.pools.locations.find(location =>
            !this.allocated.locations.has(location) &&
            !this.locks.locations.has(location)
        );

        if (availableLocation) {
            this.locks.locations.add(availableLocation);
            this.allocated.locations.set(availableLocation, deviceId);
            return availableLocation;
        }

        // If no unique location available, try to reuse one that's not currently locked
        const reusableLocation = this.pools.locations.find(location =>
            !this.locks.locations.has(location)
        );

        if (reusableLocation) {
            this.locks.locations.add(reusableLocation);
            return reusableLocation;
        }

        return null;
    }

    /**
     * Allocate a proxy for a device
     */
    async allocateProxy(deviceId, location) {
        // Generate proxy based on location
        // In production, this would interface with actual proxy provider
        const proxy = {
            host: `proxy-${location ? location.toLowerCase().replace(/[^a-z]/g, '') : 'default'}.marsproxies.com`,
            port: 8080,
            username: process.env.MARSPROXIES_USERNAME || 'user',
            password: process.env.MARSPROXIES_PASSWORD || 'pass',
            location: location
        };

        this.allocated.proxies.set(JSON.stringify(proxy), deviceId);
        return proxy;
    }

    /**
     * Allocate a phone number for SMS verification
     */
    async allocatePhoneNumber(deviceId) {
        // This would interface with SMS API provider
        // For now, return a placeholder
        const phoneNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
        this.allocated.phoneNumbers.set(phoneNumber, deviceId);
        return phoneNumber;
    }

    /**
     * Release resources allocated to a device
     */
    async releaseForDevice(deviceId, resources = null) {
        // If resources specified, release only those
        if (resources) {
            // Release emails
            if (resources.emails) {
                resources.emails.forEach(email => {
                    this.allocated.emails.delete(email);
                    this.locks.emails.delete(email);
                });
            }

            // Release location
            if (resources.location) {
                const entries = Array.from(this.allocated.locations.entries());
                entries.forEach(([location, id]) => {
                    if (id === deviceId && location === resources.location) {
                        this.allocated.locations.delete(location);
                        this.locks.locations.delete(location);
                    }
                });
            }

            // Release proxy
            if (resources.proxy) {
                const proxyKey = JSON.stringify(resources.proxy);
                this.allocated.proxies.delete(proxyKey);
            }

            // Release phone number
            if (resources.phoneNumber) {
                this.allocated.phoneNumbers.delete(resources.phoneNumber);
            }

        } else {
            // Release all resources for device
            // Release emails
            Array.from(this.allocated.emails.entries()).forEach(([email, id]) => {
                if (id === deviceId) {
                    this.allocated.emails.delete(email);
                    this.locks.emails.delete(email);
                }
            });

            // Release locations
            Array.from(this.allocated.locations.entries()).forEach(([location, id]) => {
                if (id === deviceId) {
                    this.allocated.locations.delete(location);
                    this.locks.locations.delete(location);
                }
            });

            // Release proxies
            Array.from(this.allocated.proxies.entries()).forEach(([proxy, id]) => {
                if (id === deviceId) {
                    this.allocated.proxies.delete(proxy);
                }
            });

            // Release phone numbers
            Array.from(this.allocated.phoneNumbers.entries()).forEach(([number, id]) => {
                if (id === deviceId) {
                    this.allocated.phoneNumbers.delete(number);
                }
            });
        }

        this.emit('resources-released', { deviceId });
    }

    /**
     * Get current resource status
     */
    getStatus() {
        return {
            emails: {
                total: this.pools.emails.length,
                allocated: this.allocated.emails.size,
                available: this.pools.emails.length - this.allocated.emails.size
            },
            locations: {
                total: this.pools.locations.length,
                allocated: this.allocated.locations.size,
                available: this.pools.locations.length - this.allocated.locations.size
            },
            proxies: {
                allocated: this.allocated.proxies.size
            },
            phoneNumbers: {
                allocated: this.allocated.phoneNumbers.size
            }
        };
    }

    /**
     * Get resources allocated to a specific device
     */
    getDeviceResources(deviceId) {
        const resources = {
            emails: [],
            locations: [],
            proxies: [],
            phoneNumbers: []
        };

        // Get emails
        this.allocated.emails.forEach((id, email) => {
            if (id === deviceId) {
                resources.emails.push(email);
            }
        });

        // Get locations
        this.allocated.locations.forEach((id, location) => {
            if (id === deviceId) {
                resources.locations.push(location);
            }
        });

        // Get proxies
        this.allocated.proxies.forEach((id, proxy) => {
            if (id === deviceId) {
                resources.proxies.push(JSON.parse(proxy));
            }
        });

        // Get phone numbers
        this.allocated.phoneNumbers.forEach((id, number) => {
            if (id === deviceId) {
                resources.phoneNumbers.push(number);
            }
        });

        return resources;
    }

    /**
     * Add new resources to pools
     */
    async addResources(type, resources) {
        if (!Array.isArray(resources)) {
            resources = [resources];
        }

        switch (type) {
            case 'emails':
                // Filter out duplicates and invalid emails
                const newEmails = resources.filter(email =>
                    email.includes('@') && !this.pools.emails.includes(email)
                );
                this.pools.emails.push(...newEmails);

                // Save to file
                const emailsPath = path.join(this.resourceDir, 'emails.txt');
                await fs.writeFile(emailsPath, this.pools.emails.join('\n'));

                console.log(`[ResourceManager] Added ${newEmails.length} new emails`);
                break;

            case 'locations':
                const newLocations = resources.filter(location =>
                    !this.pools.locations.includes(location)
                );
                this.pools.locations.push(...newLocations);

                // Save to file
                const locationsPath = path.join(this.resourceDir, 'locations.txt');
                await fs.writeFile(locationsPath, this.pools.locations.join('\n'));

                console.log(`[ResourceManager] Added ${newLocations.length} new locations`);
                break;
        }

        this.emit('resources-updated', { type, count: resources.length });
    }

    /**
     * Mark a resource as used/burned (permanently remove from pool)
     */
    async markAsUsed(type, resource) {
        switch (type) {
            case 'emails':
                const emailIndex = this.pools.emails.indexOf(resource);
                if (emailIndex > -1) {
                    this.pools.emails.splice(emailIndex, 1);
                    this.allocated.emails.delete(resource);
                    this.locks.emails.delete(resource);

                    // Update file
                    const emailsPath = path.join(this.resourceDir, 'emails.txt');
                    await fs.writeFile(emailsPath, this.pools.emails.join('\n'));

                    console.log(`[ResourceManager] Marked email as used: ${resource}`);
                }
                break;
        }

        this.emit('resource-used', { type, resource });
    }

    /**
     * Clean up locked but unallocated resources
     */
    cleanupLocks() {
        // Clean emails
        this.locks.emails.forEach(email => {
            if (!this.allocated.emails.has(email)) {
                this.locks.emails.delete(email);
            }
        });

        // Clean locations
        this.locks.locations.forEach(location => {
            if (!this.allocated.locations.has(location)) {
                this.locks.locations.delete(location);
            }
        });

        console.log('[ResourceManager] Cleaned up stale locks');
    }
}

module.exports = ResourceManager;