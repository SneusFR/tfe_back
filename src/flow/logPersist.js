// src/flow/logPersist.js
import { ExecutionLog } from '../models/index.js';
import flowLog from './flowLogger.js';

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
    
    // Persist to MongoDB (fire and forget)
    if (meta.taskId && meta.flowId) {
      void ExecutionLog.create({
        taskId: meta.taskId,
        flowId: meta.flowId,
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
    
    // Persist to MongoDB (fire and forget)
    if (meta.taskId && meta.flowId) {
      void ExecutionLog.create({
        taskId: meta.taskId,
        flowId: meta.flowId,
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
    
    // Persist to MongoDB (fire and forget)
    if (meta.taskId && meta.flowId) {
      void ExecutionLog.create({
        taskId: meta.taskId,
        flowId: meta.flowId,
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
    
    // Persist to MongoDB (fire and forget)
    if (meta.taskId && meta.flowId) {
      void ExecutionLog.create({
        taskId: meta.taskId,
        flowId: meta.flowId,
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
  startExecution: (taskId, flowId, taskType) => {
    // Call the original logger
    flowLog.startExecution(taskId, taskType);
    
    // Persist to MongoDB (fire and forget)
    void ExecutionLog.create({
      taskId,
      flowId,
      level: 'info',
      message: `Starting flow execution for task: ${taskId} - ${taskType}`,
      payload: {
        event: 'flow_execution_start',
        taskType
      }
    }).catch(err => {
      console.error('Failed to persist log to MongoDB:', err);
    });
  },
  
  /**
   * Log flow execution end and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {boolean} success - Whether the execution was successful
   * @param {Object} result - Result of the execution
   */
  endExecution: (taskId, flowId, success, result) => {
    // Call the original logger
    flowLog.endExecution(taskId, success, result);
    
    // Persist to MongoDB (fire and forget)
    void ExecutionLog.create({
      taskId,
      flowId,
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
  },
  
  /**
   * Log node execution start and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} nodeId - ID of the node being executed
   * @param {string} nodeType - Type of the node being executed
   */
  startNodeExecution: (taskId, flowId, nodeId, nodeType) => {
    // Call the original logger
    flowLog.startNodeExecution(nodeId, nodeType);
    
    // Persist to MongoDB (fire and forget)
    void ExecutionLog.create({
      taskId,
      flowId,
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
  },
  
  /**
   * Log node execution end and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} nodeId - ID of the node being executed
   * @param {string} nodeType - Type of the node being executed
   * @param {Object} outputData - Output data from the node
   */
  endNodeExecution: (taskId, flowId, nodeId, nodeType, outputData) => {
    // Call the original logger
    flowLog.endNodeExecution(nodeId, nodeType, outputData);
    
    // Persist to MongoDB (fire and forget)
    void ExecutionLog.create({
      taskId,
      flowId,
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
  },
  
  /**
   * Log node execution error and persist it to MongoDB
   * @param {string} taskId - ID of the task being executed
   * @param {string} flowId - ID of the flow being executed
   * @param {string} nodeId - ID of the node being executed
   * @param {string} nodeType - Type of the node being executed
   * @param {Error} error - Error object
   */
  nodeError: (taskId, flowId, nodeId, nodeType, error) => {
    // Call the original logger
    flowLog.nodeError(nodeId, nodeType, error);
    
    // Persist to MongoDB (fire and forget)
    void ExecutionLog.create({
      taskId,
      flowId,
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
};

export default logPersist;
