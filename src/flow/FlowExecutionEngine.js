// Flow Execution Engine
// This service handles the execution of a flow diagram by traversing nodes and edges

import axios from 'axios';
import { http } from './httpLogger.js';
import { createWorker } from 'tesseract.js';

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
  }

  // Set the diagram data (nodes and edges)
  setDiagram(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
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
      console.error(`❌ [FLOW ENGINE] No matching starting node found for task type "${task.type}". Tasks must have a corresponding starting point with the same return value.`);
      return null;
    }
    
    console.log(`✅ [FLOW ENGINE] Found starting node with return value "${startingNode.data.returnText}" matching task type "${task.type}"`);
    return startingNode;
  }

  // Execute a flow for a given task
  async executeFlow(task) {
    console.log(`🔄 [FLOW ENGINE] Starting execution for task: ${task.id} - ${task.type}`);
    
    // Find the starting node that matches the task type or description
    const startingNode = this.findStartingNode(task);
    if (!startingNode) {
      console.error(`❌ [FLOW ENGINE] No starting node found for task: ${task.type}`);
      return { success: false, error: 'No starting node found for this task type' };
    }
    
    console.log(`✅ [FLOW ENGINE] Found starting node: ${startingNode.id} with condition: ${startingNode.data.conditionText}`);
    console.log(`📧 [FLOW ENGINE] Task email ID: ${task.sourceId}`);
    
    // Initialize execution context with task data
    this.executionContext.clear();
    this.executionContext.set('task', task);
    
    // Populate starting node attributes with task data
    if (startingNode.data.emailAttributes) {
      // Map task data to email attributes
      const emailAttributes = {
        ...startingNode.data.emailAttributes,
        email_id: task.sourceId || startingNode.data.emailAttributes.email_id, // Map task sourceId to email_id
        fromEmail: task.senderEmail || startingNode.data.emailAttributes.fromEmail,
        toEmail: task.recipientEmail || startingNode.data.emailAttributes.toEmail,
        // Add other mappings as needed
      };
      
      console.log(`📧 [FLOW ENGINE] Mapped email ID to execution context: ${emailAttributes.email_id}`);
      
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
        
        console.log(`📎 [FLOW ENGINE] Found ${emailAttributes.attachments.length} attachments in task:`);
        emailAttributes.attachments.forEach((attachment, index) => {
          console.log(`  - Attachment ${index + 1}: ID=${attachment.id}, Name=${attachment.name}`);
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
          console.log(`✅ [FLOW ENGINE] Stored first attachment ID ${emailAttributes.attachments[0].id} in execution context as attr-attachment_id`);
        }
        
        // Store each attachment ID individually
        emailAttributes.attachments.forEach((attachment, index) => {
          if (attachment.id) {
            this.executionContext.set(`attr-attachment-${index}`, attachment.id);
            console.log(`✅ [FLOW ENGINE] Stored attachment ID ${attachment.id} in execution context as attr-attachment-${index}`);
          }
        });
      }
    }
    
    // Execute the flow starting from the starting node
    try {
      const result = await this.executeNode(startingNode);
      console.log(`✅ [FLOW ENGINE] Flow execution completed successfully`);
      return { success: true, result };
    } catch (error) {
      console.error(`❌ [FLOW ENGINE] Error executing flow:`, error);
      return { success: false, error: error.message };
    }
  }

  // Execute a single node and follow its outgoing edges
  async executeNode(node) {
    console.trace("executeApiNode called for node:", node.id);
    console.log(`🔄 [FLOW ENGINE] Executing node: ${node.id} (${node.type})`);
    
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
        console.warn(`⚠️ [FLOW ENGINE] Unknown node type: ${node.type}`);
        outputData = null;
    }
    
    // Store the node's output in the execution context
    if (outputData !== undefined) {
      this.executionContext.set(`output-${node.id}`, outputData);
      
      // If the node has a specific output handle, store the data for that handle
      if (node.type === 'apiNode' && outputData) {
        // Store the complete response
        this.executionContext.set(`${node.id}-output`, outputData);
        
        // Store specific parts of the response for the new output handles
        this.executionContext.set(`${node.id}-output-response`, outputData);
        this.executionContext.set(`${node.id}-output-body`, outputData); // For API responses, the data is usually the body
        this.executionContext.set(`${node.id}-output-status`, 200); // Default to 200 for mock responses
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
          console.log(`🔄 [FLOW ENGINE] Passing data from ${node.id}.${edge.sourceHandle} to ${targetNode.id}.${edge.targetHandle}`);
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
        console.log(`🔄 [FLOW ENGINE] Following execution link to node: ${targetNode.id}`);
        // Execute the target node
        const result = await this.executeNode(targetNode);
        results.push(result);
      }
    }
    
    return results.length > 0 ? results : outputData;
  }

  // Get data for a specific handle
  getDataForHandle(node, handleId) {
    // For condition node attributes
    if (handleId.startsWith('attr-') && node.type === 'conditionNode') {
      // Special case for individual attachment handles
      if (handleId.match(/^attr-attachment-\d+$/)) {
        const attachmentId = this.executionContext.get(handleId);
        console.log(`🔄 [FLOW ENGINE] Getting attachment ID from handle ${handleId}: ${attachmentId}`);
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
    console.log(`🔄 [FLOW ENGINE] Executing condition node: ${node.id}`);
    
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
    console.log(`🔄 [FLOW ENGINE] Executing API node: ${node.id} - ${node.data.method} ${node.data.path}`);
    
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
              console.log(`🔄 [FLOW ENGINE] Replacing path parameter {${param.name}} with value: ${paramValue}`);
              url = url.replace(`{${param.name}}`, paramValue);
            } else {
              console.warn(`⚠️ [FLOW ENGINE] No value found for path parameter: ${param.name}`);
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
              console.log(`🔄 [FLOW ENGINE] Adding query parameter ${param.name}=${paramValue}`);
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
                  console.log(`🔄 [FLOW ENGINE] Parsed JSON body from text node`);
                } catch (e) {
                  console.warn(`⚠️ [FLOW ENGINE] Failed to parse text node content as JSON, using as string`);
                }
              }
            }
          }
        }
        
        if (requestBody !== undefined) {
          console.log(`🔄 [FLOW ENGINE] Using request body:`, requestBody);
        } else {
          console.warn(`⚠️ [FLOW ENGINE] No request body found for ${method.toUpperCase()} request`);
        }
      }
      
      // Execute the API request
      console.log(`🔄 [FLOW ENGINE] Making API request: ${method.toUpperCase()} ${url}`);
      
      // Déterminer quelle instance axios utiliser
      const axiosInstance = url.startsWith(this.backendConfig?.baseUrl) ? api : http;
      
      // Préparer les en-têtes par défaut
      const cfg = this.backendConfig ?? {};
      const hdrs = {
        'Content-Type': 'application/json',
        ...(cfg.defaultHeaders?.reduce((o, h) => ({ ...o, [h.key]: h.value }), {}))
      };
      
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
              console.error(`❌ [FLOW ENGINE] OAuth2 token retrieval failed:`, error);
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
      
      console.log(`✅ [FLOW ENGINE] API request successful: ${response.status}`);
      
      // Store specific parts of the response in the execution context
      this.executionContext.set(`${node.id}-output-response`, response.data);
      this.executionContext.set(`${node.id}-output-body`, response.data);
      this.executionContext.set(`${node.id}-output-status`, response.status);
      
      return response.data;
    } catch (error) {
      console.error(`❌ [FLOW ENGINE] API request failed:`, error);
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  // Execute a text node
  async executeTextNode(node) {
    console.log(`🔄 [FLOW ENGINE] Executing text node: ${node.id}`);
    return node.data.text;
  }

  // Execute an int node
  async executeIntNode(node) {
    console.log(`🔄 [FLOW ENGINE] Executing int node: ${node.id}`);
    return node.data.value;
  }

  // Execute a sending mail node
  async executeSendingMailNode(node) {
    console.log(`🔄 [FLOW ENGINE] Executing sending mail node: ${node.id}`);
    
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
      
      console.log (toEmail)
      console.log(fromEmail)
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
      
      console.log(`📧 [FLOW ENGINE] Sending email via Unipile:`, email);
      
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
      
      console.log(`✅ [FLOW ENGINE] Email sent successfully:`, response.data);
      return { sent: true, email: email, response: response.data };
    } catch (error) {
      console.error(`❌ [FLOW ENGINE] Failed to send email:`, error);
      return { sent: false, error: error.message };
    }
  }
  
  // Execute an email attachment node
  async executeEmailAttachmentNode(node) {
    console.log(`🔄 [FLOW ENGINE] Executing email attachment node: ${node.id}`);
    
    try {
      // Get email attributes from the node or from the execution context
      const emailAttributes = node.data.emailAttributes || {};
      
      // Get values from execution context if they were passed via connections
      const account_id = this.executionContext.get('attr-account_id') || emailAttributes.account_id || process.env.UNIPILE_EMAIL_ACCOUNT_ID;
      const email_id = this.executionContext.get('attr-email_id') || emailAttributes.email_id;
      const attachment_id = this.executionContext.get('attr-attachment_id') || emailAttributes.attachment_id;
      
      // Validate required parameters
      if (!email_id) {
        console.error(`❌ [FLOW ENGINE] Missing required parameter: email_id`);
        return { success: false, error: 'Missing required parameter: email_id' };
      }
      
      if (!attachment_id) {
        console.error(`❌ [FLOW ENGINE] Missing required parameter: attachment_id`);
        return { success: false, error: 'Missing required parameter: attachment_id' };
      }
      
      console.log(`📧 [FLOW ENGINE] Retrieving email attachment via Unipile:`, {
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
      
      console.log(`✅ [FLOW ENGINE] Email attachment retrieved successfully`);
      
      // Convert the ArrayBuffer to a base64 Data URL
      const bytes = new Uint8Array(response.data);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64String = Buffer.from(binary, 'binary').toString('base64');
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const dataUrl = `data:${contentType};base64,${base64String}`;
      
      console.log(`✅ [FLOW ENGINE] Converted attachment to base64 Data URL`);
      
      // Store the data URL in the execution context for the output handle
      this.executionContext.set(`${node.id}-output-attachment`, dataUrl);
      
      return dataUrl;
    } catch (error) {
      console.error(`❌ [FLOW ENGINE] Failed to retrieve email attachment:`, error);
      return { success: false, error: error.message };
    }
  }
  
  // Execute an OCR node
  async executeOcrNode(node) {
    console.log(`🔄 [FLOW ENGINE] Executing OCR node: ${node.id}`);
    
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
        console.error(`❌ [FLOW ENGINE] Missing required parameter: attachment_data`);
        return { success: false, error: 'Missing required parameter: attachment_data' };
      }
      
      console.log(`🔄 [FLOW ENGINE] Processing image with OCR using Tesseract.js:`, {
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
      
      console.log(`✅ [FLOW ENGINE] OCR processing completed successfully`);
      
      // Store the OCR result in the execution context for the output handle
      this.executionContext.set(`${node.id}-output-text`, ocrResult.text);
      
      return ocrResult;
    } catch (error) {
      console.error(`❌ [FLOW ENGINE] Failed to process image with OCR:`, error);
      return { success: false, error: error.message };
    }
  }
  
  // Execute a console.log node
  async executeConsoleLogNode(node) {
    console.log(`🔄 [FLOW ENGINE] Executing console.log node: ${node.id}`);
    
    try {
      // Get the input value from the connected handle
      const inputValue = this.executionContext.get('input-value');
      
      // Log the input value to the console
      console.log(`📝 [CONSOLE.LOG NODE] Value:`, inputValue);
      
      return { logged: true, value: inputValue };
    } catch (error) {
      console.error(`❌ [FLOW ENGINE] Failed to execute console.log node:`, error);
      return { logged: false, error: error.message };
    }
  }

  setBackendConfig(cfg) {
    this.backendConfig = cfg;
  }
}

// Export the class itself
export { FlowExecutionEngine };

// Export a singleton instance as default
export default new FlowExecutionEngine();
