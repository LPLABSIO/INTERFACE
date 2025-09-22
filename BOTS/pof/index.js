const { log, findAndClickWithPolling, findAndSetValue, findAndTypeCharByChar, randomWait, waitForElementNotPresent, checkAndTerminateApp } = require('../../SHARED/utils/utils');
const { getSMSProvider } = require('../../SHARED/sms-providers/sms-provider');
const EmailManager = require('../../SHARED/email-manager/EmailManager');

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


async function runPofApp(client, location) {
    try {
        log('Starting PoF app session...');

        // Vérifier et terminer l'application Tinder si elle est en cours d'exécution
        await checkAndTerminateApp(client, 'com.pof.mobileapp.iphone');
        // Open the Tinder app
        const pofIcon = await client.$('-ios predicate string:type == "XCUIElementTypeIcon" AND name CONTAINS "Plenty of Fish"');
        await client.execute('mobile: touchAndHold', { element: pofIcon.elementId, duration: 0.1 });
        log('PoF app opened');

        await findAndClickWithPolling(client, '-ios predicate string:name == "' + location.city + '"');
        log('Container button clicked');
        await randomWait(5, 10);

        // Cliquer sur le bouton "Create account"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Create account"');
        log('Create account button clicked');
        await randomWait(5, 10);

        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField"', "Emily");
        await randomWait(5, 10);

        // name == "Let's go" AND label == "Let's go" AND value == "Let's go"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Let\'s go"');
        log('Let\'s go button clicked');
        await randomWait(5, 10);

        // name == "optionLabel" AND label == "Woman"
        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Woman"');
        log('Woman button clicked');
        await randomWait(5, 10);

        // name == "Next" AND label == "Next" AND value == "Next"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        // name == "optionLabel" AND label == "Woman"
        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Mixed"');
        log('Mixed button clicked');
        await randomWait(5, 10);

        // name == "Next" AND label == "Next" AND value == "Next"
        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "datePlaceholder"');
        log('Date placeholder clicked');
        await randomWait(5, 10);

        // Here generate random birthdate
        let birthdate = (Math.floor(Math.random() * 28) + 1).toString();
        let birthmonth = (Math.floor(Math.random() * 12) + 1);
        let birthyear = (Math.floor(Math.random() * 6) + 1995).toString();

        // Convert month number to month name
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const selectedMonth = monthNames[birthmonth - 1]; // -1 because array is 0-indexed

        // Handle birth date with picker wheels
        log(`Setting birth date: ${selectedMonth} ${birthdate}, ${birthyear}`);

        const monthWheel = await client.$('-ios predicate string:type == "XCUIElementTypePickerWheel"');
        await monthWheel.setValue(selectedMonth);
        log(`Month wheel set to: ${selectedMonth}`);
        await randomWait(5, 10);

        const dayWheel = await client.$$('-ios predicate string:type == "XCUIElementTypePickerWheel"')[1];
        await dayWheel.setValue(birthdate.toString());
        log(`Day wheel set to: ${birthdate}`);
        await randomWait(5, 10);

        // Sélectionner l'année
        const yearWheel = await client.$$('-ios predicate string:type == "XCUIElementTypePickerWheel"')[2];
        await yearWheel.setValue(birthyear.toString());
        log(`Year wheel set to: ${birthyear}`);
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('Done button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "dropdownValue"');
        log('Select button clicked');
        await randomWait(3, 2);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "🇺🇸  United States"`][1]');
        log('Select button clicked');
        await randomWait(3, 2);

        // name == "dropdownValue" AND label == "Select"
        await findAndClickWithPolling(client, '-ios predicate string:name == "dropdownValue" AND label == "Select"');
        log('Select button clicked');
        await randomWait(5, 10);

        // click on location.state
        try {
            await findAndClickWithPolling(client, '-ios predicate string:name == "' + location.state + '"');
            log('State button clicked');
        } catch (error) { }
        try {
            await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "' + location.state + '"`]');
            log('State button clicked');
        } catch (error) { }

        await randomWait(3, 2);

        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField" AND value == "City"', location.city);
        log('City set');
        await randomWait(5, 10);

        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField" AND value == "Postal / Zip"', location.zip_code);
        log('Postal / ZIP set');
        await randomWait(5, 10);

        // Here the input field is still focused, so we need to click outside to unfocus in order to click on next button
        await findAndClickWithPolling(client, '-ios predicate string:name == "Return"');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        const email = await getAndRemoveEmail('email_pof.txt');
        log(email);
        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField"', email);
        log('Email set');
        await randomWait(15, 20);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Return"');
        log('Return button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        const randomLetters = Array.from({ length: 5 }, () =>
            String.fromCharCode(97 + Math.floor(Math.random() * 26))
        ).join('');
        const username = "emily" + randomLetters;
        const password = "Emily1234.";

        // name == "listItemTextField" AND value == "Username"
        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField" AND value == "Username"', username);
        log('Username set');
        await randomWait(5, 10);

        // name == "listItemTextField" AND value == "Password"
        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField" AND value == "Password"', password);
        log('Password set');
        await randomWait(5, 10);

        // name == "listItemTextField" AND value == "Confirm password"
        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField" AND value == "Confirm password"', password);
        log('Confirm password set');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Return"');
        log('Return button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Let\'s go"');
        log('Let\'s go button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Men"');
        log('Men button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Just dating - nothing serious"');
        log('Just dating - nothing serious button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Yes"');
        log('Yes button clicked');
        await randomWait(5, 10);

        await scrollDown(client);
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][11]');
        log('Yes button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField" AND value == "Occupation"', "Premed");
        log('Occupation set');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Return"');
        log('Return button clicked');

        // Random between 1 and 0 to determine if the user has a bachelor's degree
        const hasBachelorDegree = Math.random() > 0.5;
        if (hasBachelorDegree) {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Bachelor\'s degree"');
            log('Bachelor\'s degree button clicked');
        } else {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Some university"');
            log('Some university button clicked');
        }
        await randomWait(5, 10);

        const slider_ambitious = await client.$('-ios class chain:**/XCUIElementTypeSlider[`name == "listItemSlider"`]');
        await slider_ambitious.setValue(0.2);
        log('Slider set to 0.2 (first value to the right)');
        await randomWait(5, 10);

        await scrollDown(client);

        // Random between 1 and 0
        const income = Math.random() > 0.5;
        if (income) {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Under 25,000"');
            log('Under 25,000 button clicked');
        } else {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "25,001 to 35,000"');
            log('25,001 to 35,000 button clicked');
        }
        await randomWait(5, 10);

        // Random between 1 and 0
        const religion = Math.random() > 0.5;
        if (religion) {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Catholic"');
            log('Catholic button clicked');
        } else {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Christian - other"');
            log('Christian - other button clicked');
        }
        await randomWait(5, 10);

        await scrollDown(client);

        // Random between 1 and 0
        const sndlanguage = Math.random() > 0.5;
        if (sndlanguage) {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "None"');
            log('None button clicked');
        } else {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Spanish"');
            log('Spanish button clicked');
        }
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Single"');
        log('Single button clicked');
        await randomWait(5, 10);

        const slider_relationship = await client.$('-ios class chain:**/XCUIElementTypeSlider[`name == "listItemSlider"`]');
        await slider_relationship.setValue(0.2);
        log('Slider set to 0.2 (first value to the right)');
        await randomWait(5, 10);

        await scrollDown(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Brown"');
        log('Brown button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Black "');
        log('Black button clicked');
        await randomWait(5, 10);

        await scrollDown(client);

        const slider_height = await client.$('-ios class chain:**/XCUIElementTypeSlider[`name == "listItemSlider"`]');
        await slider_height.setValue(0.2);
        log('Slider set to 0.2 (first value to the right)');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Thin"');
        log('Thin button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        // Random between 1 and 0 to determine if the user has a bachelor's degree
        const personnality_type = Math.random() > 0.5;
        if (personnality_type) {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Animal lover"');
            log('Bachelor\'s degree button clicked');
        } else {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Hopeless romantic"');
            log('Some university button clicked');
        }
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "No"');
        log('No button clicked');
        await randomWait(5, 10);

        await scrollDown(client);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][7]');
        log('No button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][10]');
        log('No button clicked');
        await randomWait(5, 10);

        const vehicle_ownership = Math.random() > 0.5;
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][' + (vehicle_ownership ? '14' : '15') + ']');
        log('Vehicle ownership button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][1]');
        log('No button clicked');
        await randomWait(5, 10);

        const want_children = Math.random() > 0.5;
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][' + (want_children ? '5' : '6') + ']');
        log('Want children button clicked');
        await randomWait(5, 10);

        const have_pets = Math.random() > 0.5;
        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeStaticText[`name == "optionLabel"`][' + (have_pets ? '9' : '10') + ']');
        log('Have pets button clicked');
        await randomWait(5, 10);

        await scrollDown(client);
        await scrollDown(client);

        // Random between 1 and 0
        const parents_status = Math.random() > 0.5;
        if (parents_status) {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Still married"');
            log('Still married button clicked');
        } else {
            await findAndClickWithPolling(client, '-ios predicate string:name == "optionLabel" AND label == "Divorced"');
            log('Divorced button clicked');
        }
        await randomWait(5, 10);

        const slider_sibling = await client.$('-ios class chain:**/XCUIElementTypeSlider[`name == "listItemSlider"`]');
        await slider_sibling.setValue(0.2);
        log('Slider set to 0.2 (first value to the right)');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[`name == "birthOrderImage"`][1]');
        log('Birth order image clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        const bio = require('./bio.json');
        const randomBio = bio[Math.floor(Math.random() * bio.length)];
        await findAndSetValue(client, '-ios predicate string:name == "listItemTextField"', randomBio);
        log('Random bio set');
        await randomWait(20, 30);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Return"');
        log('Return button clicked');
        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        const about = require('./about.json');
        const randomAbout = about[Math.floor(Math.random() * about.length)];
        log(randomAbout);
        await findAndSetValue(client, '-ios predicate string:name == "This could be your hobbies, dreams, nightmares, anything"', randomAbout);
        log('About set');
        await randomWait(20, 30);

        // Click on coordinates
        await client.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: 200, y: 400 },
                    { type: 'pointerDown', button: 0 },
                ]
            }
        ]);
        log('Coordinates clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        const final_touches = require('./final_touches.json');
        const randomFinalTouches = final_touches[Math.floor(Math.random() * final_touches.length)];
        await findAndSetValue(client, '-ios predicate string:name == "As long as it’s not crossfit. Jokes."', randomFinalTouches);
        log('Final touches set');
        await randomWait(20, 30);

        // Click on coordinates
        await client.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: 200, y: 400 },
                    { type: 'pointerDown', button: 0 },
                ]
            }
        ]);
        log('Coordinates clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        // Load 3 interests randomly from the interests.json file
        const interests = require('./interests.json');
        const randomInterests = interests.slice(0, 3);
        await findAndSetValue(client, '-ios predicate string:value == "Add an interest"', randomInterests.join(', '));
        log('Interests set');
        await randomWait(10, 15);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Return"');
        log('Return button clicked');
        await randomWait(10, 15);

        // Click on coordinates
        await client.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: 200, y: 400 },
                    { type: 'pointerDown', button: 0 },
                ]
            }
        ]);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Okay"');
        log('Okay button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Allow While Using App"');
        log('Allow While Using App button clicked');
        await randomWait(5, 10);

        // Get the appropriate SMS provider service
        const smsService = getSMSProvider('daisysms');

        // Obtenir un numéro de téléphone via smsProvider
        log(`Getting phone number from daisysms...`);
        const { number, id } = await smsService.rentNumber(location.area_code ? location.area_code : null, "vz,att", "pf");
        log(`Got phone number: ${number}`);
        log(`Got activation ID: ${id}`);

        await findAndSetValue(client, '-ios predicate string:value == "555-555-5555"', number);
        log('Phone number set');
        await randomWait(15, 20);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Send code"');
        log('Send code button clicked');
        await randomWait(5, 10);

        // Attendre et obtenir le code de vérification
        log('Waiting for verification code...');
        const code = await smsService.getCode(id);
        log(`Got verification code: ${code}`);

        await findAndTypeCharByChar(
            client,
            code
        );
        log('Phone number code set');
        await randomWait(15, 20);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Verify"');
        log('Verify button clicked');
        await randomWait(5, 10);

        await scrollDown(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Upload from device"');
        log('Upload from device button clicked');
        await randomWait(5, 10);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeWindow[`name == "mainPOFWindow"`]/XCUIElementTypeOther[2]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther[1]/XCUIElementTypeOther[1]');
        log('Upload first picture clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add photo"');
        log('Add photo button clicked');

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[1]');
        log('Photo 1 selected');
        await randomWait(20, 30);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('Done button clicked');
        await randomWait(10, 20);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeButton[`name == "plus icon large active"`][1]');
        log('Upload second picture clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add photo"');
        log('Add photo button clicked');

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[2]');
        log('Photo 2 selected');
        await randomWait(20, 30);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('Done button clicked');
        await randomWait(10, 20);

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeButton[`name == "plus icon large active"`][2]');
        log('Upload third picture clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Add photo"');
        log('Add photo button clicked');

        await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[3]');
        log('Photo 3 selected');
        await randomWait(20, 30);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        log('Done button clicked');
        await randomWait(10, 20);

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeButton[`name == "plus icon large active"`][1]');
        //log('Upload fourth picture clicked');

        //await findAndClickWithPolling(client, '-ios predicate string:name == "Add photo"');
        //log('Add photo button clicked');

        //await findAndClickWithPolling(client, '-ios class chain:**/XCUIElementTypeImage[4]');
        //log('Photo 4 selected');
        //await randomWait(20, 30);

        //await findAndClickWithPolling(client, '-ios predicate string:name == "Done"');
        //log('Done button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "Next"');
        log('Next button clicked');

        await scrollDown(client);

        await findAndClickWithPolling(client, '-ios predicate string:name == "Got it"');
        log('Got it button clicked');

        await findAndClickWithPolling(client, '-ios predicate string:name == "No thanks"');
        log('No thanks button clicked');

        return true;
    } catch (tinderError) {
        log(`Error during Tinder app session: ${tinderError.message}`, tinderError);
        return false;
    }
}

module.exports = {
    runPofApp
};