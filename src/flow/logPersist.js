// src/flow/logPersist.js
import { ExecutionLog } from '../models/index.js';
import flowLog from './flowLogger.js';
import mongoose from 'mongoose';

// Helper function to check if a string is a valid ObjectId
const isValidObjectId = (id) => {
  return id && mongoose.Types.ObjectId.isValid(id);
};

// Helper function to convert string to ObjectId if valid, or return null
const toObjectId = (id) => {
  return isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
};

// Helper function to ensure we have a valid ObjectId for required fields
const ensureValidObjectId = (id) => {
  if (isValidObjectId(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  // If not valid, create a new ObjectId to use as a fallback
  return new mongoose.Types.ObjectId();
};

// Helper function to extract the actual flowId from the task object in the execution context
const getFlowIdFromContext = () => {
  try {
    // Try to get the task object from the execution context
    const task = global.__executionContext?.get('task');
    
    // If we have a task object and it has a flow property that's a valid ObjectId
    if (task && task.flow && isValidObjectId(task.flow)) {
      return new mongoose.Types.ObjectId(task.flow);
    }
    
    // If we have a global flowId that's valid
    if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      return new mongoose.Types.ObjectId(global.__currentFlowId);
    }
    
    // Fallback to a new ObjectId
    return new mongoose.Types.ObjectId();
  } catch (error) {
    // If anything goes wrong, return a new ObjectId
    return new mongoose.Types.ObjectId();
  }
};

// Helper function to extract the actual taskId from the execution context
const getTaskIdFromContext = () => {
  try {
    // Try to get the task object from the execution context
    const task = global.__executionContext?.get('task');
    
    // If we have a task object and it has an id property that's a valid ObjectId
    if (task && task.id && isValidObjectId(task.id)) {
      return new mongoose.Types.ObjectId(task.id);
    }
    
    // Fallback to a new ObjectId
    return new mongoose.Types.ObjectId();
  } catch (error) {
    // If anything goes wrong, return a new ObjectId
    return new mongoose.Types.ObjectId();
  }
};

/**
 * Wrapper around flowLog that persists logs to MongoDB
 * @param {string} level - Log level ('info', 'debug', 'warn', 'error')
 * @param {Object} meta - Metadata for the log entry
 * @param {string} meta.taskId - ID of the task being executed
 * @param {string} meta.flowId - ID of the flow being executed
 * @param {string} meta.message - Log message
 * @param {string} [meta.nodeId] - ID of the node being executed (optional)
 * @param {string} [meta.nodeType] - Type of the node being executed (optional)
 * @param {Object} [meta.payload] - Additional data to log (optional)
 * @returns {void}
 */
const logPersist = {
  /**
   * Log an info message and persist it to MongoDB
   * @param {string} message - Log message
   * @param {Object} meta - Metadata for the log entry
   */
  info: (message, meta = {}) => {
    // Call the original logger
    flowLog.info(message, meta);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from meta, task, or global variable
    let flowId;
    if (meta.flowId && isValidObjectId(meta.flowId)) {
      flowId = new mongoose.Types.ObjectId(meta.flowId);
    } else if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get taskId from meta, task, or create a new one
    let taskId;
    if (meta.taskId && isValidObjectId(meta.taskId)) {
      taskId = new mongoose.Types.ObjectId(meta.taskId);
    } else if (task && task.id && isValidObjectId(task.id)) {
      taskId = new mongoose.Types.ObjectId(task.id);
    } else {
      taskId = new mongoose.Types.ObjectId();
    }
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'info',
        nodeId: meta.nodeId || null,
        nodeType: meta.nodeType || null,
        message: message,
        payload: meta.payload || null
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log a debug message and persist it to MongoDB
   * @param {string} message - Log message
   * @param {Object} meta - Metadata for the log entry
   */
  debug: (message, meta = {}) => {
    // Call the original logger
    flowLog.debug(message, meta);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from meta, task, or global variable
    let flowId;
    if (meta.flowId && isValidObjectId(meta.flowId)) {
      flowId = new mongoose.Types.ObjectId(meta.flowId);
    } else if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get taskId from meta, task, or create a new one
    let taskId;
    if (meta.taskId && isValidObjectId(meta.taskId)) {
      taskId = new mongoose.Types.ObjectId(meta.taskId);
    } else if (task && task.id && isValidObjectId(task.id)) {
      taskId = new mongoose.Types.ObjectId(task.id);
    } else {
      taskId = new mongoose.Types.ObjectId();
    }
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'debug',
        nodeId: meta.nodeId || null,
        nodeType: meta.nodeType || null,
        message: message,
        payload: meta.payload || null
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log a warning message and persist it to MongoDB
   * @param {string} message - Log message
   * @param {Object} meta - Metadata for the log entry
   */
  warn: (message, meta = {}) => {
    // Call the original logger
    flowLog.warn(message, meta);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from meta, task, or global variable
    let flowId;
    if (meta.flowId && isValidObjectId(meta.flowId)) {
      flowId = new mongoose.Types.ObjectId(meta.flowId);
    } else if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get taskId from meta, task, or create a new one
    let taskId;
    if (meta.taskId && isValidObjectId(meta.taskId)) {
      taskId = new mongoose.Types.ObjectId(meta.taskId);
    } else if (task && task.id && isValidObjectId(task.id)) {
      taskId = new mongoose.Types.ObjectId(task.id);
    } else {
      taskId = new mongoose.Types.ObjectId();
    }
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'warn',
        nodeId: meta.nodeId || null,
        nodeType: meta.nodeType || null,
        message: message,
        payload: meta.payload || null
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log an error message and persist it to MongoDB
   * @param {string} message - Log message
   * @param {Error} error - Error object
   * @param {Object} meta - Metadata for the log entry
   */
  error: (message, error, meta = {}) => {
    // Call the original logger
    flowLog.error(message, error, meta);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from meta, task, or global variable
    let flowId;
    if (meta.flowId && isValidObjectId(meta.flowId)) {
      flowId = new mongoose.Types.ObjectId(meta.flowId);
    } else if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get taskId from meta, task, or create a new one
    let taskId;
    if (meta.taskId && isValidObjectId(meta.taskId)) {
      taskId = new mongoose.Types.ObjectId(meta.taskId);
    } else if (task && task.id && isValidObjectId(task.id)) {
      taskId = new mongoose.Types.ObjectId(task.id);
    } else {
      taskId = new mongoose.Types.ObjectId();
    }
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'error',
        nodeId: meta.nodeId || null,
        nodeType: meta.nodeType || null,
        message: message,
        payload: {
          ...meta.payload,
          error: error?.message,
          stack: error?.stack
        }
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log flow execution start and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} taskType - Type of the task being executed
   */
  startExecution: (taskId, taskType) => {
    // Call the original logger
    flowLog.startExecution(taskId, taskType);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from task or global variable
    let flowId;
    if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get valid taskId
    const validTaskId = isValidObjectId(taskId) ? 
      new mongoose.Types.ObjectId(taskId) : 
      (task && task.id && isValidObjectId(task.id) ? 
        new mongoose.Types.ObjectId(task.id) : 
        new mongoose.Types.ObjectId());
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: validTaskId,
        flowId: flowId,
        level: 'info',
        message: `Starting flow execution for task: ${taskId} - ${taskType}`,
        payload: {
          event: 'flow_execution_start',
          taskType
        }
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log flow execution end and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {boolean} success - Whether the execution was successful
   * @param {Object} result - Result of the execution
   */
  endExecution: (taskId, success, result) => {
    // Call the original logger
    flowLog.endExecution(taskId, success, result);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from task or global variable
    let flowId;
    if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get valid taskId
    const validTaskId = isValidObjectId(taskId) ? 
      new mongoose.Types.ObjectId(taskId) : 
      (task && task.id && isValidObjectId(task.id) ? 
        new mongoose.Types.ObjectId(task.id) : 
        new mongoose.Types.ObjectId());
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: validTaskId,
        flowId: flowId,
        level: success ? 'info' : 'error',
        message: `Flow execution ${success ? 'completed successfully' : 'failed'} for task: ${taskId}`,
        payload: {
          event: 'flow_execution_end',
          success,
          result: success ? result : { error: result?.error }
        }
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log node execution start and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} nodeId - ID of the node being executed
   * @param {string} nodeType - Type of the node being executed
   */
  startNodeExecution: (nodeId, nodeType) => {
    // Call the original logger
    flowLog.startNodeExecution(nodeId, nodeType);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from task or global variable
    let flowId;
    if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get valid taskId from task
    const taskId = task && task.id && isValidObjectId(task.id) ? 
      new mongoose.Types.ObjectId(task.id) : 
      new mongoose.Types.ObjectId();
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'debug',
        nodeId,
        nodeType,
        message: `Executing node: ${nodeId} (${nodeType})`,
        payload: {
          event: 'node_execution_start'
        }
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log node execution end and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} nodeId - ID of the node being executed
   * @param {string} nodeType - Type of the node being executed
   * @param {Object} outputData - Output data from the node
   */
  endNodeExecution: (nodeId, nodeType, outputData) => {
    // Call the original logger
    flowLog.endNodeExecution(nodeId, nodeType, outputData);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from task or global variable
    let flowId;
    if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get valid taskId from task
    const taskId = task && task.id && isValidObjectId(task.id) ? 
      new mongoose.Types.ObjectId(task.id) : 
      new mongoose.Types.ObjectId();
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'debug',
        nodeId,
        nodeType,
        message: `Node execution completed: ${nodeId} (${nodeType})`,
        payload: {
          event: 'node_execution_end',
          output: outputData
        }
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  },
  
  /**
   * Log node execution error and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} nodeId - ID of the node being executed
   * @param {string} nodeType - Type of the node being executed
   * @param {Error} error - Error object
   */
  nodeError: (nodeId, nodeType, error) => {
    // Call the original logger
    flowLog.nodeError(nodeId, nodeType, error);
    
    // Get task from execution context if available
    const task = global.__executionContext?.get('task');
    
    // Get flowId from task or global variable
    let flowId;
    if (task && task.flow && isValidObjectId(task.flow)) {
      flowId = new mongoose.Types.ObjectId(task.flow);
    } else if (global.__currentFlowId && isValidObjectId(global.__currentFlowId)) {
      flowId = new mongoose.Types.ObjectId(global.__currentFlowId);
    } else {
      flowId = new mongoose.Types.ObjectId();
    }
    
    // Get valid taskId from task
    const taskId = task && task.id && isValidObjectId(task.id) ? 
      new mongoose.Types.ObjectId(task.id) : 
      new mongoose.Types.ObjectId();
    
    // Persist to MongoDB (fire and forget)
    {
      void ExecutionLog.create({
        taskId: taskId,
        flowId: flowId,
        level: 'error',
        nodeId,
        nodeType,
        message: `Error executing node: ${nodeId} (${nodeType})`,
        payload: {
          event: 'node_execution_error',
          error: error.message,
          stack: error.stack
        }
      }).catch(err => {
        console.error('Failed to persist log to MongoDB:', err);
      });
    }
  }
};

export default logPersist;
