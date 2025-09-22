const fs = require('fs').promises;
const path = require('path');

/**
 * Charge tous les emails depuis un fichier texte (un email par ligne)
 * @param {string} filePath - Chemin du fichier texte
 * @returns {Promise<string[]>} - Tableau d'emails
 */
const loadEmails = async (filePath) => {
    try {
        const absPath = path.resolve(filePath);
        const data = await fs.readFile(absPath, 'utf-8');
        return data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Fichier inexistant
            return [];
        }
        throw error;
    }
};

/**
 * Sauvegarde la liste d'emails dans le fichier texte (un email par ligne)
 * @param {string[]} emails - Tableau d'emails
 * @param {string} filePath - Chemin du fichier texte
 * @returns {Promise<void>}
 */
const saveEmails = async (emails, filePath) => {
    const absPath = path.resolve(filePath);
    const data = emails.join('\n');
    await fs.writeFile(absPath, data, 'utf-8');
};

/**
 * Récupère et supprime le premier email du fichier, puis le retourne
 * @param {string} filePath - Chemin du fichier texte
 * @returns {Promise<string|null>} - L'email récupéré, ou null si aucun email
 */
const getAndRemoveEmail = async (filePath) => {
    const emails = await loadEmails(filePath);
    if (emails.length === 0) {
        return null;
    }
    const email = emails.shift();
    await saveEmails(emails, filePath);
    return email;
};

module.exports = {
    loadEmails,
    saveEmails,
    getAndRemoveEmail
};