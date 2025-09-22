// Hinge Profile Configuration Management

// Load current configuration on page load
window.addEventListener('DOMContentLoaded', () => {
    loadCurrentConfig();

    // Setup form submission
    document.getElementById('configForm').addEventListener('submit', saveConfiguration);
});

/**
 * Load the current configuration from file
 */
async function loadCurrentConfig() {
    try {
        const config = await window.electronAPI.loadHingeConfig();

        if (config) {
            populateForm(config);
            showStatus('Configuration loaded successfully', 'success');
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showStatus('Failed to load configuration', 'error');
    }
}

/**
 * Populate the form with configuration data
 */
function populateForm(config) {
    // Basic Information
    if (config.profileSettings) {
        const profile = config.profileSettings;

        document.getElementById('firstName').value = profile.firstName || 'Emma';
        document.getElementById('gender').value = profile.gender || 'female';
        document.getElementById('ageMin').value = profile.ageRange?.min || 22;
        document.getElementById('ageMax').value = profile.ageRange?.max || 26;
        document.getElementById('height').value = profile.height || '5\'5"';

        // Relationship
        document.getElementById('relationshipGoal').value = profile.relationshipGoal || 'Long-term relationship, open to short';
        document.getElementById('childrenPreference').value = profile.childrenPreference || 'Open to children';

        // Demographics
        document.getElementById('ethnicity').value = profile.ethnicity || 'White/Caucasian';
        document.getElementById('religion').value = profile.religion || 'Spiritual';
        document.getElementById('education').value = profile.education || 'Bachelor\'s degree';

        // Lifestyle
        document.getElementById('drinking').value = profile.drinking || 'Sometimes';
        document.getElementById('smoking').value = profile.smoking || 'No';
        document.getElementById('cannabis').value = profile.cannabis || 'No';
    }

    // Prompts are now handled by the separate prompts file
    // No need to populate prompts in the UI anymore
}

/**
 * Save the configuration
 */
async function saveConfiguration(event) {
    event.preventDefault();

    // Gather form data
    const config = {
        profileSettings: {
            firstName: document.getElementById('firstName').value,
            gender: document.getElementById('gender').value,
            ageRange: {
                min: parseInt(document.getElementById('ageMin').value),
                max: parseInt(document.getElementById('ageMax').value)
            },
            height: document.getElementById('height').value,
            relationshipGoal: document.getElementById('relationshipGoal').value,
            ethnicity: document.getElementById('ethnicity').value,
            education: document.getElementById('education').value,
            religion: document.getElementById('religion').value,
            hometown: "",
            children: "Don't have children",
            childrenPreference: document.getElementById('childrenPreference').value,
            drinking: document.getElementById('drinking').value,
            smoking: document.getElementById('smoking').value,
            cannabis: document.getElementById('cannabis').value,
            drugs: "No"
        },
        // Prompts are now loaded from separate file
        prompts: [],
        photoSettings: {
            uploadPhotos: true,
            numberOfPhotos: 6,
            photoSource: "library"
        },
        behaviorSettings: {
            randomizeOrder: false,
            useVariations: false,
            delayBetweenActions: {
                min: 1,
                max: 3
            }
        },
        autoSwipe: {
            enabled: false,
            swipeCount: 0,
            likeRatio: 0.3
        }
    };

    // Validate configuration
    if (!validateConfig(config)) {
        return;
    }

    try {
        // Save via IPC
        const result = await window.electronAPI.saveHingeConfig(config);

        if (result.success) {
            showStatus('Configuration saved successfully!', 'success');

            // Optional: Show summary
            showConfigSummary(config);
        } else {
            showStatus('Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showStatus('Error saving configuration: ' + error.message, 'error');
    }
}

/**
 * Validate the configuration
 */
function validateConfig(config) {
    const profile = config.profileSettings;

    // Check required fields
    if (!profile.firstName || profile.firstName.trim() === '') {
        showStatus('First name is required', 'error');
        return false;
    }

    // Check age range
    if (profile.ageRange.min > profile.ageRange.max) {
        showStatus('Invalid age range', 'error');
        return false;
    }

    // Prompts are now handled by the separate file, no validation needed here

    return true;
}

/**
 * Load default values
 */
function loadDefaults() {
    const defaults = {
        profileSettings: {
            firstName: 'Emma',
            gender: 'female',
            ageRange: { min: 22, max: 26 },
            height: '5\'5"',
            relationshipGoal: 'Long-term relationship, open to short',
            ethnicity: 'White/Caucasian',
            religion: 'Spiritual',
            education: 'Bachelor\'s degree',
            childrenPreference: 'Open to children',
            drinking: 'Sometimes',
            smoking: 'No',
            cannabis: 'No'
        },
        // Prompts are loaded from separate file now
    };

    populateForm(defaults);
    showStatus('Loaded default configuration', 'success');
}

/**
 * Show status message
 */
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

/**
 * Show configuration summary
 */
function showConfigSummary(config) {
    const profile = config.profileSettings;
    const summary = `
Configuration Summary:
- Name: ${profile.firstName}
- Age: ${profile.ageRange.min}-${profile.ageRange.max}
- Goal: ${profile.relationshipGoal}
- Prompts: Loaded from separate file
    `;

    console.log(summary);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadCurrentConfig,
        saveConfiguration,
        validateConfig
    };
}