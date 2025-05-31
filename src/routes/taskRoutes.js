import express from 'express';
import { taskController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';
import { COLLABORATION_ROLE } from '../utils/constants.js';

const router = express.Router({ mergeParams: true }); // Pour accéder aux params de la route parent (flowId)
const { protect, hasFlowAccess } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateTask, validatePagination } = validationMiddleware;

// Appliquer le middleware hasFlowAccess à toutes les routes
router.use(protect, hasFlowAccess(COLLABORATION_ROLE.VIEWER));

/**
 * @route   GET /api/flow/:flowId/tasks
 * @desc    Récupérer toutes les tâches d'un flow
 * @access  Private (viewer+)
 */
router.get('/', validatePagination, asyncHandler(taskController.getTasks));

/**
 * @route   GET /api/flow/:flowId/tasks/:id
 * @desc    Récupérer une tâche par ID
 * @access  Private (viewer+)
 */
router.get('/:id', validateMongoId('id'), asyncHandler(taskController.getTaskById));

/**
 * @route   POST /api/flow/:flowId/tasks
 * @desc    Créer une nouvelle tâche
 * @access  Private (editor+)
 */
router.post('/', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateTask, asyncHandler(taskController.createTask));

/**
 * @route   PUT /api/flow/:flowId/tasks/:id
 * @desc    Mettre à jour une tâche
 * @access  Private (editor+)
 */
router.put('/:id', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), validateTask, asyncHandler(taskController.updateTask));

/**
 * @route   DELETE /api/flow/:flowId/tasks/:id
 * @desc    Supprimer une tâche
 * @access  Private (editor+)
 */
router.delete('/:id', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), asyncHandler(taskController.deleteTask));

/**
 * @route   PUT /api/flow/:flowId/tasks/:id/complete
 * @desc    Marquer une tâche comme terminée
 * @access  Private (editor+)
 */
router.put('/:id/complete', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), asyncHandler(taskController.completeTask));

/**
 * @route   PUT /api/flow/:flowId/tasks/:id/in-progress
 * @desc    Marquer une tâche comme en cours
 * @access  Private (editor+)
 */
router.put('/:id/in-progress', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), asyncHandler(taskController.setInProgressTask));

/**
 * @route   PUT /api/flow/:flowId/tasks/:id/pending
 * @desc    Marquer une tâche comme en attente
 * @access  Private (editor+)
 */
router.put('/:id/pending', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), asyncHandler(taskController.setPendingTask));

export default router;
