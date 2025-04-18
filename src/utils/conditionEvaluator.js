/**
 * Utilitaire pour évaluer des expressions conditionnelles
 * Utilise une approche simple basée sur Function pour évaluer des expressions JavaScript
 * Note: Dans un environnement de production, il serait préférable d'utiliser
 * une bibliothèque dédiée comme expr-eval ou JEXL pour plus de sécurité
 */

/**
 * Évalue une expression conditionnelle avec un contexte donné
 * @param {string} expression - L'expression à évaluer
 * @param {Object} context - Le contexte contenant les variables à utiliser
 * @returns {boolean} - Le résultat de l'évaluation
 */
export const evaluateCondition = (expression, context = {}) => {
  try {
    // Créer une liste de variables à partir du contexte
    const contextVars = Object.keys(context).map(key => `const ${key} = ${JSON.stringify(context[key])};`).join('\n');
    
    // Créer une fonction qui évalue l'expression avec le contexte
    // eslint-disable-next-line no-new-func
    const evalFunction = new Function(`
      "use strict";
      ${contextVars}
      return (${expression});
    `);
    
    // Exécuter la fonction et retourner le résultat
    return Boolean(evalFunction());
  } catch (error) {
    console.error('Erreur lors de l\'évaluation de la condition:', error);
    return false;
  }
};

/**
 * Valide une expression conditionnelle sans l'exécuter
 * @param {string} expression - L'expression à valider
 * @returns {boolean} - True si l'expression est valide
 */
export const validateCondition = (expression) => {
  try {
    // eslint-disable-next-line no-new-func
    new Function(`"use strict"; return (${expression});`);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Remplace les variables dans un texte avec les valeurs du contexte
 * @param {string} text - Le texte contenant des variables sous forme ${variable}
 * @param {Object} context - Le contexte contenant les valeurs des variables
 * @returns {string} - Le texte avec les variables remplacées
 */
export const replaceVariables = (text, context = {}) => {
  return text.replace(/\${([^}]+)}/g, (match, variable) => {
    try {
      // Créer une liste de variables à partir du contexte
      const contextVars = Object.keys(context).map(key => `const ${key} = ${JSON.stringify(context[key])};`).join('\n');
      
      // Créer une fonction qui évalue l'expression avec le contexte
      // eslint-disable-next-line no-new-func
      const evalFunction = new Function(`
        "use strict";
        ${contextVars}
        return (${variable});
      `);
      
      // Exécuter la fonction et retourner le résultat
      const result = evalFunction();
      return result !== undefined && result !== null ? String(result) : '';
    } catch (error) {
      console.error(`Erreur lors du remplacement de la variable ${variable}:`, error);
      return match; // Retourner le match original en cas d'erreur
    }
  });
};
