const { log, findAndClickWithPolling, checkAndTerminateApp, findAndSetValue, randomWait } = require('./utils');
const { getRandomLocationInCity } = require('./locations');

async function setupOrbitApp(client, location) {
    try {
        log('Starting Orbit app session...');

        // Vérifier l'état de l'application Orbit
        await checkAndTerminateApp(client, 'com.sgwc.Orbit');
        await client.execute('mobile: activateApp', { bundleId: 'com.sgwc.Orbit' });
        log('Orbit app activated');

        // Cliquer sur Configure
        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeStaticText" AND name == "Application List"');
        log('Clicked on Application List');


        await findAndClickWithPolling(client, '-ios predicate string:name == "Plenty of Fish"');
        log('Clicked on Plenty of Fish');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Containers"');
        log('Clicked on Containers');

        await findAndClickWithPolling(client, '-ios predicate string:name == "' + location.city + '"');
        log('Clicked on ' + location.city);

        // name == "Enable, Orbit for Plenty of Fish"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Enable, Orbit for Plenty of Fish"');
        log('Clicked on Enable, Orbit for Plenty of Fish');

        // name == "Choose"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose"');
        log('Clicked on Choose');

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[5]/XCUIElementTypeOther/XCUIElementTypeButton[2]')
        log('Location coordinates button clicked');

        // Here we need to call my fonction to get random latitude and longitude
        const { latitude, longitude } = await getRandomLocationInCity(location.lat, location.lon);

        await findAndSetValue(
            client,
            '-ios predicate string:value == "Latitude..."',
            latitude
        );
        log('Latitude set');

        await findAndSetValue(
            client,
            '-ios predicate string:value == "Longitude..."',
            longitude
        );
        log('Longitude set');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Set Location"');
        log('Set Location button clicked');

        await randomWait(3, 3);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[4]/XCUIElementTypeButton');
        log('Close maps button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Generate, Random gyroscope x/y/z"');
        log('Set Location button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Bypass, Simulated by Software"');
        log('Set Location button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Bypass, Produced by Accessory"');
        log('Set Location button clicked');

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
    setupOrbitApp
};

// Version paramétrable pour d'autres apps (ex: Hinge)
async function setupOrbitForApp(client, appName, location) {
    try {
        log('Starting Orbit app session (generic)...');

        await checkAndTerminateApp(client, 'com.sgwc.Orbit');
        await client.execute('mobile: activateApp', { bundleId: 'com.sgwc.Orbit' });
        log('Orbit app activated');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeStaticText" AND name == "Application List"');
        log('Clicked on Application List');

        await findAndClickWithPolling(client, `-ios predicate string:name == "${appName}"`);
        log(`Clicked on ${appName}`);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Containers"');
        log('Clicked on Containers');

        await findAndClickWithPolling(client, `-ios predicate string:name == "${location.city}"`);
        log(`Clicked on ${location.city}`);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Enable, Orbit for ' + appName + '"');
        log(`Clicked on Enable, Orbit for ${appName}`);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Choose"');
        log('Clicked on Choose');

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[5]/XCUIElementTypeOther/XCUIElementTypeButton[2]');
        log('Location coordinates button clicked');

        const { latitude, longitude } = await getRandomLocationInCity(location.lat, location.lon);

        await findAndSetValue(
            client,
            '-ios predicate string:value == "Latitude..."',
            latitude
        );
        log('Latitude set');

        await findAndSetValue(
            client,
            '-ios predicate string:value == "Longitude..."',
            longitude
        );
        log('Longitude set');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Set Location"');
        log('Set Location button clicked');

        await randomWait(3, 3);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[4]/XCUIElementTypeButton');
        log('Close maps button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Generate, Random gyroscope x/y/z"');
        log('Random gyroscope clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Bypass, Simulated by Software"');
        log('Bypass Simulated by Software clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Bypass, Produced by Accessory"');
        log('Bypass Produced by Accessory clicked');

        await client.execute('mobile: pressButton', { name: 'home' });
        log('Clicked on home button');

        return true;
    } catch (ghostError) {
        log(`Error during Orbit app session (generic): ${ghostError.message}`, ghostError);
        return false;
    }
}

module.exports.setupOrbitForApp = setupOrbitForApp;