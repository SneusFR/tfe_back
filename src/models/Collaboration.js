import mongoose from 'mongoose';
import { COLLABORATION_ROLE } from '../utils/constants.js';
const { Schema } = mongoose;

const CollaborationSchema = new Schema({
  flow: { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { 
    type: String, 
    enum: [COLLABORATION_ROLE.OWNER, COLLABORATION_ROLE.EDITOR, COLLABORATION_ROLE.VIEWER], 
    default: COLLABORATION_ROLE.VIEWER 
  },
}, { 
  timestamps: true 
});

// Transformer _id en id pour le frontend
CollaborationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

// Création d'un index composé unique pour éviter les doublons de collaboration
CollaborationSchema.index({ flow: 1, user: 1 }, { unique: true });

const Collaboration = mongoose.model('Collaboration', CollaborationSchema);

export default Collaboration;
