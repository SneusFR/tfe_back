// Flow Execution Engine
// This service handles the execution of a flow diagram by traversing nodes and edges

import axios from 'axios';
import { http } from './httpLogger.js';
import { createWorker } from 'tesseract.js';
import flowLog from './flowLogWrapper.js';
import { ExecutionLog } from '../models/index.js';

// Create an axios instance
const api = axios.create({
  baseURL: '/api'
});

class FlowExecutionEngine {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.executionContext = new Map(); // Stores data during execution
    this.baseApiUrl = 'http://localhost:5171'; // Backend API base URL
    this.backendConfig = null;
    
    // Make execution context available globally for logging
    global.__executionContext = this.executionContext;
    
    flowLog.info(`Flow Execution Engine initialized`, {
      baseApiUrl: this.baseApiUrl,
      timestamp: new Date().toISOString()
    });
  }

  // Set the diagram data (nodes and edges)
  setDiagram(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
    
    flowLog.info(`Diagram set with ${nodes.length} nodes and ${edges.length} edges`, {
      nodeTypes: this.countNodeTypes(),
      edgeCount: edges.length,
      hasStartingNode: this.hasStartingNode()
    });
  }
  
  // Count the number of each type of node in the diagram
  countNodeTypes() {
    const typeCounts = {};
    this.nodes.forEach(node => {
      if (!typeCounts[node.type]) {
        typeCounts[node.type] = 0;
      }
      typeCounts[node.type]++;
    });
    return typeCounts;
  }
  
  // Check if the diagram has a starting node
  hasStartingNode() {
    return this.nodes.some(node => 
      node.type === 'conditionNode' && 
      node.data.isStartingPoint === true
    );
  }

  // Find the starting point node for a given task
  findStartingNode(task) {
    // Look for a condition node marked as starting point
    // that has a returnText matching the task type
    const startingNode = this.nodes.find(node => 
      node.type === 'conditionNode' && 
      node.data.isStartingPoint === true &&
      node.data.returnText === task.type
    );
    
    // If no specific starting node is found, log an error but don't fall back to any starting point
    if (!startingNode) {
      flowLog.error(`No matching starting node found for task type "${task.type}"`, new Error('No matching starting node'), {
        taskType: task.type,
        availableStartingNodes: this.nodes
          .filter(node => node.type === 'conditionNode' && node.data.isStartingPoint === true)
          .map(node => ({
            id: node.id,
            returnText: node.data.returnText
          }))
      });
      return null;
    }
    
    flowLog.info(`Found starting node with return value "${startingNode.data.returnText}" matching task type "${task.type}"`, {
      nodeId: startingNode.id,
      nodeType: startingNode.type,
      returnText: startingNode.data.returnText,
      taskType: task.type
    });
    return startingNode;
  }

  // Execute a flow for a given task
  async executeFlow(task) {
    // Store the task in the execution context
    this.executionContext.set('task', task);
    
    // Make sure the flowId is available globally for logging
    if (task && task.flow) {
      global.__currentFlowId = task.flow;
    }
    
    flowLog.startExecution(task.id, task.type);
    flowLog.info(`Task details`, { 
      taskId: task.id, 
      taskType: task.type, 
      sourceId: task.sourceId,
      senderEmail: task.senderEmail,
      recipientEmail: task.recipientEmail,
      hasAttachments: task.attachments ? task.attachments.length > 0 : false
    });
    
    // Find the starting node that matches the task type or description
    const startingNode = this.findStartingNode(task);
    if (!startingNode) {
      flowLog.error(`No starting node found for task type: ${task.type}`, new Error('No starting node found'));
      return { success: false, error: 'No starting node found for this task type' };
    }
    
    flowLog.info(`Found starting node`, {
      nodeId: startingNode.id,
      conditionText: startingNode.data.conditionText,
      returnText: startingNode.data.returnText,
      isStartingPoint: startingNode.data.isStartingPoint
    });
    
    if (task.sourceId) {
      flowLog.info(`Task email ID: ${task.sourceId}`);
    }
    
    // Initialize execution context with task data
    this.executionContext.clear();
    this.executionContext.set('task', task);
    flowLog.contextUpdate('task', task);
    
    // Populate starting node attributes with task data
    if (startingNode.data.emailAttributes) {
      // Map task data to email attributes
      const emailAttributes = {
        ...startingNode.data.emailAttributes,
        email_id: task.sourceId || startingNode.data.emailAttributes.email_id, // Map task sourceId to email_id
        fromEmail: task.senderEmail || startingNode.data.emailAttributes.fromEmail,
        toEmail: task.recipientEmail || startingNode.data.emailAttributes.toEmail,
        subject: task.subject || startingNode.data.emailAttributes.subject,
        fromDisplayName: task.senderName || startingNode.data.emailAttributes.fromDisplayName,
        toDisplayName: task.recipientName || startingNode.data.emailAttributes.toDisplayName,
        content: task.body || startingNode.data.emailAttributes.content,
        date: task.date || startingNode.data.emailAttributes.date,
        attachment_id: task.attachmentId || startingNode.data.emailAttributes.attachment_id
      };
      
      flowLog.info(`Mapped email ID to execution context: ${emailAttributes.email_id}`);
      
      // Handle attachments if they exist in the task
      if (task.attachments && Array.isArray(task.attachments)) {
        emailAttributes.attachments = task.attachments.map(attachment => ({
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          extension: attachment.extension,
          mime: attachment.mime,
          cid: attachment.cid
        }));
        
        flowLog.info(`Found ${emailAttributes.attachments.length} attachments in task`, {
          attachmentCount: emailAttributes.attachments.length,
          attachments: emailAttributes.attachments.map(att => ({
            id: att.id,
            name: att.name,
            size: att.size,
            extension: att.extension,
            mime: att.mime
          }))
        });
      }
      
      // Store each attribute in the execution context
      Object.entries(emailAttributes).forEach(([key, value]) => {
        this.executionContext.set(`attr-${key}`, value);
      });
      
      // Store individual attachment IDs in the execution context for direct access
      if (emailAttributes.attachments && emailAttributes.attachments.length > 0) {
        // Store the first attachment ID as the main attachment_id attribute
        if (emailAttributes.attachments[0].id) {
          this.executionContext.set('attr-attachment_id', emailAttributes.attachments[0].id);
          flowLog.debug(`Stored first attachment ID ${emailAttributes.attachments[0].id} in execution context as attr-attachment_id`);
        }
        
        // Store each attachment ID individually
        emailAttributes.attachments.forEach((attachment, index) => {
          if (attachment.id) {
            this.executionContext.set(`attr-attachment-${index}`, attachment.id);
            flowLog.debug(`Stored attachment ID ${attachment.id} in execution context as attr-attachment-${index}`);
          }
        });
      }
    }
    
    // Execute the flow starting from the starting node
    try {
      const result = await this.executeNode(startingNode);
      flowLog.endExecution(task.id, true, result);
      return { success: true, result };
    } catch (error) {
      flowLog.endExecution(task.id, false, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // Execute a single node and follow its outgoing edges
  async executeNode(node) {
    flowLog.startNodeExecution(node.id, node.type);
    
    let outputData;
    
    // Execute node based on its type
    switch (node.type) {
      case 'conditionNode':
        outputData = await this.executeConditionNode(node);
        break;
      case 'apiNode':
        outputData = await this.executeApiNode(node);
        break;
      case 'textNode':
        outputData = await this.executeTextNode(node);
        break;
      case 'intNode':
        outputData = await this.executeIntNode(node);
        break;
      case 'sendingMailNode':
        outputData = await this.executeSendingMailNode(node);
        break;
      case 'emailAttachmentNode':
        outputData = await this.executeEmailAttachmentNode(node);
        break;
      case 'ocrNode':
        outputData = await this.executeOcrNode(node);
        break;
      case 'consoleLogNode':
        outputData = await this.executeConsoleLogNode(node);
        break;
      case 'aiNode':
        outputData = await this.executeAiNode(node);
        break;
      case 'conditionalFlowNode':
        outputData = await this.executeConditionalFlowNode(node);
        break;
      default:
        flowLog.warn(`Unknown node type: ${node.type}`);
        outputData = null;
    }
    
    // Store the node's output in the execution context
    if (outputData !== undefined) {
      this.executionContext.set(`output-${node.id}`, outputData);
      flowLog.contextUpdate(`output-${node.id}`, outputData);
      
      // If the node has a specific output handle, store the data for that handle
      if (node.type === 'apiNode' && outputData) {
        // Store the complete response
        this.executionContext.set(`${node.id}-output`, outputData);
        
      // Store specific parts of the response for the new output handles
        this.executionContext.set(`${node.id}-output-response`, outputData);
        this.executionContext.set(`${node.id}-output-body`, outputData); // For API responses, the data is usually the body
        this.executionContext.set(`${node.id}-output-status`, 200); // Default to 200 for mock responses
        
        flowLog.contextUpdate(`${node.id}-output-response`, outputData);
        flowLog.contextUpdate(`${node.id}-output-body`, outputData);
        flowLog.contextUpdate(`${node.id}-output-status`, 200);
      }
    }
    
    // Process all outgoing edges to transfer data
    const outgoingEdges = this.edges.filter(edge => edge.source === node.id);
    for (const edge of outgoingEdges) {
      const targetNode = this.nodes.find(n => n.id === edge.target);
      if (targetNode && edge.sourceHandle && edge.targetHandle) {
        const sourceData = this.getDataForHandle(node, edge.sourceHandle);
        if (sourceData !== undefined) {
          this.executionContext.set(edge.targetHandle, sourceData);
          flowLog.dataTransfer(node.id, edge.sourceHandle, targetNode.id, edge.targetHandle, sourceData);
        }
      }
    }
    
    // Only follow execution links for flow execution
    const executionEdges = this.edges.filter(edge => 
      edge.source === node.id && 
      edge.data?.isExecutionLink === true
    );
    
    // Process each execution edge
    const results = [];
    
    // Special handling for conditionalFlowNode to follow the correct path
    if (node.type === 'conditionalFlowNode') {
      // Get the condition result (true, false, or default)
      const conditionResult = this.executionContext.get(`${node.id}-condition-result`);
      
      // Find the edge that corresponds to the condition result
      const matchingEdges = executionEdges.filter(edge => {
        // Check if the sourceHandle matches the condition result
        return edge.sourceHandle === `execution-${conditionResult}`;
      });
      
      // Follow the matching edge if found
      if (matchingEdges.length > 0) {
        for (const edge of matchingEdges) {
          const targetNode = this.nodes.find(n => n.id === edge.target);
          if (targetNode) {
            flowLog.info(`Following conditional execution path "${conditionResult}" to node: ${targetNode.id}`, {
              sourceNodeId: node.id,
              targetNodeId: targetNode.id,
              conditionResult: conditionResult,
              edgeType: 'execution'
            });
            // Execute the target node
            const result = await this.executeNode(targetNode);
            results.push(result);
          }
        }
      } else {
        flowLog.warn(`No matching execution path found for condition result "${conditionResult}"`, {
          nodeId: node.id,
          conditionResult: conditionResult,
          availablePaths: executionEdges.map(e => e.sourceHandle)
        });
      }
    } else {
      // Standard execution for other node types
      for (const edge of executionEdges) {
        const targetNode = this.nodes.find(n => n.id === edge.target);
        if (targetNode) {
          flowLog.info(`Following execution link to node: ${targetNode.id}`, {
            sourceNodeId: node.id,
            targetNodeId: targetNode.id,
            edgeType: 'execution'
          });
          // Execute the target node
          const result = await this.executeNode(targetNode);
          results.push(result);
        }
      }
    }
    
    flowLog.endNodeExecution(node.id, node.type, outputData);
    return results.length > 0 ? results : outputData;
  }

  // Get data for a specific handle
  getDataForHandle(node, handleId) {
    // For condition node attributes
    if (handleId.startsWith('attr-') && node.type === 'conditionNode') {
      // Special case for individual attachment handles
      if (handleId.match(/^attr-attachment-\d+$/)) {
        const attachmentId = this.executionContext.get(handleId);
        flowLog.debug(`Getting attachment ID from handle ${handleId}: ${attachmentId}`);
        return attachmentId;
      }
      return this.executionContext.get(handleId);
    }
    
    // For int node output
    if (handleId === 'attr-int' && node.type === 'intNode') {
      return node.data.value;
    }
    
    // For API node output - main output handle
    if (handleId === 'output' && node.type === 'apiNode') {
      return this.executionContext.get(`${node.id}-output`);
    }
    
    // For API node specific output handles
    if (handleId.startsWith('output-') && node.type === 'apiNode') {
      const outputType = handleId.replace('output-', '');
      return this.executionContext.get(`${node.id}-output-${outputType}`);
    }
    
    // For email attachment node output
    if (handleId === 'output-attachment' && node.type === 'emailAttachmentNode') {
      return this.executionContext.get(`${node.id}-output-attachment`);
    }
    
    // For OCR node output
    if (handleId === 'output-text' && node.type === 'ocrNode') {
      return this.executionContext.get(`${node.id}-output-text`);
    }
    
    // For AI node output
    if (handleId === 'attr-output' && node.type === 'aiNode') {
      return this.executionContext.get(`${node.id}-output`);
    }
    
    // For conditional flow node output
    if (node.type === 'conditionalFlowNode') {
      // Return the condition result for the output handle
      if (handleId === 'output-result') {
        return this.executionContext.get(`${node.id}-condition-result`);
      }
    }
    
    // For text node output
    if (node.type === 'textNode') {
      return node.data.text;
    }
    
    // For API node body field connections
    if (handleId.startsWith('body-') && node.type === 'apiNode') {
      const fieldName = handleId.replace('body-', '');
      // Check if there's a value in the execution context for this field
      const fieldValue = this.executionContext.get(`body-${fieldName}`);
      if (fieldValue !== undefined) {
        flowLog.debug(`Getting body field ${fieldName} from execution context: ${fieldValue}`);
        return fieldValue;
      }
      
      // If not in execution context, check if it's in the default body
      if (node.data.defaultBody && node.data.defaultBody[fieldName] !== undefined) {
        flowLog.debug(`Getting body field ${fieldName} from default body: ${node.data.defaultBody[fieldName]}`);
        return node.data.defaultBody[fieldName];
      }
      
      flowLog.debug(`No value found for body field ${fieldName}`);
      return undefined;
    }
    
    // Default: return the node's general output
    return this.executionContext.get(`output-${node.id}`);
  }

  // Execute a condition node
  async executeConditionNode(node) {
    flowLog.debug(`Executing condition node: ${node.id}`, {
      conditionText: node.data.conditionText,
      isStartingPoint: node.data.isStartingPoint,
      returnText: node.data.returnText
    });
    
    // For starting points, we've already populated the attributes
    if (node.data.isStartingPoint) {
      return node.data.returnText || 'Condition matched';
    }
    
    // For regular condition nodes, evaluate the condition
    // This is a simplified implementation
    return node.data.returnText || 'Condition evaluated';
  }

  // Execute an API node
  async executeApiNode(node) {
    flowLog.info(`Executing API node: ${node.id} - ${node.data.method} ${node.data.path}`, {
      nodeId: node.id,
      method: node.data.method,
      path: node.data.path,
      hasParameters: node.data.parameters ? node.data.parameters.length > 0 : false,
      hasRequestBody: !!node.data.requestBody
    });
    
    // Declare variables outside try block so they're accessible in catch
    let method;
    let url;
    let startTime;
    let response;
    let axiosInstance;
    let requestBody = null;
    let queryParams = {};
    let hdrs = {};
    
    try {
      // Build the request configuration
      method = node.data.method.toLowerCase();
      url = node.data.path;
      
      // Replace path parameters with values from the execution context
      if (node.data.parameters) {
        for (const param of node.data.parameters) {
          if (param.in === 'path') {
            // Get parameter value from connected handle or execution context
            let paramValue = this.executionContext.get(`param-${param.name}`);
            
            // If not found in execution context, check if there's a direct connection to this parameter
            if (paramValue === undefined) {
              // Find edges that target this parameter's handle
              const targetHandleId = `param-${param.name}`;
              const incomingEdges = this.edges.filter(edge => 
                edge.target === node.id && edge.targetHandle === targetHandleId
              );
              
              if (incomingEdges.length > 0) {
                // Get the source node and handle
                const sourceEdge = incomingEdges[0];
                const sourceNode = this.nodes.find(n => n.id === sourceEdge.source);
                
                if (sourceNode) {
                  // Get data from the source node's handle
                  paramValue = this.getDataForHandle(sourceNode, sourceEdge.sourceHandle);
                }
              }
            }
            
            // If we have a value, replace the parameter in the URL
            if (paramValue !== undefined) {
              flowLog.debug(`Replacing path parameter {${param.name}} with value: ${paramValue}`);
              url = url.replace(`{${param.name}}`, paramValue);
            } else {
              flowLog.warn(`No value found for path parameter: ${param.name}`);
            }
          }
        }
      }
      
      // Ensure URL starts with the base API URL
      if (!url.startsWith('http')) {
        const base = this.backendConfig?.baseUrl || this.baseApiUrl;
        url = `${base}${url}`;
      }
      
      // Build query parameters
      const queryParams = {};
      if (node.data.parameters) {
        for (const param of node.data.parameters) {
          if (param.in === 'query') {
            // Get parameter value from connected handle or execution context
            let paramValue = this.executionContext.get(`param-${param.name}`);
            
            // If not found in execution context, check if there's a direct connection to this parameter
            if (paramValue === undefined) {
              // Find edges that target this parameter's handle
              const targetHandleId = `param-${param.name}`;
              const incomingEdges = this.edges.filter(edge => 
                edge.target === node.id && edge.targetHandle === targetHandleId
              );
              
              if (incomingEdges.length > 0) {
                // Get the source node and handle
                const sourceEdge = incomingEdges[0];
                const sourceNode = this.nodes.find(n => n.id === sourceEdge.source);
                
                if (sourceNode) {
                  // Get data from the source node's handle
                  paramValue = this.getDataForHandle(sourceNode, sourceEdge.sourceHandle);
                }
              }
            }
            
            // If we have a value, add it to the query parameters
            if (paramValue !== undefined) {
              flowLog.debug(`Adding query parameter ${param.name}=${paramValue}`);
              queryParams[param.name] = paramValue;
            }
          }
        }
      }
      
      // Build request body if needed
      let requestBody = null;
      if (['post', 'put', 'patch'].includes(method)) {
        // First check if there's a complete request body provided
        requestBody = this.executionContext.get('param-body');
        
        // If not found in execution context, check if there's a direct connection to the body parameter
        if (requestBody === undefined) {
          // Find edges that target the body parameter handle
          const targetHandleId = 'param-body';
          const incomingEdges = this.edges.filter(edge => 
            edge.target === node.id && edge.targetHandle === targetHandleId
          );
          
          if (incomingEdges.length > 0) {
            // Get the source node and handle
            const sourceEdge = incomingEdges[0];
            const sourceNode = this.nodes.find(n => n.id === sourceEdge.source);
            
            if (sourceNode) {
              // Get data from the source node's handle
              requestBody = this.getDataForHandle(sourceNode, sourceEdge.sourceHandle);
              
              // If the source is a text node, try to parse it as JSON
              if (sourceNode.type === 'textNode' && typeof requestBody === 'string') {
                try {
                  requestBody = JSON.parse(requestBody);
                  flowLog.debug(`Parsed JSON body from text node`);
                } catch (e) {
                  flowLog.warn(`Failed to parse text node content as JSON, using as string`);
                }
              }
            }
          }
        }
        
        // If no complete body was found, try to build it from individual field connections
        if (requestBody === undefined && node.data.bodySchema) {
          requestBody = {};
          let hasAnyField = false;
          
          // Build the request body from individual field connections
          hasAnyField = this.buildRequestBodyFromConnections(node, requestBody);
          
          // If no fields were found, set requestBody back to null
          if (!hasAnyField) {
            requestBody = null;
          }
        }
        
        // Use default body values for any missing fields if available
        if (requestBody && node.data.defaultBody) {
          requestBody = {
            ...node.data.defaultBody,
            ...requestBody
          };
        }
        
        if (requestBody !== undefined && requestBody !== null) {
          flowLog.debug(`Using request body for ${method.toUpperCase()} request`, { requestBody });
        } else {
          flowLog.warn(`No request body found for ${method.toUpperCase()} request`);
        }
      }
      
      // Execute the API request
      // Préparer les en-têtes par défaut
      const cfg = this.backendConfig ?? {};
      hdrs = {
        'Content-Type': 'application/json',
        ...(cfg.defaultHeaders?.reduce((o, h) => ({ ...o, [h.key]: h.value }), {}))
      };
      
      flowLog.apiRequest(node.id, method.toUpperCase(), url, hdrs, requestBody);
      
      startTime = Date.now();
      
      // Déterminer quelle instance axios utiliser
      axiosInstance = url.startsWith(this.backendConfig?.baseUrl) ? api : http;
      
      
      // Appliquer l'authentification selon le type configuré
      if (cfg.authType && cfg.authType !== 'none') {
        switch (cfg.authType) {
          case 'bearer':
            hdrs.Authorization = `${cfg.auth.prefix ?? 'Bearer'} ${cfg.auth.token}`;
            break;
            
          case 'basic':
            hdrs.Authorization = 'Basic ' + Buffer
              .from(`${cfg.auth.username}:${cfg.auth.password}`, 'utf8')
              .toString('base64');
            break;
            
          case 'apiKey':
            if (cfg.auth.location === 'header') {
              hdrs[cfg.auth.paramName] = cfg.auth.apiKey;
            } else if (cfg.auth.location === 'query') {
              queryParams[cfg.auth.paramName] = cfg.auth.apiKey;
            } else if (cfg.auth.location === 'cookie') {
              hdrs.Cookie = `${cfg.auth.paramName}=${cfg.auth.apiKey}`;
            }
            break;
            
          case 'cookie':
            hdrs.Cookie = `${cfg.auth.cookieName}=${cfg.auth.cookieValue}`;
            break;
            
          case 'custom':
            (cfg.auth.customHeaders || []).forEach(h => hdrs[h.key] = h.value);
            break;
            
          case 'oauth2_cc':
            try {
              // Importer dynamiquement le service OAuth2
              const { getOauth2Token } = await import('../services/oauth2Service.js');
              const token = await getOauth2Token(cfg);
              hdrs.Authorization = `Bearer ${token}`;
            } catch (error) {
              flowLog.error(`OAuth2 token retrieval failed`, error);
              // Continuer sans token en cas d'échec
            }
            break;
        }
      }
      
      // Créer un agent HTTPS personnalisé si nécessaire
      let httpsAgent;
      if (cfg.tlsSkipVerify) {
        const https = await import('https');
        httpsAgent = new https.Agent({ rejectUnauthorized: false });
      }
      
      // Exécuter la requête avec la configuration complète
      response = await axiosInstance({
        method,
        baseURL: cfg.baseUrl,
        url,
        timeout: cfg.timeout,
        headers: hdrs,
        params: queryParams,
        data: requestBody,
        proxy: cfg.proxy?.host ? cfg.proxy : false,
        httpsAgent,
        decompress: cfg.compression
      });
      
      const responseTime = Date.now() - startTime;
      flowLog.apiResponse(node.id, method.toUpperCase(), url, response.status, response.data, responseTime);
      
      // Store specific parts of the response in the execution context
      this.executionContext.set(`${node.id}-output-response`, response.data);
      this.executionContext.set(`${node.id}-output-body`, response.data);
      this.executionContext.set(`${node.id}-output-status`, response.status);
      
      return response.data;
    } catch (error) {
      // Calculate response time only if startTime is defined
      const responseTime = startTime ? Date.now() - startTime : 0;
      flowLog.apiError(node.id, method ? method.toUpperCase() : 'UNKNOWN', url || 'UNKNOWN_URL', error, responseTime);
      
      // Create a more detailed error message
      let detailedErrorMessage = `API request failed: ${error.message}`;
      let errorDetails = {};
      
      // Add HTTP status code if available
      if (error.response && error.response.status) {
        const statusText = error.response.statusText || this.getHttpStatusText(error.response.status);
        detailedErrorMessage = `API request failed with status code ${error.response.status} (${statusText})`;
        errorDetails.status = error.response.status;
        errorDetails.statusText = statusText;
        
        // Add error details from response body if available
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            detailedErrorMessage += `: ${error.response.data}`;
            errorDetails.errorMessage = error.response.data;
          } else if (typeof error.response.data === 'object') {
            // Extract error message from common API error response formats
            const errorMessage = 
              error.response.data.message || 
              error.response.data.error || 
              error.response.data.errorMessage ||
              (error.response.data.errors && JSON.stringify(error.response.data.errors)) ||
              JSON.stringify(error.response.data);
            
            detailedErrorMessage += `: ${errorMessage}`;
            errorDetails.errorData = error.response.data;
          }
        }
      }
      
      // Add request details
      detailedErrorMessage += `\nRequest: ${method?.toUpperCase() || 'UNKNOWN'} ${url || 'UNKNOWN_URL'}`;
      errorDetails.method = method?.toUpperCase() || 'UNKNOWN';
      errorDetails.url = url || 'UNKNOWN_URL';
      
      // Add request body if available for debugging (only for non-production environments)
      if (process.env.NODE_ENV !== 'production' && requestBody) {
        try {
          const bodyPreview = typeof requestBody === 'object' ? 
            JSON.stringify(requestBody).substring(0, 200) : 
            String(requestBody).substring(0, 200);
          
          detailedErrorMessage += `\nRequest Body: ${bodyPreview}${bodyPreview.length >= 200 ? '...' : ''}`;
          errorDetails.requestBody = requestBody;
        } catch (e) {
          // Ignore stringification errors
        }
      }
      
      // Add headers to error details (excluding sensitive information)
      if (hdrs) {
        const safeHeaders = { ...hdrs };
        // Remove sensitive headers
        delete safeHeaders.Authorization;
        delete safeHeaders.authorization;
        delete safeHeaders.Cookie;
        delete safeHeaders.cookie;
        
        errorDetails.headers = safeHeaders;
      }
      
      // Log the detailed error with all the information
      flowLog.error(`API request failed with detailed information`, new Error(detailedErrorMessage), {
        nodeId: node.id,
        method: method?.toUpperCase() || 'UNKNOWN',
        url: url || 'UNKNOWN_URL',
        status: error.response?.status,
        errorDetails: errorDetails
      });
      
      throw new Error(detailedErrorMessage);
    }
  }

  // Execute a text node
  async executeTextNode(node) {
    flowLog.debug(`Executing text node: ${node.id}`, {
      text: node.data.text ? 
        (node.data.text.length > 100 ? node.data.text.substring(0, 100) + '...' : node.data.text) : 
        null
    });
    return node.data.text;
  }

  // Execute an int node
  async executeIntNode(node) {
    flowLog.debug(`Executing int node: ${node.id}`, { value: node.data.value });
    return node.data.value;
  }

  // Execute a sending mail node
  async executeSendingMailNode(node) {
    flowLog.info(`Executing sending mail node: ${node.id}`);
    
    try {
      // Get email attributes from the node or from the execution context
      const emailAttributes = node.data.emailAttributes || {};
      
      // Get values from execution context if they were passed via connections
      const account_id = process.env.UNIPILE_EMAIL_ACCOUNT_ID;
      
      const fromEmail = this.executionContext.get('attr-fromEmail') || emailAttributes.fromEmail;
      const fromDisplayName = this.executionContext.get('attr-fromDisplayName') || emailAttributes.fromDisplayName;
      
      const toEmail = this.executionContext.get('attr-toEmail') || emailAttributes.toEmail;
      const toDisplayName = this.executionContext.get('attr-toDisplayName') || emailAttributes.toDisplayName;
      
      const subject = this.executionContext.get('attr-subject') || emailAttributes.subject;
      const body = this.executionContext.get('attr-body') || emailAttributes.content;
      
      const reply_to = this.executionContext.get('attr-reply_to') || emailAttributes.reply_to;
      const cc = this.executionContext.get('attr-cc') || emailAttributes.cc;
      const bcc = this.executionContext.get('attr-bcc') || emailAttributes.bcc;
      const custom_headers = this.executionContext.get('attr-custom_headers') || emailAttributes.custom_headers;
      
      flowLog.debug(`Email details`, {
        toEmail,
        fromEmail,
        subject: subject ? (subject.length > 50 ? subject.substring(0, 50) + '...' : subject) : null
      });
      // Format the email data according to Unipile API requirements
      const email = {
        account_id: account_id,
        to: [
          {
            display_name: toDisplayName,
            identifier: toEmail,
          },
        ],
        subject: subject,
        body: body,
      };
      
      // Add optional fields if they exist
      if (fromEmail) {
        email.from = {
          display_name: fromDisplayName,
          identifier: fromEmail,
        };
      }
      
      if (reply_to) {
        email.reply_to = {
          identifier: reply_to,
        };
      }
      
      // Add CC recipients if they exist
      if (cc && cc.length > 0) {
        email.cc = cc.map(recipient => ({
          display_name: recipient.displayName || '',
          identifier: recipient.email,
        }));
      }
      
      // Add BCC recipients if they exist
      if (bcc && bcc.length > 0) {
        email.bcc = bcc.map(recipient => ({
          display_name: recipient.displayName || '',
          identifier: recipient.email,
        }));
      }
      
      // Add custom headers if they exist
      if (custom_headers && custom_headers.length > 0) {
        email.custom_headers = custom_headers;
      }
      
      flowLog.info(`Sending email via Unipile`, {
        to: email.to,
        from: email.from,
        subject: email.subject ? 
          (email.subject.length > 50 ? email.subject.substring(0, 50) + '...' : email.subject) : 
          null,
        hasCC: email.cc && email.cc.length > 0,
        hasBCC: email.bcc && email.bcc.length > 0,
        hasCustomHeaders: email.custom_headers && email.custom_headers.length > 0
      });
      
      // Make the API request to Unipile
      const unipileBaseUrl = process.env.UNIPILE_BASE_URL;
      const unipileApiKey = process.env.UNIPILE_EMAIL_API_KEY;
      const OpenaiKey = process.env.OPENAI_API_KEY;
      
      const response = await axios({
        method: 'post',
        url: `${unipileBaseUrl}/emails`,
        data: email,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': unipileApiKey,
        }
      });
      
      flowLog.info(`Email sent successfully`, {
        responseData: response.data
      });
      return { sent: true, email: email, response: response.data };
    } catch (error) {
      flowLog.error(`Failed to send email`, error);
      return { sent: false, error: error.message };
    }
  }
  
  // Execute an email attachment node
  async executeEmailAttachmentNode(node) {
    flowLog.info(`Executing email attachment node: ${node.id}`);
    
    try {
      // Get email attributes from the node or from the execution context
      const emailAttributes = node.data.emailAttributes || {};
      
      // Get values from execution context if they were passed via connections
      const account_id = this.executionContext.get('attr-account_id') || emailAttributes.account_id || process.env.UNIPILE_EMAIL_ACCOUNT_ID;
      const email_id = this.executionContext.get('attr-email_id') || emailAttributes.email_id;
      const attachment_id = this.executionContext.get('attr-attachment_id') || emailAttributes.attachment_id;
      
      // Validate required parameters
      if (!email_id) {
        flowLog.error(`Missing required parameter: email_id`, new Error('Missing required parameter'));
        return { success: false, error: 'Missing required parameter: email_id' };
      }
      
      if (!attachment_id) {
        flowLog.error(`Missing required parameter: attachment_id`, new Error('Missing required parameter'));
        return { success: false, error: 'Missing required parameter: attachment_id' };
      }
      
      flowLog.info(`Retrieving email attachment via Unipile`, {
        account_id,
        email_id,
        attachment_id
      });
      
      // Make the API request to Unipile
      const unipileBaseUrl = process.env.UNIPILE_BASE_URL;
      const unipileApiKey = process.env.UNIPILE_EMAIL_API_KEY;
      
      // Construct the URL for retrieving the attachment
      // Format: https://[subdomain].unipile.com:[port]/api/v1/emails/{email_id}/attachments/{attachment_id}
      const url = `${unipileBaseUrl}/emails/${email_id}/attachments/${attachment_id}`;
      
      // Add account_id as a query parameter if it exists
      const params = {};
      if (account_id) {
        params.account_id = account_id;
      }
      
      // Add responseType: 'arraybuffer' to get binary data instead of JSON
      const response = await axios({
        method: 'get',
        url: url,
        params: params,
        headers: {
          'X-API-KEY': unipileApiKey,
        },
        responseType: 'arraybuffer', // Get binary data instead of JSON
      });
      
      flowLog.info(`Email attachment retrieved successfully`, {
        contentType: response.headers['content-type'],
        size: response.data.byteLength
      });
      
      // Convert the ArrayBuffer to a base64 Data URL
      const bytes = new Uint8Array(response.data);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64String = Buffer.from(binary, 'binary').toString('base64');
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const dataUrl = `data:${contentType};base64,${base64String}`;
      
      flowLog.debug(`Converted attachment to base64 Data URL`, {
        contentType,
        dataUrlLength: dataUrl.length
      });
      
      // Store the data URL in the execution context for the output handle
      this.executionContext.set(`${node.id}-output-attachment`, dataUrl);
      
      return dataUrl;
    } catch (error) {
      flowLog.error(`Failed to retrieve email attachment`, error);
      return { success: false, error: error.message };
    }
  }
  
  // Execute an OCR node
  async executeOcrNode(node) {
    flowLog.info(`Executing OCR node: ${node.id}`);
    
    // Declare variables outside try block so they're accessible in catch
    let startTime;
    let worker;
    let result;
    let processingTimeMs;
    
    try {
      // Get OCR attributes from the node or from the execution context
      const ocrAttributes = node.data.ocrAttributes || {};
      
      // Get values from execution context if they were passed via connections
      // Now expecting a base64 Data URL from the EmailAttachmentNode
      const attachment_data = this.executionContext.get('attr-attachment_data');
      const language = this.executionContext.get('attr-language') || ocrAttributes.language || 'auto';
      const enhance_image = this.executionContext.get('attr-enhance_image') || ocrAttributes.enhance_image || false;
      
      // Validate required parameters
      if (!attachment_data) {
        flowLog.error(`Missing required parameter: attachment_data`, new Error('Missing required parameter'));
        return { success: false, error: 'Missing required parameter: attachment_data' };
      }
      
      flowLog.info(`Processing image with OCR using Tesseract.js`, {
        language,
        enhance_image,
        dataUrlProvided: attachment_data.startsWith('data:')
      });
      
      // Create a Tesseract worker
      worker = await createWorker(language !== 'auto' ? language : undefined);
      
      // Process the image with Tesseract.js directly using the data URL
      // No need to fetch external URLs anymore
      startTime = Date.now();
      result = await worker.recognize(attachment_data);
      processingTimeMs = startTime ? Date.now() - startTime : 0;
      
      // Terminate the worker to free up resources
      await worker.terminate();
      
      // Create the OCR result object
      const ocrResult = {
        success: true,
        text: result.data.text,
        confidence: result.data.confidence / 100, // Convert to 0-1 scale
        language: language,
        processingTimeMs: processingTimeMs,
        enhancedImage: enhance_image
      };
      
      flowLog.info(`OCR processing completed successfully`, {
        textLength: ocrResult.text ? ocrResult.text.length : 0,
        confidence: ocrResult.confidence,
        processingTimeMs: ocrResult.processingTimeMs
      });
      
      // Store the OCR result in the execution context for the output handle
      this.executionContext.set(`${node.id}-output-text`, ocrResult.text);
      
      return ocrResult;
    } catch (error) {
      flowLog.error(`Failed to process image with OCR`, error);
      return { success: false, error: error.message };
    }
  }
  
  // Execute a console.log node
  async executeConsoleLogNode(node) {
    flowLog.info(`Executing console.log node: ${node.id}`);
    
    try {
      // Get the input value from the connected handle
      const inputValue = this.executionContext.get('input-value');
      
      // Log the input value to the console
      console.log(`📝 [CONSOLE.LOG NODE] Value:`, inputValue);
      flowLog.info(`Console.log node output`, { value: inputValue });
      
      return { logged: true, value: inputValue };
    } catch (error) {
      flowLog.error(`Failed to execute console.log node`, error);
      return { logged: false, error: error.message };
    }
  }
  
  // Execute a conditional flow node
  async executeConditionalFlowNode(node) {
    flowLog.info(`Executing conditional flow node: ${node.id}`, {
      nodeId: node.id,
      conditionType: node.data.conditionType,
      inputValue: node.data.inputValue,
      compareValue: node.data.value
    });
    
    try {
      // Get the condition type and values from the node data or from the execution context
      const conditionType = node.data.conditionType;
      
      // Get the input value (the value to check)
      let inputValue = this.executionContext.get('value-input') || node.data.inputValue;
      
      // Get the comparison value (what to compare against)
      let compareValue = this.executionContext.get('compare-input') || node.data.value;
      
      // Log the values being compared
      flowLog.debug(`Evaluating condition: ${conditionType}`, {
        inputValue,
        compareValue
      });
      
      // Determine the result of the condition (true, false, or default)
      let conditionResult = 'default'; // Default path if evaluation fails
      
      // Evaluate the condition based on the condition type
      try {
        switch (conditionType) {
          case 'equals':
            conditionResult = inputValue === compareValue ? 'true' : 'false';
            break;
            
          case 'notEquals':
            conditionResult = inputValue !== compareValue ? 'true' : 'false';
            break;
            
          case 'contains':
            conditionResult = String(inputValue).includes(String(compareValue)) ? 'true' : 'false';
            break;
            
          case 'notContains':
            conditionResult = !String(inputValue).includes(String(compareValue)) ? 'true' : 'false';
            break;
            
          case 'greaterThan':
            conditionResult = Number(inputValue) > Number(compareValue) ? 'true' : 'false';
            break;
            
          case 'lessThan':
            conditionResult = Number(inputValue) < Number(compareValue) ? 'true' : 'false';
            break;
            
          case 'greaterOrEqual':
            conditionResult = Number(inputValue) >= Number(compareValue) ? 'true' : 'false';
            break;
            
          case 'lessOrEqual':
            conditionResult = Number(inputValue) <= Number(compareValue) ? 'true' : 'false';
            break;
            
          case 'startsWith':
            conditionResult = String(inputValue).startsWith(String(compareValue)) ? 'true' : 'false';
            break;
            
          case 'endsWith':
            conditionResult = String(inputValue).endsWith(String(compareValue)) ? 'true' : 'false';
            break;
            
          case 'isEmpty':
            conditionResult = (inputValue === undefined || inputValue === null || inputValue === '' || 
                              (Array.isArray(inputValue) && inputValue.length === 0) ||
                              (typeof inputValue === 'object' && Object.keys(inputValue).length === 0)) ? 'true' : 'false';
            break;
            
          case 'isNotEmpty':
            conditionResult = (inputValue !== undefined && inputValue !== null && inputValue !== '' && 
                              !(Array.isArray(inputValue) && inputValue.length === 0) &&
                              !(typeof inputValue === 'object' && Object.keys(inputValue).length === 0)) ? 'true' : 'false';
            break;
            
          case 'isTrue':
            conditionResult = (inputValue === true || inputValue === 'true' || inputValue === 1 || inputValue === '1') ? 'true' : 'false';
            break;
            
          case 'isFalse':
            conditionResult = (inputValue === false || inputValue === 'false' || inputValue === 0 || inputValue === '0') ? 'true' : 'false';
            break;
            
          default:
            flowLog.warn(`Unknown condition type: ${conditionType}, using default path`);
            conditionResult = 'default';
        }
      } catch (error) {
        // If there's an error in the condition evaluation, use the default path
        flowLog.error(`Error evaluating condition: ${error.message}`, error, {
          conditionType,
          inputValue,
          compareValue
        });
        conditionResult = 'default';
        
        // Log the error to ExecutionLog
        const task = this.executionContext.get('task');
        const flowId = task?.flow || global.__currentFlowId;
        const taskId = task?.id;
        
        if (flowId && taskId) {
          void ExecutionLog.create({
            taskId: taskId,
            flowId: flowId,
            level: 'error',
            nodeId: node.id,
            nodeType: 'conditionalFlowNode',
            message: `Condition evaluation failed: ${error.message}`,
            payload: {
              event: 'condition_evaluation_error',
              conditionType,
              inputValue,
              compareValue,
              error: error.message,
              stack: error.stack
            }
          }).catch(err => {
            console.error('Failed to persist condition evaluation log to MongoDB:', err);
          });
        }
      }
      
      // Store the condition result in the execution context
      this.executionContext.set(`${node.id}-condition-result`, conditionResult);
      
      // Log the condition result
      flowLog.info(`Condition evaluation result: ${conditionResult}`, {
        nodeId: node.id,
        conditionType,
        inputValue,
        compareValue,
        result: conditionResult
      });
      
      // Log the condition result to ExecutionLog
      const task = this.executionContext.get('task');
      const flowId = task?.flow || global.__currentFlowId;
      const taskId = task?.id;
      
      if (flowId && taskId) {
        void ExecutionLog.create({
          taskId: taskId,
          flowId: flowId,
          level: 'info',
          nodeId: node.id,
          nodeType: 'conditionalFlowNode',
          message: `Condition evaluated: ${conditionType}`,
          payload: {
            event: 'condition_evaluated',
            conditionType,
            inputValue,
            compareValue,
            result: conditionResult
          }
        }).catch(err => {
          console.error('Failed to persist condition evaluation log to MongoDB:', err);
        });
      }
      
      // Return the condition result
      return {
        conditionType,
        inputValue,
        compareValue,
        result: conditionResult
      };
    } catch (error) {
      flowLog.error(`Failed to execute conditional flow node`, error, {
        nodeId: node.id
      });
      
      // Log the error to ExecutionLog
      const task = this.executionContext.get('task');
      const flowId = task?.flow || global.__currentFlowId;
      const taskId = task?.id;
      
      if (flowId && taskId) {
        void ExecutionLog.create({
          taskId: taskId,
          flowId: flowId,
          level: 'error',
          nodeId: node.id,
          nodeType: 'conditionalFlowNode',
          message: `Conditional flow node execution failed: ${error.message}`,
          payload: {
            event: 'conditional_flow_node_error',
            error: error.message,
            stack: error.stack
          }
        }).catch(err => {
          console.error('Failed to persist conditional flow node error log to MongoDB:', err);
        });
      }
      
      // Set default path in case of error
      this.executionContext.set(`${node.id}-condition-result`, 'default');
      
      return { 
        error: error.message,
        result: 'default'
      };
    }
  }
  
  // Execute an AI node
  async executeAiNode(node) {
    flowLog.info(`Executing AI node: ${node.id}`);
    
    // Declare variables outside try block so they're accessible in catch
    let startTime;
    let processingTimeMs;
    let prompt;
    let input;
    let aiResponse;
    
    try {
      // Get values from node data or from the execution context
      prompt = this.executionContext.get('attr-prompt') || node.data.prompt;
      input = this.executionContext.get('attr-input') || node.data.input || '';
      
      // Validate required parameters
      if (!prompt) {
        const error = new Error('Missing required parameter: prompt');
        flowLog.error(`Missing required parameter: prompt`, error, {
          nodeId: node.id,
          nodeType: 'aiNode'
        });
        
        // Log detailed error information to ExecutionLog
        const task = this.executionContext.get('task');
        const flowId = task?.flow || global.__currentFlowId;
        const taskId = task?.id;
        
        if (flowId && taskId) {
          void ExecutionLog.create({
            taskId: taskId,
            flowId: flowId,
            level: 'error',
            nodeId: node.id,
            nodeType: 'aiNode',
            message: 'AI processing failed: Missing required parameter: prompt',
            payload: {
              event: 'ai_processing_error',
              error: 'Missing required parameter: prompt'
            }
          }).catch(err => {
            console.error('Failed to persist AI log to MongoDB:', err);
          });
        }
        
        return { success: false, error: 'Missing required parameter: prompt' };
      }
      
      // Log the start of AI processing with detailed information
      flowLog.info(`Processing AI request with Unipile`, {
        nodeId: node.id,
        promptLength: prompt ? prompt.length : 0,
        inputLength: input ? input.length : 0,
        promptPreview: prompt ? (prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt) : null,
        inputPreview: input ? (input.length > 100 ? input.substring(0, 100) + '...' : input) : null
      });
      
      // Log AI request details to ExecutionLog
      const task = this.executionContext.get('task');
      const flowId = task?.flow || global.__currentFlowId;
      const taskId = task?.id;
      
      if (flowId && taskId) {
        void ExecutionLog.create({
          taskId: taskId,
          flowId: flowId,
          level: 'info',
          nodeId: node.id,
          nodeType: 'aiNode',
          message: 'AI processing started',
          payload: {
            event: 'ai_processing_start',
            prompt: prompt,
            input: input
          }
        }).catch(err => {
          console.error('Failed to persist AI log to MongoDB:', err);
        });
      }
      
      // Make the API request to OpenAI
      const openaiApiKey = process.env.OPENAI_API_KEY;
      
      // Prepare the request body
      const requestBody = {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: input
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      };
      
      // Log the request (excluding sensitive information)
      flowLog.debug(`AI request details`, {
        model: requestBody.model,
        promptLength: prompt.length,
        inputLength: input ? input.length : 0,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens
      });
      
      // Record start time for performance measurement
      startTime = Date.now();
      
      // Make the API request
      const response = await axios({
        method: 'post',
        url: `https://api.openai.com/v1/chat/completions`,
        data: requestBody,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        }
      });
      
      // Calculate processing time
      processingTimeMs = Date.now() - startTime;
      
      // Extract the AI response
      aiResponse = response.data.choices[0].message.content;
      
      flowLog.info(`AI processing completed successfully`, {
        responseLength: aiResponse ? aiResponse.length : 0,
        processingTimeMs: processingTimeMs,
        responsePreview: aiResponse ? (aiResponse.length > 100 ? aiResponse.substring(0, 100) + '...' : aiResponse) : null
      });
      
      // Log AI response to ExecutionLog
      if (flowId && taskId) {
        void ExecutionLog.create({
          taskId: taskId,
          flowId: flowId,
          level: 'info',
          nodeId: node.id,
          nodeType: 'aiNode',
          message: 'AI processing completed successfully',
          payload: {
            event: 'ai_processing_complete',
            prompt: prompt,
            input: input,
            output: aiResponse,
            processingTimeMs: processingTimeMs,
            model: requestBody.model
          }
        }).catch(err => {
          console.error('Failed to persist AI log to MongoDB:', err);
        });
      }
      
      // Store the AI response in the execution context for the output handle
      this.executionContext.set(`${node.id}-output`, aiResponse);
      
      // Store the AI response for the specific output handle
      this.executionContext.set(`${node.id}-output-output`, aiResponse);
      
      return aiResponse;
    } catch (error) {
      // Calculate processing time if startTime was set
      processingTimeMs = startTime ? Date.now() - startTime : 0;
      
      flowLog.error(`Failed to process AI request`, error, {
        nodeId: node.id,
        processingTimeMs: processingTimeMs
      });
      
      // Log error to ExecutionLog
      const task = this.executionContext.get('task');
      const flowId = task?.flow || global.__currentFlowId;
      const taskId = task?.id;
      
      if (flowId && taskId) {
        void ExecutionLog.create({
          taskId: taskId,
          flowId: flowId,
          level: 'error',
          nodeId: node.id,
          nodeType: 'aiNode',
          message: `AI processing failed: ${error.message}`,
          payload: {
            event: 'ai_processing_error',
            prompt: prompt,
            input: input,
            error: error.message,
            stack: error.stack,
            processingTimeMs: processingTimeMs
          }
        }).catch(err => {
          console.error('Failed to persist AI log to MongoDB:', err);
        });
      }
      
      return { success: false, error: error.message };
    }
  }

  // Build request body from individual field connections
  buildRequestBodyFromConnections(node, requestBody = {}) {
    let hasAnyField = false;
    
    if (!node.data.bodySchema) {
      return hasAnyField;
    }
    
    // Process properties if they exist
    if (node.data.bodySchema.properties) {
      // Get the body fields from the schema
      const bodyFields = Object.keys(node.data.bodySchema.properties);
      
      // For each field in the schema, check if there's a connection to it
      for (const fieldName of bodyFields) {
        // Find edges that target this body field's handle
        const targetHandleId = `body-${fieldName}`;
        const incomingEdges = this.edges.filter(edge => 
          edge.target === node.id && edge.targetHandle === targetHandleId
        );
        
        if (incomingEdges.length > 0) {
          // Get the source node and handle
          const sourceEdge = incomingEdges[0];
          const sourceNode = this.nodes.find(n => n.id === sourceEdge.source);
          
          if (sourceNode) {
            // Get data from the source node's handle
            const fieldValue = this.getDataForHandle(sourceNode, sourceEdge.sourceHandle);
            
            if (fieldValue !== undefined) {
              // Get the field schema to determine the type
              const fieldSchema = node.data.bodySchema.properties[fieldName];
              
              // Convert the value to the appropriate type based on the schema
              const convertedValue = this.convertValueToType(fieldValue, fieldSchema);
              
              // Add the field to the request body
              requestBody[fieldName] = convertedValue;
              hasAnyField = true;
              flowLog.debug(`Added field ${fieldName} to request body with value: ${convertedValue}`);
            }
          }
        }
      }
    }
    
    return hasAnyField;
  }
  
  // Convert a value to the appropriate type based on the schema
  convertValueToType(value, schema) {
    if (!schema || !schema.type) {
      return value;
    }
    
    try {
      switch (schema.type.toLowerCase()) {
        case 'integer':
          // Convert to integer
          return parseInt(value, 10);
          
        case 'number':
          // Convert to number
          return parseFloat(value);
          
        case 'boolean':
          // Convert to boolean
          if (typeof value === 'string') {
            const lowerValue = value.toLowerCase();
            return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
          }
          return Boolean(value);
          
        case 'array':
          // Convert to array if it's not already
          if (!Array.isArray(value)) {
            if (typeof value === 'string') {
              // Try to parse as JSON array
              try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [value];
              } catch (e) {
                // If parsing fails, split by comma
                return value.split(',').map(item => item.trim());
              }
            }
            return [value];
          }
          return value;
          
        case 'object':
          // Convert to object if it's not already
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch (e) {
              flowLog.warn(`Failed to parse string as object: ${value}`);
              return value;
            }
          }
          return value;
          
        case 'string':
        default:
          // Ensure it's a string
          return String(value);
      }
    } catch (error) {
      flowLog.warn(`Error converting value to type ${schema.type}: ${error.message}`);
      return value; // Return original value if conversion fails
    }
  }
  
  setBackendConfig(cfg) {
    this.backendConfig = cfg;
    
    if (cfg) {
      flowLog.info(`Backend configuration set`, {
        baseUrl: cfg.baseUrl,
        authType: cfg.authType,
        hasProxy: !!cfg.proxy?.host,
        hasDefaultHeaders: cfg.defaultHeaders && cfg.defaultHeaders.length > 0,
        timeout: cfg.timeout
      });
    } else {
      flowLog.warn(`Backend configuration cleared or set to null`);
    }
  }
  
  // Helper method to get HTTP status text from status code
  getHttpStatusText(statusCode) {
    const statusTexts = {
      // 1xx Informational
      100: 'Continue',
      101: 'Switching Protocols',
      102: 'Processing',
      103: 'Early Hints',
      
      // 2xx Success
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      203: 'Non-Authoritative Information',
      204: 'No Content',
      205: 'Reset Content',
      206: 'Partial Content',
      207: 'Multi-Status',
      208: 'Already Reported',
      226: 'IM Used',
      
      // 3xx Redirection
      300: 'Multiple Choices',
      301: 'Moved Permanently',
      302: 'Found',
      303: 'See Other',
      304: 'Not Modified',
      305: 'Use Proxy',
      307: 'Temporary Redirect',
      308: 'Permanent Redirect',
      
      // 4xx Client Errors
      400: 'Bad Request',
      401: 'Unauthorized',
      402: 'Payment Required',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      406: 'Not Acceptable',
      407: 'Proxy Authentication Required',
      408: 'Request Timeout',
      409: 'Conflict',
      410: 'Gone',
      411: 'Length Required',
      412: 'Precondition Failed',
      413: 'Payload Too Large',
      414: 'URI Too Long',
      415: 'Unsupported Media Type',
      416: 'Range Not Satisfiable',
      417: 'Expectation Failed',
      418: 'I\'m a Teapot',
      421: 'Misdirected Request',
      422: 'Unprocessable Entity',
      423: 'Locked',
      424: 'Failed Dependency',
      425: 'Too Early',
      426: 'Upgrade Required',
      428: 'Precondition Required',
      429: 'Too Many Requests',
      431: 'Request Header Fields Too Large',
      451: 'Unavailable For Legal Reasons',
      
      // 5xx Server Errors
      500: 'Internal Server Error',
      501: 'Not Implemented',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
      505: 'HTTP Version Not Supported',
      506: 'Variant Also Negotiates',
      507: 'Insufficient Storage',
      508: 'Loop Detected',
      510: 'Not Extended',
      511: 'Network Authentication Required'
    };
    
    return statusTexts[statusCode] || 'Unknown Status';
  }
}

// Export the class itself
export { FlowExecutionEngine };

// Export a singleton instance as default
export default new FlowExecutionEngine();
