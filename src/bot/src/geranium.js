const { log, checkAndTerminateApp, findAndClickWithPolling, findAndTypeCharByChar } = require('./utils');

/**
 * Configure l'app Geranium pour définir la localisation via LocSim.
 * @param {import('webdriverio').Browser} client
 * @param {{ lat: number|string, lon: number|string, city?: string }} location
 */
async function setupGeraniumApp(client, location) {
  const bundleId = 'live.cclerc.geranium';
  try {
    log('Starting Geranium app session...');

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
    // Taper Return sur le clavier
    try {
      await client.execute('mobile: pressButton', { name: 'return' });
    } catch {}

    // Champ longitude
    const longitude = String(location?.lon ?? '0');
    await findAndTypeCharByChar(client, longitude);

    // Valider par OK
    await findAndClickWithPolling(client, '-ios predicate string:name == "OK"');

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

