// src/models/ExecutionLog.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ExecutionLogSchema = new Schema({
  taskId:       { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  flowId:       { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
  level:        { type: String, enum: ['info', 'debug', 'warn', 'error'], required: true },
  nodeId:       { type: String, default: null },
  nodeType:     { type: String, default: null },
  message:      { type: String, required: true },
  payload:      { type: Schema.Types.Mixed, default: null },
  createdAt:    { type: Date, default: Date.now }
}, {
  timestamps: false // We only need createdAt, not updatedAt
});

// Index for efficient querying by taskId and createdAt
ExecutionLogSchema.index({ taskId: 1, createdAt: 1 });

// Transform _id to id for frontend
ExecutionLogSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

const ExecutionLog = mongoose.model('ExecutionLog', ExecutionLogSchema);

export default ExecutionLog;
