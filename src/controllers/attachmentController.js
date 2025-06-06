import { Attachment, Email } from '../models/index.js';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';

// Récupérer toutes les pièces jointes d'un flow
export const getAttachmentsByFlow = async (req, res) => {
  try {
    const flowId = req.params.flowId;
    
    // Trouver tous les emails associés à ce flow qui appartiennent à l'utilisateur
    const emails = await Email.find({ 
      flow: flowId,
      owner: req.user.id
    });
    
    if (emails.length === 0) {
      return res.json([]);
    }
    
    // Récupérer les IDs des emails
    const emailIds = emails.map(email => email._id);
    
    // Trouver toutes les pièces jointes associées à ces emails
    const attachments = await Attachment.find({ 
      email: { $in: emailIds } 
    }).populate('email', 'subject from date');
    
    res.json(attachments);
  } catch (error) {
    console.error('Erreur lors de la récupération des pièces jointes:', error);
    res.status(500).json({ message: error.message });
  }
};

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
    
    // Générer un nom de fichier basé sur l'ID de la pièce jointe et son nom original
    const safeFileName = `${attachment._id.toString()}-${attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(process.cwd(), 'uploads', safeFileName);
    
    // Vérifier si le fichier existe déjà dans le dossier uploads
    if (!fs.existsSync(filePath)) {
      console.log(`Fichier non trouvé: ${filePath}, tentative de récupération depuis storageKey`);
      
      if (attachment.storageKey?.startsWith('data:')) {
        // cas « upload direct » : vraie data URL
        const base64 = attachment.storageKey.split(';base64,').pop();
        await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
        console.log(`Fichier créé avec succès: ${filePath}`);
      } else if (attachment.storageKey && attachment.storageKey.length > 0) {
        // cas « Unipile » : storageKey == identifiant distant
        
        // Récupérer l'email pour obtenir son emailId Unipile
        const email = await Email.findById(attachment.email._id);
        if (!email) {
          return res.status(500).json({ message: 'Email introuvable' });
        }
        
        // Vérifier que l'emailId Unipile existe
        if (!email.emailId) {
          return res.status(500).json({ message: 'emailId manquant' });
        }
        
        // Construire l'URL correcte selon la documentation Unipile
        let unipileUrl = `${process.env.UNIPILE_BASE_URL.replace(/\/$/, '')}/emails/${email.emailId}/attachments/${attachment.storageKey}`;
        
        try {
          const { data } = await axios.get(unipileUrl, {
            responseType: 'arraybuffer',
            headers: { 'X-API-KEY': process.env.UNIPILE_EMAIL_API_KEY }
          });
          
          await fs.writeFile(filePath, data);
          console.log(`Fichier téléchargé depuis Unipile avec succès: ${filePath}`);
        } catch (apiError) {
          // Extraire les informations importantes de l'erreur
          const status = apiError.response?.status;
          const headers = apiError.response?.headers;
          const body = apiError.response?.data?.toString?.().slice(0, 500); // trim

          console.error('⛔️ Unipile download failed', {
            url: unipileUrl,
            status,
            headers,
            body
          });

          return res.status(502).json({
            message: 'Erreur Unipile',
            status,
            detail: body || apiError.message
          });
        }
      } else {
        return res.status(404).json({ message: 'Fichier non trouvé sur le serveur et aucune donnée disponible' });
      }
    }
    
    // Définir les en-têtes HTTP appropriés
    res.set('Content-Type', attachment.mime || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.name)}"`);
    
    // Envoyer le fichier
    res.sendFile(filePath);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ message: error.message });
  }
};

// Télécharger un fichier en tant que pièce jointe
export const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier téléchargé' });
    }
    
    // Créer une nouvelle pièce jointe
    const attachment = new Attachment({
      email: req.body.emailId, // ID de l'email associé
      name: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
      storageKey: req.file.filename // Le nom du fichier sur le disque
    });
    
    const savedAttachment = await attachment.save();
    
    // Renommer le fichier pour utiliser le même format que downloadAttachment
    const safeFileName = `${savedAttachment._id.toString()}-${savedAttachment.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const originalPath = path.join(process.cwd(), 'uploads', req.file.filename);
    const newPath = path.join(process.cwd(), 'uploads', safeFileName);
    
    // Renommer le fichier si nécessaire
    if (fs.existsSync(originalPath) && originalPath !== newPath) {
      await fs.move(originalPath, newPath, { overwrite: true });
      
      // Mettre à jour le storageKey dans la base de données
      await Attachment.updateOne(
        { _id: savedAttachment._id },
        { storageKey: safeFileName }
      );
      
      // Mettre à jour l'objet savedAttachment pour la réponse
      savedAttachment.storageKey = safeFileName;
    }
    
    // Mettre à jour l'email avec la référence à la pièce jointe
    await Email.updateOne(
      { _id: req.body.emailId },
      { $push: { attachments: savedAttachment._id } }
    );
    
    res.status(201).json(savedAttachment);
  } catch (error) {
    console.error('Erreur lors du téléchargement:', error);
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
    
    // Supprimer le fichier du système de stockage
    // Vérifier d'abord le fichier avec le nom basé sur l'ID
    const safeFileName = `${attachment._id.toString()}-${attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const newFilePath = path.join(process.cwd(), 'uploads', safeFileName);
    
    // Vérifier aussi le chemin avec le storageKey original
    const originalFilePath = path.join(process.cwd(), 'uploads', attachment.storageKey);
    
    // Supprimer les fichiers s'ils existent
    if (fs.existsSync(newFilePath)) {
      await fs.remove(newFilePath);
      console.log(`Fichier supprimé: ${newFilePath}`);
    }
    
    if (fs.existsSync(originalFilePath)) {
      await fs.remove(originalFilePath);
      console.log(`Fichier supprimé: ${originalFilePath}`);
    }
    
    // Mettre à jour l'email pour retirer la référence à cette pièce jointe
    await Email.updateOne(
      { _id: attachment.email._id },
      { $pull: { attachments: attachment._id } }
    );
    
    // Supprimer la pièce jointe de la base de données
    await attachment.deleteOne();
    
    res.json({ message: 'Pièce jointe supprimée' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ message: error.message });
  }
};
