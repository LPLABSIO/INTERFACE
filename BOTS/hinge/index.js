const { log, findAndClickWithPolling, findAndSetValue, randomWait, checkAndTerminateApp, findAndTypeCharByChar, waitForElementNotPresent, clickByCoordinates } = require('../../SHARED/utils/utils');
const { getSMSProvider } = require('../../SHARED/sms-providers/sms-provider');
const EmailManager = require('../../SHARED/email-manager/EmailManager');
const { getAndRemoveEmail } = require('../../SHARED/email-manager/email');
const { waitForHingeCodeFromGmail } = require('../../SHARED/email-manager/email-inbox');
const config = require('./config.json');
const fs = require('fs');
const path = require('path');

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
async function runHingeApp(client, location, phone, proxyInfo, smsProvider = 'api21k') {
  try {
    // Charger la configuration du profil
    const profileConfig = loadProfileConfig();
    const profile = profileConfig?.profileSettings || {};
    const behavior = profileConfig?.behaviorSettings || {};

    // Charger les prompts depuis le fichier dédié
    const prompts = loadPrompts();

    log('Starting Hinge app session...');
    log(`Using profile: ${profile.firstName || 'Default'}`)
    log(`Loaded ${prompts.length} prompts from file`)

    // Placeholder: fermer si déjà ouverte puis ouvrir Hinge (bundleId à confirmer)
    const bundleId = 'co.hinge.mobile.ios';
    await checkAndTerminateApp(client, bundleId);
    await client.execute('mobile: launchApp', { bundleId });
    log('Hinge app opened');
    await randomWait(2, 3);

    // Bouton Create account
    try {
      await findAndClickWithPolling(
        client,
        '-ios predicate string:name == "Create account" AND label == "Create account" AND value == "Create account"'
      );
      log('Clicked on Create account');
    } catch (e) {
      log('Create account button not found immediately, retrying after short wait...');
      await randomWait(2, 3);
      await findAndClickWithPolling(
        client,
        '-ios predicate string:name == "Create account" AND label == "Create account" AND value == "Create account"'
      );
      log('Clicked on Create account (retry)');
    }
    
    // Entrer le numéro de téléphone
    await findAndClickWithPolling(
      client,
      '-ios predicate string:name == "phone number" AND label == "phone number" AND type == "XCUIElementTypeTextField"'
    );
    await findAndTypeCharByChar(client, phone?.number || '');
    log('Phone number entered');
    await randomWait(1, 2);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
    log('Clicked Next after phone');

    // Récupérer et entrer le code SMS
    const smsService = getSMSProvider(smsProvider);
    const code = await smsService.getCode(phone.id);
    await findAndTypeCharByChar(client, code);
    log('SMS code entered');
    await randomWait(1, 2);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
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

    // Utiliser l'email depuis l'environnement si disponible, sinon fallback sur l'ancien système
    let email = process.env.HINGE_EMAIL;
    if (!email) {
      log('No email in env, using file system');
      const emailFilePath = path.join(__dirname, '../../data/resources/emails/hinge_emails.txt');
      email = await getAndRemoveEmail(emailFilePath);
    } else {
      log('Using email from environment variable');
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

    // Code email via Gmail - attendre le vrai code
    if (email) {
      try {
        log('Waiting for email verification code from Gmail...');
        const gmailUser = process.env.GMAIL_IMAP_USER || 'lucas@lpplabs.io';
        const gmailPass = (process.env.GMAIL_IMAP_PASS || 'mxtiogiawujyffyy'); // sans espaces
        const gmailCode = await waitForHingeCodeFromGmail({
          host: process.env.GMAIL_IMAP_HOST || 'imap.gmail.com',
          port: Number(process.env.GMAIL_IMAP_PORT || 993),
          secure: true,
          auth: { user: gmailUser, pass: gmailPass },
          timeoutMs: 120000,
        });
        await randomWait(0.5, 1); // Attendre avant de taper le code
        await findAndTypeCharByChar(client, gmailCode);
        log('Entered email verification code from Gmail');
      } catch (e) {
        log(`Email code not available from Gmail (${e.message}), using placeholder 0000`);
        await randomWait(0.5, 1);
        await findAndTypeCharByChar(client, '0000');
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

