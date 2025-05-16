// src/routes/executionLogRoutes.js
import express from 'express';
import { executionLogController } from '../controllers/index.js';
import { protect, hasFlowAccess } from '../middleware/authMiddleware.js';
import { validatePagination } from '../middleware/validationMiddleware.js';

const router = express.Router();

/**
 * @route   GET /api/executions/logs
 * @desc    List execution logs with various filters
 * @access  Private (requires authentication + flow access)
 */
router.get(
  '/logs',
  protect,
  validatePagination,
  executionLogController.listExecutionLogs
);

/**
 * @route   GET /api/executions/:taskId/logs
 * @desc    Get execution logs for a task
 * @access  Private (requires authentication + flow access)
 */
router.get(
  '/:taskId/logs',
  protect,
  validatePagination,
  executionLogController.getExecutionLogs
);

/**
 * @route   DELETE /api/executions/logs
 * @desc    Delete execution logs
 * @access  Private (requires authentication + flow owner access or own tasks)
 */
router.delete(
  '/logs',
  protect,
  executionLogController.deleteExecutionLogs
);

export default router;
