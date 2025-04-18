import express from 'express';
import { conditionController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';
import { Condition } from '../models/index.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateCondition, validatePagination } = validationMiddleware;

/**
 * @route   GET /api/conditions
 * @desc    Récupérer toutes les conditions d'un utilisateur
 * @access  Private
 */
router.get('/', protect, validatePagination, asyncHandler(async (req, res, next) => {
  try {
    const conditions = await Condition.find({ owner: req.user.id })
      .sort(req.pagination.sort)
      .skip(req.pagination.skip)
      .limit(req.pagination.limit);
    
    const total = await Condition.countDocuments({ owner: req.user.id });
    
    res.json({
      page: req.pagination.page,
      limit: req.pagination.limit,
      total,
      totalPages: Math.ceil(total / req.pagination.limit),
      data: conditions
    });
  } catch (error) {
    next(error);
  }
}));

/**
 * @route   GET /api/conditions/:id
 * @desc    Récupérer une condition par ID
 * @access  Private
 */
router.get('/:id', protect, validateMongoId('id'), asyncHandler(conditionController.getConditionById));

/**
 * @route   POST /api/conditions
 * @desc    Créer une nouvelle condition
 * @access  Private
 */
router.post('/', protect, validateCondition, asyncHandler(conditionController.createCondition));

/**
 * @route   PUT /api/conditions/:id
 * @desc    Mettre à jour une condition
 * @access  Private
 */
router.put('/:id', protect, validateMongoId('id'), validateCondition, asyncHandler(conditionController.updateCondition));

/**
 * @route   DELETE /api/conditions/:id
 * @desc    Supprimer une condition
 * @access  Private
 */
router.delete('/:id', protect, validateMongoId('id'), asyncHandler(conditionController.deleteCondition));

/**
 * @route   POST /api/conditions/evaluate
 * @desc    Évaluer une condition
 * @access  Private
 */
router.post('/evaluate', protect, asyncHandler(conditionController.evaluateCondition));

/**
 * @route   POST /api/conditions/validate
 * @desc    Valider une expression conditionnelle sans l'exécuter
 * @access  Private
 */
router.post('/validate', protect, asyncHandler(async (req, res) => {
  const { expression } = req.body;
  
  if (!expression) {
    return res.status(400).json({ 
      success: false,
      code: 'MISSING_EXPRESSION',
      message: 'Expression requise' 
    });
  }
  
  const { validateCondition } = await import('../utils/conditionEvaluator.js');
  const isValid = validateCondition(expression);
  
  res.json({
    success: true,
    isValid,
    message: isValid ? 'Expression valide' : 'Expression invalide'
  });
}));

export default router;
