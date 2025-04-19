import BackendConfig from '../models/BackendConfig.js';
import { NotFoundError, AuthorizationError } from '../utils/AppError.js';

/**
 * Masque les données sensibles dans la configuration
 * @param {Object} config - Configuration à masquer
 * @param {Boolean} isAdmin - Si l'utilisateur est admin
 * @returns {Object} - Configuration avec données sensibles masquées
 */
const maskSensitiveData = (config, isAdmin = false) => {
  // Créer une copie pour ne pas modifier l'original
  const masked = config.toJSON ? config.toJSON() : { ...config };
  
  // Si l'utilisateur n'est pas admin, masquer les secrets
  if (!isAdmin && masked.auth && typeof masked.auth === 'object') {
    // Selon le type d'authentification, masquer différemment
    switch (masked.authType) {
      case 'bearer':
        masked.auth = { ...masked.auth, token: '<masked>' };
        break;
      case 'basic':
        masked.auth = { 
          ...masked.auth, 
          username: masked.auth.username, 
          password: '<masked>' 
        };
        break;
      case 'apiKey':
        masked.auth = { 
          ...masked.auth, 
          apiKey: '<masked>',
          paramName: masked.auth.paramName,
          location: masked.auth.location
        };
        break;
      case 'oauth2_cc':
        masked.auth = { 
          ...masked.auth, 
          clientId: masked.auth.clientId,
          clientSecret: '<masked>',
          tokenUrl: masked.auth.tokenUrl,
          scopes: masked.auth.scopes
        };
        break;
      case 'cookie':
        masked.auth = { 
          ...masked.auth, 
          cookieName: masked.auth.cookieName,
          cookieValue: '<masked>' 
        };
        break;
      case 'custom':
        if (masked.auth.customHeaders && Array.isArray(masked.auth.customHeaders)) {
          masked.auth.customHeaders = masked.auth.customHeaders.map(h => ({
            key: h.key,
            value: '<masked>'
          }));
        }
        break;
    }
  }
  
  return masked;
};

/**
 * Liste toutes les configurations d'un utilisateur
 * @param {String} userId - ID de l'utilisateur
 * @param {Boolean} isAdmin - Si l'utilisateur est admin
 * @returns {Promise<Array>} - Liste des configurations
 */
export const listConfigs = async (userId, isAdmin = false) => {
  const configs = await BackendConfig.find({ owner: userId });
  return configs.map(cfg => maskSensitiveData(cfg, isAdmin));
};

/**
 * Récupère une configuration par son ID
 * @param {String} id - ID de la configuration
 * @param {String} userId - ID de l'utilisateur
 * @param {Boolean} isAdmin - Si l'utilisateur est admin
 * @returns {Promise<Object>} - Configuration
 */
export const getConfig = async (id, userId, isAdmin = false) => {
  const cfg = await BackendConfig.findById(id);
  if (!cfg) throw new NotFoundError('CONFIG_NOT_FOUND');
  
  // Vérifier que l'utilisateur est propriétaire
  if (cfg.owner.toString() !== userId) 
    throw new AuthorizationError('UNAUTHORIZED');
  
  // Pour les opérations internes (comme updateConfig), retourner l'objet complet
  if (isAdmin === 'internal') return cfg;
  
  // Sinon, masquer les données sensibles
  return maskSensitiveData(cfg, isAdmin);
};

/**
 * Crée une nouvelle configuration
 * @param {String} userId - ID de l'utilisateur
 * @param {Object} data - Données de la configuration
 * @returns {Promise<Object>} - Configuration créée
 */
export const createConfig = async (userId, data) => {
  const config = await BackendConfig.create({ ...data, owner: userId });
  return maskSensitiveData(config);
};

/**
 * Met à jour une configuration
 * @param {String} id - ID de la configuration
 * @param {String} userId - ID de l'utilisateur
 * @param {Object} data - Nouvelles données
 * @returns {Promise<Object>} - Configuration mise à jour
 */
export const updateConfig = async (id, userId, data) => {
  // Utiliser 'internal' pour récupérer l'objet complet
  const cfg = await getConfig(id, userId, 'internal');
  Object.assign(cfg, data);
  await cfg.save();
  return maskSensitiveData(cfg);
};

/**
 * Supprime une configuration
 * @param {String} id - ID de la configuration
 * @param {String} userId - ID de l'utilisateur
 * @returns {Promise<void>}
 */
export const deleteConfig = async (id, userId) => {
  const cfg = await getConfig(id, userId, 'internal');
  await cfg.deleteOne();
};
