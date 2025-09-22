const { log, findAndClickWithPolling, findAndSetValue, randomWait, touchAndHoldThenPaste, checkAndTerminateApp, clickByCoordinates } = require('../../SHARED/utils/utils');
const { getRandomLocationInCity } = require('../../SHARED/utils/locations');
const { sendTelegramMessage } = require('../../SHARED/notifications/telegram');

async function runBlazeXApp(client, location) {
    try {
        log('Starting BlazeX app session...');

        // Vérifier et terminer l'application Tinder si elle est en cours d'exécution
        await checkAndTerminateApp(client, 'com.cardify.tinder');
        // Open the Tinder app
        await client.execute('mobile: launchApp', { bundleId: 'com.cardify.tinder' });
        log('Tinder app opened');

        // Cliquer sur le bouton "chevron.compact.left"
        await findAndClickWithPolling(client, '-ios predicate string:name == "chevron.compact.left"');
        log('Chevron left button clicked');

        await randomWait(1, 1);

        // Cliquer sur le bouton "name == "rectangle.3.offgrid.fill""
        await findAndClickWithPolling(client, '-ios predicate string:name == "rectangle.3.offgrid.fill"');
        log('BlazeX button clicked');

        // Cliquer sur le bouton "name == "Orbit""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Orbit"');
        log('Orbit button clicked');

        // Cliquer sur le bouton "Location"
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[4]/XCUIElementTypeOther[3]/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[4]/XCUIElementTypeOther/XCUIElementTypeButton[2]');
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

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[3]/XCUIElementTypeOther[3]/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[3]/XCUIElementTypeButton');
        log('Close maps button clicked');

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[3]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeOther[2]/XCUIElementTypeButton');
        log('Close blazex button clicked');

        return true;
    } catch (tinderError) {
        log(`Error during Tinder app session: ${tinderError.message}`, tinderError);
        return false;
    }
}

async function closeBlazeXApp(client, proxyInfo, swipes_data, open_chevron, send_tokens) {
    try {
        log('Closing BlazeX app...');

        if (open_chevron) {
            // Cliquer sur le bouton "chevron.compact.left"
            await findAndClickWithPolling(client, '-ios predicate string:name == "chevron.compact.left"');
            log('Chevron left button clicked');
        }

        await randomWait(1, 1);

        // Cliquer sur le bouton "name == "rectangle.3.offgrid.fill""
        await findAndClickWithPolling(client, '-ios predicate string:name == "rectangle.3.offgrid.fill"');
        log('BlazeX button clicked');

        if (send_tokens) {
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
        }
        // Cliquer sur le bouton "name == "Reset""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Reset"');
        log('Reset button clicked');

        // Cliquer sur le bouton "name == "Yes, I'm sure!""
        await findAndClickWithPolling(client, '-ios predicate string:name == "Yes, I\'m sure!"');
        log('Yes, I\'m sure! button clicked');

        // Sleep
        await randomWait(10, 10);

        if (send_tokens) {
            // Open app notes
            await checkAndTerminateApp(client, 'com.apple.mobilenotes');
            await client.execute('mobile: launchApp', { bundleId: 'com.apple.mobilenotes' });
            log('Notes app opened');

            // Click on input bar
            await findAndClickWithPolling(client, '-ios predicate string:name == "Search"');
            log('Input bar clicked');

            // Perform touch and hold then paste on the input field
            await touchAndHoldThenPaste(client, '-ios predicate string:name == "Search" AND label == "Search"');
            log('Paste operation completed on input field');

            // Get the value of name == "Search" AND label == "Search"
            const searchField = await client.$('-ios predicate string:name == "Search" AND label == "Search"');
            const searchFieldValue = await searchField.getAttribute('value');
            log(`Search field value: ${searchFieldValue}`);

            const message = searchFieldValue;
            const regex =
                /Auth Token: ([\w-]+) Refresh Token: ([\w.-]+) Persistent Device ID: ([\w-]+) Device ID: ([\w-]+) Latitude: ([\d.-]+) Longitude: ([\d.-]+) $/;
            const match = await message.match(regex);
            log(match);
            if (match) {
                const authToken = match[1];
                const refreshToken = match[2];
                const persistentDeviceId = match[3];
                const deviceId = match[4];
                const latitude = match[5];
                const longitude = match[6];
                log("Auth Token: " + authToken + "\n" +
                    "Refresh Token: " + refreshToken + "\n" +
                    "Persistent Device ID: " + persistentDeviceId + "\n" +
                    "Device ID: " + deviceId + "\n" +
                    "Latitude: " + latitude + "\n" +
                    "Longitude: " + longitude + "\n" +
                    "Proxy:" + proxyInfo.domain + ":" + proxyInfo.port + ":" + proxyInfo.username + ":" + proxyInfo.password + "\n" +
                    "Had a match: " + swipes_data.had_a_match + "\n" +
                    "Current likes: " + swipes_data.current_likes);
                await sendTelegramMessage("Auth Token: " + authToken + "\n" +
                    "Refresh Token: " + refreshToken + "\n" +
                    "Persistent Device ID: " + persistentDeviceId + "\n" +
                    "Device ID: " + deviceId + "\n" +
                    "Latitude: " + latitude + "\n" +
                    "Longitude: " + longitude + "\n" +
                    "Proxy:" + proxyInfo.domain + ":" + proxyInfo.port + ":" + proxyInfo.username + ":" + proxyInfo.password + "\n" +
                    "Had a match: " + swipes_data.had_a_match + "\n" +
                    "Current likes: " + swipes_data.current_likes);
            } else {
                console.log("No match found.");
            }
        }
        // Open app photos
        await checkAndTerminateApp(client, 'com.apple.mobileslideshow');
        await client.execute('mobile: launchApp', { bundleId: 'com.apple.mobileslideshow' });
        log('Photos app opened');

        // Click on "Select"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Select"');
        log('Select button clicked');

        // Click by coordinates
        await clickByCoordinates(client, 360, 700);
        log('Click by coordinates on picture 1');

        // Click by coordinates
        await clickByCoordinates(client, 270, 700);
        log('Click by coordinates on picture 2');

        // Click by coordinates
        await client.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: 170, y: 700 },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pause', duration: 100 },
                    { type: 'pointerUp', button: 0 }
                ]
            }
        ]);
        log('Click by coordinates on picture 3');

        // Click on delete button
        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete"');
        log('Delete button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Delete 3 Photos"');
        log('Delete 3 photos button clicked');

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

module.exports = {
    runBlazeXApp,
    closeBlazeXApp
};