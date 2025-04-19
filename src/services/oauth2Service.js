// src/services/oauth2Service.js
import axios from 'axios';
import NodeCache from 'node-cache';

// Cache pour stocker les tokens OAuth2
const tokenCache = new NodeCache({ stdTTL: 300 }); // 5 minutes par défaut

/**
 * Récupère un token OAuth2 en utilisant le flux client_credentials
 * Utilise un cache pour éviter de faire trop de requêtes
 * 
 * @param {Object} cfg - Configuration du backend
 * @returns {Promise<string>} - Token d'accès
 */
export async function getOauth2Token(cfg) {
  if (!cfg || !cfg.auth || cfg.authType !== 'oauth2_cc') {
    throw new Error('Configuration OAuth2 invalide');
  }
  
  // Clé de cache unique basée sur l'ID de la configuration
  const cacheKey = `oauth2:${cfg.id}`;
  
  // Vérifier si un token est déjà en cache
  const cachedToken = tokenCache.get(cacheKey);
  if (cachedToken) {
    return cachedToken;
  }
  
  try {
    // Préparer les paramètres pour la requête de token
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.auth.clientId,
      client_secret: cfg.auth.clientSecret
    });
    
    // Ajouter le scope si présent
    if (cfg.auth.scopes) {
      params.append('scope', cfg.auth.scopes);
    }
    
    // Faire la requête pour obtenir le token
    const response = await axios.post(cfg.auth.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Vérifier que la réponse contient un token
    if (!response.data || !response.data.access_token) {
      throw new Error('Réponse OAuth2 invalide: pas de token d\'accès');
    }
    
    // Calculer la durée de vie du token (par défaut 1 heure si non spécifié)
    const expiresIn = response.data.expires_in || 3600;
    
    // Stocker le token dans le cache avec une durée de vie légèrement inférieure
    // pour éviter d'utiliser un token expiré
    tokenCache.set(cacheKey, response.data.access_token, expiresIn - 60);
    
    return response.data.access_token;
  } catch (error) {
    console.error('Erreur lors de l\'obtention du token OAuth2:', error.message);
    throw new Error(`Échec de l'authentification OAuth2: ${error.message}`);
  }
}
