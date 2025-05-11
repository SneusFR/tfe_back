// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import { User, Collaboration } from '../models/index.js';
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
      return res.status(401).json({
        success: false,
        message: 'Non autorisé, token manquant',
        code: 'NO_TOKEN'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé, token invalide',
        code: 'INVALID_TOKEN'
      });
    }

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Token malformé',
        code: 'MALFORMED_TOKEN'
      });
    }

    req.user = await User.findById(decoded.id).select('-passwordHash');
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware utilitaire pour injecter le flowId dans les paramètres de la requête
 * à partir d'une collaboration
 */
export const injectFlowId = async (req, res, next) => {
  try {
    const collab = await Collaboration.findById(req.params.id).lean();
    if (!collab) {
      return res.status(404).json({ message: 'Collaboration non trouvée' });
    }
    req.params.flowId = collab.flow.toString();
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
        return res.status(404).json({
          success: false,
          message: 'Ressource non trouvée',
          code: 'RESOURCE_NOT_FOUND'
        });
      }
      if (ownerId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé',
          code: 'UNAUTHORIZED_ACCESS'
        });
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
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé',
          code: 'UNAUTHORIZED_ACCESS'
        });
      }
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé pour ce rôle',
          code: 'INSUFFICIENT_ROLE'
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

import { COLLABORATION_ROLE } from '../utils/constants.js';

/**
 * Middleware pour vérifier l'accès à un Flow via le service de collaborations
 * @param {string} requiredRole - Rôle requis (owner, editor, viewer)
 */
export const hasFlowAccess = (requiredRole = COLLABORATION_ROLE.VIEWER) => {
  return async (req, res, next) => {
    try {
      const flowId = req.params.flowId || req.params.id || req.body.flowId;
      if (!flowId) {
        return res.status(400).json({
          success: false,
          message: 'ID du flow non fourni',
          code: 'MISSING_FLOW_ID'
        });
      }

      const hasAccess = await flowService.checkFlowAccess(
        req.user.id,
        flowId,
        requiredRole
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce flow',
          code: 'INSUFFICIENT_FLOW_PERMISSION'
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
