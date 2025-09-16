// Script de test pour vérifier l'affichage des logs
console.log("🚀 Démarrage du test de logs...");

let counter = 0;
const interval = setInterval(() => {
    counter++;
    console.log(`[Test ${counter}] Message de test numéro ${counter}`);

    if (counter >= 10) {
        console.log("✅ Test terminé avec succès!");
        clearInterval(interval);
        process.exit(0);
    }
}, 1000);