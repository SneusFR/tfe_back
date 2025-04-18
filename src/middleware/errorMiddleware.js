import { NotFoundError, ValidationError } from '../utils/AppError.js';

/**
 * Middleware pour gérer les erreurs 404 (ressource non trouvée)
 */
export const notFound = (req, res, next) => {
  next(new NotFoundError(`Route non trouvée - ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
};

/**
 * Middleware pour gérer les erreurs générales
 */
export const errorHandler = (err, req, res, next) => {
  // Déterminer le code de statut
  const statusCode = err.statusCode || res.statusCode === 200 ? 500 : res.statusCode;
  
  // Construire la réponse d'erreur
  const errorResponse = {
    success: false,
    message: err.message,
    code: err.code || 'SERVER_ERROR',
  };
  
  // Ajouter la stack trace en développement
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
};

/**
 * Middleware pour capturer les erreurs asynchrones
 * @param {Function} fn - Fonction asynchrone à exécuter
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Middleware pour valider les IDs MongoDB
 * @param {string} paramName - Nom du paramètre contenant l'ID
 */
export const validateMongoId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName] || req.body[paramName];
    
    if (!id) {
      return next(new ValidationError(`${paramName} est requis`, 'MISSING_ID'));
    }
    
    // Vérifier si l'ID est un ID MongoDB valide (24 caractères hexadécimaux)
    const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
    
    if (!mongoIdRegex.test(id)) {
      return next(new ValidationError(`${paramName} n'est pas un ID valide`, 'INVALID_ID_FORMAT'));
    }
    
    next();
  };
};

/**
 * Middleware pour limiter le taux de requêtes
 * @param {number} maxRequests - Nombre maximum de requêtes
 * @param {number} windowMs - Fenêtre de temps en millisecondes
 */
export const rateLimit = (maxRequests, windowMs) => {
  const clients = new Map();
  
  return (req, res, next) => {
    // Utiliser l'IP comme identifiant (ou un token si disponible)
    const clientId = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    // Récupérer les données du client
    const now = Date.now();
    const clientData = clients.get(clientId) || { count: 0, resetTime: now + windowMs };
    
    // Réinitialiser le compteur si la fenêtre de temps est passée
    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + windowMs;
    } else {
      // Incrémenter le compteur
      clientData.count += 1;
    }
    
    // Mettre à jour les données du client
    clients.set(clientId, clientData);
    
    // Vérifier si le client a dépassé la limite
    if (clientData.count > maxRequests) {
      return res.status(429).json({
        message: 'Trop de requêtes, veuillez réessayer plus tard',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }
    
    // Ajouter les headers de limite de taux
    res.set('X-RateLimit-Limit', maxRequests);
    res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count));
    res.set('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000));
    
    next();
  };
};
