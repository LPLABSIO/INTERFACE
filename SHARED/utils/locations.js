const turf = require('@turf/turf');
const fs = require('fs');
const csvParser = require('csv-parser');
const { format } = require('@fast-csv/format');
const { log } = require('./utils');

/**
 * Génère un point aléatoire dans un rayon de 300 mètres autour d'un point donné
 */
function getRandomPointInRadius(latitude, longitude, radiusInMeters = 500) {
    // Créer un point à partir des coordonnées données
    const center = turf.point([parseFloat(longitude), parseFloat(latitude)]);

    // Créer un cercle de 300m autour du point
    const circle = turf.circle(center, radiusInMeters / 1000); // turf utilise des kilomètres

    // Générer un point aléatoire dans ce cercle
    const point = randomPointInPolygon(circle);

    return point;
}

/**
 * Génère un point aléatoire dans un polygone avec turf
 */
function randomPointInPolygon(polygon) {
    let point;
    let tries = 0;

    do {
        point = turf.randomPoint(1, { bbox: turf.bbox(polygon) }).features[0];
        tries++;
    } while (!turf.booleanPointInPolygon(point, polygon) && tries < 50);

    if (turf.booleanPointInPolygon(point, polygon)) {
        return {
            latitude: point.geometry.coordinates[1].toFixed(7),
            longitude: point.geometry.coordinates[0].toFixed(7)
        };
    }

    throw new Error('Impossible de générer un point dans ce polygone après 50 essais.');
}

/**
 * Fonction principale - Maintenant génère un point aléatoire dans un rayon de 300m
 */
async function getRandomLocationInCity(latitude, longitude) {
    try {
        log(`→ Génération d'un point aléatoire dans un rayon de 300m autour de [${latitude}, ${longitude}]...`);

        const point = getRandomPointInRadius(latitude, longitude);

        log(`Coordonnée aléatoire générée:`, point);
        return point;
    } catch (err) {
        console.error('Erreur :', err.message);
        throw err; // Propager l'erreur pour la gérer dans l'application
    }
}

async function loadLocations(locationsPath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(locationsPath)
            .pipe(csvParser())
            .on('data', (data) => results.push(data))
            .on('error', (error) => reject(error))
            .on('end', () => {
                log(`Successfully loaded ${results.length} locations from CSV`);
                resolve(results);
            });
    });
}

async function saveLocations(cityToRemove, locationsPath) {
    try {
        // Charger toutes les locations
        const locations = await loadLocations(locationsPath);

        // Filtrer la ville à supprimer
        const updatedLocations = locations.filter(loc => loc.city !== cityToRemove);

        // Créer le writer stream
        const writeStream = format({ headers: true });
        const fileStream = fs.createWriteStream(locationsPath);

        return new Promise((resolve, reject) => {
            writeStream.pipe(fileStream)
                .on('error', reject)
                .on('finish', () => {
                    log(`Successfully saved ${updatedLocations.length} locations to CSV after removing ${cityToRemove}`);
                    resolve(updatedLocations);
                });

            // Écrire chaque location
            for (const location of updatedLocations) {
                writeStream.write(location);
            }

            writeStream.end();
        });
    } catch (error) {
        console.error(`Error saving locations to CSV: ${error.message}`);
        throw error;
    }
}

module.exports = {
    getRandomLocationInCity,
    loadLocations,
    saveLocations
};
