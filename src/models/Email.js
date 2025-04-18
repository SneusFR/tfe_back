import mongoose from 'mongoose';
const { Schema } = mongoose;

const EmailSchema = new Schema({
  owner:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emailId:      { type: String, required: true },
  subject:      String,
  from:         { address: String, name: String },
  to:           [{ address: String, name: String }],
  date:         Date,
  body:         String,
  attachments:  [{ type: Schema.Types.ObjectId, ref: 'Attachment' }]
}, {
  timestamps: true
});

// Transformer _id en id pour le frontend
EmailSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

// Création d'un index composé unique pour éviter les doublons d'emails
EmailSchema.index({ owner: 1, emailId: 1 }, { unique: true });

const Email = mongoose.model('Email', EmailSchema);

export default Email;
