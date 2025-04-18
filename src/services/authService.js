import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/AppError.js';

/**
 * Hache un mot de passe
 * @param {string} password - Mot de passe en clair
 * @returns {Promise<string>} - Mot de passe haché
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

/**
 * Compare un mot de passe en clair avec un hash
 * @param {string} password - Mot de passe en clair
 * @param {string} hash - Hash du mot de passe
 * @returns {Promise<boolean>} - True si le mot de passe correspond
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Génère un token JWT
 * @param {Object} payload - Données à inclure dans le token
 * @param {string} expiresIn - Durée de validité du token
 * @returns {Object} - Token JWT et informations d'expiration
 */
export const generateToken = (payload, expiresIn = '1d') => {
  // Convertir expiresIn en millisecondes pour calculer la date d'expiration
  let expiresInMs;
  if (expiresIn.endsWith('d')) {
    expiresInMs = parseInt(expiresIn) * 24 * 60 * 60 * 1000;
  } else if (expiresIn.endsWith('h')) {
    expiresInMs = parseInt(expiresIn) * 60 * 60 * 1000;
  } else if (expiresIn.endsWith('m')) {
    expiresInMs = parseInt(expiresIn) * 60 * 1000;
  } else if (expiresIn.endsWith('s')) {
    expiresInMs = parseInt(expiresIn) * 1000;
  } else {
    expiresInMs = 24 * 60 * 60 * 1000; // Par défaut 1 jour
  }
  
  const expiresAt = new Date(Date.now() + expiresInMs);
  
  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
  
  return {
    token,
    expiresIn,
    expiresAt: expiresAt.toISOString()
  };
};

/**
 * Vérifie un token JWT
 * @param {string} token - Token JWT à vérifier
 * @returns {Object|null} - Payload décodé ou null si invalide
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Enregistre un nouvel utilisateur
 * @param {Object} userData - Données de l'utilisateur
 * @returns {Promise<Object>} - Utilisateur créé
 */
export const registerUser = async (userData) => {
  const { email, password, displayName } = userData;
  
  // Normaliser l'email (trim et lowercase)
  const normalizedEmail = email.trim().toLowerCase();
  
  // Vérifier si l'utilisateur existe déjà
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ConflictError('Cet email est déjà utilisé', 'EMAIL_ALREADY_EXISTS');
  }
  
  // Créer l'utilisateur (le hachage sera fait par le pre-save hook)
  const user = new User({
    email: normalizedEmail,
    passwordHash: password, // Sera haché par le pre-save hook
    displayName: displayName || ''
  });
  
  return await user.save();
};

/**
 * Authentifie un utilisateur
 * @param {string} email - Email de l'utilisateur
 * @param {string} password - Mot de passe en clair
 * @returns {Promise<Object>} - Utilisateur et token
 */
export const loginUser = async (email, password) => {
  // Normaliser l'email (trim et lowercase)
  const normalizedEmail = email.trim().toLowerCase();
  
  // Trouver l'utilisateur
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ValidationError('Email ou mot de passe incorrect', 'INVALID_CREDENTIALS');
  }
  
  // Vérifier le mot de passe en utilisant la méthode du modèle
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ValidationError('Email ou mot de passe incorrect', 'INVALID_CREDENTIALS');
  }
  
  // Générer le token avec un payload minimal
  const token = generateToken({
    id: user._id
  });
  
  return {
    user: {
      _id: user._id,
      email: user.email,
      displayName: user.displayName
    },
    token
  };
};

/**
 * Récupère les informations d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Utilisateur
 */
export const getUserById = async (userId) => {
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) {
    throw new NotFoundError('Utilisateur non trouvé', 'USER_NOT_FOUND');
  }
  return user;
};

/**
 * Met à jour les informations d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {Object} updateData - Données à mettre à jour
 * @returns {Promise<Object>} - Utilisateur mis à jour
 */
export const updateUser = async (userId, updateData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('Utilisateur non trouvé', 'USER_NOT_FOUND');
  }
  
  // Mettre à jour les champs
  if (updateData.displayName) {
    user.displayName = updateData.displayName;
  }
  
  // Si le mot de passe est fourni, le mettre à jour
  // Le pre-save hook se chargera de le hacher
  if (updateData.password) {
    user.passwordHash = updateData.password;
  }
  
  return await user.save();
};

/**
 * Change le mot de passe d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {string} currentPassword - Mot de passe actuel
 * @param {string} newPassword - Nouveau mot de passe
 * @returns {Promise<Object>} - Utilisateur mis à jour
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('Utilisateur non trouvé', 'USER_NOT_FOUND');
  }
  
  // Vérifier le mot de passe actuel en utilisant la méthode du modèle
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new ValidationError('Mot de passe actuel incorrect', 'INVALID_CURRENT_PASSWORD');
  }
  
  // Mettre à jour le mot de passe (le pre-save hook se chargera de le hacher)
  user.passwordHash = newPassword;
  
  return await user.save();
};
