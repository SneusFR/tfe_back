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
/* Cascade delete pour les entités liées au flow                              */
/* -------------------------------------------------------------------------- */
// Hook pour document.deleteOne()
FlowSchema.pre('deleteOne', { document: true }, async function() {
  const flowId = this._id;
  const mongoose = this.constructor.base;
  
  // Supprimer toutes les tâches liées à ce flow
  await mongoose.model('Task').deleteMany({ flow: flowId });
  
  // Supprimer toutes les configurations backend liées à ce flow
  await mongoose.model('BackendConfig').deleteMany({ flow: flowId });
  
  // Supprimer toutes les conditions liées à ce flow
  await mongoose.model('Condition').deleteMany({ flow: flowId });
  
  // Supprimer toutes les collaborations liées à ce flow
  await mongoose.model('Collaboration').deleteMany({ flow: flowId });
});

// Hook pour Flow.findOneAndDelete() et Flow.findByIdAndDelete()
FlowSchema.pre('findOneAndDelete', async function() {
  const flowId = this.getQuery()._id;
  const mongoose = this.model.base;
  
  // Supprimer toutes les tâches liées à ce flow
  await mongoose.model('Task').deleteMany({ flow: flowId });
  
  // Supprimer toutes les configurations backend liées à ce flow
  await mongoose.model('BackendConfig').deleteMany({ flow: flowId });
  
  // Supprimer toutes les conditions liées à ce flow
  await mongoose.model('Condition').deleteMany({ flow: flowId });
  
  // Supprimer toutes les collaborations liées à ce flow
  await mongoose.model('Collaboration').deleteMany({ flow: flowId });
});

// Hook pour Flow.deleteMany()
FlowSchema.pre('deleteMany', async function() {
  const filter = this.getQuery();
  const mongoose = this.model.base;
  
  // Trouver tous les flows qui correspondent au filtre
  const flows = await this.model.find(filter).select('_id');
  const flowIds = flows.map(flow => flow._id);
  
  if (flowIds.length > 0) {
    // Supprimer toutes les tâches liées à ces flows
    await mongoose.model('Task').deleteMany({ flow: { $in: flowIds } });
    
    // Supprimer toutes les configurations backend liées à ces flows
    await mongoose.model('BackendConfig').deleteMany({ flow: { $in: flowIds } });
    
    // Supprimer toutes les conditions liées à ces flows
    await mongoose.model('Condition').deleteMany({ flow: { $in: flowIds } });
    
    // Supprimer toutes les collaborations liées à ces flows
    await mongoose.model('Collaboration').deleteMany({ flow: { $in: flowIds } });
  }
});

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
