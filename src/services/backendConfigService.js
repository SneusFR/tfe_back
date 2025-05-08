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
 * @deprecated Utiliser listConfigsByFlow à la place
 */
export const listConfigsByOwner = async (userId, isAdmin = false) => {
  const configs = await BackendConfig.find({ owner: userId });
  return configs.map(cfg => maskSensitiveData(cfg, isAdmin));
};

/**
 * @deprecated Utiliser listConfigsByOwner ou listConfigsByFlow à la place
 */
export const listConfigs = listConfigsByOwner;

/**
 * Liste toutes les configurations d'un flow
 * @param {String} flowId - ID du flow
 * @param {Boolean} isAdmin - Si l'utilisateur est admin
 * @returns {Promise<Array>} - Liste des configurations
 */
export const listConfigsByFlow = async (flowId, isAdmin = false) => {
  const configs = await BackendConfig.find({ flow: flowId });
  return configs.map(cfg => maskSensitiveData(cfg, isAdmin));
};

/**
 * Récupère une configuration par son ID
 * @param {String} id - ID de la configuration
 * @param {String} flowId - ID du flow
 * @param {Boolean} isAdmin - Si l'utilisateur est admin
 * @returns {Promise<Object>} - Configuration
 */
export const getConfig = async (id, flowId, isAdmin = false) => {
  const cfg = await BackendConfig.findOne({ _id: id, flow: flowId });
  if (!cfg) throw new NotFoundError('CONFIG_NOT_FOUND');
  
  // L'accès est déjà vérifié par le middleware hasFlowAccess
  
  // Pour les opérations internes (comme updateConfig), retourner l'objet complet
  if (isAdmin === 'internal') return cfg;
  
  // Sinon, masquer les données sensibles
  return maskSensitiveData(cfg, isAdmin);
};

/**
 * Crée une nouvelle configuration
 * @param {String} userId - ID de l'utilisateur
 * @param {String} flowId - ID du flow
 * @param {Object} data - Données de la configuration
 * @returns {Promise<Object>} - Configuration créée
 */
export const createConfig = async (userId, flowId, data) => {
  const config = await BackendConfig.create({ ...data, owner: userId, flow: flowId });
  return maskSensitiveData(config);
};

/**
 * Met à jour une configuration
 * @param {String} id - ID de la configuration
 * @param {String} flowId - ID du flow
 * @param {Object} data - Nouvelles données
 * @returns {Promise<Object>} - Configuration mise à jour
 */
export const updateConfig = async (id, flowId, data) => {
  // Utiliser 'internal' pour récupérer l'objet complet
  const cfg = await getConfig(id, flowId, 'internal');
  Object.assign(cfg, data);
  await cfg.save();
  return maskSensitiveData(cfg);
};

/**
 * Supprime une configuration
 * @param {String} id - ID de la configuration
 * @param {String} flowId - ID du flow
 * @returns {Promise<void>}
 */
export const deleteConfig = async (id, flowId) => {
  const cfg = await getConfig(id, flowId, 'internal');
  await cfg.deleteOne();
};

/**
 * Définit une configuration comme active et désactive toutes les autres
 * @param {String} id - ID de la configuration à activer
 * @param {String} flowId - ID du flow
 * @returns {Promise<Object>} - Configuration activée
 */
export const setActiveConfig = async (id, flowId) => {
  // Désactiver toutes les configurations du flow
  await BackendConfig.updateMany(
    { flow: flowId },
    { $set: { isActive: false } }
  );
  
  // Activer la configuration spécifiée
  await BackendConfig.updateOne(
    { _id: id, flow: flowId },
    { $set: { isActive: true } }
  );
  
  // Retourner la configuration mise à jour
  return getConfig(id, flowId);
};

/**
 * Récupère la configuration active d'un flow
 * @param {String} flowId - ID du flow
 * @returns {Promise<Object>} - Configuration active
 */
export const getActiveConfig = async (flowId) => {
  const cfg = await BackendConfig.findOne({ flow: flowId, isActive: true });
  if (!cfg) throw new NotFoundError('NO_ACTIVE_CONFIG');
  return cfg;
};
