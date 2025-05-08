import express from 'express';
import { conditionController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';
import { Condition } from '../models/index.js';

const router = express.Router({ mergeParams: true }); // Pour accéder aux params de la route parent (flowId)
const { protect, hasFlowAccess } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateCondition, validatePagination } = validationMiddleware;

// Appliquer le middleware hasFlowAccess à toutes les routes
router.use(protect, hasFlowAccess('viewer'));

/**
 * @route   GET /api/flow/:flowId/conditions
 * @desc    Récupérer toutes les conditions d'un flow
 * @access  Private (viewer+)
 */
router.get('/', validatePagination, asyncHandler(async (req, res, next) => {
  try {
    const flowId = req.params.flowId;
    const conditions = await Condition.find({ flow: flowId })
      .sort(req.pagination.sort)
      .skip(req.pagination.skip)
      .limit(req.pagination.limit);
    
    const total = await Condition.countDocuments({ flow: flowId });
    
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
 * @route   GET /api/flow/:flowId/conditions/:id
 * @desc    Récupérer une condition par ID
 * @access  Private (viewer+)
 */
router.get('/:id', validateMongoId('id'), asyncHandler(conditionController.getConditionById));

/**
 * @route   POST /api/flow/:flowId/conditions
 * @desc    Créer une nouvelle condition
 * @access  Private (editor+)
 */
router.post('/', hasFlowAccess('editor'), validateCondition, asyncHandler(conditionController.createCondition));

/**
 * @route   PUT /api/flow/:flowId/conditions/:id
 * @desc    Mettre à jour une condition
 * @access  Private (editor+)
 */
router.put('/:id', hasFlowAccess('editor'), validateMongoId('id'), validateCondition, asyncHandler(conditionController.updateCondition));

/**
 * @route   DELETE /api/flow/:flowId/conditions/:id
 * @desc    Supprimer une condition
 * @access  Private (editor+)
 */
router.delete('/:id', hasFlowAccess('editor'), validateMongoId('id'), asyncHandler(conditionController.deleteCondition));

/**
 * @route   POST /api/flow/:flowId/conditions/evaluate
 * @desc    Évaluer une condition
 * @access  Private (viewer+)
 */
router.post('/evaluate', asyncHandler(conditionController.evaluateCondition));

/**
 * @route   POST /api/flow/:flowId/conditions/validate
 * @desc    Valider une expression conditionnelle sans l'exécuter
 * @access  Private (viewer+)
 */
router.post('/validate', asyncHandler(async (req, res) => {
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
