import express from 'express';
import { userController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';
import { User } from '../models/index.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateUser, validatePagination } = validationMiddleware;

/**
 * @route   GET /api/users
 * @desc    Récupérer tous les utilisateurs
 * @access  Private/Admin
 */
router.get('/', protect, validatePagination, asyncHandler(async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-passwordHash')
      .sort(req.pagination.sort)
      .skip(req.pagination.skip)
      .limit(req.pagination.limit);
    
    const total = await User.countDocuments();
    
    res.json({
      page: req.pagination.page,
      limit: req.pagination.limit,
      total,
      totalPages: Math.ceil(total / req.pagination.limit),
      data: users
    });
  } catch (error) {
    next(error);
  }
}));

/**
 * @route   GET /api/users/:id
 * @desc    Récupérer un utilisateur par ID
 * @access  Private
 */
router.get('/:id', protect, validateMongoId('id'), asyncHandler(userController.getUserById));

/**
 * @route   POST /api/users
 * @desc    Créer un nouvel utilisateur
 * @access  Private/Admin
 */
router.post('/', protect, validateUser, asyncHandler(userController.createUser));

/**
 * @route   PUT /api/users/:id
 * @desc    Mettre à jour un utilisateur
 * @access  Private
 */
router.put('/:id', protect, validateMongoId('id'), validateUser, asyncHandler(userController.updateUser));

/**
 * @route   DELETE /api/users/:id
 * @desc    Supprimer un utilisateur
 * @access  Private
 */
router.delete('/:id', protect, validateMongoId('id'), asyncHandler(userController.deleteUser));

export default router;
