const TELEGRAM_BOT_TOKEN = '7919681998:AAGoIELBmDV3Jlv28yvl4p4_0zJ0VK9aAF0';
const TELEGRAM_USER_ID = '825977330';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

/**
 * Envoie un message Telegram à l'utilisateur défini.
 * @param {string} message - Le message à envoyer.
 * @returns {Promise<void>}
 */
async function sendTelegramMessage(message) {
    try {
        const response = await fetch(TELEGRAM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_USER_ID,
                text: message,
            }),
        });
        const data = await response.json();
        if (!data.ok) {
            console.error('Erreur lors de l\'envoi du message Telegram:', data);
        } else {
            console.log('Message Telegram envoyé avec succès.');
        }
    } catch (error) {
        console.error('Erreur lors de la requête Telegram:', error);
    }
}

module.exports = { sendTelegramMessage };
