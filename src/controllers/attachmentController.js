import { Attachment, Email } from '../models/index.js';

// Récupérer toutes les pièces jointes d'un email
export const getAttachmentsByEmail = async (req, res) => {
  try {
    const emailId = req.params.emailId;
    
    // Vérifier si l'email existe et appartient à l'utilisateur
    const email = await Email.findById(emailId);
    
    if (!email) {
      return res.status(404).json({ message: 'Email non trouvé' });
    }
    
    if (email.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    const attachments = await Attachment.find({ email: emailId });
    
    res.json(attachments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Récupérer une pièce jointe par ID
export const getAttachmentById = async (req, res) => {
  try {
    const attachment = await Attachment.findById(req.params.id)
      .populate('email', 'owner');
    
    if (!attachment) {
      return res.status(404).json({ message: 'Pièce jointe non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à voir cette pièce jointe
    if (attachment.email.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    res.json(attachment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Télécharger une pièce jointe
// Note: Cette fonction est un placeholder, l'implémentation réelle dépendra
// du système de stockage utilisé (GridFS, S3, etc.)
export const downloadAttachment = async (req, res) => {
  try {
    const attachment = await Attachment.findById(req.params.id)
      .populate('email', 'owner');
    
    if (!attachment) {
      return res.status(404).json({ message: 'Pièce jointe non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à télécharger cette pièce jointe
    if (attachment.email.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Ici, on récupérerait le fichier depuis le système de stockage
    // et on l'enverrait au client
    
    // Exemple avec GridFS (à adapter selon l'implémentation réelle)
    /*
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db);
    const downloadStream = bucket.openDownloadStream(attachment.storageKey);
    
    res.set('Content-Type', attachment.mime);
    res.set('Content-Disposition', `attachment; filename="${attachment.name}"`);
    
    downloadStream.pipe(res);
    */
    
    // Pour l'instant, on renvoie juste un message
    res.json({ 
      message: 'Téléchargement de pièce jointe non implémenté',
      attachment: attachment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Supprimer une pièce jointe
export const deleteAttachment = async (req, res) => {
  try {
    const attachment = await Attachment.findById(req.params.id)
      .populate('email', 'owner');
    
    if (!attachment) {
      return res.status(404).json({ message: 'Pièce jointe non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à supprimer cette pièce jointe
    if (attachment.email.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Ici, on supprimerait également le fichier du système de stockage
    // Exemple avec GridFS (à adapter selon l'implémentation réelle)
    /*
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db);
    await bucket.delete(attachment.storageKey);
    */
    
    // Mettre à jour l'email pour retirer la référence à cette pièce jointe
    await Email.updateOne(
      { _id: attachment.email._id },
      { $pull: { attachments: attachment._id } }
    );
    
    // Supprimer la pièce jointe de la base de données
    await attachment.deleteOne();
    
    res.json({ message: 'Pièce jointe supprimée' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
