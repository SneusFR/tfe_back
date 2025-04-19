import express from 'express';
import FlowEngine from '../flow/FlowExecutionEngine.js';
import { authMiddleware, errorMiddleware } from '../middleware/index.js';
import * as cfgSvc from '../services/backendConfigService.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler } = errorMiddleware;

router.post('/execute',
  protect, // ou retire si exécution publique
  asyncHandler(async (req, res) => {
    const { nodes, edges, task, backendConfig, backendConfigId } = req.body;
    
    if (!nodes || !edges || !task) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: nodes, edges, and task are required' 
      });
    }
    
    // Configure the flow engine
    FlowEngine.setDiagram(nodes, edges);
    
    // Set backend config if provided directly
    if (backendConfig) {
      FlowEngine.setBackendConfig(backendConfig);
    }
    // Or fetch from database if ID is provided
    else if (backendConfigId) {
      const cfg = await cfgSvc.getConfig(backendConfigId, req.user.id);
      FlowEngine.setBackendConfig(cfg.toJSON());
    }
    
    // Execute the flow
    const result = await FlowEngine.executeFlow(task);
    
    // Return the result
    res.json(result);
  })
);

export default router;
