import { Email, Attachment, Task } from '../models/index.js';

// Récupérer tous les emails d'un utilisateur
export const getEmails = async (req, res) => {
  try {
    const emails = await Email.find({ owner: req.user.id })
      .sort({ date: -1 })
      .populate('attachments');
    
    res.json(emails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Récupérer un email par ID
export const getEmailById = async (req, res) => {
  try {
    const email = await Email.findById(req.params.id)
      .populate('attachments');
    
    if (!email) {
      return res.status(404).json({ message: 'Email non trouvé' });
    }
    
    // Vérifier si l'utilisateur est autorisé à voir cet email
    if (email.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    res.json(email);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Créer un nouvel email (généralement appelé par un service de récupération d'emails)
export const createEmail = async (req, res) => {
  try {
    const { emailId, subject, from, to, date, body, attachments, flow } = req.body;
    
    // Vérifier si l'email existe déjà pour cet utilisateur
    const existingEmail = await Email.findOne({
      owner: req.user.id,
      emailId
    });
    
    if (existingEmail) {
      return res.status(400).json({ message: 'Cet email existe déjà' });
    }
    
    const email = new Email({
      owner: req.user.id,
      emailId,
      subject,
      from,
      to,
      date: date || new Date(),
      body,
      flow: flow || null // Utiliser le flow fourni ou null
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
    
    // Créer automatiquement une tâche associée à cet email si nécessaire
    // Cette logique pourrait être déplacée dans un service dédié
    const task = await Task.create({
      user: req.user.id,
      flow: flow || req.user.defaultFlow, // Utiliser le flow fourni ou le flow par défaut
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
    
    // Task.create() sauvegarde déjà la tâche, pas besoin de save() supplémentaire
    
    // Récupérer l'email avec les pièces jointes pour la réponse
    const emailWithAttachments = await Email.findById(createdEmail._id)
      .populate('attachments');
    
    res.status(201).json(emailWithAttachments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Supprimer un email
export const deleteEmail = async (req, res) => {
  try {
    const email = await Email.findById(req.params.id);
    
    if (!email) {
      return res.status(404).json({ message: 'Email non trouvé' });
    }
    
    // Vérifier si l'utilisateur est autorisé à supprimer cet email
    if (email.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Supprimer les pièces jointes associées
    await Attachment.deleteMany({ email: email._id });
    
    // Supprimer l'email
    await email.deleteOne();
    
    res.json({ message: 'Email supprimé' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Rechercher des emails
export const searchEmails = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Paramètre de recherche requis' });
    }
    
    const emails = await Email.find({
      owner: req.user.id,
      $or: [
        { subject: { $regex: query, $options: 'i' } },
        { body: { $regex: query, $options: 'i' } },
        { 'from.address': { $regex: query, $options: 'i' } },
        { 'from.name': { $regex: query, $options: 'i' } }
      ]
    }).sort({ date: -1 }).populate('attachments');
    
    res.json(emails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Récupérer tous les emails d'un flow
export const getEmailsByFlow = async (req, res) => {
  try {
    const flowId = req.params.flowId;
    
    const emails = await Email.find({ 
      owner: req.user.id,
      flow: flowId
    })
      .sort({ date: -1 })
      .populate('attachments');
    
    res.json(emails);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
