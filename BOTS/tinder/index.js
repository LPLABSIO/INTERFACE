const { log, findAndClickWithPolling, clickByCoordinates, findAndTypeCharByChar, randomWait, waitForElementNotPresent, checkAndTerminateApp } = require('../../SHARED/utils/utils');
const { getSMSProvider } = require('../../SHARED/sms-providers/sms-provider');
const EmailManager = require('../../SHARED/email-manager/EmailManager');
const { closeBlazeXApp } = require('./blazex');

async function swipeRight(client) {
    await client.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: 100, y: 400 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerMove', duration: 600, x: 265, y: 400 },
            { type: 'pointerUp', button: 0 }
        ]
    }]);
}

async function swipeLeft(client) {
    await client.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: 265, y: 400 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerMove', duration: 600, x: 100, y: 400 },
            { type: 'pointerUp', button: 0 }
        ]
    }]);
}

async function scrollDown(client) {
    log('Performing 40% scroll down...');
    const { width, height } = await client.getWindowSize();
    const startY = height * 0.8;
    const endY = height * 0.4;
    await client.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: width / 2, y: startY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerMove', duration: 600, x: width / 2, y: endY },
            { type: 'pointerUp', button: 0 }
        ]
    }]);
    log('Scroll completed');
}

async function checkForMatches(client) {
    try {
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeButton[`name == "close_button"`]', 3000);
        await randomWait(3, 5);
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeButton[`name == "close_button"`]', 3000);
        log('Match detected, closing it');
        return true;
    } catch (error) {
        log('Match not detected');
    }
    return false;
}

async function checkForDoubleMatch(client) {
    try {
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeButton[`name == "close_button"`]', 3000);
        await randomWait(3, 5);
        await findAndClickWithPolling(client, '-ios predicate string:name == "Maybe later"', 3000, false);
        log('Maybe later button clicked');
        return true;
    } catch (error) {
        log('Match not detected');
    }
    return false;
}


async function checkForCaptcha(client) {
    let captchaDetectedOnce = false;

    while (true) {
        try {
            await findAndClickWithPolling(client, `-ios predicate string:name == "Let's verify you're a human"`, 1000);
            log('Captcha detected, waiting before rechecking...');

            captchaDetectedOnce = true;

            // Attente aléatoire entre 30 et 60 secondes
            await randomWait(30, 60);
        } catch (error) {
            // Si on ne trouve pas le captcha, on sort de la boucle
            log('No captcha detected anymore.');
            break;
        }
    }

    if (captchaDetectedOnce) {
        log('Captcha was present earlier. Restarting Tinder app once...');
        await checkAndTerminateApp(client, 'com.cardify.tinder');
        await client.execute('mobile: launchApp', { bundleId: 'com.cardify.tinder' });
        log('Tinder app re-opened after captcha.');
        await randomWait(10, 15);

        // Dismiss modal
        try {
            await findAndClickWithPolling(client, '-ios predicate string:name == "Dismiss"', 1000);
            log('Dismiss button clicked');
            await randomWait(5, 10);
        } catch (error) {
            log('Dismiss button not found');
        }
    }
}


async function clickWithRetryOnPopup(client, targetSelector, popupSelector = `-ios predicate string:name == "Okay"`) {
    const startTime = Date.now();
    const timeout = 2 * 60 * 1000; // 2 minutes max

    while (true) {
        try {
            // Essayer de cliquer sur le bouton cible
            await findAndClickWithPolling(client, targetSelector);
            log(`Clicked target: ${targetSelector}`);

            // Vérifier si la popup est toujours là
            const popupStillThere = await client.$(popupSelector);
            //if (popupStillThere) {
            //    log(await popupStillThere.isExisting())
            //    log(await popupStillThere.isDisplayed())
            //    log(await popupStillThere.isEnabled())
            //}
            if (popupStillThere && await popupStillThere.isDisplayed()) {
                log('Popup "Ok" still present after click, retrying...');
                throw new Error('Popup still there');
            }

            log("Form was sent");
            // Succès : on sort
            break;
        } catch (error) {
            const now = Date.now();
            if (now - startTime > timeout) {
                throw new Error('Popup still there');
            }

            // Si la popup est visible, cliquer dessus
            try {
                const popup = await client.$(popupSelector);
                if (popup && await popup.isDisplayed()) {
                    await popup.click();
                    log('Clicked on "Okay" popup');
                    await randomWait(1, 2);
                }
            } catch (_) {
                // Ignore si la popup a disparu entre-temps
            }

            // Attendre un peu avant de réessayer
            await randomWait(10, 20);
        }
    }
}


