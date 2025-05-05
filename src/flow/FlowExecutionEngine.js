// Flow Execution Engine
// This service handles the execution of a flow diagram by traversing nodes and edges

import axios from 'axios';
import { http } from './httpLogger.js';
import { createWorker } from 'tesseract.js';
import flowLog from './flowLogger.js';

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
    
    // For text node output
    if (node.type === 'textNode') {
      return node.data.text;
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
    
    try {
      // Build the request configuration
      const method = node.data.method.toLowerCase();
      let url = node.data.path;
      
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
      if (['post', 'put', 'patch'].includes(method) && node.data.requestBody) {
        // Get request body from execution context
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
        
        if (requestBody !== undefined) {
          flowLog.debug(`Using request body for ${method.toUpperCase()} request`, { requestBody });
        } else {
          flowLog.warn(`No request body found for ${method.toUpperCase()} request`);
        }
      }
      
      // Execute the API request
      // Préparer les en-têtes par défaut
      const cfg = this.backendConfig ?? {};
      const hdrs = {
        'Content-Type': 'application/json',
        ...(cfg.defaultHeaders?.reduce((o, h) => ({ ...o, [h.key]: h.value }), {}))
      };
      
      flowLog.apiRequest(node.id, method.toUpperCase(), url, hdrs, requestBody);
      
      const startTime = Date.now();
      
      // Déterminer quelle instance axios utiliser
      const axiosInstance = url.startsWith(this.backendConfig?.baseUrl) ? api : http;
      
      
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
      const response = await axiosInstance({
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
      const responseTime = Date.now() - startTime;
      flowLog.apiError(node.id, method.toUpperCase(), url, error, responseTime);
      throw new Error(`API request failed: ${error.message}`);
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
      const worker = await createWorker(language !== 'auto' ? language : undefined);
      
      // Process the image with Tesseract.js directly using the data URL
      // No need to fetch external URLs anymore
      const startTime = Date.now();
      const result = await worker.recognize(attachment_data);
      const processingTimeMs = Date.now() - startTime;
      
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
}

// Export the class itself
export { FlowExecutionEngine };

// Export a singleton instance as default
export default new FlowExecutionEngine();
