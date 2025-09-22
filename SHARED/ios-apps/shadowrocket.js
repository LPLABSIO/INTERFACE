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
        // Stratégie plus robuste: cliquer le champ puis taper caractère par caractère
        try {
            const secureField = await client.$('-ios predicate string:type == "XCUIElementTypeSecureTextField"');
            await secureField.click();
            await randomWait(1, 1);
            // Taper via le clavier système (évite setValue sur SecureTextField)
            await findAndTypeCharByChar(client, proxyInfo.password, true);
            log('Password set (typed)');
        } catch (e) {
            log(`Primary secure input failed: ${e.message}. Retrying after re-activating Shadowrocket...`);
            await client.execute('mobile: activateApp', { bundleId: 'com.liguangming.Shadowrocket' });
            const secureFieldRetry = await client.$('-ios predicate string:type == "XCUIElementTypeSecureTextField"');
            await secureFieldRetry.click();
            await randomWait(1, 1);
            await findAndTypeCharByChar(client, proxyInfo.password, true);
            log('Password set (retry typed)');
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

        await randomWait(5, 5);

        await findAndClickWithPolling(client, '-ios predicate string:name == "' + remarks + '"');
        log('New proxy selected');

        // Vérifier et cliquer sur la checkbox si nécessaire
        const switchSelector = '-ios predicate string:type == "XCUIElementTypeSwitch"';
        await findAndClickWithPollingIfNotEnabled(client, switchSelector);
        log('Server configuration completed successfully');

        await randomWait(5, 5);

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