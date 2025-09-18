const { log, findAndClickWithPolling, findAndSetValue, randomWait, checkAndTerminateApp, findAndTypeCharByChar, waitForElementNotPresent, clickByCoordinates } = require('./utils');
const { getSMSProvider } = require('./sms-provider');
const { getAndRemoveEmail } = require('./email');
const { waitForHingeCodeFromGmail } = require('./email-inbox');

/**
 * Squelette d'automatisation pour Hinge.
 * À compléter avec les étapes UI précises dès réception.
 * @param {import('webdriverio').Browser} client
 * @param {Object} location - { city, state, lat, lon, ... }
 * @param {Object} phone - { number, id }
 * @param {Object} proxyInfo - { domain, port, username, password }
 */
async function runHingeApp(client, location, phone, proxyInfo) {
  try {
    log('Starting Hinge app session...');

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
    const smsService = getSMSProvider('api21k');
    const code = await smsService.getCode(phone.id);
    await findAndTypeCharByChar(client, code);
    log('SMS code entered');
    await randomWait(1, 2);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
    log('Clicked Next after SMS code');

    // Basic info
    await findAndClickWithPolling(client, '-ios predicate string:name == "Enter basic info" AND label == "Enter basic info" AND type == "XCUIElementTypeButton"');
    await findAndTypeCharByChar(client, 'Chloe');
    log('Entered first name');
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // No thanks, puis email (depuis env ou fichier)
    await findAndClickWithPolling(client, '-ios predicate string:name == "No thanks" AND label == "No thanks" AND value == "No thanks"');

    // Utiliser l'email depuis l'environnement si disponible, sinon fallback sur l'ancien système
    let email = process.env.HINGE_EMAIL;
    if (!email) {
      log('No email in env, using file system');
      email = await getAndRemoveEmail('email_hinge.txt');
    } else {
      log('Using email from environment variable');
    }

    if (email) {
      await findAndTypeCharByChar(client, email);
      log(`Entered email: ${email.substring(0, 3)}***`);
    } else {
      log('Warning: No email available');
    }
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
    // Code email via Gmail (fallback 0000 si indispo)
    try {
      const gmailUser = process.env.GMAIL_IMAP_USER || 'lucas@lpplabs.io';
      const gmailPass = (process.env.GMAIL_IMAP_PASS || 'mxtiogiawujyffyy'); // sans espaces
      const gmailCode = await waitForHingeCodeFromGmail({
        host: process.env.GMAIL_IMAP_HOST || 'imap.gmail.com',
        port: Number(process.env.GMAIL_IMAP_PORT || 993),
        secure: true,
        auth: { user: gmailUser, pass: gmailPass },
        timeoutMs: 120000,
      });
      await findAndTypeCharByChar(client, gmailCode);
      log('Entered email verification code from Gmail');
    } catch (e) {
      log(`Email code not available from Gmail (${e.message}), using placeholder 0000`);
      await findAndTypeCharByChar(client, '0000');
    }
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');

    // Date d'anniversaire (similaire Tinder)
    let birthdate = (Math.floor(Math.random() * 28) + 1).toString();
    let birthmonth = (Math.floor(Math.random() * 12) + 1).toString();
    let birthyear = (Math.floor(Math.random() * 6) + 1999).toString();
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

    // Relations et monogamie
    const relations = ['Long-term relationship, open to short','Short-term relationship, open to long','Short-term relationship'];
    await findAndClickWithPolling(client, `-ios predicate string:name == "${relations[Math.floor(Math.random()*relations.length)]}"`);
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

    // Ethnicité / enfants
    await findAndClickWithPolling(client, '-ios predicate string:name == "Hispanic/Latino"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "checked; Visible on profile"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Don\'t have children"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    const children = ['Open to children','Want children','Not sure'];
    await findAndClickWithPolling(client, `-ios predicate string:name == "${children[Math.floor(Math.random()*children.length)]}"`, 3000, false);
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
    await findAndClickWithPolling(client, '-ios predicate string:name == "Catholic"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Prefer not to say"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);

    // Questions Yes/Sometimes/No
    const yns = ['Yes','Sometimes','No'];
    for (let i=0;i<2;i++) {
      await findAndClickWithPolling(client, `-ios predicate string:name == "${yns[Math.floor(Math.random()*yns.length)]}"`, 3000, false);
      await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
    }
    await findAndClickWithPolling(client, '-ios predicate string:name == "No"', 3000, false);
    await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
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

    // Missing prompt 1
    try {
      await findAndClickWithPolling(client, '-ios predicate string:name == "Missing prompt 1. Select a Prompt and write your own answer."', 3000, false);
      const promptXpaths = [
        '(//XCUIElementTypeStaticText[@name="Typical Sunday"])[1]',
        '(//XCUIElementTypeStaticText[@name="A random fact I love is"])[1]',
        '(//XCUIElementTypeStaticText[@name="I recently discovered that"])[1]',
        '(//XCUIElementTypeStaticText[@name="A life goal of mine"])[1]',
        '(//XCUIElementTypeStaticText[@name="My simple pleasures"])[1]',
        '(//XCUIElementTypeStaticText[@name="My most irrational fear"])[1]'
      ];
      const pick = promptXpaths[Math.floor(Math.random()*promptXpaths.length)];
      const el = await client.$(pick);
      if (el) await el.click();
    } catch {}

    return true;
  } catch (e) {
    log(`Error during Hinge app session: ${e.message}`, e);
    return false;
  }
}

module.exports = {
  runHingeApp,
};

