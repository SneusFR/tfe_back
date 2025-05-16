// src/flow/flowLogWrapper.js
import bareLogger from './flowLogger.js';   // le logger d'origine (avec *toutes* les méthodes)
import logPersist from './logPersist.js';  // les méthodes enrichies & persistance Mongo

// On crée un proxy qui commence par le logger d'origine
// puis écrase/étend avec les méthodes de persistance
const merged = { ...bareLogger, ...logPersist };

export default merged;       // ← c'est celui-là qu'on importe partout
export { bareLogger as flowLogCore }; // (optionnel) accès direct au logger "sec" si besoin
