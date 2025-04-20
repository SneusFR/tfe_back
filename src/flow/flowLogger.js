// src/flow/flowLogger.js
import winston from 'winston';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create a custom format for console output
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let metaStr = '';
  if (Object.keys(metadata).length > 0) {
    metaStr = JSON.stringify(metadata, null, 2);
  }
  
  // Use emojis for different log levels
  const emoji = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍',
    verbose: '📝',
  }[level] || '🔄';
  
  return `${timestamp} ${emoji} [FLOW ENGINE] ${level.toUpperCase()}: ${message} ${metaStr}`;
});

// Create a Winston logger for flow execution
const flowLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  defaultMeta: { service: 'flow-execution-engine' },
  transports: [
    // Console transport with colorized output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        consoleFormat
      )
    }),
    // File transport for errors
    new winston.transports.File({ 
      filename: 'logs/flow-error.log', 
      level: 'error' 
    }),
    // File transport for all logs
    new winston.transports.File({ 
      filename: 'logs/flow.log' 
    })
  ]
});

// Helper function to mask sensitive data in objects
const maskSensitiveData = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Create a copy to avoid modifying the original
  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  
  // List of sensitive field names
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'apiKey', 'api_key', 'auth',
    'authorization', 'credential', 'jwt', 'accessToken', 'refreshToken'
  ];
  
  // Recursively mask sensitive fields
  const maskRecursive = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    
    Object.keys(result).forEach(key => {
      const lowerKey = key.toLowerCase();
      
      // Mask sensitive fields
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        result[key] = '<masked>';
      } 
      // Process nested objects recursively
      else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = maskRecursive(result[key]);
      }
      // Truncate long string values
      else if (typeof result[key] === 'string' && result[key].length > 200) {
        result[key] = result[key].substring(0, 200) + '... (truncated)';
      }
    });
    
    return result;
  };
  
  return maskRecursive(masked);
};

// Add helper methods for common logging patterns
const flowLog = {
  // Log flow execution start
  startExecution: (taskId, taskType) => {
    flowLogger.info(`Starting flow execution for task: ${taskId} - ${taskType}`, {
      event: 'flow_execution_start',
      taskId,
      taskType
    });
  },
  
  // Log flow execution completion
  endExecution: (taskId, success, result) => {
    const maskedResult = maskSensitiveData(result);
    if (success) {
      flowLogger.info(`Flow execution completed successfully for task: ${taskId}`, {
        event: 'flow_execution_end',
        taskId,
        success,
        result: maskedResult
      });
    } else {
      flowLogger.error(`Flow execution failed for task: ${taskId}`, {
        event: 'flow_execution_end',
        taskId,
        success,
        error: maskedResult
      });
    }
  },
  
  // Log node execution start
  startNodeExecution: (nodeId, nodeType) => {
    flowLogger.debug(`Executing node: ${nodeId} (${nodeType})`, {
      event: 'node_execution_start',
      nodeId,
      nodeType
    });
  },
  
  // Log node execution completion
  endNodeExecution: (nodeId, nodeType, outputData) => {
    const maskedOutput = maskSensitiveData(outputData);
    flowLogger.debug(`Node execution completed: ${nodeId} (${nodeType})`, {
      event: 'node_execution_end',
      nodeId,
      nodeType,
      output: maskedOutput
    });
  },
  
  // Log node execution error
  nodeError: (nodeId, nodeType, error) => {
    flowLogger.error(`Error executing node: ${nodeId} (${nodeType})`, {
      event: 'node_execution_error',
      nodeId,
      nodeType,
      error: error.message,
      stack: error.stack
    });
  },
  
  // Log data transfer between nodes
  dataTransfer: (sourceNodeId, sourceHandle, targetNodeId, targetHandle, data) => {
    const maskedData = maskSensitiveData(data);
    flowLogger.debug(`Data transfer: ${sourceNodeId}.${sourceHandle} -> ${targetNodeId}.${targetHandle}`, {
      event: 'data_transfer',
      sourceNodeId,
      sourceHandle,
      targetNodeId,
      targetHandle,
      data: maskedData
    });
  },
  
  // Log API request details
  apiRequest: (nodeId, method, url, headers, body) => {
    const maskedHeaders = maskSensitiveData(headers);
    const maskedBody = maskSensitiveData(body);
    
    flowLogger.info(`API Request: ${method} ${url}`, {
      event: 'api_request',
      nodeId,
      method,
      url,
      headers: maskedHeaders,
      body: maskedBody
    });
  },
  
  // Log API response details
  apiResponse: (nodeId, method, url, status, responseData, responseTime) => {
    const maskedData = maskSensitiveData(responseData);
    
    flowLogger.info(`API Response: ${status} ${method} ${url} (${responseTime}ms)`, {
      event: 'api_response',
      nodeId,
      method,
      url,
      status,
      responseTime,
      data: maskedData
    });
  },
  
  // Log API error details
  apiError: (nodeId, method, url, error, responseTime) => {
    flowLogger.error(`API Error: ${method} ${url}`, {
      event: 'api_error',
      nodeId,
      method,
      url,
      error: error.message,
      status: error.response?.status,
      data: maskSensitiveData(error.response?.data),
      responseTime
    });
  },
  
  // Log execution context updates
  contextUpdate: (key, value) => {
    const maskedValue = maskSensitiveData(value);
    flowLogger.debug(`Execution context updated: ${key}`, {
      event: 'context_update',
      key,
      value: maskedValue
    });
  },
  
  // Generic info log
  info: (message, metadata = {}) => {
    flowLogger.info(message, maskSensitiveData(metadata));
  },
  
  // Generic debug log
  debug: (message, metadata = {}) => {
    flowLogger.debug(message, maskSensitiveData(metadata));
  },
  
  // Generic warning log
  warn: (message, metadata = {}) => {
    flowLogger.warn(message, maskSensitiveData(metadata));
  },
  
  // Generic error log
  error: (message, error, metadata = {}) => {
    flowLogger.error(message, {
      ...maskSensitiveData(metadata),
      error: error.message,
      stack: error.stack
    });
  }
};

export default flowLog;
