const { log, findAndClickWithPolling, findAndSetValue, randomWait, checkAndTerminateApp, findAndTypeCharByChar, waitForElementNotPresent, clickByCoordinates } = require('../../SHARED/utils/utils');
const { getSMSProvider } = require('../../SHARED/sms-providers/sms-provider');
const EmailManager = require('../../SHARED/email-manager/EmailManager');
const { getAndRemoveEmail } = require('../../SHARED/email-manager/email');
const { waitForHingeCodeFromGmail } = require('../../SHARED/email-manager/email-inbox');
const QuixEmailService = require('../../SHARED/email-manager/quix-email');
const {
  setDebugMode,
  findAndClickWithDebugFallback,
  findAndSetValueWithDebugFallback,
  findAndTypeWithDebugFallback,
  logDebugStep,
  debugPause
} = require('../../SHARED/utils/debug-helpers');
const config = require('./config.json');
const fs = require('fs');
const path = require('path');

// Vérifier périodiquement que la session est toujours active
async function validateSession(client, operationName = 'operation') {
  try {
    // Utiliser une commande simple pour vérifier si la session est active
    await client.execute('mobile: getDeviceTime');
    return true;
  } catch (error) {
    log(`Session lost during ${operationName}: ${error.message}`);
    return false;
  }
}

// Charger la configuration du profil
function loadProfileConfig() {
  try {
    const configPath = path.join(__dirname, '../../config/app/hinge-profile-config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    log('No profile config found, using defaults');
    return null;
  }
}

// Charger les prompts depuis le fichier
function loadPrompts() {
  try {
    const promptsPath = path.join(__dirname, '../../data/apps/hinge-prompts.json');
    const promptsData = fs.readFileSync(promptsPath, 'utf8');
    const data = JSON.parse(promptsData);

    // Sélectionner 3 prompts aléatoires
    const selectedPrompts = [];
    const availablePrompts = [...data.prompts];

    for (let i = 0; i < 3 && availablePrompts.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availablePrompts.length);
      const prompt = availablePrompts.splice(randomIndex, 1)[0];
      const randomAnswer = prompt.answers[Math.floor(Math.random() * prompt.answers.length)];

      selectedPrompts.push({
        prompt: prompt.question,
        answer: randomAnswer
      });
    }

    return selectedPrompts;
  } catch (error) {
    log('Error loading prompts:', error.message);
    return [];
  }
}

/**
 * Squelette d'automatisation pour Hinge.
 * À compléter avec les étapes UI précises dès réception.
 * @param {import('webdriverio').Browser} client
 * @param {Object} location - { city, state, lat, lon, ... }
 * @param {Object} phone - { number, id }
 * @param {Object} proxyInfo - { domain, port, username, password }
 */
