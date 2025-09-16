const AppOrchestrator = require('./src/core/AppOrchestrator');

async function testSessionManager() {
  console.log('🚀 Test du Session Management System');

  const orchestrator = new AppOrchestrator({
    dbPath: './data/sessions.db',
    statePath: './data/state.json'
  });

  try {
    // Initialiser
    console.log('📦 Initialisation...');
    await orchestrator.initialize();

    // Scanner les appareils
    console.log('📱 Scan des appareils...');
    const devices = await orchestrator.scanDevices();
    console.log(`Trouvé ${devices.length} appareils:`, devices.map(d => d.name));

    // Simuler le lancement d'une session
    if (devices.length > 0) {
      console.log('\n🎯 Lancement d\'une session test...');
      const selectedDevices = [devices[0].udid]; // Premier appareil

      const sessions = await orchestrator.launchSession(selectedDevices, {
        app: 'hinge',
        accountsNumber: 1,
        proxyProvider: 'marsproxies'
      });

      console.log('✅ Session créée:', sessions[0].id);

      // Attendre un peu
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Vérifier le statut
      const status = await orchestrator.getDeviceStatus(devices[0].udid);
      console.log('\n📊 Statut de l\'appareil:', status);

      // Obtenir le statut global
      const globalStatus = orchestrator.getGlobalStatus();
      console.log('\n🌍 Statut global:', JSON.stringify(globalStatus, null, 2));

      // Arrêter la session
      console.log('\n🛑 Arrêt de la session...');
      await orchestrator.stopSession(sessions[0].id);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    // Shutdown propre
    await orchestrator.shutdown();
    console.log('\n✅ Test terminé');
  }
}

// Lancer le test
testSessionManager().catch(console.error);