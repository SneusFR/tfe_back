// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { flowService } from '../services/index.js';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError
} from '../utils/AppError.js';

/**
 * Middleware pour protéger les routes
 * Vérifie si l'utilisateur est authentifié via un token JWT stocké en HttpOnly cookie
 */
export const protect = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      throw new AuthenticationError('Non autorisé, token manquant', 'NO_TOKEN');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AuthenticationError('Non autorisé, token invalide', 'INVALID_TOKEN');
    }

    if (!decoded.id) {
      throw new AuthenticationError('Token malformé', 'MALFORMED_TOKEN');
    }

    req.user = await User.findById(decoded.id).select('-passwordHash');
    if (!req.user) {
      throw new AuthenticationError('Utilisateur non trouvé', 'USER_NOT_FOUND');
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware pour vérifier si l'utilisateur est le propriétaire d'une ressource
 * @param {Function} getResourceOwnerId - Fonction qui retourne l’ID du propriétaire
 */
export const isOwner = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getResourceOwnerId(req);
      if (!ownerId) {
        throw new NotFoundError('Ressource non trouvée', 'RESOURCE_NOT_FOUND');
      }
      if (ownerId.toString() !== req.user.id) {
        throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Middleware pour vérifier si l'utilisateur a un rôle spécifique
 * @param {Array<string>} roles - Rôles autorisés (e.g. ['admin','editor'])
 */
export const hasRole = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
      }
      if (!roles.includes(req.user.role)) {
        throw new AuthorizationError('Accès non autorisé pour ce rôle', 'INSUFFICIENT_ROLE');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Middleware pour vérifier l’accès à un Flow via le service de collaborations
 * @param {string} requiredRole - Rôle requis (owner, editor, viewer)
 */
export const hasFlowAccess = (requiredRole = 'viewer') => {
  return async (req, res, next) => {
    try {
      const flowId = req.params.id || req.params.flowId || req.body.flowId;
      if (!flowId) {
        throw new ValidationError('ID du flow non fourni', 'MISSING_FLOW_ID');
      }

      const hasAccess = await flowService.checkFlowAccess(
        req.user.id,
        flowId,
        requiredRole
      );
      if (!hasAccess) {
        throw new AuthorizationError(
          'Accès non autorisé à ce flow',
          'INSUFFICIENT_FLOW_PERMISSION'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
