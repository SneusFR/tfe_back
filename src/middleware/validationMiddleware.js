import { ValidationError } from '../utils/AppError.js';

/**
 * Middleware pour valider les données d'un utilisateur
 */
export const validateUser = (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    
    // Valider l'email
    if (!email) {
      throw new ValidationError('Email requis', 'MISSING_EMAIL');
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Format d\'email invalide', 'INVALID_EMAIL_FORMAT');
    }
    
    // Valider le mot de passe lors de la création d'un utilisateur
    if (req.method === 'POST' && !password) {
      throw new ValidationError('Mot de passe requis', 'MISSING_PASSWORD');
    }
    
    if (password && password.length < 6) {
      throw new ValidationError('Le mot de passe doit contenir au moins 6 caractères', 'PASSWORD_TOO_SHORT');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les données d'authentification
 */
export const validateAuth = (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      throw new ValidationError('Email et mot de passe requis', 'MISSING_CREDENTIALS');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les données d'un flow
 */
export const validateFlow = (req, res, next) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      throw new ValidationError('Nom du flow requis', 'MISSING_FLOW_NAME');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les données d'une collaboration
 */
import { COLLABORATION_ROLE } from '../utils/constants.js';

export const validateCollaboration = (req, res, next) => {
  try {
    const { flowId, userId, email, role } = req.body;
    
    if (!flowId) {
      throw new ValidationError('ID du flow requis', 'MISSING_FLOW_ID');
    }
    
    if (!userId && !email) {
      throw new ValidationError('ID ou email de l\'utilisateur requis', 'MISSING_USER_IDENTIFIER');
    }
    
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError('Format d\'email invalide', 'INVALID_EMAIL_FORMAT');
      }
    }
    
    if (role && !Object.values(COLLABORATION_ROLE).includes(role)) {
      throw new ValidationError('Rôle invalide', 'INVALID_ROLE');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les données d'une condition
 */
export const validateCondition = (req, res, next) => {
  try {
    const { conditionText, returnText } = req.body;
    
    if (!conditionText) {
      throw new ValidationError('Texte de condition requis', 'MISSING_CONDITION_TEXT');
    }
    
    if (!returnText) {
      throw new ValidationError('Texte de retour requis', 'MISSING_RETURN_TEXT');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les données d'une tâche
 */
export const validateTask = (req, res, next) => {
  try {
    const { type } = req.body;
    
    if (!type) {
      throw new ValidationError('Type de tâche requis', 'MISSING_TASK_TYPE');
    }
    
    // Valider le statut si présent
    const { status } = req.body;
    if (status && !['pending', 'completed'].includes(status)) {
      throw new ValidationError('Statut invalide', 'INVALID_TASK_STATUS');
    }
    
    // Valider la source si présente
    const { source } = req.body;
    if (source && !['email', 'manual'].includes(source)) {
      throw new ValidationError('Source invalide', 'INVALID_TASK_SOURCE');
    }
    
    // Récupérer les nouveaux champs (pas d'erreur bloquante : ils sont optionnels)
    const { subject, senderName, recipientName, body, date, attachmentId } = req.body;
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les données d'un email
 */
export const validateEmail = (req, res, next) => {
  try {
    const { emailId, subject, from } = req.body;
    
    if (!emailId) {
      throw new ValidationError('ID d\'email requis', 'MISSING_EMAIL_ID');
    }
    
    if (!subject) {
      throw new ValidationError('Sujet requis', 'MISSING_EMAIL_SUBJECT');
    }
    
    if (!from || !from.address) {
      throw new ValidationError('Adresse d\'expéditeur requise', 'MISSING_EMAIL_SENDER');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les paramètres de pagination
 */
export const validatePagination = (req, res, next) => {
  try {
    let { page, limit, sort } = req.query;
    
    // Convertir en nombres
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;
    
    // Valider les valeurs
    if (page < 1) {
      throw new ValidationError('Le numéro de page doit être supérieur à 0', 'INVALID_PAGE');
    }
    
    if (limit < 1 || limit > 100) {
      throw new ValidationError('La limite doit être entre 1 et 100', 'INVALID_LIMIT');
    }
    
    // Traiter le paramètre de tri
    let sortObj = { createdAt: -1 }; // Tri par défaut
    
    if (sort) {
      try {
        // Vérifier si c'est un JSON valide
        if (sort.startsWith('{') && sort.endsWith('}')) {
          sortObj = JSON.parse(sort);
        } else {
          // Format simple: field:direction (ex: "name:asc")
          const [field, direction] = sort.split(':');
          if (field && direction) {
            sortObj = { [field]: direction.toLowerCase() === 'asc' ? 1 : -1 };
          }
        }
      } catch (error) {
        throw new ValidationError('Format de tri invalide', 'INVALID_SORT_FORMAT');
      }
    }
    
    // Ajouter les paramètres validés à la requête
    req.pagination = {
      page,
      limit,
      skip: (page - 1) * limit,
      sort: sortObj
    };
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour valider les paramètres de recherche
 */
export const validateSearch = (req, res, next) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim() === '') {
      throw new ValidationError('Paramètre de recherche requis', 'MISSING_SEARCH_QUERY');
    }
    
    // Limiter la longueur de la requête
    if (query.length > 100) {
      throw new ValidationError('La requête de recherche est trop longue', 'SEARCH_QUERY_TOO_LONG');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
