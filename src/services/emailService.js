import { Email, Attachment, Task } from '../models/index.js';

/**
 * Récupère tous les emails d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {Object} options - Options de filtrage et pagination
 * @returns {Promise<Array>} - Liste des emails
 */
export const getUserEmails = async (userId, options = {}) => {
  const { limit = 20, skip = 0, sort = { date: -1 } } = options;
  
  const emails = await Email.find({ owner: userId })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('attachments');
  
  return emails;
};

/**
 * Récupère un email par ID
 * @param {string} emailId - ID de l'email
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Email
 */
export const getEmailById = async (emailId, userId) => {
  const email = await Email.findById(emailId)
    .populate('attachments');
  
  if (!email) {
    throw new Error('Email non trouvé');
  }
  
  // Vérifier si l'utilisateur est autorisé à voir cet email
  if (email.owner.toString() !== userId) {
    throw new Error('Accès non autorisé');
  }
  
  return email;
};

/**
 * Crée un nouvel email
 * @param {string} userId - ID de l'utilisateur
 * @param {Object} emailData - Données de l'email
 * @returns {Promise<Object>} - Email créé
 */
export const createEmail = async (userId, emailData) => {
  const { emailId, subject, from, to, date, body, attachments } = emailData;
  
  // Vérifier si l'email existe déjà pour cet utilisateur
  const existingEmail = await Email.findOne({
    owner: userId,
    emailId
  });
  
  if (existingEmail) {
    throw new Error('Cet email existe déjà');
  }
  
  const email = new Email({
    owner: userId,
    emailId,
    subject,
    from,
    to,
    date: date || new Date(),
    body
  });
  
  const createdEmail = await email.save();
  
  // Traiter les pièces jointes si elles existent
  if (attachments && attachments.length > 0) {
    const attachmentDocs = [];
    
    for (const attachment of attachments) {
      const newAttachment = new Attachment({
        email: createdEmail._id,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        storageKey: attachment.storageKey
      });
      
      const savedAttachment = await newAttachment.save();
      attachmentDocs.push(savedAttachment._id);
    }
    
    // Mettre à jour l'email avec les références aux pièces jointes
    createdEmail.attachments = attachmentDocs;
    await createdEmail.save();
  }
  
  // Créer automatiquement une tâche associée à cet email
  const task = new Task({
    user: userId,
    type: 'email_processing',
    description: `Traiter l'email: ${subject}`,
    source: 'email',
    sourceId: createdEmail._id.toString(),
    attachments: attachments ? attachments.map(a => ({
      id: a.storageKey,
      name: a.name,
      mime: a.mime,
      size: a.size
    })) : []
  });
  
  await task.save();
  
  // Récupérer l'email avec les pièces jointes pour la réponse
  return await Email.findById(createdEmail._id)
    .populate('attachments');
};

/**
 * Supprime un email
 * @param {string} emailId - ID de l'email
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<void>}
 */
export const deleteEmail = async (emailId, userId) => {
  const email = await Email.findById(emailId);
  
  if (!email) {
    throw new Error('Email non trouvé');
  }
  
  // Vérifier si l'utilisateur est autorisé à supprimer cet email
  if (email.owner.toString() !== userId) {
    throw new Error('Accès non autorisé');
  }
  
  // Supprimer les pièces jointes associées
  await Attachment.deleteMany({ email: email._id });
  
  // Supprimer les tâches associées à cet email
  await Task.deleteMany({ 
    source: 'email',
    sourceId: email._id.toString()
  });
  
  // Supprimer l'email
  await email.deleteOne();
};

/**
 * Recherche des emails
 * @param {string} userId - ID de l'utilisateur
 * @param {string} query - Texte de recherche
 * @param {Object} options - Options de filtrage et pagination
 * @returns {Promise<Array>} - Liste des emails correspondants
 */
export const searchEmails = async (userId, query, options = {}) => {
  const { limit = 20, skip = 0, sort = { date: -1 } } = options;
  
  if (!query) {
    throw new Error('Paramètre de recherche requis');
  }
  
  const emails = await Email.find({
    owner: userId,
    $or: [
      { subject: { $regex: query, $options: 'i' } },
      { body: { $regex: query, $options: 'i' } },
      { 'from.address': { $regex: query, $options: 'i' } },
      { 'from.name': { $regex: query, $options: 'i' } }
    ]
  })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('attachments');
  
  return emails;
};

/**
 * Récupère une pièce jointe par ID
 * @param {string} attachmentId - ID de la pièce jointe
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Pièce jointe
 */
export const getAttachmentById = async (attachmentId, userId) => {
  const attachment = await Attachment.findById(attachmentId)
    .populate('email', 'owner');
  
  if (!attachment) {
    throw new Error('Pièce jointe non trouvée');
  }
  
  // Vérifier si l'utilisateur est autorisé à voir cette pièce jointe
  if (attachment.email.owner.toString() !== userId) {
    throw new Error('Accès non autorisé');
  }
  
  return attachment;
};

/**
 * Récupère toutes les pièces jointes d'un email
 * @param {string} emailId - ID de l'email
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Array>} - Liste des pièces jointes
 */
export const getAttachmentsByEmail = async (emailId, userId) => {
  // Vérifier si l'email existe et appartient à l'utilisateur
  const email = await Email.findById(emailId);
  
  if (!email) {
    throw new Error('Email non trouvé');
  }
  
  if (email.owner.toString() !== userId) {
    throw new Error('Accès non autorisé');
  }
  
  return await Attachment.find({ email: emailId });
};

/**
 * Supprime une pièce jointe
 * @param {string} attachmentId - ID de la pièce jointe
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<void>}
 */
export const deleteAttachment = async (attachmentId, userId) => {
  const attachment = await Attachment.findById(attachmentId)
    .populate('email', 'owner');
  
  if (!attachment) {
    throw new Error('Pièce jointe non trouvée');
  }
  
  // Vérifier si l'utilisateur est autorisé à supprimer cette pièce jointe
  if (attachment.email.owner.toString() !== userId) {
    throw new Error('Accès non autorisé');
  }
  
  // Mettre à jour l'email pour retirer la référence à cette pièce jointe
  await Email.updateOne(
    { _id: attachment.email._id },
    { $pull: { attachments: attachment._id } }
  );
  
  // Supprimer la pièce jointe
  await attachment.deleteOne();
};
