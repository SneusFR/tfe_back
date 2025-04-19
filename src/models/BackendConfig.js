// models/BackendConfig.js
import mongoose from 'mongoose';
import crypto from 'crypto';

const { Schema } = mongoose;

/* ----------- Chiffrement des secrets avec rotation de clé ----------- */
// Vérifier que les clés font exactement 32 bytes
const CURRENT_KEY = process.env.SECRET_ENC_KEY;
const NEXT_KEY = process.env.SECRET_ENC_KEY_NEXT;

// Validation des clés
if (!CURRENT_KEY || CURRENT_KEY.length !== 32) {
  console.error('ERREUR: SECRET_ENC_KEY doit faire exactement 32 caractères');
  process.exit(1); // Arrêter le serveur si la clé n'est pas valide
}

if (NEXT_KEY && NEXT_KEY.length !== 32) {
  console.error('ERREUR: SECRET_ENC_KEY_NEXT doit faire exactement 32 caractères');
  process.exit(1); // Arrêter le serveur si la clé de rotation n'est pas valide
}
const IV_LENGTH = 16;

const encrypt = (text = '') => {
  if (!CURRENT_KEY) throw new Error('Encryption key not configured');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', CURRENT_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${enc.toString('hex')}`;
};

const decrypt = (payload = '') => {
  if (!payload || !payload.includes('.')) return payload;
  
  const [ivHex, tagHex, dataHex] = payload.split('.');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  
  // Essayer d'abord avec la clé actuelle
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', CURRENT_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, 'binary', 'utf8') + decipher.final('utf8');
  } catch (err) {
    // Si échec et qu'une clé de rotation est disponible, essayer avec celle-ci
    if (NEXT_KEY) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', NEXT_KEY, iv);
        decipher.setAuthTag(tag);
        return decipher.update(data, 'binary', 'utf8') + decipher.final('utf8');
      } catch (nextErr) {
        console.error('Failed to decrypt with both current and next keys');
        return '{}'; // Retourner un objet vide en cas d'échec
      }
    }
    console.error('Failed to decrypt and no next key available');
    return '{}';
  }
};
/*---------------------------------------------------------------------*/

const KeyVal = new Schema({ key: String, value: String }, { _id: false });

const BackendConfigSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,

  baseUrl: { type: String, required: true },
  timeout: { type: Number, default: 10000 },
  retries: { type: Number, default: 0 },

  defaultHeaders: [KeyVal],

  /* --------------------- Auth bloc ----------------------- */
  authType: {
    type: String,
    enum: ['none', 'bearer', 'basic', 'apiKey', 'oauth2_cc', 'cookie', 'custom'],
    default: 'none'
  },
  auth: { type: Schema.Types.Mixed, default: {} }, // secrets chiffrés !

  /* -------------------- Avancé ---------------------------- */
  compression: { type: Boolean, default: false },
  proxy: { host: String, port: String },
  tlsSkipVerify: { type: Boolean, default: false },
}, {
  timestamps: true
});

/* ----------- (dé)chiffrer avant save / après find ---------- */
BackendConfigSchema.pre('save', function(next) {
  if (this.isModified('auth')) {
    this.auth = encrypt(JSON.stringify(this.auth));
  }
  next();
});

BackendConfigSchema.post('init', function(doc) {
  try { 
    doc.auth = JSON.parse(decrypt(doc.auth)); 
  }
  catch { 
    doc.auth = {}; 
  }
});

/* ----------- JSON → id pour le front ---------------------- */
BackendConfigSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export default mongoose.model('BackendConfig', BackendConfigSchema);
