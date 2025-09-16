const { log, findAndClickWithPolling, findAndSetValue, randomWait, touchAndHoldThenPaste, checkAndTerminateApp, findAndTypeCharByChar } = require('./utils');
const { getRandomLocationInCity } = require('./locations');

async function runTinderJailedApp(client, location) {
    try {
        log('Starting Tinder Jailed app session...');

        // Vérifier et terminer l'application Tinder si elle est en cours d'exécution
        await checkAndTerminateApp(client, 'com.cardify.tinder');
        // Open the Tinder app
        await client.execute('mobile: launchApp', { bundleId: 'com.cardify.tinder' });
        log('Tinder app opened');

        await randomWait(1, 1);

        // Cliquer sur le bouton gear
        await findAndClickWithPolling(client, '-ios predicate string:name == "gear"');
        log('Gear button clicked');

        // Cliquer sur le bouton Location Spoofer
        await findAndClickWithPolling(client, '-ios predicate string:name == "Location Spoofer"');
        log('Location Spoofer button clicked');

        // Cliquer sur le bouton "Location"
        await findAndClickWithPolling(client, '-ios predicate string:name == "location.fill.viewfinder"');
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

        await randomWait(10, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Close"');
        log('Close maps button clicked');
        return true;
    } catch (tinderError) {
        log(`Error during Tinder app session: ${tinderError.message}`, tinderError);
        return false;
    }
}

module.exports = {
    runTinderJailedApp,
};