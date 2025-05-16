// src/controllers/executionLogController.js
import { ExecutionLog, Task } from '../models/index.js';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { flowService } from '../services/index.js';

/**
 * Truncate payload if it's too large
 * @param {Object} payload - The payload to truncate
 * @returns {string} - The truncated payload as a string
 */
const truncatePayload = (payload) => {
  if (!payload) return null;
  
  // Convert to string to check size
  const payloadStr = JSON.stringify(payload);
  
  // If payload is larger than 5KB, truncate it
  if (payloadStr.length > 5000) {
    return payloadStr.substring(0, 200) + '...(truncated)';
  }
  
  // Always return a string for consistency
  return payloadStr;
};

/**
 * @desc    Get execution logs for a task
 * @route   GET /api/executions/:taskId/logs
 * @access  Private (requires authentication + flow access)
 */
export const getExecutionLogs = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { since } = req.query;
  
  // Validate taskId
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de tâche invalide',
      code: 'INVALID_TASK_ID'
    });
  }
  
  // Check if task exists and get its flowId
  const task = await Task.findById(taskId).select('flow').lean();
  if (!task) {
    return res.status(404).json({
      success: false,
      message: 'Tâche non trouvée',
      code: 'TASK_NOT_FOUND'
    });
  }
  
  // Check if user has access to the flow
  const flowId = task.flow;
  const hasAccess = await flowService.checkFlowAccess(
    req.user.id,
    flowId,
    'viewer'
  );
  
  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'Accès non autorisé à ce flow',
      code: 'INSUFFICIENT_FLOW_PERMISSION'
    });
  }
  
  // Build query
  const query = { taskId };
  
  // Add since filter if provided
  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Format de date invalide pour le paramètre since',
        code: 'INVALID_DATE_FORMAT'
      });
    }
    query.createdAt = { $gt: sinceDate };
  }
  
  // Get pagination parameters
  const { page, limit, skip, sort } = req.pagination;
  
  // Get total count
  const total = await ExecutionLog.countDocuments(query);
  
  // Get logs with pagination
  const logs = await ExecutionLog.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
  
  // Format response
  const formattedLogs = logs.map(log => ({
    timestamp: log.createdAt,
    level: log.level,
    nodeId: log.nodeId,
    nodeType: log.nodeType,
    message: log.message,
    payload: truncatePayload(log.payload)
  }));
  
  res.json({
    page,
    limit,
    total,
    data: formattedLogs
  });
});
