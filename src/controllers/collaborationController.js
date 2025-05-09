import { Collaboration, Flow, User } from '../models/index.js';
import { COLLABORATION_ROLE } from '../utils/constants.js';

// Récupérer toutes les collaborations pour un flow
export const getCollaborationsByFlow = async (req, res) => {
  try {
    const flowId = req.params.flowId;
    
    // Vérifier si l'utilisateur est autorisé à voir les collaborations de ce flow
    // Cette vérification sera gérée par un middleware d'autorisation
    
    const collaborations = await Collaboration.find({ flow: flowId })
      .populate('user', 'email displayName');
    
    res.json(collaborations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Récupérer toutes les collaborations d'un utilisateur
export const getCollaborationsByUser = async (req, res) => {
  try {
    const collaborations = await Collaboration.find({ user: req.user.id })
      .populate('flow', 'name isActive');
    
    res.json(collaborations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Créer une nouvelle collaboration
export const createCollaboration = async (req, res) => {
  try {
    const { flowId, userId, email, role } = req.body;
    
    // Vérifier si le flow existe
    const flow = await Flow.findById(flowId);
    if (!flow) {
      return res.status(404).json({ message: 'Flow non trouvé' });
    }
    
    // Vérifier si l'utilisateur est autorisé à ajouter des collaborateurs à ce flow
    // Cette vérification sera gérée par un middleware d'autorisation
    
    // Déterminer l'ID de l'utilisateur (soit directement fourni, soit recherché par email)
    let userIdToUse = userId;
    
    // Si userId n'est pas fourni mais email l'est, rechercher l'utilisateur par email
    if (!userIdToUse && email) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé avec cet email' });
      }
      userIdToUse = user._id;
    }
    
    // Vérifier si la collaboration existe déjà
    const existingCollaboration = await Collaboration.findOne({
      flow: flowId,
      user: userIdToUse
    });
    
    if (existingCollaboration) {
      return res.status(400).json({ message: 'Cette collaboration existe déjà' });
    }
    
    const collaboration = new Collaboration({
      flow: flowId,
      user: userIdToUse,
      role: role || COLLABORATION_ROLE.VIEWER
    });
    
    const createdCollaboration = await collaboration.save();
    
    await createdCollaboration.populate('user', 'email displayName');
    
    res.status(201).json(createdCollaboration);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mettre à jour une collaboration
export const updateCollaboration = async (req, res) => {
  try {
    const { role } = req.body;
    
    const collaboration = await Collaboration.findById(req.params.id);
    
    if (!collaboration) {
      return res.status(404).json({ message: 'Collaboration non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à modifier cette collaboration
    // Cette vérification sera gérée par un middleware d'autorisation
    
    // Vérifier si c'est le dernier owner et qu'on essaie de changer son rôle
    if (collaboration.role === COLLABORATION_ROLE.OWNER && role !== COLLABORATION_ROLE.OWNER) {
      // Compter les owners restants
      const ownersCount = await Collaboration.countDocuments({
        flow: collaboration.flow,
        role: COLLABORATION_ROLE.OWNER
      });
      
      if (ownersCount <= 1) {
        return res.status(403).json({ 
          message: 'Impossible de rétrograder le dernier propriétaire du flow' 
        });
      }
    }
    
    collaboration.role = role || collaboration.role;
    
    const updatedCollaboration = await collaboration.save();
    
    await updatedCollaboration.populate('user', 'email displayName');
    await updatedCollaboration.populate('flow', 'name');
    
    res.json(updatedCollaboration);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Supprimer une collaboration
export const deleteCollaboration = async (req, res) => {
  try {
    const collaboration = await Collaboration.findById(req.params.id);
    
    if (!collaboration) {
      return res.status(404).json({ message: 'Collaboration non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à supprimer cette collaboration
    // Cette vérification sera gérée par un middleware d'autorisation
    
    // Vérifier si c'est le dernier owner
    if (collaboration.role === COLLABORATION_ROLE.OWNER) {
      // Compter les owners restants
      const ownersCount = await Collaboration.countDocuments({
        flow: collaboration.flow,
        role: COLLABORATION_ROLE.OWNER
      });
      
      if (ownersCount <= 1) {
        return res.status(403).json({ 
          message: 'Impossible de supprimer le dernier propriétaire du flow' 
        });
      }
    }
    
    await collaboration.deleteOne();
    
    res.json({ message: 'Collaboration supprimée' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
