const { log, checkAndTerminateApp, findAndClickWithPolling, findAndTypeCharByChar, randomWait } = require('../utils/utils');

/**
 * Configure l'app Geranium pour définir la localisation via LocSim.
 * @param {import('webdriverio').Browser} client
 * @param {{ lat: number|string, lon: number|string, city?: string }} location
 */
async function setupGeraniumApp(client, location) {
  const bundleId = 'live.cclerc.geranium';
  try {
    log('Starting Geranium app session...');

    // Vérifier que la session est valide avant de continuer
    try {
      await client.execute('mobile: getDeviceTime');
    } catch (sessionError) {
      log('Session lost before Geranium, aborting...');
      return false;
    }

    // Assurer un état propre puis lancer l'app
    await checkAndTerminateApp(client, bundleId);
    await client.execute('mobile: activateApp', { bundleId });
    log('Geranium app activated');

    // Ouvrir LocSim
    await findAndClickWithPolling(client, '-ios predicate string:name == "LocSim"');

    // Ouvrir Map Pin
    await findAndClickWithPolling(client, '-ios predicate string:name == "Map Pin" AND label == "Map Pin" AND type == "XCUIElementTypeButton"');

    // Champ latitude
    const latitude = String(location?.lat ?? '0');
    await findAndTypeCharByChar(client, latitude);

    // Attendre un peu après la latitude
    await randomWait(0.3, 0.5);

    // Cliquer sur le champ Longitude par son placeholder
    await findAndClickWithPolling(client, '-ios predicate string:value == "Longitude"');
    await randomWait(0.2, 0.3);

    // Champ longitude
    const longitude = String(location?.lon ?? '0');
    await findAndTypeCharByChar(client, longitude);

    // Valider par OK
    await findAndClickWithPolling(client, '-ios predicate string:name == "OK"');

    // Attendre que les changements soient sauvegardés
    await randomWait(2, 3);

    // Fermer l'app
    await client.execute('mobile: terminateApp', { bundleId });
    log('Geranium app terminated');
    return true;
  } catch (e) {
    log(`Error during Geranium app session: ${e.message}`, e);
    try { await client.execute('mobile: terminateApp', { bundleId }); } catch {}
    return false;
  }
}

module.exports = {
  setupGeraniumApp,
};

