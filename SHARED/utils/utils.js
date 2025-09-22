// Configure logging
const fs = require('fs');
const path = require('path');
const logDir = 'logs';
const logFile = path.join(logDir, `bot_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

// Create logs directory if it doesn't exist
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Logging function
function log(message, error = false) {
    const timestamp = new Date().toISOString();
    // Récupérer la stack trace
    const stack = new Error().stack;
    let callerInfo = '';
    if (stack) {
        // La 3ème ligne de la stack correspond à l'appelant
        const stackLines = stack.split('\n');
        if (stackLines.length >= 3) {
            // Extraire le chemin du fichier et la ligne
            const match = stackLines[2].match(/\(([^)]+):(\d+):(\d+)\)/);
            if (match) {
                const filePath = match[1];
                const lineNumber = match[2];
                // Extraire juste le nom du fichier
                const fileName = filePath.split('/').pop();
                callerInfo = `[${fileName}:${lineNumber}]`;
            }
        }
    }
    const logMessage = `${timestamp} - ${callerInfo} - ${typeof message === 'object' ? (() => { try { return JSON.stringify(message); } catch { return '[Unserializable object]'; } })() : message}\n`;
    // Affichage console amélioré
    if (typeof message === 'object') {
        try {
            console.log(`${callerInfo} -`, JSON.stringify(message, null, 2));
        } catch {
            console.log(`${callerInfo} - [Unserializable object]`);
        }
    } else {
        console.log(`${callerInfo} - ${message}`);
    }
    fs.appendFileSync(logFile, logMessage);
    if (error) {
        fs.appendFileSync(logFile, `${timestamp} - ${callerInfo} - Error stack: ${error.stack}\n`);
    }
}

// Helper function for element interactions with polling
async function findAndClickWithPolling(client, selector, timeout = 30000, trow_error=true) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            const element = await client.$(selector);
            if (element) {
                await element.click();
                return true;
            }
        } catch (error) {
            // Continue polling
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
    }
    if (trow_error)
        throw new Error(`Element ${selector} not clickable after ${timeout}ms`);
}

// Helper function for text input interactions
async function findAndSetValue(client, selector, value) {
    try {
        const element = await client.$(selector);
        await element.setValue(value);
        return true;
    } catch (error) {
        log(`Error setting value for element ${selector}: ${error.message}`);
        return false;
    }
}

// Helper function to type characters one by one with direct keyboard input
async function findAndTypeCharByChar(client, value, fast = false) {
    try {
        // Taper d'abord un espace pour activer le champ puis le supprimer
        await client.keys(' ');
        await client.pause(200);
        await client.keys('\uE003'); // Backspace key

        // Type each character individually
        for (let i = 0; i < value.length; i++) {
            // Use the keyboard to type the character
            await client.keys(value[i]);
            if (fast == false)
                await randomWait(0.2, 0.5);
        }

        return true;
    } catch (error) {
        log(`Error typing characters: ${error.message}`);
        return false;
    }
}

// Helper function for switch interactions
async function findAndClickWithPollingIfNotEnabled(client, selector) {
    try {
        const element = await client.$(selector);
        const value = await element.getAttribute('value');

        if (value !== '1') {
            await element.click();
            log('Switch clicked because it was not enabled');
            return true;
        }

        log('Switch already enabled, skipping click');
        return false;
    } catch (error) {
        log(`Error interacting with switch: ${error.message}`);
        return false;
    }
}

// Helper function for random wait
async function randomWait(min, max) {
    const waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
    log(`Waiting for ${waitTime} seconds...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
}

