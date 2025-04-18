import express from 'express';
import { taskController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateTask, validatePagination } = validationMiddleware;

/**
 * @route   GET /api/tasks
 * @desc    Récupérer toutes les tâches d'un utilisateur
 * @access  Private
 */
router.get('/', protect, validatePagination, asyncHandler(taskController.getTasks));

/**
 * @route   GET /api/tasks/stats
 * @desc    Récupérer les statistiques des tâches d'un utilisateur
 * @access  Private
 */
router.get('/stats', protect, asyncHandler(async (req, res) => {
  const { taskService } = await import('../services/index.js');
  const stats = await taskService.getTaskStats(req.user.id);
  res.json(stats);
}));

/**
 * @route   GET /api/tasks/:id
 * @desc    Récupérer une tâche par ID
 * @access  Private
 */
router.get('/:id', protect, validateMongoId('id'), asyncHandler(taskController.getTaskById));

/**
 * @route   POST /api/tasks
 * @desc    Créer une nouvelle tâche
 * @access  Private
 */
router.post('/', protect, validateTask, asyncHandler(taskController.createTask));

/**
 * @route   PUT /api/tasks/:id
 * @desc    Mettre à jour une tâche
 * @access  Private
 */
router.put('/:id', protect, validateMongoId('id'), validateTask, asyncHandler(taskController.updateTask));

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Supprimer une tâche
 * @access  Private
 */
router.delete('/:id', protect, validateMongoId('id'), asyncHandler(taskController.deleteTask));

/**
 * @route   PUT /api/tasks/:id/complete
 * @desc    Marquer une tâche comme terminée
 * @access  Private
 */
router.put('/:id/complete', protect, validateMongoId('id'), asyncHandler(taskController.completeTask));

export default router;
