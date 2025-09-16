const { log, findAndClickWithPolling, checkAndTerminateApp, findAndSetValue } = require('./utils');

async function performCraneSequence(client, city) {
    try {
        log('Interacting with Crane element...');

        // Lancer l'application settings
        await checkAndTerminateApp(client, 'com.apple.Preferences');
        await client.execute('mobile: activateApp', { bundleId: 'com.apple.Preferences' });
        log('Preferences app activated');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeCell" AND name == "Crane"');
        log('Crane element clicked');

        // Chaîner les actions avec des vérifications minimales
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeCell" AND name == "Applications"');
        log('Applications element clicked');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeCell" AND name == "Plenty of Fish"');
        log('Plenty of Fish element clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add"');
        await findAndSetValue(client, '-ios predicate string:type == "XCUIElementTypeTextField"', city);
        log('City set');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add"');
        log('Add button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "' + city + '"');
        log('City clicked');

        await findAndClickWithPolling(client,  '-ios predicate string:name == "Protect Using Biometrics" AND label == "Protect Using Biometrics" AND value == "0" AND type == "XCUIElementTypeSwitch"');
        log('Biometrics protection disabled');

        //await findAndClickWithPolling(client,  '-ios predicate string:name == "Use Container Identifier" AND label == "Use Container Identifier" AND value == "1" AND type == "XCUIElementTypeSwitch"');
        //await findAndClickWithPolling(client, '-ios predicate string:name == "Generate New"');
        //await findAndClickWithPolling(client, '-ios predicate string:name == "Continue"');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Reset Registration"');
        log('Reset registration clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete Data"');
        log('Delete data clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete"');
        log('Delete button clicked');

        // Fermer les préférences avant de passer à AppData
        await client.execute('mobile: terminateApp', { bundleId: 'com.apple.Preferences' });
        log('Preferences app terminated');

        // Configuration des permissions de localisation
        await client.execute('mobile: activateApp', { bundleId: 'com.apple.Preferences' });
        log('Preferences app activated');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Plenty of Fish"');
        log('Plenty of Fish element clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "While Using"');
        log('While Using element clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Ask Next Time Or When I Share"');
        log('Ask Next Time Or When I Share element clicked');

        // Terminer proprement
        await client.execute('mobile: terminateApp', { bundleId: 'com.apple.Preferences' });

    } catch (uiError) {
        log(`Error during UI interaction: ${uiError.message}`, uiError);
        throw uiError;
    }
}

module.exports = {
    performCraneSequence
};

// Version paramétrable pour d'autres apps (ex: Hinge)
async function performCraneForApp(client, appName, city) {
    try {
        log('Interacting with Crane element (generic)...');

        await checkAndTerminateApp(client, 'com.apple.Preferences');
        await client.execute('mobile: activateApp', { bundleId: 'com.apple.Preferences' });
        log('Preferences app activated');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeCell" AND name == "Crane"');
        log('Crane element clicked');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeCell" AND name == "Applications"');
        log('Applications element clicked');

        await findAndClickWithPolling(client, `-ios predicate string:type == "XCUIElementTypeCell" AND name == "${appName}"`);
        log(`${appName} element clicked`);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add"');
        await findAndSetValue(client, '-ios predicate string:type == "XCUIElementTypeTextField"', city);
        log('City set');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add"');
        log('Add button clicked');

        await findAndClickWithPolling(client, `-ios predicate string:name == "${city}"`);
        log('City clicked');

        await findAndClickWithPolling(client,  '-ios predicate string:name == "Protect Using Biometrics" AND label == "Protect Using Biometrics" AND value == "0" AND type == "XCUIElementTypeSwitch"');
        log('Biometrics protection disabled');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Reset Registration"');
        log('Reset registration clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete Data"');
        log('Delete data clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete"');
        log('Delete button clicked');

        await client.execute('mobile: terminateApp', { bundleId: 'com.apple.Preferences' });
        log('Preferences app terminated');

    } catch (uiError) {
        log(`Error during UI interaction (generic): ${uiError.message}`, uiError);
        throw uiError;
    }
}

module.exports.performCraneForApp = performCraneForApp;