// Helper function to wait for an element to no longer be present
async function waitForElementNotPresent(client, selector, timeout = 30000) {
    log(`Waiting for element ${selector} to not be present or not visible...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            const element = await client.$(selector);
            const isExisting = await element.isExisting();

            if (!isExisting) {
                log(`Element ${selector} is no longer present`);
                return true;
            }

            // Check if the element exists but is not visible
            try {
                const isVisible = await element.getAttribute('visible');
                if (isVisible === 'false') {
                    log(`Element ${selector} exists but is not visible (visible=false)`);
                    return true;
                }
            } catch (visibilityError) {
                // If we can't get the visible attribute, continue with the polling
                log(`Could not check visibility for ${selector}: ${visibilityError.message}`);
            }
        } catch (error) {
            // If we get an error, the element is likely gone
            log(`Element ${selector} is no longer present (caught error)`);
            return true;
        }

        // Wait a short time before polling again
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Element ${selector} still present and visible after ${timeout}ms`);
}

// Helper function to perform touch and hold on an element then click on "Paste" (Coller)
async function touchAndHoldThenPaste(client, selector, holdDuration = 0.5) {
    try {
        log(`Performing touch and hold on ${selector} then paste`);

        // First locate the element
        const element = await client.$(selector);
        const elementId = await element.elementId;

        // Perform the touch and hold action
        await client.execute('mobile: touchAndHold', {
            element: elementId,
            duration: holdDuration
        });
        log('Touch and hold completed');

        try {
            const pasteElement = await client.$('-ios predicate string:name == "Paste"');
            const exists = await pasteElement.isExisting();
            if (exists) {
                await pasteElement.click();
                return true;
            }
        } catch (error) {
            log('Could not find paste button');
        }

    } catch (error) {
        log(`Error during touch and hold then paste: ${error.message}`, error);
        return false;
    }
}

/**
 * Vérifie l'état d'une application et la termine si elle est en cours d'exécution
 * @param {Object} client - Le client Appium
 * @param {string} bundleId - L'identifiant du bundle de l'application
 * @param {boolean} forceTerminate - Si true, termine l'application même si elle n'est pas en cours d'exécution
 * @returns {number} - L'état final de l'application après vérification/terminaison
 */
async function checkAndTerminateApp(client, bundleId, forceTerminate = false) {
    try {
        // Table de correspondance des états
        const stateMap = {
            0: "Not installed",
            1: "Not running",
            2: "Running in background but suspended",
            3: "Running in background",
            4: "Running in foreground"
        };

        // Vérifier l'état de l'application
        log(`Checking app state for ${bundleId}...`);
        const appState = await client.execute('mobile: queryAppState', { bundleId });
        log(`${bundleId} state: ${appState} (${stateMap[appState] || "Unknown state"})`);

        // Terminer l'application si elle est en cours d'exécution ou si forceTerminate est vrai
        if (appState > 1 || forceTerminate) {
            log(`${bundleId} is ${stateMap[appState]}, terminating the app...`);
            await client.execute('mobile: terminateApp', { bundleId });
            log(`${bundleId} terminated successfully`);

            // Vérifier à nouveau l'état pour confirmation
            const appStateAfterTerminate = await client.execute('mobile: queryAppState', { bundleId });
            log(`${bundleId} state after termination: ${appStateAfterTerminate} (${stateMap[appStateAfterTerminate] || "Unknown state"})`);

            return appStateAfterTerminate;
        } else {
            log(`${bundleId} is not running, skipping termination`);
            return appState;
        }
    } catch (error) {
        log(`Error checking/terminating app ${bundleId}: ${error.message}`, error);
        throw error;
    }
}

