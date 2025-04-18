import mongoose from 'mongoose';
import { TASK_STATUS, TASK_SOURCE } from '../utils/constants.js';
const { Schema } = mongoose;

const TaskSchema = new Schema({
  user:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, required: true },
  description:  { type: String },
  source:       { type: String, enum: Object.values(TASK_SOURCE), default: TASK_SOURCE.EMAIL },
  sourceId:     { type: String },
  status:       { type: String, enum: Object.values(TASK_STATUS), default: TASK_STATUS.PENDING },
  attachments:  [{
     _id: false,
     id:         String,
     name:       String,
     mime:       String,
     size:       Number
  }],
  completedAt:  { type: Date }
}, {
  timestamps: true
});

// Transformer _id en id pour le frontend
TaskSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

const Task = mongoose.model('Task', TaskSchema);

export default Task;
