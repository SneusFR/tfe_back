import express from 'express';
import { 
  getFlowMetrics, 
  getExecutionDetails, 
  getFlowComparison, 
  exportMetricsAsCsv 
} from '../controllers/metricsController.js';

const router = express.Router();

// Get metrics for a specific flow
router.get('/flows/:flowId', getFlowMetrics);

// Get details for a specific execution
router.get('/executions/:executionId', getExecutionDetails);

// Get comparison data for all flows
router.get('/flows/comparison', getFlowComparison);

// Export metrics data as CSV
router.get('/flows/:flowId/export', exportMetricsAsCsv);

export default router;
