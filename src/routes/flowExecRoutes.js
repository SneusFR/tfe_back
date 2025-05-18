import express from 'express';
import FlowEngine from '../flow/FlowExecutionEngine.js';
import { authMiddleware, errorMiddleware } from '../middleware/index.js';
import * as cfgSvc from '../services/backendConfigService.js';
import flowLog from '../flow/flowLogger.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler } = errorMiddleware;

router.post('/:flowId/execute',
  protect, // ou retire si exécution publique
  asyncHandler(async (req, res) => {
    const { flowId } = req.params;
    const { nodes, edges, task, backendConfig, backendConfigId } = req.body;
    
    // Make flowId available globally for logging
    global.__currentFlowId = flowId;
    
    // Log the incoming request
    flowLog.info(`Flow execution request received`, {
      userId: req.user?.id,
      taskId: task?.id,
      taskType: task?.type,
      nodesCount: nodes?.length,
      edgesCount: edges?.length,
      hasBackendConfig: !!backendConfig,
      backendConfigId
    });
    
    if (!nodes || !edges || !task) {
      flowLog.error(`Missing required parameters in flow execution request`, new Error('Missing parameters'), {
        hasNodes: !!nodes,
        hasEdges: !!edges,
        hasTask: !!task
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: nodes, edges, and task are required' 
      });
    }
    
    // Configure the flow engine
    FlowEngine.setDiagram(nodes, edges);
    flowLog.info(`Flow diagram set with ${nodes.length} nodes and ${edges.length} edges`);
    
    // Set backend config if provided directly
    if (backendConfig) {
      FlowEngine.setBackendConfig(backendConfig);
      flowLog.info(`Using provided backend config`);
    }
    // Or fetch from database if ID is provided
    else if (backendConfigId) {
      flowLog.info(`Fetching backend config with ID: ${backendConfigId}`);
      try {
        // Récupérer le document mongoose "interne" avec les secrets déchiffrés
        const cfgDoc = await cfgSvc.getConfig(backendConfigId, req.user.id, 'internal');
        FlowEngine.setBackendConfig(cfgDoc.toJSON());
        flowLog.info(`Successfully loaded backend config with ID: ${backendConfigId}`);
      } catch (error) {
        flowLog.error(`Failed to load backend config with ID: ${backendConfigId}`, error);
      }
    }
    // Or use the active config if no specific config is provided
    else {
      flowLog.info(`No specific backend config provided, attempting to use active config`);
      try {
        // getActiveConfig retourne déjà le document Mongoose complet
        const cfgDoc = await cfgSvc.getActiveConfig(req.user.id);
        FlowEngine.setBackendConfig(cfgDoc.toJSON());
        flowLog.info(`Successfully loaded active backend config`);
      } catch (error) {
        flowLog.warn(`No active backend config found, continuing without config`, { error: error.message });
      }
    }
    
    // Execute the flow
    flowLog.info(`Starting flow execution for task: ${task.id} - ${task.type}`);
    const result = await FlowEngine.executeFlow(task);
    
    // Log the result
    if (result.success) {
      flowLog.info(`Flow execution completed successfully`, {
        taskId: task.id,
        taskType: task.type,
        success: result.success
      });
    } else {
      // Create a more detailed error object for logging
      const detailedError = new Error(result.error);
      
      // Add additional properties to the error object for better logging
      detailedError.taskId = task.id;
      detailedError.taskType = task.type;
      detailedError.flowId = flowId;
      
      // Log the detailed error
      flowLog.error(`Flow execution failed`, detailedError, {
        taskId: task.id,
        taskType: task.type,
        success: result.success,
        error: result.error,
        // Include the full error message in the payload for better frontend display
        errorDetails: result.error
      });
    }
    
    // Return the result
    res.json(result);
  })
);

export default router;
