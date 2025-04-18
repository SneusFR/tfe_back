import express from 'express';
import { emailController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateEmail, validatePagination, validateSearch } = validationMiddleware;

/**
 * @route   GET /api/emails
 * @desc    Récupérer tous les emails d'un utilisateur
 * @access  Private
 */
router.get('/', protect, validatePagination, asyncHandler(emailController.getEmails));

/**
 * @route   GET /api/emails/search
 * @desc    Rechercher des emails
 * @access  Private
 */
router.get('/search', protect, validateSearch, validatePagination, asyncHandler(emailController.searchEmails));

/**
 * @route   GET /api/emails/:id
 * @desc    Récupérer un email par ID
 * @access  Private
 */
router.get('/:id', protect, validateMongoId('id'), asyncHandler(emailController.getEmailById));

/**
 * @route   POST /api/emails
 * @desc    Créer un nouvel email
 * @access  Private
 */
router.post('/', protect, validateEmail, asyncHandler(emailController.createEmail));

/**
 * @route   DELETE /api/emails/:id
 * @desc    Supprimer un email
 * @access  Private
 */
router.delete('/:id', protect, validateMongoId('id'), asyncHandler(emailController.deleteEmail));

export default router;
