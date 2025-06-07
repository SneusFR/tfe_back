import { ExecutionMetrics, Flow } from '../models/index.js';

/**
 * Get metrics for a specific flow
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getFlowMetrics = async (req, res) => {
  try {
    const { flowId } = req.params;
    const { startDate, endDate, status, taskType } = req.query;
    
    // Build the query
    const query = { flowId };
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    // Add status filter if provided
    if (status) {
      query.success = status === 'success';
    }
    
    // Add task type filter if provided
    if (taskType) {
      query.taskType = taskType;
    }
    
    // Get all execution metrics for the flow
    const executionMetrics = await ExecutionMetrics.find(query)
      .sort({ timestamp: -1 })
      .lean();
    
    if (executionMetrics.length === 0) {
      return res.json({
        summary: {
          totalExecutions: 0,
          avgExecutionTime: 0,
          successRate: 0,
          failureRate: 0
        },
        nodeExecutionTimes: [],
        historicalData: [],
        recentExecutions: [],
        nodeTypeDistribution: [],
        errorDistribution: []
      });
    }
    
    // Calculate summary metrics
    const summary = {
      totalExecutions: executionMetrics.length,
      avgExecutionTime: executionMetrics.reduce((sum, metric) => sum + metric.executionTime, 0) / executionMetrics.length || 0,
      successRate: executionMetrics.filter(metric => metric.success).length / executionMetrics.length || 0,
      failureRate: executionMetrics.filter(metric => !metric.success).length / executionMetrics.length || 0
    };
    
    // Calculate node execution times
    const nodeExecutionTimes = {};
    executionMetrics.forEach(metric => {
      if (metric.nodeMetrics && Array.isArray(metric.nodeMetrics)) {
        metric.nodeMetrics.forEach(node => {
          if (!nodeExecutionTimes[node.nodeId]) {
            nodeExecutionTimes[node.nodeId] = {
              nodeId: node.nodeId,
              nodeType: node.nodeType,
              label: node.label,
              executionTimes: [],
              successCount: 0,
              failureCount: 0
            };
          }
          
          nodeExecutionTimes[node.nodeId].executionTimes.push(node.executionTime);
          if (node.success) {
            nodeExecutionTimes[node.nodeId].successCount++;
          } else {
            nodeExecutionTimes[node.nodeId].failureCount++;
          }
        });
      }
    });
    
    // Calculate average, min, and max execution times for each node
    const nodeExecutionTimesArray = Object.values(nodeExecutionTimes).map(node => {
      const totalExecutions = node.successCount + node.failureCount;
      return {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        label: node.label,
        avgTime: node.executionTimes.reduce((sum, time) => sum + time, 0) / node.executionTimes.length || 0,
        minTime: Math.min(...node.executionTimes),
        maxTime: Math.max(...node.executionTimes),
        successRate: node.successCount / totalExecutions || 0
      };
    });
    
    // Get recent executions
    const recentExecutions = executionMetrics.slice(0, 10).map(metric => ({
      id: metric.id,
      timestamp: metric.timestamp,
      executionTime: metric.executionTime,
      success: metric.success,
      taskId: metric.taskId,
      taskType: metric.taskType
    }));
    
    // Calculate node type distribution
    const nodeTypeDistribution = {};
    nodeExecutionTimesArray.forEach(node => {
      if (!nodeTypeDistribution[node.nodeType]) {
        nodeTypeDistribution[node.nodeType] = {
          type: node.nodeType,
          count: 0,
          totalExecutionTime: 0
        };
      }
      
      nodeTypeDistribution[node.nodeType].count++;
      nodeTypeDistribution[node.nodeType].totalExecutionTime += node.avgTime;
    });
    
    const nodeTypeDistributionArray = Object.values(nodeTypeDistribution).map(type => ({
      type: type.type,
      count: type.count,
      avgExecutionTime: type.totalExecutionTime / type.count || 0
    }));
    
    // Calculate error distribution
    const errorDistribution = {};
    executionMetrics.filter(metric => !metric.success).forEach(metric => {
      const errorType = metric.errorMessage ? metric.errorMessage.split(':')[0] : 'Unknown Error';
      if (!errorDistribution[errorType]) {
        errorDistribution[errorType] = {
          type: errorType,
          count: 0
        };
      }
      
      errorDistribution[errorType].count++;
    });
    
    const failedExecutions = executionMetrics.filter(metric => !metric.success).length;
    const errorDistributionArray = Object.values(errorDistribution).map(error => ({
      type: error.type,
      count: error.count,
      percentage: (error.count / failedExecutions) * 100 || 0
    }));
    
    // Calculate historical data (last 30 days)
    const historicalData = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(today.getDate() - (29 - i));
      const dateString = date.toISOString().split('T')[0];
      
      const dayExecutions = executionMetrics.filter(metric => {
        const metricDate = new Date(metric.timestamp);
        return metricDate.toISOString().split('T')[0] === dateString;
      });
      
      historicalData.push({
        date: dateString,
        avgExecutionTime: dayExecutions.reduce((sum, metric) => sum + metric.executionTime, 0) / dayExecutions.length || 0,
        executionCount: dayExecutions.length,
        successRate: dayExecutions.filter(metric => metric.success).length / dayExecutions.length || 0
      });
    }
    
    // Return the metrics data
    res.json({
      summary,
      nodeExecutionTimes: nodeExecutionTimesArray,
      historicalData,
      recentExecutions,
      nodeTypeDistribution: nodeTypeDistributionArray,
      errorDistribution: errorDistributionArray
    });
  } catch (error) {
    console.error('Error fetching flow metrics:', error);
    res.status(500).json({ error: 'Failed to fetch flow metrics' });
  }
};

/**
 * Get details for a specific execution
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getExecutionDetails = async (req, res) => {
  try {
    const { executionId } = req.params;
    
    // Get the execution metrics
    const executionMetrics = await ExecutionMetrics.findOne({ id: executionId }).lean();
    
    if (!executionMetrics) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    // Get historical data for node metrics
    const flowMetrics = await ExecutionMetrics.find({ 
      flowId: executionMetrics.flowId,
      _id: { $ne: executionMetrics._id }
    }).lean();
    
    // Calculate historical metrics for each node
    const nodeMetricsWithHistory = executionMetrics.nodeMetrics.map(node => {
      // Find historical data for this node
      const nodeHistory = [];
      flowMetrics.forEach(metric => {
        if (metric.nodeMetrics && Array.isArray(metric.nodeMetrics)) {
          const historyNode = metric.nodeMetrics.find(n => n.nodeId === node.nodeId);
          if (historyNode) {
            nodeHistory.push(historyNode);
          }
        }
      });
      
      // Calculate historical metrics
      const executionTimes = nodeHistory.map(n => n.executionTime);
      const avgTime = executionTimes.length > 0 
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length 
        : 0;
      const minTime = executionTimes.length > 0 ? Math.min(...executionTimes) : 0;
      const maxTime = executionTimes.length > 0 ? Math.max(...executionTimes) : 0;
      const successRate = nodeHistory.length > 0 
        ? nodeHistory.filter(n => n.success).length / nodeHistory.length 
        : 1.0;
      
      return {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        label: node.label,
        actualTime: node.executionTime,
        avgTime,
        minTime,
        maxTime,
        successRate
      };
    });
    
    // Return the execution details
    res.json({
      id: executionMetrics.id,
      timestamp: executionMetrics.timestamp,
      executionTime: executionMetrics.executionTime,
      success: executionMetrics.success,
      taskId: executionMetrics.taskId,
      taskType: executionMetrics.taskType,
      errorMessage: executionMetrics.errorMessage,
      nodeMetrics: nodeMetricsWithHistory
    });
  } catch (error) {
    console.error('Error fetching execution details:', error);
    res.status(500).json({ error: 'Failed to fetch execution details' });
  }
};

/**
 * Get comparison data for all flows
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getFlowComparison = async (req, res) => {
  try {
    // Get all flows with execution metrics
    const flowIds = await ExecutionMetrics.distinct('flowId');
    
    // Get flow details and metrics for each flow
    const flowComparison = await Promise.all(flowIds.map(async (flowId) => {
      // Get flow details
      const flow = await Flow.findOne({ _id: flowId }).lean();
      
      // Get execution metrics for the flow
      const executionMetrics = await ExecutionMetrics.find({ flowId }).lean();
      
      // Calculate metrics
      const avgExecutionTime = executionMetrics.reduce((sum, metric) => sum + metric.executionTime, 0) / executionMetrics.length || 0;
      const successRate = executionMetrics.filter(metric => metric.success).length / executionMetrics.length || 0;
      
      return {
        flowId,
        name: flow ? flow.name : `Flow ${flowId}`,
        avgExecutionTime,
        executionCount: executionMetrics.length,
        successRate
      };
    }));
    
    // Return the flow comparison data
    res.json(flowComparison);
  } catch (error) {
    console.error('Error fetching flow comparison:', error);
    res.status(500).json({ error: 'Failed to fetch flow comparison' });
  }
};

/**
 * Export metrics data as CSV
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const exportMetricsAsCsv = async (req, res) => {
  try {
    const { flowId } = req.params;
    const { startDate, endDate, status, taskType } = req.query;
    
    // Build the query
    const query = { flowId };
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    // Add status filter if provided
    if (status) {
      query.success = status === 'success';
    }
    
    // Add task type filter if provided
    if (taskType) {
      query.taskType = taskType;
    }
    
    // Get all execution metrics for the flow
    const executionMetrics = await ExecutionMetrics.find(query)
      .sort({ timestamp: -1 })
      .lean();
    
    // Create CSV header
    let csv = 'id,timestamp,executionTime,success,taskId,taskType\n';
    
    // Add rows for each execution
    executionMetrics.forEach(metric => {
      csv += `${metric.id},${metric.timestamp},${metric.executionTime},${metric.success},${metric.taskId},${metric.taskType}\n`;
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=flow-metrics-${flowId}-${new Date().toISOString().split('T')[0]}.csv`);
    
    // Send the CSV
    res.send(csv);
  } catch (error) {
    console.error('Error exporting metrics data:', error);
    res.status(500).json({ error: 'Failed to export metrics data' });
  }
};
