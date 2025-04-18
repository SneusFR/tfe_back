/**
 * Classe d'erreur personnalisée pour l'application
 * Permet de standardiser les erreurs avec un code, un message et un statut HTTP
 */
class AppError extends Error {
  /**
   * @param {string} message - Message d'erreur
   * @param {string} code - Code d'erreur unique (ex: USER_NOT_FOUND)
   * @param {number} statusCode - Code de statut HTTP (ex: 404)
   */
  constructor(message, code, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Erreurs liées à l'authentification
export class AuthenticationError extends AppError {
  constructor(message, code = 'AUTHENTICATION_ERROR') {
    super(message, code, 401);
  }
}

// Erreurs liées à l'autorisation
export class AuthorizationError extends AppError {
  constructor(message, code = 'AUTHORIZATION_ERROR') {
    super(message, code, 403);
  }
}

// Erreurs liées aux ressources non trouvées
export class NotFoundError extends AppError {
  constructor(message, code = 'NOT_FOUND') {
    super(message, code, 404);
  }
}

// Erreurs liées à la validation des données
export class ValidationError extends AppError {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message, code, 400);
  }
}

// Erreurs liées aux conflits (ex: email déjà utilisé)
export class ConflictError extends AppError {
  constructor(message, code = 'CONFLICT_ERROR') {
    super(message, code, 409);
  }
}

// Erreurs liées au serveur
export class ServerError extends AppError {
  constructor(message, code = 'SERVER_ERROR') {
    super(message, code, 500);
  }
}

export default AppError;
