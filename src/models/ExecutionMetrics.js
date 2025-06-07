import mongoose from 'mongoose';

const nodeMetricsSchema = new mongoose.Schema({
  nodeId: { type: String, required: true },
  nodeType: { type: String, required: true },
  label: { type: String },
  executionTime: { type: Number, required: true },
  success: { type: Boolean, required: true }
}, { _id: false });

const executionMetricsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  flowId: { type: String, required: true },
  taskId: { type: String, required: true },
  taskType: { type: String, required: true },
  timestamp: { type: Date, required: true },
  executionTime: { type: Number, required: true },
  success: { type: Boolean, required: true },
  errorMessage: { type: String },
  nodeMetrics: [nodeMetricsSchema]
}, { timestamps: true });

// Create indexes for faster queries
executionMetricsSchema.index({ flowId: 1, timestamp: -1 });
executionMetricsSchema.index({ taskId: 1 });
executionMetricsSchema.index({ success: 1 });
executionMetricsSchema.index({ taskType: 1 });

const ExecutionMetrics = mongoose.model('ExecutionMetrics', executionMetricsSchema);

export default ExecutionMetrics;