async function runTinderApp(client, phone, proxyInfo) {
    try {
        log('Starting Tinder app session...');

        // Cliquer sur le bouton "Create account"
        await findAndClickWithPolling(client, '-ios predicate string:name == "create_account_button"');
        log('Create account button clicked');

        // Sélectionner le code pays US +1
        //await findAndClickWithPolling(client, '-ios predicate string:name == "Country Code US +1"');
        //log('Country Code US +1 clicked');
        //await randomWait(1, 2);

        // Sélectionner le pays UK
        //await findAndSetValue(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[2]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[1]/XCUIElementTypeOther[1]/XCUIElementTypeOther', 'United Kingdom');
        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "United Kingdom"`]');
        //log('United Kingdom clicked');

        log(`Got phone number: ${phone.number}`);
        log(`Got activation ID: ${phone.id}`);

        // Entrer le numéro de téléphone
        await findAndTypeCharByChar(
            client,
            phone.number
        );
        log('Phone number set');
        await randomWait(15, 20);

        // Cliquer sur le bouton "Suivant"
        await clickWithRetryOnPopup(client, '-ios predicate string:name == "continue_button"');
        log('Next button clicked');
        await randomWait(5, 10);

        // Be sure the number is valid
        try {
            await findAndClickWithPolling(client, '-ios predicate string:name == "Invalid phone number"', 1000);
            log('Invalid phone number')
            await closeBlazeXApp(client, proxyInfo, null, false, false);
            return true;
        } catch { }

        // Attendre et obtenir le code de vérification
        log('Waiting for verification code...');
        const smsService = getSMSProvider('daisysms');
        const code = await smsService.getCode(phone.id);
        log(`Got verification code: ${code}`);

        // Here put number one by one
        await findAndTypeCharByChar(
            client,
            code
        );
        log('Phone number code set');
        await randomWait(15, 20);

        // Cliquer sur le bouton "Suivant"
        await clickWithRetryOnPopup(client, '-ios predicate string:name == "continueButton"');
        log('Next button clicked');
        await randomWait(5, 10);

        const email = await getAndRemoveEmail('email_tinder.txt');
        await findAndTypeCharByChar(
            client,
            email
        );
        log('Email set');
        await randomWait(12, 18);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "SKIP"');
        log('Ignore button clicked');
        await randomWait(5, 7);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "I agree"');
        log('I agree button clicked');
        await randomWait(5, 7);

        const firstName = "Chloe";
        await findAndTypeCharByChar(
            client,
            firstName
        );
        log('Prénom set');
        await randomWait(8, 12);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('OK button clicked');
        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await clickWithRetryOnPopup(client, `-ios predicate string:name == "Let's go"`);
        log(`C'est parti button clicked`);
        await randomWait(5, 7);

        // Here generate random birthdate
        let birthdate = (Math.floor(Math.random() * 28) + 1).toString();
        let birthmonth = (Math.floor(Math.random() * 12) + 1).toString();
        let birthyear = (Math.floor(Math.random() * 6) + 1999).toString();

        // I should add a 0 in front of the birthmonth if it's less than 10
        if (birthmonth.length === 1) {
            birthmonth = '0' + birthmonth;
        }
        if (birthdate.length === 1) {
            birthdate = '0' + birthdate;
        }

        log(birthmonth);
        await findAndTypeCharByChar(
            client,
            birthmonth
        );
        await randomWait(2, 5);

        log(birthdate);
        await findAndTypeCharByChar(
            client,
            birthdate
        );
        await randomWait(2, 5);

        log(birthyear);
        await findAndTypeCharByChar(
            client,
            birthyear
        );
        await randomWait(15, 20);
        log('Birthdate set');

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Woman"');
        log('Femme button clicked');
        await randomWait(5, 7);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Straight"');
        log('Hétéro button clicked');
        await randomWait(5, 7);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Men"');
        log('Des hommes button clicked');
        await randomWait(5, 7);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Long-term, open to short"');
        log('Long terme, OK pour court button clicked');
        await randomWait(5, 7);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Skip"');
        log('Pass button clicked');
        await randomWait(5, 7);

        const drinking_frequency = ["On special occasions", "Socially on weekends"]
        const randomIndex = Math.floor(Math.random() * drinking_frequency.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + drinking_frequency[randomIndex] + '"');
        log(drinking_frequency[randomIndex] + ' button clicked');
        await randomWait(3, 5);

        // Click on the random index
        await findAndClickWithPolling(client, '-ios predicate string:name == "Non-smoker"');
        log('Non-fumeur button clicked');
        await randomWait(3, 5);

        await scrollDown(client);
        await randomWait(2, 3);

        const sport_frequency = ["Everyday", "Often", "Sometimes"]
        const randomSportFrequencyIndex = Math.floor(Math.random() * sport_frequency.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + sport_frequency[randomSportFrequencyIndex] + '"');
        log(sport_frequency[randomSportFrequencyIndex] + ' button clicked');
        await randomWait(3, 5);

        const animals = ["Dog", "Cat", "Fish", "Rabbit", "Want a pet", "All the pets"]
        const randomAnimalsIndex = Math.floor(Math.random() * animals.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + animals[randomAnimalsIndex] + '"');
        log(animals[randomAnimalsIndex] + ' button clicked');
        await randomWait(3, 5);

        await clickWithRetryOnPopup(client, '-ios predicate string:name CONTAINS "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        const communicationWay = ["Bad texter", "Better in person"];
        const randomCommunicationWayIndex = Math.floor(Math.random() * communicationWay.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + communicationWay[randomCommunicationWayIndex] + '"');
        log(communicationWay[randomCommunicationWayIndex] + ' button clicked');
        await randomWait(3, 5);

        const loveWay = ["Presents", "Touch"];
        const randomLoveWayIndex = Math.floor(Math.random() * loveWay.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + loveWay[randomLoveWayIndex] + '"');
        log(loveWay[randomLoveWayIndex] + ' button clicked');
        await randomWait(3, 5);

        await scrollDown(client);
        await randomWait(2, 3);

        const schoolLevel = ["Masters", "PhD"];
        const randomSchoolLevelIndex = Math.floor(Math.random() * schoolLevel.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + schoolLevel[randomSchoolLevelIndex] + '"');
        log(schoolLevel[randomSchoolLevelIndex] + ' button clicked');
        await randomWait(3, 5);

        const astroSigne = ["Capricorn", "Cancer", "Leo", "Virgo"];
        const randomAstroSigneIndex = Math.floor(Math.random() * astroSigne.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + astroSigne[randomAstroSigneIndex] + '"');
        log(astroSigne[randomAstroSigneIndex] + ' button clicked');
        await randomWait(3, 5);

        await clickWithRetryOnPopup(client, '-ios predicate string:name CONTAINS "Next"');
        log('Next button clicked');
        await randomWait(5, 7);

        const activities_1 = ["Acapella", "Art", "Blogging", "Choir"];
        const randomActivities_1Index = Math.floor(Math.random() * activities_1.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_1[randomActivities_1Index] + '" AND label == "' + activities_1[randomActivities_1Index] + '"  AND value == "' + activities_1[randomActivities_1Index] + '"');
        log(activities_1[randomActivities_1Index] + ' button clicked');
        await randomWait(3, 5);

        const activities_2 = ["90s Kid", "Comic-con", "Disney"];
        const randomActivities_2Index = Math.floor(Math.random() * activities_2.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_2[randomActivities_2Index] + '" AND label == "' + activities_2[randomActivities_2Index] + '"  AND value == "' + activities_2[randomActivities_2Index] + '"');
        log(activities_2[randomActivities_2Index] + ' button clicked');
        await randomWait(3, 5);

        await scrollDown(client);
        await randomWait(2, 3);

        const activities_3 = ["Coffee", "Craft Beer", "Food tours", "Foodie"];
        const randomActivities_3Index = Math.floor(Math.random() * activities_3.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_3[randomActivities_3Index] + '" AND label == "' + activities_3[randomActivities_3Index] + '"  AND value == "' + activities_3[randomActivities_3Index] + '"');
        log(activities_3[randomActivities_3Index] + ' button clicked');
        await randomWait(3, 5);

        const activities_4 = ["Nintendo", "PlayStation"];
        const randomActivities_4Index = Math.floor(Math.random() * activities_4.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_4[randomActivities_4Index] + '" AND label == "' + activities_4[randomActivities_4Index] + '"  AND value == "' + activities_4[randomActivities_4Index] + '"');
        log(activities_4[randomActivities_4Index] + ' button clicked');
        await randomWait(3, 5);

        const activities_5 = ["Aquarium", "Art galleries", "Bar Hopping", "Bars"];
        const randomActivities_5Index = Math.floor(Math.random() * activities_5.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_5[randomActivities_5Index] + '" AND label == "' + activities_5[randomActivities_5Index] + '"  AND value == "' + activities_5[randomActivities_5Index] + '"');
        log(activities_5[randomActivities_5Index] + ' button clicked');
        await randomWait(3, 5);

        await scrollDown(client);
        await randomWait(2, 3);

        const activities_6 = ["Alternative music", "Country Music", "Electronic Music", "Folk music"];
        const randomActivities_6Index = Math.floor(Math.random() * activities_6.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_6[randomActivities_6Index] + '" AND label == "' + activities_6[randomActivities_6Index] + '"  AND value == "' + activities_6[randomActivities_6Index] + '"');
        log(activities_6[randomActivities_6Index] + ' button clicked');
        await randomWait(5, 10);

        const activities_7 = ["Backpacking", "Beach Bars", "Camping"];
        const randomActivities_7Index = Math.floor(Math.random() * activities_7.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_7[randomActivities_7Index] + '" AND label == "' + activities_7[randomActivities_7Index] + '"  AND value == "' + activities_7[randomActivities_7Index] + '"');
        log(activities_7[randomActivities_7Index] + ' button clicked');
        await randomWait(5, 10);

        const activities_8 = ["Instagram", "Memes", "Netflix"];
        const randomActivities_8Index = Math.floor(Math.random() * activities_8.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_8[randomActivities_8Index] + '" AND label == "' + activities_8[randomActivities_8Index] + '"  AND value == "' + activities_8[randomActivities_8Index] + '"');
        log(activities_8[randomActivities_8Index] + ' button clicked');
        await randomWait(5, 10);

        await scrollDown(client);
        await randomWait(2, 3);

        const activities_9 = ["Archery", "Athletics", "Badminton"];
        const randomActivities_9Index = Math.floor(Math.random() * activities_9.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_9[randomActivities_9Index] + '" AND label == "' + activities_9[randomActivities_9Index] + '"  AND value == "' + activities_9[randomActivities_9Index] + '"');
        log(activities_9[randomActivities_9Index] + ' button clicked');
        await randomWait(5, 10);

        const activities_10 = ["Baking", "Cooking"];
        const randomActivities_10Index = Math.floor(Math.random() * activities_10.length);
        await findAndClickWithPolling(client, '-ios predicate string:name == "' + activities_10[randomActivities_10Index] + '" AND label == "' + activities_10[randomActivities_10Index] + '"  AND value == "' + activities_10[randomActivities_10Index] + '"');
        log(activities_10[randomActivities_10Index] + ' button clicked');
        await randomWait(5, 10);

        await clickWithRetryOnPopup(client, '-ios predicate string:name CONTAINS "Next"');
        log('Next button clicked');
        await randomWait(5, 12);

        // Problem here ?
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeScrollView/XCUIElementTypeOther[1]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeCollectionView/XCUIElementTypeCell[1]/XCUIElementTypeOther/XCUIElementTypeOther[2]');
        log('Add picture button clicked');
        await randomWait(5, 12);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Gallery"');
        log('Gallery button clicked');
        await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios predicate string:name == "Select More Photos…"');
        //log('Select More Photos... button clicked');
        //await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "PXGGridLayout-Info"`][1]');
        //log('Photo 1 selected');
        //await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "PXGGridLayout-Info"`][2]');
        //log('Photo 2 selected');
        //await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "PXGGridLayout-Info"`][3]');
        //log('Photo 3 selected');
        //await randomWait(5, 12);

        // Pourquoi ça ne marche pas certaines fois ?
        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "PXGGridLayout-Info"`][4]');
        //log('Photo 4 selected');
        //await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios predicate string:name == "Update"');
        //log('Done button clicked');
        //await randomWait(5, 12);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Recents"');
        log('Recents button clicked');
        await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[3]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeCollectionView/XCUIElementTypeCell[1]/XCUIElementTypeImage');
        //log('First picture button clicked');
        //await randomWait(5, 12);
        //
        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[3]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeCollectionView/XCUIElementTypeCell[2]/XCUIElementTypeImage');
        //log('Second picture button clicked');
        //await randomWait(5, 12);
        //
        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[3]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeCollectionView/XCUIElementTypeCell[3]/XCUIElementTypeImage');
        //log('Third picture button clicked');
        //await randomWait(5, 12);

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[1]/XCUIElementTypeOther[3]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeCollectionView/XCUIElementTypeCell[4]/XCUIElementTypeImage');
        //log('Fourth picture button clicked');
        //await randomWait(20, 30);

        await clickByCoordinates(client, 50, 140);
        log('First picture button clicked');
        await randomWait(5, 12);

        await clickByCoordinates(client, 150, 440);
        log('Second picture button clicked');
        await randomWait(5, 12);

        await clickByCoordinates(client, 250, 440);
        log('Third picture button clicked');
        await randomWait(5, 12);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('OK button clicked');
        await randomWait(10, 20);

        await clickWithRetryOnPopup(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(50, 60);

        //try {
        //    await findAndClickWithPolling(client, '-ios predicate string:name == "Allow"', 1000);
        //    log('Allow button clicked');
        //    await randomWait(15, 20);
        //} catch (error) {
        //    log('Allow button not found');
        //}
        //try {
        //    await findAndClickWithPolling(client, '-ios predicate string:name == "Allow While Using App"', 1000);
        //    log('Allow While Using App button clicked');
        //    await randomWait(30, 30);
        //} catch (error) {
        //    log('Allow While Using App button not found');
        //}
        //try {
        //    await findAndClickWithPolling(client, `-ios predicate string:name == "I'll miss out"`, 1000);
        //    log('I\'ll miss out button clicked');
        //    await randomWait(5, 12);
        //} catch (error) {
        //    log('I\'ll miss out button not found');
        //}

        await waitForElementNotPresent(client, '-ios predicate string:name == "notification_banner"');
        log('Notification not present');
        await findAndClickWithPolling(client, '-ios predicate string:name == "close"', 3000, false);
        log('Close button clicked');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Maybe later"', 3000, false);
        log('Maybe later button clicked');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        // Only for UK
        //await findAndClickWithPolling(client, '-ios predicate string:name == "I Accept"');
        //log('I Accept button clicked');
        //await randomWait(5, 12);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Start tutorial"', 3000, false);
        log('Start tutorial button clicked');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await swipeRight(client);
        log('Swipe right completed');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, `-ios predicate string:name == "Let's go"`, 3000, false);
        log(`C'est parti button clicked`);
        await randomWait(5, 10);
        await checkForCaptcha(client);

        let had_a_match = false;

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeRight(client);
        log('Swipe right completed');
        await checkForDoubleMatch(client);
        had_a_match = await checkForMatches(client);
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Explore Page"', 3000, false);
        log('Explore Page button clicked');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await scrollDown(client);
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Discovery"', 3000, false);
        log('Discovery button clicked');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Home"', 3000, false);
        log('Home button clicked');
        await randomWait(2, 5);
        await checkForCaptcha(client);


        await findAndClickWithPolling(client, '-ios predicate string:name == "Complete profile" AND label == "Complete profile" AND type == "XCUIElementTypeButton"', 3000, false);
        log('Complete profile button clicked');
        await randomWait(10, 15);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Height"', 3000, false);
        log('Height button clicked');
        await randomWait(10, 15);
        await checkForCaptcha(client);
        await findAndClickWithPolling(client, '-ios predicate string:name == "Height"', 3000, false);
        log('Height button clicked');
        await randomWait(10, 15);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done" AND label == "Done" AND value == "Done"', 3000, false);
        log('Done button clicked');
        await randomWait(5, 10);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"', 3000, false);
        log('Done button clicked');
        await randomWait(3, 5);
        await checkForCaptcha(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Discovery"', 3000, false);
        log('Discovery button clicked');
        await randomWait(3, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        // name == "NewMatchList"
        await findAndClickWithPolling(client, '-ios predicate string:name == "NewMatchList"', 3000, false);
        log('NewMatchList button clicked');
        await randomWait(3, 5);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
        log('Next button clicked');
        await randomWait(2, 3);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"', 3000, false);
        log('Next button clicked');
        await randomWait(2, 3);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Got it"', 3000, false);
        log('Got it button clicked');
        await randomWait(2, 3);

        let current_likes = 0;

        try {
            const goldButton = await client.$('-ios class chain:**/XCUIElementTypeButton[`name == "Gold"`]');
            const goldButtonLabel = await goldButton.getAttribute('label');
            if (goldButtonLabel && goldButtonLabel.includes('Likes,')) {
                log(`Nombre de likes: ${goldButtonLabel.split(' ')[1]}`);
                current_likes = parseInt(goldButtonLabel.split(' ')[1]);
            } else {
                log(`No likes found`);
            }
        } catch (error) {
            log('Gold button not found');
            log(error);
        }

        // Here start complementary method to be sure the account is not sb
        await findAndClickWithPolling(client, '-ios predicate string:name == "Discovery"', 3000, false);
        log('Discovery button clicked');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeLeft(client);
        log('Swipe left completed');
        await randomWait(2, 5);
        await checkForCaptcha(client);

        await swipeRight(client);
        log('Swipe right completed');
        await checkForDoubleMatch(client);
        had_a_match = await checkForMatches(client);
        await randomWait(2, 5);
        await checkForCaptcha(client);

        // Restart tinder app
        await checkAndTerminateApp(client, 'com.cardify.tinder');
        await client.execute('mobile: launchApp', { bundleId: 'com.cardify.tinder' });
        log('Tinder app re opened');
        await randomWait(10, 15);

        // Here check if the account is logged out
        try {
            await findAndClickWithPolling(client, '-ios predicate string:name == "tagline_promo_view"', 1000);
            log('Account logged out')
            await closeBlazeXApp(client, proxyInfo, null, true, false);
            return true;
        } catch { }

        // Dismiss modal
        try {
            await findAndClickWithPolling(client, '-ios predicate string:name == "Dismiss"', 1000);
            log('Dismiss button clicked');
            await randomWait(5, 10);
        } catch (error) {
            log('Dismiss button not found');
        }

        await checkForCaptcha(client);

        const max_execution_minutes = 5;
        const start_time = Date.now();

        while (current_likes < 15) {
            // Check if max execution time is reached
            if (Date.now() - start_time > max_execution_minutes * 60 * 1000) {
                log('Max execution time reached');
                break;
            }
            await swipeLeft(client);
            log('Swipe left completed');
            await randomWait(2, 5);
            await checkForCaptcha(client);

            await swipeRight(client);
            log('Swipe right completed');
            await checkForDoubleMatch(client);
            await randomWait(2, 5);
            await checkForCaptcha(client);

            had_a_match = await checkForMatches(client);

            await swipeLeft(client);
            log('Swipe left completed');
            await randomWait(2, 5);
            await checkForCaptcha(client);

            await swipeLeft(client);
            log('Swipe left completed');
            await randomWait(2, 5);
            await checkForCaptcha(client);

            await findAndClickWithPolling(client, '-ios predicate string:name == "Gold"', 3000, false);
            log('Gold button clicked');

            // Faire un swipe de x 200 y 320 vers x 200 y 650 pour refresh
            await client.performActions([
                {
                    type: 'pointer',
                    id: 'finger1',
                    parameters: { pointerType: 'touch' },
                    actions: [
                        {
                            type: 'pointerMove',
                            duration: 500,
                            x: 200,
                            y: 320
                        },
                        {
                            type: 'pointerMove',
                            duration: 500,
                            x: 200,
                            y: 830
                        },
                        {
                            type: 'pointerUp'
                        }
                    ]
                }
            ]);
            await randomWait(5, 10);
            await checkForCaptcha(client);

            await findAndClickWithPolling(client, '-ios predicate string:name == "Discovery"', 3000, false);
            log('Discovery button clicked');
            await randomWait(5, 10);
            await checkForCaptcha(client);

            try {
                const goldButton = await client.$('-ios class chain:**/XCUIElementTypeButton[`name == "Gold"`]');
                const goldButtonLabel = await goldButton.getAttribute('label');
                if (goldButtonLabel && goldButtonLabel.includes('Likes,')) {
                    log(`Nombre de likes: ${goldButtonLabel.split(' ')[1]}`);
                    current_likes = parseInt(goldButtonLabel.split(' ')[1]);
                } else {
                    log(`No likes found`);
                }
            } catch (error) {
                log('Gold button not found');
                log(error);
            }
        }

        if (had_a_match == false) {
            // Change discovery range
            await findAndClickWithPolling(client, '-ios predicate string:name == "Discovery Settings"', 3000, false);
            log('Slider button clicked');
            await randomWait(5, 10);
            await checkForCaptcha(client);

            await client.performActions([
                {
                    type: 'pointer',
                    id: 'finger1',
                    parameters: { pointerType: 'touch' },
                    actions: [
                        {
                            type: 'pointerMove',
                            duration: 500,
                            x: 185,
                            y: 235
                        },
                        {
                            type: 'pointerMove',
                            duration: 500,
                            x: 200,
                            y: 235
                        },
                        {
                            type: 'pointerUp'
                        }
                    ]
                }
            ]);
            log('Distance range edited');
            await randomWait(3, 5);
            await checkForCaptcha(client);

            await findAndClickWithPolling(client, '-ios predicate string:name == "Done"', 3000, false);
            log('Done button clicked');
            await randomWait(3, 5);
            await checkForCaptcha(client);

            await swipeLeft(client);
            log('Swipe left completed');
            await randomWait(2, 5);
            await checkForCaptcha(client);

            await swipeRight(client);
            log('Swipe right completed');
            await checkForDoubleMatch(client);
            await randomWait(2, 5);
            await checkForCaptcha(client);

            had_a_match = await checkForMatches(client);
            await randomWait(2, 5);
        }

        // Close the BlazeX app
        await closeBlazeXApp(client, proxyInfo, { current_likes: current_likes, had_a_match: had_a_match }, true, true);

        return true;
    } catch (tinderError) {
        log(`Error during Tinder app session: ${tinderError.message}`, tinderError);
        await closeBlazeXApp(client, proxyInfo, null, false, false);
        return false;
    }
}

module.exports = {
    runTinderApp
};