const { log, randomWait } = require('./utils');

/**
 * Mode Debug Assisté - Permet l'intervention manuelle si un élément n'est pas trouvé
 */

let debugMode = false;
let assistedMode = false;

/**
 * Configure le mode debug
 */
function setDebugMode(isDebug, isAssisted = false) {
  debugMode = isDebug;
  assistedMode = isAssisted;
  if (assistedMode) {
    log('🔧 DEBUG ASSISTÉ activé - Le bot continuera en cas d\'erreur pour permettre l\'intervention manuelle');
  }
}

/**
 * Wrapper pour findAndClickWithPolling avec mode debug assisté
 */
async function findAndClickWithDebugFallback(client, selector, options = {}) {
  const maxRetries = assistedMode ? 10 : 1; // En mode assisté, on réessaye plus longtemps
  const waitTime = options.waitTime || 5000;
  const throwError = options.throwError !== undefined ? options.throwError : true;
  const retryInterval = options.retryInterval || 10000; // 10 secondes entre les tentatives

  // En mode debug assisté, on ne lance jamais d'erreur
  const shouldThrow = assistedMode ? false : throwError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Importer dynamiquement pour éviter les dépendances circulaires
    const { findAndClickWithPolling } = require('./utils');

    // Appeler findAndClickWithPolling qui retourne true/false sans lancer d'erreur
    const clicked = await findAndClickWithPolling(client, selector, waitTime, false);

    if (clicked) {
      if (attempt > 1) {
        log(`✅ Élément trouvé après intervention manuelle (tentative ${attempt})`);
      }
      return true;
    }

    // L'élément n'a pas été trouvé
    if (!assistedMode && throwError) {
      throw new Error(`Element not clickable after ${waitTime}ms: ${selector}`);
    }

    // En mode assisté, on affiche les messages et on pause
    log(`⚠️ DEBUG ASSISTÉ - Élément non trouvé: ${selector}`);
    log(`   → Tentative ${attempt}/${maxRetries}`);
    log(`   → Vous pouvez intervenir manuellement`);
    log(`   → Le bot réessayera dans ${retryInterval/1000} secondes...`);

    if (attempt < maxRetries) {
      // Attendre avant de réessayer
      await randomWait(retryInterval/1000, retryInterval/1000 + 2);
      log(`   → Nouvelle tentative...`);
    } else {
      log(`⏭️ DEBUG ASSISTÉ - Passage à l'étape suivante après ${maxRetries} tentatives`);
      return false; // On continue le flow sans bloquer
    }
  }

  return false;
}

/**
 * Wrapper pour findAndSetValue avec mode debug assisté
 */
async function findAndSetValueWithDebugFallback(client, selector, value, options = {}) {
  const maxRetries = assistedMode ? 10 : 1;
  const waitTime = options.waitTime || 5000;
  const retryInterval = options.retryInterval || 10000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { findAndSetValue } = require('./utils');
      await findAndSetValue(client, selector, value, waitTime);
      if (attempt > 1) {
        log(`✅ Champ rempli après intervention manuelle (tentative ${attempt})`);
      }
      return true;
    } catch (error) {
      if (!assistedMode) {
        throw error;
      }

      log(`⚠️ DEBUG ASSISTÉ - Champ non trouvé: ${selector}`);
      log(`   → Tentative ${attempt}/${maxRetries}`);
      log(`   → Valeur à entrer: ${value.substring(0, 20)}...`);
      log(`   → Vous pouvez remplir le champ manuellement`);
      log(`   → Le bot réessayera dans ${retryInterval/1000} secondes...`);

      if (attempt < maxRetries) {
        await randomWait(retryInterval/1000, retryInterval/1000 + 2);
        log(`   → Nouvelle tentative...`);
      } else {
        log(`⏭️ DEBUG ASSISTÉ - Passage à l'étape suivante après ${maxRetries} tentatives`);
        return false;
      }
    }
  }

  return false;
}

/**
 * Wrapper pour findAndTypeCharByChar avec mode debug assisté
 */
async function findAndTypeWithDebugFallback(client, text, isSecure = false, options = {}) {
  const maxRetries = assistedMode ? 10 : 1;
  const retryInterval = options.retryInterval || 10000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { findAndTypeCharByChar } = require('./utils');
      await findAndTypeCharByChar(client, text, isSecure);
      if (attempt > 1) {
        log(`✅ Texte saisi après intervention manuelle (tentative ${attempt})`);
      }
      return true;
    } catch (error) {
      if (!assistedMode) {
        throw error;
      }

      log(`⚠️ DEBUG ASSISTÉ - Impossible de saisir le texte`);
      log(`   → Tentative ${attempt}/${maxRetries}`);
      if (!isSecure) {
        log(`   → Texte à saisir: ${text.substring(0, 20)}...`);
      }
      log(`   → Vous pouvez saisir le texte manuellement`);
      log(`   → Le bot réessayera dans ${retryInterval/1000} secondes...`);

      if (attempt < maxRetries) {
        await randomWait(retryInterval/1000, retryInterval/1000 + 2);
        log(`   → Nouvelle tentative...`);
      } else {
        log(`⏭️ DEBUG ASSISTÉ - Passage à l'étape suivante après ${maxRetries} tentatives`);
        return false;
      }
    }
  }

  return false;
}

/**
 * Vérifie si on peut continuer (l'utilisateur a peut-être déjà changé d'écran)
 */
async function checkIfCanProceed(client, expectedElements = []) {
  if (!assistedMode || expectedElements.length === 0) {
    return false;
  }

  try {
    // Vérifier si un des éléments attendus est présent
    for (const selector of expectedElements) {
      try {
        const element = await client.$(selector);
        if (await element.isDisplayed()) {
          log(`✅ Détection automatique: L'utilisateur semble avoir complété l'action`);
          return true;
        }
      } catch (e) {
        // Élément non trouvé, continuer
      }
    }
  } catch (error) {
    // Erreur lors de la vérification
  }

  return false;
}

/**
 * Log une étape importante en mode debug assisté
 */
function logDebugStep(stepName, details = '') {
  if (assistedMode) {
    log(`\n${'='.repeat(50)}`);
    log(`🔧 ÉTAPE: ${stepName}`);
    if (details) {
      log(`   ${details}`);
    }
    log(`${'='.repeat(50)}\n`);
  } else {
    log(`${stepName}${details ? ': ' + details : ''}`);
  }
}

/**
 * Pause interactive en mode debug assisté
 */
async function debugPause(message = 'Pause pour intervention manuelle', duration = 5) {
  if (assistedMode) {
    log(`\n⏸️  ${message}`);
    log(`   → Reprise dans ${duration} secondes...`);
    await randomWait(duration, duration + 1);
  }
}

module.exports = {
  setDebugMode,
  findAndClickWithDebugFallback,
  findAndSetValueWithDebugFallback,
  findAndTypeWithDebugFallback,
  checkIfCanProceed,
  logDebugStep,
  debugPause
};