import mongoose from 'mongoose';
const { Schema } = mongoose;

const ConditionSchema = new Schema({
  owner:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  conditionText: { type: String, required: true },
  returnText:    { type: String, required: true }
}, {
  timestamps: true
});

// Transformer _id en id pour le frontend
ConditionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

const Condition = mongoose.model('Condition', ConditionSchema);

export default Condition;
