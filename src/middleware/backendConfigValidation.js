// src/middleware/backendConfigValidation.js
import { body, validationResult } from 'express-validator';
import { ValidationError } from '../utils/AppError.js';

// Validation des champs pour la création/mise à jour d'une configuration de backend
export const validateBackendConfig = [
  // Validation du nom (obligatoire)
  body('name')
    .notEmpty().withMessage('Le nom est obligatoire')
    .isString().withMessage('Le nom doit être une chaîne de caractères')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  
  // Validation de l'URL de base (obligatoire et format URL)
  body('baseUrl')
    .notEmpty().withMessage('L\'URL de base est obligatoire')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,        // <- autorise localhost / intranet
      allow_underscores: true,   // <- autorise api_dev.local etc.
      allow_ip_domain: true      // <- autorise 192.168.0.10
    }).withMessage('L\'URL de base doit être une URL valide commençant par http:// ou https://'),
  
  // Validation du timeout (optionnel, nombre positif)
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 60000 }).withMessage('Le timeout doit être entre 1000 et 60000 ms'),
  
  // Validation des retries (optionnel, nombre entier positif)
  body('retries')
    .optional()
    .isInt({ min: 0, max: 10 }).withMessage('Le nombre de tentatives doit être entre 0 et 10'),
  
  // Validation des en-têtes par défaut (optionnel, tableau d'objets)
  body('defaultHeaders')
    .optional()
    .isArray().withMessage('Les en-têtes par défaut doivent être un tableau'),
  
  body('defaultHeaders.*.key')
    .optional()
    .isString().withMessage('La clé d\'en-tête doit être une chaîne de caractères')
    .trim()
    .notEmpty().withMessage('La clé d\'en-tête ne peut pas être vide'),
  
  body('defaultHeaders.*.value')
    .optional()
    .isString().withMessage('La valeur d\'en-tête doit être une chaîne de caractères'),
  
  // Validation du type d'authentification (optionnel, enum)
  body('authType')
    .optional()
    .isIn(['none', 'bearer', 'basic', 'apiKey', 'oauth2_cc', 'cookie', 'custom'])
    .withMessage('Type d\'authentification invalide'),
  
  // Validation des paramètres d'authentification selon le type
  body('auth')
    .optional()
    .custom((value, { req }) => {
      const authType = req.body.authType;
      
      // Validation spécifique selon le type d'authentification
      switch (authType) {
        case 'bearer':
          if (!value.token) {
            throw new Error('Le token Bearer est obligatoire');
          }
          break;
          
        case 'basic':
          if (!value.username || !value.password) {
            throw new Error('Le nom d\'utilisateur et le mot de passe sont obligatoires pour l\'authentification Basic');
          }
          break;
          
        case 'apiKey':
          if (!value.apiKey) {
            throw new Error('La clé API est obligatoire');
          }
          if (!value.paramName) {
            throw new Error('Le nom du paramètre est obligatoire');
          }
          if (!value.location || !['header', 'query', 'cookie'].includes(value.location)) {
            throw new Error('L\'emplacement doit être header, query ou cookie');
          }
          break;
          
        case 'oauth2_cc':
          if (!value.clientId || !value.clientSecret || !value.tokenUrl) {
            throw new Error('clientId, clientSecret et tokenUrl sont obligatoires pour OAuth2 Client Credentials');
          }
          break;
          
        case 'cookie':
          if (!value.cookieName || !value.cookieValue) {
            throw new Error('Le nom et la valeur du cookie sont obligatoires');
          }
          break;
          
        case 'custom':
          if (!value.customHeaders || !Array.isArray(value.customHeaders)) {
            throw new Error('Les en-têtes personnalisés doivent être un tableau');
          }
          break;
      }
      
      return true;
    }),
  
  // Validation de la compression (optionnel, booléen)
  body('compression')
    .optional()
    .isBoolean().withMessage('La compression doit être un booléen'),
  
  // Validation du proxy (optionnel, objet)
  body('proxy')
    .optional()
    .custom(value => {
      if (typeof value !== 'object') {
        throw new Error('Le proxy doit être un objet');
      }
      
      if (value.host && typeof value.host !== 'string') {
        throw new Error('L\'hôte du proxy doit être une chaîne de caractères');
      }
      
      if (value.port) {
        const port = parseInt(value.port);
        if (isNaN(port) || port < 1 || port > 65535) {
          throw new Error('Le port du proxy doit être un nombre entre 1 et 65535');
        }
      }
      
      return true;
    }),
  
  // Validation de tlsSkipVerify (optionnel, booléen)
  body('tlsSkipVerify')
    .optional()
    .isBoolean().withMessage('tlsSkipVerify doit être un booléen'),
  
  // Middleware pour gérer les erreurs de validation
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(err => err.msg);
      return next(new ValidationError(messages.join(', '), 'INVALID_BACKEND_CONFIG'));
    }
    next();
  }
];

// Middleware pour limiter le nombre de requêtes par utilisateur
export const backendConfigRateLimit = (rateLimit) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limite chaque IP à 100 requêtes par fenêtre
    standardHeaders: true, // Retourne les headers 'RateLimit-*' standards
    legacyHeaders: false, // Désactive les headers 'X-RateLimit-*'
    keyGenerator: (req) => req.user?.id || req.ip, // Utilise l'ID utilisateur ou l'IP
    handler: (_, __, ___, options) => {
      throw new ValidationError(
        `Trop de requêtes, veuillez réessayer après ${options.windowMs / 60000} minutes`,
        'RATE_LIMIT_EXCEEDED'
      );
    },
  });
};
