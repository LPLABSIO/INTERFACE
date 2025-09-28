const { log, findAndClickWithPolling, findAndSetValue, findAndClickWithPollingIfNotEnabled, checkAndTerminateApp, randomWait, findAndTypeCharByChar } = require('../utils/utils');

async function configureShadowrocket(client, proxyInfo, city) {
    try {
        // Lancer l'application Shadowrocket
        await checkAndTerminateApp(client, 'com.liguangming.Shadowrocket');
        await client.execute('mobile: activateApp', { bundleId: 'com.liguangming.Shadowrocket' });
        log('Shadowrocket app activated');

        // Cliquer sur le bouton "Add"
        log('Adding new server configuration...');
        await findAndClickWithPolling(client, '-ios predicate string:label == "Add"');
        log('Add button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:label == "Add Server"');
        log('Add Server button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:label == "Type"');
        log('Type button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:label == "Socks5"');
        log('Socks5 option clicked');

        await findAndSetValue(
            client,
            '-ios predicate string:type == "XCUIElementTypeTextField" AND value == "Required, Domain or IP"',
            proxyInfo.domain
        );
        log('Domain set');

        await findAndSetValue(
            client,
            '-ios predicate string:type == "XCUIElementTypeTextField" AND value == "Required, 1-65535"',
            proxyInfo.port
        );
        log('Port set');

        await findAndSetValue(
            client,
            '-ios predicate string:type == "XCUIElementTypeTextField" AND value == "Optional"',
            proxyInfo.username
        );
        log('Username set');

        // Renseignement du mot de passe dans un champ sécurisé
        // Utiliser sendKeys qui est plus stable pour les SecureTextField
        try {
            const secureField = await client.$('-ios predicate string:type == "XCUIElementTypeSecureTextField"');
            await secureField.click();
            await randomWait(0.2, 0.3);
            // Utiliser sendKeys avec un tableau de caractères
            await secureField.sendKeys(proxyInfo.password.split(''));
            log('Password set (sendKeys method)');
        } catch (e) {
            log(`Primary secure input failed: ${e.message}. Retrying with alternate method...`);
            try {
                // Méthode alternative: utiliser keys directement
                await client.keys(proxyInfo.password);
                log('Password set (keys method)');
            } catch (keyError) {
                log(`Keys method also failed: ${keyError.message}. Falling back to char-by-char...`);
                // Fallback ultime: taper caractère par caractère
                await findAndTypeCharByChar(client, proxyInfo.password, true);
                log('Password set (char-by-char fallback)');
            }
        }

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('Done button clicked');

        const randomRemarks = Math.random().toString(36).substring(2, 8);
        const remarks = city + "_" + randomRemarks;

        await findAndSetValue(
            client,
            '-ios predicate string:type == "XCUIElementTypeTextField" AND value == "Optional"',
            remarks
        );
        log('Remarks set');

        await findAndClickWithPolling(client, '-ios predicate string:type == "XCUIElementTypeButton" AND name == "Save"');
        log('Save button clicked');

        await randomWait(2, 2.5);

        await findAndClickWithPolling(client, '-ios predicate string:name == "' + remarks + '"');
        log('New proxy selected');

        // Gérer le switch de connexion
        const switchSelector = '-ios predicate string:type == "XCUIElementTypeSwitch"';

        // Petite attente pour laisser l'UI se charger
        await randomWait(0.5, 1);

        // Vérifier l'état du switch via le XCUIElementTypeCell
        try {
            const cellElement = await client.$('-ios predicate string:value == "1" AND type == "XCUIElementTypeCell"');
            const isConnected = await cellElement.isExisting();

            if (isConnected) {
                // Le switch est à 1 (activé) - il faut le désactiver puis réactiver
                log('Status: Already connected (value=1) - Refreshing connection...');

                // Clic pour désactiver
                log('Disabling current connection...');
                await findAndClickWithPolling(client, switchSelector);
                await randomWait(2, 2.5); // Plus de temps pour la déconnexion

                // Clic pour réactiver
                log('Re-enabling connection...');
                await findAndClickWithPolling(client, switchSelector);
                await randomWait(1, 1.5);
                log('Connection refreshed successfully');
            } else {
                // Le switch est à 0 (désactivé) - juste l'activer
                log('Status: Not connected (value=0) - Activating connection...');
                await findAndClickWithPolling(client, switchSelector);
                log('Connection enabled from disconnected state');
            }
        } catch (e) {
            // En cas d'erreur, essayer l'ancienne méthode avec Not Connected
            log('Fallback method: checking for "Not Connected" text...');
            try {
                const notConnected = await client.$('-ios predicate string:name == "Not Connected" AND label == "Not Connected"');
                if (await notConnected.isDisplayed()) {
                    log('Status: Not Connected - Activating connection...');
                    await findAndClickWithPolling(client, switchSelector);
                    log('Connection enabled');
                } else {
                    // Faire un toggle par défaut
                    log('Default behavior: toggle off/on...');
                    await findAndClickWithPolling(client, switchSelector);
                    await randomWait(2, 2.5);
                    await findAndClickWithPolling(client, switchSelector);
                    log('Connection toggled');
                }
            } catch (fallbackError) {
                // En dernier recours, juste cliquer une fois
                log('Last resort: clicking switch once...');
                await findAndClickWithPolling(client, switchSelector);
            }
        }

        log('Server configuration completed successfully');

        await randomWait(1.5, 2);

        // Go to home
        await client.execute('mobile: pressButton', { name: 'home' });
        log('Clicked on home button');

        return true;
    } catch (shadowrocketError) {
        log(`Error during Shadowrocket app session: ${shadowrocketError.message}`, shadowrocketError);
        return false;
    }
}

module.exports = {
    configureShadowrocket
};