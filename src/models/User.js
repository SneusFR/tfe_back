import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const { Schema } = mongoose;

const UserSchema = new Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName:  { type: String, default: '' }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.passwordHash; // Ne jamais renvoyer le hash du mot de passe
      return ret;
    }
  }
});

// Créer un index unique pour l'email
UserSchema.index({ email: 1 }, { unique: true });

// Pre-save hook pour hacher le mot de passe
UserSchema.pre('save', async function(next) {
  // Seulement hacher le mot de passe s'il a été modifié (ou est nouveau)
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Ajouter un champ virtuel 'id' qui sera toujours disponible, même via populate
UserSchema.virtual('id').get(function() {
  return this._id;
});

// Méthode pour comparer les mots de passe
UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.passwordHash);
};

const User = mongoose.model('User', UserSchema);

export default User;
