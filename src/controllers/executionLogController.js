// src/controllers/executionLogController.js
import { ExecutionLog, Task, Flow } from '../models/index.js';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { flowService } from '../services/index.js';
import { COLLABORATION_ROLE } from '../utils/constants.js';

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
    COLLABORATION_ROLE.VIEWER
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
  const { page, limit, skip } = req.pagination;
  const sort = req.pagination.sort;
  
  // Get total count
  const total = await ExecutionLog.countDocuments(query);
  
  // Get logs with pagination
  const logs = await ExecutionLog.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
  
  // Format response
  const formattedLogs = logs.map(log => {
    // Create the base log object
    const formattedLog = {
      timestamp: log.createdAt,
      level: log.level,
      nodeId: log.nodeId,
      nodeType: log.nodeType,
      message: log.message
    };
    
    // Handle payload differently based on log level and content
    if (log.level === 'error') {
      // For error logs, extract and format detailed error information
      if (log.payload) {
        // Include the error message
        formattedLog.error = log.payload.error;
        
        // Include error details if available
        if (log.payload.errorDetails) {
          formattedLog.errorDetails = log.payload.errorDetails;
        }
        
        // Include stack trace in development environment
        if (process.env.NODE_ENV !== 'production' && log.payload.stack) {
          formattedLog.stack = log.payload.stack;
        }
      }
      
      // Still include the full payload (truncated) for debugging
      formattedLog.payload = truncatePayload(log.payload);
    } else {
      // For non-error logs, just include the truncated payload
      formattedLog.payload = truncatePayload(log.payload);
    }
    
    return formattedLog;
  });
  
  res.json({
    page,
    limit,
    total,
    data: formattedLogs
  });
});

/**
 * @desc    List execution logs with various filters
 * @route   GET /api/executions/logs
 * @access  Private (requires authentication + flow access)
 */
export const listExecutionLogs = asyncHandler(async (req, res) => {
  const { taskIds, flowId, level, since, until } = req.query;
  const query = {};
  
  // Apply filters
  if (taskIds) {
    const taskIdArray = taskIds.split(',');
    
    // Validate taskIds
    for (const id of taskIdArray) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID de tâche invalide',
          code: 'INVALID_TASK_ID'
        });
      }
    }
    
    // Check access for each task
    if (taskIdArray.length > 0) {
      const tasks = await Task.find({ _id: { $in: taskIdArray } }).select('flow').lean();
      
      // Check if all tasks exist
      if (tasks.length !== taskIdArray.length) {
        return res.status(404).json({
          success: false,
          message: 'Une ou plusieurs tâches non trouvées',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      // Check if user has access to all flows
      for (const task of tasks) {
        const hasAccess = await flowService.checkFlowAccess(
          req.user.id,
          task.flow,
          COLLABORATION_ROLE.VIEWER
        );
        
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'Accès non autorisé à un ou plusieurs flows',
            code: 'INSUFFICIENT_FLOW_PERMISSION'
          });
        }
      }
    }
    
    query.taskId = { $in: taskIdArray };
  }
  
  // Filter by flowId
  if (flowId) {
    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de flow invalide',
        code: 'INVALID_FLOW_ID'
      });
    }
    
    // Check if flow exists
    const flow = await Flow.findById(flowId).lean();
    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Flow non trouvé',
        code: 'FLOW_NOT_FOUND'
      });
    }
    
    // Check if user has access to the flow
    const hasAccess = await flowService.checkFlowAccess(
      req.user.id,
      flowId,
      COLLABORATION_ROLE.VIEWER
    );
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce flow',
        code: 'INSUFFICIENT_FLOW_PERMISSION'
      });
    }
    
    query.flowId = flowId;
  }
  
  // Filter by log level
  if (level) {
    if (!['info', 'debug', 'warn', 'error'].includes(level)) {
      return res.status(400).json({
        success: false,
        message: 'Niveau de log invalide',
        code: 'INVALID_LOG_LEVEL'
      });
    }
    query.level = level;
  }
  
  // Filter by date range
  if (since || until) {
    query.createdAt = {};
    
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Format de date invalide pour le paramètre since',
          code: 'INVALID_DATE_FORMAT'
        });
      }
      query.createdAt.$gte = sinceDate;
    }
    
    if (until) {
      const untilDate = new Date(until);
      if (isNaN(untilDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Format de date invalide pour le paramètre until',
          code: 'INVALID_DATE_FORMAT'
        });
      }
      query.createdAt.$lte = untilDate;
    }
  }
  
  // Get pagination parameters
  const { page, limit, skip } = req.pagination;
  const sort = req.pagination.sort;
  
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
    ...log,
    payload: truncatePayload(log.payload)
  }));
  
  res.json({
    page,
    limit,
    total,
    data: formattedLogs
  });
});

/**
 * @desc    Delete execution logs
 * @route   DELETE /api/executions/logs
 * @access  Private (requires authentication + flow owner access or own tasks)
 */
export const deleteExecutionLogs = asyncHandler(async (req, res) => {
  const { taskIds, flowId } = req.body;
  
  // Require at least one filter
  if (!taskIds && !flowId) {
    return res.status(400).json({
      success: false,
      message: 'Au moins un filtre (taskIds ou flowId) est requis',
      code: 'MISSING_FILTER'
    });
  }
  
  const deleteFilter = {};
  
  // Delete by taskIds
  if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
    // Validate taskIds
    for (const id of taskIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID de tâche invalide',
          code: 'INVALID_TASK_ID'
        });
      }
    }
    
    // Check access for each task
    const tasks = await Task.find({ _id: { $in: taskIds } }).select('flow user').lean();
    
    // Check if all tasks exist
    if (tasks.length !== taskIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Une ou plusieurs tâches non trouvées',
        code: 'TASK_NOT_FOUND'
      });
    }
    
    // Check if user has owner access to all flows or if they are the task owner
    for (const task of tasks) {
      // Check if user is the task owner
      const isTaskOwner = task.user && task.user.toString() === req.user.id;
      
      if (!isTaskOwner) {
        // If not task owner, check if user is flow owner
        const hasOwnerAccess = await flowService.checkFlowAccess(
          req.user.id,
          task.flow,
          COLLABORATION_ROLE.OWNER
        );
        
        if (!hasOwnerAccess) {
          return res.status(403).json({
            success: false,
            message: 'Accès non autorisé pour supprimer les logs de cette tâche',
            code: 'INSUFFICIENT_PERMISSION'
          });
        }
      }
    }
    
    deleteFilter.taskId = { $in: taskIds };
  }
  
  // Delete by flowId
  if (flowId) {
    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de flow invalide',
        code: 'INVALID_FLOW_ID'
      });
    }
    
    // Check if flow exists
    const flow = await Flow.findById(flowId).lean();
    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Flow non trouvé',
        code: 'FLOW_NOT_FOUND'
      });
    }
    
    // Check if user has owner access to the flow
    const hasOwnerAccess = await flowService.checkFlowAccess(
      req.user.id,
      flowId,
      COLLABORATION_ROLE.OWNER
    );
    
    if (!hasOwnerAccess) {
      return res.status(403).json({
        success: false,
        message: 'Seul le propriétaire du flow peut supprimer tous ses logs',
        code: 'INSUFFICIENT_PERMISSION'
      });
    }
    
    deleteFilter.flowId = flowId;
  }
  
  // Delete logs
  const result = await ExecutionLog.deleteMany(deleteFilter);
  
  res.json({
    success: true,
    message: `${result.deletedCount} logs supprimés avec succès`,
    deletedCount: result.deletedCount
  });
});
