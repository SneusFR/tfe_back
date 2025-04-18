// models/Flow.js
import mongoose from 'mongoose';
const { Schema, Types } = mongoose;

/* -------------------------------------------------------------------------- */
/* Sous‑schéma d’une variante                                                 */
/* -------------------------------------------------------------------------- */
const FlowVersionSchema = new Schema(
  {
    // facultatif : donner un nom à la variante
    label:      { type: String, default: '' },

    /*  Les vraies données du diagramme  */
    nodes:      { type: [Schema.Types.Mixed], default: [] },
    edges:      { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false, timestamps: true }          // _id inutile dans un sous‑doc
);

/* -------------------------------------------------------------------------- */
/* Schéma principal                                                           */
/* -------------------------------------------------------------------------- */
const FlowSchema = new Schema(
  {
    owner:      { type: Types.ObjectId, ref: 'User', required: true },

    /*  Meta  */
    name:               { type: String, required: true },
    isActive:           { type: Boolean, default: true },

    /*  Gestion des variantes  */
    currentVersionIndex:{ type: Number, default: 0, min: 0, max: 2 },
    versions: {
      type: [FlowVersionSchema],
      default: [],                                    // <= 3 éléments
      validate: [arr => arr.length <= 3, 'Max 3 versions par flow']
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------------------- */
/* Transformation JSON pour le front                                          */
/* -------------------------------------------------------------------------- */
FlowSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export default mongoose.model('Flow', FlowSchema);