async function runHingeApp(client, location, phone, proxyInfo, smsProvider = 'api21k', debugMode = false) {
  try {
    // Configurer le mode debug assisté
    const isDebugAssisted = debugMode === 'assisted' || process.env.DEBUG_ASSISTED === 'true';
    setDebugMode(debugMode, isDebugAssisted);

    if (isDebugAssisted) {
      log('\n' + '🔧'.repeat(20));
      log('MODE DEBUG ASSISTÉ ACTIVÉ');
      log('Le bot continuera même si des éléments ne sont pas trouvés');
      log('Vous pouvez intervenir manuellement si nécessaire');
      log('🔧'.repeat(20) + '\n');
    }

    // Fonctions wrapper pour choisir entre mode normal et debug assisté
    const clickElement = async (selector, waitTime = 5000) => {
      if (isDebugAssisted) {
        return await findAndClickWithDebugFallback(client, selector, { waitTime });
      } else {
        return await findAndClickWithPolling(client, selector, waitTime);
      }
    };

    const setValue = async (selector, value, waitTime = 5000) => {
      if (isDebugAssisted) {
        return await findAndSetValueWithDebugFallback(client, selector, value, { waitTime });
      } else {
        return await findAndSetValue(client, selector, value, waitTime);
      }
    };

    const typeText = async (text, isSecure = false) => {
      if (isDebugAssisted) {
        return await findAndTypeWithDebugFallback(client, text, isSecure);
      } else {
        return await findAndTypeCharByChar(client, text, isSecure);
      }
    };
    // Vérifier la session au début avec un retry
    let sessionValid = await validateSession(client, 'initial check');
    if (!sessionValid) {
      log('Session not ready, waiting 2 seconds and retrying...');
      await randomWait(2, 3);
      sessionValid = await validateSession(client, 'initial check');
      if (!sessionValid) {
        log('WARNING: WebDriver session might be unstable, continuing anyway...');
        // Ne pas throw, continuer l'exécution
      }
    }
    // Charger la configuration du profil
    const profileConfig = loadProfileConfig();
    const profile = profileConfig?.profileSettings || {};
    const behavior = profileConfig?.behaviorSettings || {};

    // Charger les prompts depuis le fichier dédié
    const prompts = loadPrompts();

    log('Starting Hinge Fast app session...');
    log(`Using profile: ${profile.firstName || 'Default'}`)
    log(`Loaded ${prompts.length} prompts from file`)

    // ==============================================================
    // HINGE FAST: Configuration rapide sans Crane
    // ==============================================================

    if (!await validateSession(client, 'HINGE FAST start')) {
      log('Session lost, attempting to continue anyway...');
    }

    // 1. PREMIER: Configurer Geranium pour la localisation
    log('Configuring Geranium for location...');
    const { setupGeraniumApp } = require('../../SHARED/ios-apps/geranium');
    try {
      await setupGeraniumApp(client, {
        lat: location?.latitude || location?.lat,
        lon: location?.longitude || location?.lon,
        city: location.city
      });
    } catch (geraniumError) {
      log(`Geranium configuration failed: ${geraniumError.message}`);
      // Continuer malgré l'erreur Geranium
    }

    // 2. ENSUITE configurer le proxy dans les Settings
    log('Opening Settings to configure Hinge proxy...');
    let settingsConfigured = false;

    try {
      await checkAndTerminateApp(client, 'com.apple.Preferences');
      await client.execute('mobile: launchApp', { bundleId: 'com.apple.Preferences' });
      await randomWait(2, 3); // Attendre que Settings soit bien chargé

      // Chercher et ouvrir hingePort dans les réglages avec protection
      try {
        await findAndClickWithPolling(client, '-ios predicate string:name == "hingePort"');
        await randomWait(1, 2);
      } catch (hingePortError) {
        log(`Could not open hingePort: ${hingePortError.message}`);
        // Essayer de continuer quand même
      }

      // Configurer Proxy String et MP Credentials avec les coordonnées
      const proxyString = `${proxyInfo.domain}:${proxyInfo.port}:${proxyInfo.username}:${proxyInfo.password}`;
      const mpCredential = `${proxyInfo.username}:${proxyInfo.password}`;

      log('Using coordinates-based approach for proxy configuration...');

      // Scroller plusieurs fois pour être sûr d'arriver en bas - NOUVELLE MÉTHODE
      try {
        log('Scrolling down to reach proxy fields using swipe method...');

        // On va utiliser mobile: swipe qui est plus stable - 5 swipes pour bien arriver en bas
        for (let i = 0; i < 5; i++) {
          try {
            log(`Swipe ${i + 1}/5...`);

            // Méthode 1: Utiliser mobile: swipe (plus simple)
            await client.execute('mobile: swipe', {
              direction: 'up',  // up pour scroller vers le bas
              velocity: 250
            });

            await randomWait(0.3, 0.5); // Délai réduit entre les swipes

            // Vérifier que la session est toujours active
            if (i < 4) {  // Pas besoin de vérifier après le dernier swipe
              try {
                await client.execute('mobile: getDeviceTime');
                log(`Session still active after swipe ${i + 1}`);
              } catch (sessionCheckError) {
                log(`Session might be unstable after swipe ${i + 1}, trying alternative method...`);

                // Méthode alternative: dragFromToForDuration
                try {
                  await client.execute('mobile: dragFromToForDuration', {
                    fromX: 200,
                    fromY: 600,
                    toX: 200,
                    toY: 200,
                    duration: 0.5
                  });
                  await randomWait(0.3, 0.5);
                } catch (dragError) {
                  log(`Alternative drag method also failed: ${dragError.message}`);
                  break;
                }
              }
            }
          } catch (swipeError) {
            log(`Swipe ${i + 1} failed: ${swipeError.message}`);
            // Essayer avec dragFromToForDuration comme fallback
            try {
              log(`Trying drag method as fallback for swipe ${i + 1}...`);
              await client.execute('mobile: dragFromToForDuration', {
                fromX: 200,
                fromY: 600,
                toX: 200,
                toY: 200,
                duration: 0.5
              });
              await randomWait(1, 1.5);
            } catch (dragError) {
              log(`Drag fallback also failed: ${dragError.message}`);
              break;
            }
          }
        }
      } catch (scrollError) {
        log('Scroll/swipe error, continuing anyway...');
      }

      // PROXY STRING - Utiliser la séquence de coordonnées avec protection try-catch
      try {
        log('Configuring Proxy String using coordinates...');

        // Clic 1: X:128 Y:375 - Premier clic sur le champ (MODIFIÉ)
        log('Click 1/4 at X:128 Y:375...');
        await client.execute('mobile: tap', { x: 128, y: 375 });
        await randomWait(0.2, 0.3);

        // Clic 2: X:345 Y:275 - Deuxième clic
        log('Click 2/4 at X:345 Y:275...');
        await client.execute('mobile: tap', { x: 345, y: 275 });
        await randomWait(0.2, 0.3);

        // Clic 3: X:342 Y:275 - Troisième clic (MODIFIÉ)
        log('Click 3/4 at X:342 Y:275...');
        await client.execute('mobile: tap', { x: 342, y: 275 });
        await randomWait(0.2, 0.3);

        // Clic 4: X:315 Y:230 - Position finale pour écrire (MODIFIÉ)
        log('Click 4/4 at X:315 Y:230 - Final position for typing...');
        await client.execute('mobile: tap', { x: 315, y: 230 });
        await randomWait(0.3, 0.5);

        // Écrire Proxy String directement
        log(`Writing proxy string: ${proxyString}`);
        await findAndTypeCharByChar(client, proxyString, true);
        await randomWait(0.5, 0.8);
        log('Proxy String configured successfully');
      } catch (proxyError) {
        log(`Proxy String configuration error: ${proxyError.message}`);
        // Continuer malgré l'erreur
      }

    // MP CREDENTIALS - Utiliser la séquence de coordonnées qui fonctionne
    log('Setting MP Credentials using coordinates...');

    try {
      // Clic 1: X:150 Y:230 - Premier clic sur le champ MP Credentials
      log('MP Click 1/4 at X:150 Y:230...');
      await client.execute('mobile: tap', { x: 150, y: 230 });
      await randomWait(0.2, 0.3);

      // Clic 2: X:345 Y:233 - Deuxième clic
      log('MP Click 2/4 at X:345 Y:233...');
      await client.execute('mobile: tap', { x: 345, y: 233 });
      await randomWait(0.2, 0.3);

      // Clic 3: X:335 Y:232 - Troisième clic
      log('MP Click 3/4 at X:341 Y:232...');
      await client.execute('mobile: tap', { x: 341, y: 232 });
      await randomWait(0.2, 0.3);

      // Clic 4: X:315 Y:190 - Position finale pour écrire
      log('MP Click 4/4 at X:315 Y:190 - Final position for typing...');
      await client.execute('mobile: tap', { x: 315, y: 190 });
      await randomWait(0.3, 0.5);

      // Écrire MP Credentials directement
      log(`Writing MP Credentials: ${mpCredential}`);
      await findAndTypeCharByChar(client, mpCredential, true);
      await randomWait(0.5, 0.8);
      log('MP Credentials configured successfully');
    } catch (mpError) {
      log(`MP Credentials configuration error: ${mpError.message}`);
      // Continuer même si MP Credentials échoue
    }

      await randomWait(1, 2);

      // Cliquer sur Settings pour revenir à la page principale
      log('Clicking on Settings to go back...');
      await findAndClickWithPolling(client, '-ios predicate string:name == "Settings"');
      await randomWait(2, 2.5);

      // Fermer les Réglages en douceur (pas kill)
      await client.execute('mobile: pressButton', { name: 'home' });
      log('Settings configured and closed gracefully');
      settingsConfigured = true;
    } catch (settingsError) {
      log(`Settings configuration error: ${settingsError.message}`);
      // Essayer de fermer Settings en cas d'erreur
      try { await client.execute('mobile: pressButton', { name: 'home' }); } catch {}
    }

    if (!settingsConfigured) {
      log('WARNING: Settings were not configured, continuing without proxy');
    }

    // 3. Configurer Shadowrocket
    try {
      // Vérifier la session
      if (!await validateSession(client, 'Shadowrocket configuration')) {
        log('Session might be unstable, continuing...');
      }
      log('Configuring Shadowrocket proxy...');
      const { configureShadowrocket } = require('../../SHARED/ios-apps/shadowrocket');
      await configureShadowrocket(client, proxyInfo, location.city);
    } catch (shadowrocketError) {
      log(`Shadowrocket configuration error: ${shadowrocketError.message}`);
    }

    // 5. Retour à l'écran d'accueil et création du conteneur
    try {
      // Vérifier la session
      if (!await validateSession(client, 'Container creation')) {
        log('Session might be unstable, continuing...');
      }
      log('Creating new container for Hinge...');

      // Aller à l'écran d'accueil
      await client.execute('mobile: pressButton', { name: 'home' });
      await randomWait(1, 2);

      // Appui long sur Hinge pour afficher le menu contextuel
      log('Long press on Hinge app...');
      const hingeAppSelector = '-ios predicate string:name == "Hinge" AND type == "XCUIElementTypeIcon"';
      const hingeElement = await client.$(hingeAppSelector);
      const elementId = await hingeElement.elementId;

      await client.execute('mobile: touchAndHold', {
        element: elementId,
        duration: 1.5
      });
      await randomWait(0.5, 1);

      // Cliquer sur "New Container"
      log('Creating new container...');
      await findAndClickWithPolling(client, '-ios predicate string:name == "New Container"');
      await randomWait(1, 2);

      // Nommer le conteneur avec le nom de la ville
      const containerName = location.city || 'Default';
      log(`Naming container: ${containerName}`);
      await findAndTypeCharByChar(client, containerName);
      await randomWait(0.5, 1);

      // Valider la création du conteneur avec le bouton Create
      await findAndClickWithPolling(client, '-ios predicate string:name == "Create"');
      await randomWait(2, 3);

      log('Container created successfully');
    } catch (containerError) {
      log(`Container creation error: ${containerError.message}`);
      // Continuer malgré l'erreur
    }

    // ==============================================================
    // FIN DES ÉTAPES HINGE FAST
    // ==============================================================

    // 5. Lancer Hinge dans le nouveau conteneur
    try {
      // Vérifier la session avant le lancement final
      if (!await validateSession(client, 'Hinge launch')) {
        log('Session might be unstable, attempting launch anyway...');
      }

      const bundleId = 'co.hinge.mobile.ios';
      await checkAndTerminateApp(client, bundleId);
      await client.execute('mobile: launchApp', { bundleId });
      log('Hinge app opened');
      await randomWait(2, 3);
    } catch (launchError) {
      log(`Hinge launch error: ${launchError.message}`);
      // Essayer de continuer malgré l'erreur
    }

    // Bouton Create account
    try {
      // Vérifier la session
      if (!await validateSession(client, 'Create account')) {
        log('Session might be unstable, continuing...');
      }

      // Use wrapper function that handles debug mode
      await clickElement(
        '-ios predicate string:name == "Create account" AND label == "Create account" AND value == "Create account"',
        8000
      );
      log('Clicked on Create account');
    } catch (e) {
      if (e.message && e.message.includes('Session does not exist')) {
        log('Session lost during Create account click');
        throw e;
      }
      log('Create account button not found immediately, retrying after short wait...');
      await randomWait(2, 3);
      try {
        await clickElement(
          '-ios predicate string:name == "Create account" AND label == "Create account" AND value == "Create account"',
          8000
        );
        log('Clicked on Create account (retry)');
      } catch (retryError) {
        log(`Failed to click Create account: ${retryError.message}`);
        throw retryError;
      }
    }
    
    // Entrer le numéro de téléphone
    await clickElement(
      '-ios predicate string:name == "phone number" AND label == "phone number" AND type == "XCUIElementTypeTextField"',
      5000
    );
    await typeText(phone?.number || '');
    log('Phone number entered');
    await randomWait(1, 2);
    await clickElement('-ios predicate string:name == "Next"', 5000);
    log('Clicked Next after phone');

    // Récupérer et entrer le code SMS
    const smsService = getSMSProvider(smsProvider);
    const code = await smsService.getCode(phone.id);
    await typeText(code);
    log('SMS code entered');
    await randomWait(1, 2);
    await clickElement('-ios predicate string:name == "Next"', 5000);
    log('Clicked Next after SMS code');

    // Basic info
    await findAndClickWithPolling(client, '-ios predicate string:name == "Enter basic info" AND label == "Enter basic info" AND type == "XCUIElementTypeButton"');
    const firstName = profile.firstName || 'Emma';
    await randomWait(1.5, 2); // Attendre plus longtemps pour que le champ soit bien prêt
    // Cliquer dans le champ avant de taper
    await client.pause(500);
    await findAndTypeCharByChar(client, firstName);
    log(`Entered first name: ${firstName}`);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // No thanks, puis email (depuis env ou fichier)
    await findAndClickWithPolling(client, '-ios predicate string:name == "No thanks" AND label == "No thanks" AND value == "No thanks"');

    // Obtenir l'email selon la méthode configurée
    let email;
    let quixService = null;

    const emailMethod = config.settings?.emailMethod || 'gmail';
    log(`Using email method: ${emailMethod}`);

    if (emailMethod === 'quix') {
      // Utiliser l'API Quix pour générer un email temporaire
      const quixApiKey = config.settings?.quixApiKey || process.env.QUIX_API_KEY;
      if (!quixApiKey) {
        throw new Error('Quix API key not configured. Add quixApiKey to config or set QUIX_API_KEY env variable');
      }
      quixService = new QuixEmailService(quixApiKey);
      email = await quixService.generateEmail();
      log(`Generated temporary email via Quix: ${email.substring(0, 5)}***@${email.split('@')[1]}`);
    } else {
      // Méthode Gmail traditionnelle
      email = process.env.HINGE_EMAIL;
      if (!email) {
        log('No email in env, using file system');
        const emailFilePath = path.join(__dirname, '../../data/resources/emails/hinge_emails.txt');
        email = await getAndRemoveEmail(emailFilePath);
      } else {
        log('Using email from environment variable');
      }
    }

    if (email) {
      await randomWait(1.5, 2); // Attendre plus longtemps pour que le champ soit bien prêt
      // Cliquer dans le champ avant de taper
      await client.pause(500);
      await findAndTypeCharByChar(client, email);
      log(`Entered email: ${email.substring(0, 3)}***`);
    } else {
      log('Warning: No email available');
    }
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // Code email - récupérer selon la méthode configurée
    if (email) {
      try {
        let verificationCode;

        if (emailMethod === 'quix' && quixService) {
          // Utiliser Quix pour récupérer le code
          log('Waiting for email verification code from Quix...');
          verificationCode = await quixService.getHingeCode(120000);
          log(`Received verification code from Quix: ${verificationCode}`);
        } else {
          // Méthode Gmail traditionnelle
          log('Waiting for email verification code from Gmail...');
          const gmailUser = process.env.GMAIL_IMAP_USER || 'lucas@lpplabs.io';
          const gmailPass = (process.env.GMAIL_IMAP_PASS || 'mxtiogiawujyffyy'); // sans espaces
          verificationCode = await waitForHingeCodeFromGmail({
            host: process.env.GMAIL_IMAP_HOST || 'imap.gmail.com',
            port: Number(process.env.GMAIL_IMAP_PORT || 993),
            secure: true,
            auth: { user: gmailUser, pass: gmailPass },
            timeoutMs: 120000,
          });
          log(`Received verification code from Gmail: ${verificationCode}`);
        }

        await randomWait(0.5, 1); // Attendre avant de taper le code
        await findAndTypeCharByChar(client, verificationCode);
        log('Entered email verification code');
      } catch (e) {
        log(`Email code not available (${e.message}), using placeholder 0000`);
        await randomWait(0.5, 1);
        await findAndTypeCharByChar(client, '0000');
      } finally {
        // Nettoyer le service Quix si utilisé
        if (quixService) {
          await quixService.cleanup().catch(err => log(`Quix cleanup error: ${err.message}`));
        }
      }
    } else {
      // Pas d'email, donc pas de code à attendre
      log('No email provided, skipping email verification');
      await randomWait(0.5, 1);
      await findAndTypeCharByChar(client, '0000');
    }
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // Date d'anniversaire basée sur la config
    const currentYear = new Date().getFullYear();
    const ageMin = profile.ageRange?.min || 22;
    const ageMax = profile.ageRange?.max || 26;
    const age = Math.floor(Math.random() * (ageMax - ageMin + 1)) + ageMin;
    let birthyear = (currentYear - age).toString();
    let birthmonth = (Math.floor(Math.random() * 12) + 1).toString();
    let birthdate = (Math.floor(Math.random() * 28) + 1).toString();
    if (birthmonth.length === 1) birthmonth = '0' + birthmonth;
    if (birthdate.length === 1) birthdate = '0' + birthdate;
    await findAndTypeCharByChar(client, birthmonth);
    await findAndTypeCharByChar(client, birthdate);
    await findAndTypeCharByChar(client, birthyear);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
    await findAndClickWithPolling(client, '-ios predicate string:name == "Confirm" AND label == "Confirm" AND value == "Confirm"');

    // Notifications / détails
    await findAndClickWithPolling(client, '-ios predicate string:name == "Disable notifications" AND label == "Disable notifications" AND value == "Disable notifications"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Not now" AND label == "Not now" AND value == "Not now"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Add more details" AND label == "Add more details" AND value == "Add more details"');

    // Locate me x2
    await findAndClickWithPolling(client, '-ios predicate string:name == "Locate me"');
    await findAndClickWithPolling(client, '-ios predicate string:name == "Locate me"');
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // Sélections par XPaths
    try { await (await client.$('//XCUIElementTypeTable/XCUIElementTypeCell[1]/XCUIElementTypeOther[2]')).click(); } catch {}
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    try { await (await client.$('//XCUIElementTypeTable/XCUIElementTypeCell[2]/XCUIElementTypeOther[5]')).click(); } catch {}
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    try { await (await client.$('//XCUIElementTypeTable/XCUIElementTypeCell[2]/XCUIElementTypeOther[3]')).click(); } catch {}
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    try { await (await client.$('//XCUIElementTypeTable/XCUIElementTypeCell[1]/XCUIElementTypeOther[2]')).click(); } catch {}
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Relations et monogamie (depuis config)
    const relationshipGoal = profile.relationshipGoal || 'Long-term relationship, open to short';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${relationshipGoal}"`);
    log(`Selected relationship goal: ${relationshipGoal}`);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
    await findAndClickWithPolling(client, '-ios predicate string:name == "Monogamy"');
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // Scroll containers aléatoires
    try {
      const xpaths = [
        '//XCUIElementTypeApplication[@name="Hinge"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeScrollView[2]',
        '//XCUIElementTypeApplication[@name="Hinge"]/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[2]/XCUIElementTypeScrollView[2]/XCUIElementTypeOther/XCUIElementTypeOther'
      ];
      const pick = xpaths[Math.floor(Math.random()*xpaths.length)];
      const el = await client.$(pick);
      if (el) await el.click();
    } catch {}
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Ethnicité depuis config
    const ethnicity = profile.ethnicity || 'White/Caucasian';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${ethnicity}"`, 3000, false);
    log(`Selected ethnicity: ${ethnicity}`);
    await findAndClickWithPolling(client, '-ios predicate string:name == "checked; Visible on profile"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Don\'t have children"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    const childrenPref = profile.childrenPreference || 'Open to children';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${childrenPref}"`, 3000, false);
    log(`Selected children preference: ${childrenPref}`);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Ville du proxy
    if (location?.city) {
      await findAndTypeCharByChar(client, location.city);
      await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    }

    // Chaîne de Next
    for (let i=0;i<3;i++) {
      await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    }
    await findAndClickWithPolling(client, '-ios predicate string:name == "Prefer not to say"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    const religion = profile.religion || 'Spiritual';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${religion}"`, 3000, false);
    log(`Selected religion: ${religion}`);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Prefer not to say"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Questions lifestyle depuis config
    // Drinking
    const drinking = profile.drinking || 'Sometimes';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${drinking}"`, 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Smoking
    const smoking = profile.smoking || 'No';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${smoking}"`, 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Cannabis
    const cannabis = profile.cannabis || 'No';
    await findAndClickWithPolling(client, `-ios predicate string:name == "${cannabis}"`, 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Drugs (toujours No)
    await findAndClickWithPolling(client, '-ios predicate string:name == "No"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Fill out your profile" AND label == "Fill out your profile" AND value == "Fill out your profile"', 3000, false);

    // Ajout de photos
    try {
      await (await client.$('//XCUIElementTypeCell[@name=" Add 1st photo. "]/XCUIElementTypeOther/XCUIElementTypeImage')).click();
      await findAndClickWithPolling(client, '-ios predicate string:name == "Browse photo library instead"');
      await randomWait(1, 2);
      await clickByCoordinates(client, 50, 200);
      await clickByCoordinates(client, 200, 200);
      await clickByCoordinates(client, 320, 200);
      await clickByCoordinates(client, 50, 350);
      await clickByCoordinates(client, 200, 350);
      await clickByCoordinates(client, 320, 350);
      await findAndClickWithPolling(client, '-ios predicate string:name == "Add"');
      for (let i=0;i<5;i++) await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
      await findAndClickWithPolling(client, '-ios predicate string:name == "Done"', 3000, false);
      await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
      await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    } catch {}

    // Prompts configurables
    if (prompts && prompts.length > 0) {
      // Prompt 1
      try {
        await findAndClickWithPolling(client, '-ios predicate string:name == "Missing prompt 1. Select a Prompt and write your own answer."', 3000, false);
        if (prompts[0]) {
          const prompt1Xpath = `(//XCUIElementTypeStaticText[@name="${prompts[0].prompt}"])[1]`;
          const el1 = await client.$(prompt1Xpath);
          if (el1) await el1.click();
          await randomWait(1, 2);
          await findAndTypeCharByChar(client, prompts[0].answer);
          log(`Added prompt 1: ${prompts[0].prompt}`);
          await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
        }
      } catch (e) {
        log('Error setting prompt 1:', e.message);
      }

      // Prompt 2
      try {
        await findAndClickWithPolling(client, '-ios predicate string:name == "Missing prompt 2. Select a Prompt and write your own answer."', 3000, false);
        if (prompts[1]) {
          const prompt2Xpath = `(//XCUIElementTypeStaticText[@name="${prompts[1].prompt}"])[1]`;
          const el2 = await client.$(prompt2Xpath);
          if (el2) await el2.click();
          await randomWait(1, 2);
          await findAndTypeCharByChar(client, prompts[1].answer);
          log(`Added prompt 2: ${prompts[1].prompt}`);
          await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
        }
      } catch (e) {
        log('Error setting prompt 2:', e.message);
      }

      // Prompt 3
      try {
        await findAndClickWithPolling(client, '-ios predicate string:name == "Missing prompt 3. Select a Prompt and write your own answer."', 3000, false);
        if (prompts[2]) {
          const prompt3Xpath = `(//XCUIElementTypeStaticText[@name="${prompts[2].prompt}"])[1]`;
          const el3 = await client.$(prompt3Xpath);
          if (el3) await el3.click();
          await randomWait(1, 2);
          await findAndTypeCharByChar(client, prompts[2].answer);
          log(`Added prompt 3: ${prompts[2].prompt}`);
          await findAndClickWithPolling(client, '-ios predicate string:name == "Done"', 3000, false);
        }
      } catch (e) {
        log('Error setting prompt 3:', e.message);
      }
    } else {
      // Fallback si pas de config
      try {
        await findAndClickWithPolling(client, '-ios predicate string:name == "Missing prompt 1. Select a Prompt and write your own answer."', 3000, false);
        const promptXpaths = [
          '(//XCUIElementTypeStaticText[@name="Typical Sunday"])[1]',
          '(//XCUIElementTypeStaticText[@name="My simple pleasures"])[1]'
        ];
        const pick = promptXpaths[Math.floor(Math.random()*promptXpaths.length)];
        const el = await client.$(pick);
        if (el) await el.click();
      } catch {}
    }

    return true;
  } catch (e) {
    log(`Error during Hinge app session: ${e.message}`, e);
    return false;
  }
}

module.exports = {
  runHingeApp,
};

