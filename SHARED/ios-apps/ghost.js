const { log, findAndClickWithPolling, checkAndTerminateApp, findAndSetValue } = require('../utils/utils');

async function setupGhostApp(client, city) {
    try {
        log('Starting Ghost app session...');

        // Vérifier l'état de l'application Ghost
        await checkAndTerminateApp(client, 'com.sgwc.Ghost');
        await client.execute('mobile: activateApp', { bundleId: 'com.sgwc.Ghost' });
        log('Ghost app activated');

        // Cliquer sur Configure
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeStaticText" AND name == "Application List"');
        log('Clicked on Application List');
        
        // Instruction supplémentaire : cliquer sur l'élément "love"
        await findAndClickWithPolling(client, '-ios predicate string:name == "love"');
        log('Clicked on love');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Plenty of Fish"');
        log('Clicked on Plenty of Fish');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Containers"');
        log('Clicked on Containers');

        await findAndClickWithPolling(client, '-ios predicate string:name == "' + city + '"');
        log('Clicked on ' + city);

        // Cliquer sur Formulate
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeStaticText" AND name == "Formulate"');
        log('Clicked on Formulate');

        // Suite d'instructions demandées
        await findAndClickWithPolling(client, '-ios predicate string:name == "iPhone"');
        log('Clicked on iPhone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose an iPhone"');
        log('Clicked on Choose an iPhone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "iPhone 15 Pro"');
        log('Clicked on iPhone 15 Pro');
        await findAndClickWithPolling(client, '-ios predicate string:name == "iOS 17.1"');
        log('Clicked on iOS 17.1');
        await findAndClickWithPolling(client, '-ios predicate string:name == "iOS 18.0"');
        log('Clicked on iOS 18.0');
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton"');
        log('Clicked on generic button');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Cellular"');
        log('Clicked on Cellular');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose Carrier Provider"');
        log('Clicked on Choose Carrier Provider');
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[2]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeTable/XCUIElementTypeCell[102]');
        log('Clicked on carrier cell index 102');
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton"');
        log('Clicked on generic button');

        await findAndClickWithPolling(client, '-ios predicate string:name == "TimeZone"');
        log('Clicked on TimeZone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose TimeZone"');
        log('Clicked on Choose TimeZone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "America/New_York"');
        log('Clicked on America/New_York');
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton"');
        log('Clicked on generic button');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Advanced"');
        log('Clicked on Advanced');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Hide, Crane paths if Hinge checks for them"');
        log('Clicked on Hide, Crane paths if Hinge checks for them');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Prevent, Hinge from getting the contents of your pasteboard"');
        log('Clicked on Prevent, Hinge from getting the contents of your pasteboard');

        // Click on home button
        await client.execute('mobile: pressButton', { name: 'home' });
        log('Clicked on home button');

        return true;
    } catch (ghostError) {
        log(`Error during Ghost app session: ${ghostError.message}`, ghostError);
        return false;
    }
}

module.exports = {
    setupGhostApp
};

// Version paramétrable pour d'autres apps (ex: Hinge)
async function setupGhostForApp(client, appName, city) {
    try {
        log('Starting Ghost app session (generic)...');

        await checkAndTerminateApp(client, 'com.sgwc.Ghost');
        await client.execute('mobile: activateApp', { bundleId: 'com.sgwc.Ghost' });
        log('Ghost app activated');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeStaticText" AND name == "Application List"');
        log('Clicked on Application List');

        await findAndClickWithPolling(client, `-ios predicate string:name == "${appName}"`);
        log(`Clicked on ${appName}`);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Containers"');
        log('Clicked on Containers');

        await findAndClickWithPolling(client, `-ios predicate string:name == "${city}"`);
        log(`Clicked on ${city}`);

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeStaticText" AND name == "Formulate"');
        log('Clicked on Formulate');

        // Suite d'instructions demandées (générique)
        await findAndClickWithPolling(client, '-ios predicate string:name == "iPhone"');
        log('Clicked on iPhone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose an iPhone"');
        log('Clicked on Choose an iPhone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "iPhone 15 Pro"');
        log('Clicked on iPhone 15 Pro');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose Version"');
        log('Clicked on iOS 17.1');
        await findAndClickWithPolling(client, '-ios predicate string:name == "iOS 18.0"');
        log('Clicked on iOS 18.0');
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton"');
        log('Clicked on generic button');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Cellular"');
        log('Clicked on Cellular');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose Carrier Provider"');
        log('Clicked on Choose Carrier Provider');
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[2]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeTable/XCUIElementTypeCell[102]');
        log('Clicked on carrier cell index 102');
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton"');
        log('Clicked on generic button');

        await findAndClickWithPolling(client, '-ios predicate string:name == "TimeZone"');
        log('Clicked on TimeZone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose TimeZone"');
        log('Clicked on Choose TimeZone');
        await findAndClickWithPolling(client, '-ios predicate string:name == "America/New_York"');
        log('Clicked on America/New_York');
        await findAndClickWithPolling(client, '-ios predicate string:name == "America/New_York"');
        log('Clicked on America/New_York');
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton"');
        log('Clicked on generic button');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Advanced"');
        log('Clicked on Advanced');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Hide, Crane paths if Hinge checks for them"');
        log('Clicked on Hide, Crane paths if Hinge checks for them');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Prevent, Hinge from getting the contents of your pasteboard"');
        log('Clicked on Prevent, Hinge from getting the contents of your pasteboard');

        await client.execute('mobile: pressButton', { name: 'home' });
        log('Clicked on home button');

        return true;
    } catch (ghostError) {
        log(`Error during Ghost app session (generic): ${ghostError.message}`, ghostError);
        return false;
    }
}

module.exports.setupGhostForApp = setupGhostForApp;