async function cleaningPorcess(client, proxyInfo) {
    try {
        log('Closing BlazeX app...');

        // Cliquer sur le bouton "name == "rectangle.3.offgrid.fill""
        await findAndClickWithPolling(client, '-ios predicate string:name == "rectangle.3.offgrid.fill"');
        log('BlazeX button clicked');

        // Cliquer sur le bouton "name == "key""
        await findAndClickWithPolling(client, '-ios predicate string:name == "key"');
        log('Key button clicked');

        // Cliquer sur le bouton "name == "Copy All Tokens""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Copy All Tokens"');
        log('Copy All Tokens button clicked');

        // Cliquer sur le bouton "name == "Unformatted Token""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Unformatted Token"');
        log('Unformatted Token button clicked');

        // Cliquer sur le bouton "name == "rectangle.3.offgrid.fill""
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "rectangle.3.offgrid"`]');
        log('Home BlazeX button clicked');

        // Cliquer sur le bouton "name == "Reset""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Reset"');
        log('Reset button clicked');

        // Cliquer sur le bouton "name == "Yes, I'm sure!""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Yes, I\'m sure!"');
        log('Yes, I\'m sure! button clicked');

        // Sleep
        await randomWait(10, 10);

        // Open app telegram
        await checkAndTerminateApp(client, 'ph.telegra.Telegraph');
        await client.execute('mobile: launchApp', { bundleId: 'ph.telegra.Telegraph' });
        log('Telegram app opened');

        // Open conversation Saved Messages
        await findAndClickWithPolling(client, '-ios predicate string:name == "Saved Messages"');
        log('Saved Messages button clicked');

        // Click on input bar
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[1]/XCUIElementTypeOther[1]/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]');
        log('Input bar clicked');

        // Perform touch and hold then paste on the input field
        await touchAndHoldThenPaste(client, '-ios predicate string:type == "XCUIElementTypeTextView"');
        log('Paste operation completed on input field');

        // Input the proxy
        await findAndTypeCharByChar(
            client,
            'Proxy: ' + proxyInfo.domain + ':' + proxyInfo.port + ':' + proxyInfo.username + ':' + proxyInfo.password,
            true
        );
        log('Proxy inputted');

        // CLick on send button
        await findAndClickWithPolling(client, '-ios predicate string:name == "Send"');
        log('Send button clicked');

        await randomWait(3, 3);

        // Close Telegram app
        await client.execute('mobile: terminateApp', { bundleId: 'ph.telegra.Telegraph' });
        log('Telegram app closed');

        // Open app photos
        await checkAndTerminateApp(client, 'com.apple.mobileslideshow');
        await client.execute('mobile: launchApp', { bundleId: 'com.apple.mobileslideshow' });
        log('Photos app opened');

        // Click on "Select"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Select"');
        log('Select button clicked');

        // Approche alternative: essayer de récupérer les éléments un par un jusqu'à ce qu'on échoue
        let totalPhotos = 50;

        log(`Nombre total de photos trouvées: ${totalPhotos}`);

        // Sélectionner les 4 dernières photos
        for (let i = 0; i < 4; i++) {
            const photoIndex = totalPhotos - i;
            await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "PXGGridLayout-Info"`]' + `[${photoIndex}]`);
            log(`Photo ${photoIndex} clicked`);
        }

        // Click on delete button
        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete"');
        log('Delete button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete 4 Photos"');
        log('Delete button clicked');

        await randomWait(3, 3);

        // Terminate photos app
        await client.execute('mobile: terminateApp', { bundleId: 'com.apple.mobileslideshow' });
        log('Photos app closed');

        return true;
    } catch (tinderError) {
        log(`Error during Tinder app session: ${tinderError.message}`, tinderError);
        return false;
    }
}

async function clickByCoordinates(client, x, y) {
    try {
        // Click by coordinates
        await client.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: x, y: y },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pause', duration: 100 },
                    { type: 'pointerUp', button: 0 }
                ]
            }
        ]);
    } catch (error) {
        log(`Error checking/terminating app ${bundleId}: ${error.message}`, error);
        throw error;
    }
}

module.exports = {
    log,
    findAndClickWithPolling,
    findAndSetValue,
    findAndTypeCharByChar,
    findAndClickWithPollingIfNotEnabled,
    randomWait,
    waitForElementNotPresent,
    touchAndHoldThenPaste,
    checkAndTerminateApp,
    cleaningPorcess,
    clickByCoordinates
};
