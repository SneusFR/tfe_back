import mongoose from 'mongoose';
const { Schema } = mongoose;

const AttachmentSchema = new Schema({
  email:      { type: Schema.Types.ObjectId, ref: 'Email', required: true },
  name:       String,
  mime:       String,
  size:       Number,
  storageKey: String  // id GridFS ou clé S3
}, {
  timestamps: true
});

// Transformer _id en id pour le frontend
AttachmentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

const Attachment = mongoose.model('Attachment', AttachmentSchema);

export default Attachment;
