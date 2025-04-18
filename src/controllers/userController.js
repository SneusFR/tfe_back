// controllers/userController.js
import { authService } from '../services/index.js';
import { User }       from '../models/index.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/AppError.js';

/* -------------------------------------------------------------------------- */
/* Récupérer tous les utilisateurs                                            */
/* -------------------------------------------------------------------------- */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash');
    res.json(users);
  } catch (error) {
    res.status(500).json({ 
      message: 'Erreur serveur lors de la récupération des utilisateurs',
      error: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* Récupérer un utilisateur par ID                                            */
/* -------------------------------------------------------------------------- */
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) {
      throw new NotFoundError('Utilisateur non trouvé', 'USER_NOT_FOUND');
    }
    res.json(user);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(error.statusCode).json({ 
        message: error.message,
        code: error.code 
      });
    } else {
      res.status(500).json({ 
        message: 'Erreur serveur lors de la récupération de l\'utilisateur',
        error: error.message
      });
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Créer un nouvel utilisateur (ex. par un admin)                             */
/* -------------------------------------------------------------------------- */
export const createUser = async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    // Toute la logique (unicité, hash, trim/lowerCase…) est centralisée ici
    const user = await authService.registerUser({ email, password, displayName });

    res.status(201).json({
      _id:         user._id,
      email:       user.email,
      displayName: user.displayName
    });
  } catch (error) {
    // Différencier les erreurs de validation des erreurs système
    if (error instanceof ValidationError || 
        error instanceof ConflictError) {
      res.status(error.statusCode).json({ 
        message: error.message,
        code: error.code 
      });
    } else if (error.message === 'Cet email est déjà utilisé') {
      // Erreur spécifique pour email en doublon
      res.status(409).json({ 
        message: error.message,
        code: 'EMAIL_ALREADY_EXISTS' 
      });
    } else {
      // Erreur système
      res.status(500).json({ 
        message: 'Erreur serveur lors de la création de l\'utilisateur',
        error: error.message
      });
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Mettre à jour un utilisateur                                               */
/* -------------------------------------------------------------------------- */
export const updateUser = async (req, res) => {
  try {
    // Ne permettre que les champs autorisés
    const allowedFields = ['displayName', 'password'];
    const updateData = {};
    
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });
    
    const updated = await authService.updateUser(req.params.id, updateData);
    res.json({
      _id:         updated._id,
      email:       updated.email,
      displayName: updated.displayName
    });
  } catch (error) {
    // Différencier les erreurs de validation des erreurs système
    if (error instanceof ValidationError || 
        error instanceof NotFoundError || 
        error instanceof ConflictError) {
      res.status(error.statusCode).json({ 
        message: error.message,
        code: error.code 
      });
    } else {
      // Erreur système
      res.status(500).json({ 
        message: 'Erreur serveur lors de la mise à jour de l\'utilisateur',
        error: error.message
      });
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Supprimer un utilisateur                                                   */
/* -------------------------------------------------------------------------- */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new NotFoundError('Utilisateur non trouvé', 'USER_NOT_FOUND');
    }

    await user.deleteOne();
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(error.statusCode).json({ 
        message: error.message,
        code: error.code 
      });
    } else {
      res.status(500).json({ 
        message: 'Erreur serveur lors de la suppression de l\'utilisateur',
        error: error.message
      });
    }
  }
};
