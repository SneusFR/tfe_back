import mongoose from 'mongoose';
import { TASK_STATUS, TASK_SOURCE } from '../utils/constants.js';
const { Schema } = mongoose;

const TaskSchema = new Schema({
  user:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:           { type: String, required: true },
  description:    { type: String, default: null },
  source:         { type: String, enum: Object.values(TASK_SOURCE), default: TASK_SOURCE.EMAIL },
  sourceId:       { type: String, default: null },
  subject:        { type: String, default: null },
  senderEmail:    { type: String, default: null },
  recipientEmail: { type: String, default: null },
  senderName:     { type: String, default: null },
  recipientName:  { type: String, default: null },
  body:           { type: String, default: null }, // contenu ou extrait
  date:           { type: Date, default: null },
  attachmentId:   { type: String, default: null }, // premier fichier
  status:         { type: String, enum: Object.values(TASK_STATUS), default: TASK_STATUS.PENDING },
  attachments:    [{
     _id: false,
     id:         String,
     name:       String,
     mime:       String,
     size:       Number
  }],
  completedAt:    { type: Date, default: null }
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
