import { Condition } from '../models/index.js';
import { evaluateCondition as evalCondition, replaceVariables } from '../utils/conditionEvaluator.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../utils/AppError.js';

// Récupérer toutes les conditions d'un utilisateur
export const getConditions = async (req, res) => {
  try {
    const conditions = await Condition.find({ owner: req.user.id });
    res.json(conditions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Récupérer une condition par ID
export const getConditionById = async (req, res) => {
  try {
    const condition = await Condition.findById(req.params.id);
    
    if (!condition) {
      return res.status(404).json({ message: 'Condition non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à voir cette condition
    if (condition.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    res.json(condition);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Créer une nouvelle condition
export const createCondition = async (req, res) => {
  try {
    const { conditionText, returnText } = req.body;
    
    const condition = new Condition({
      owner: req.user.id,
      conditionText,
      returnText
    });
    
    const createdCondition = await condition.save();
    
    res.status(201).json(createdCondition);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mettre à jour une condition
export const updateCondition = async (req, res) => {
  try {
    const { conditionText, returnText } = req.body;
    
    const condition = await Condition.findById(req.params.id);
    
    if (!condition) {
      return res.status(404).json({ message: 'Condition non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à modifier cette condition
    if (condition.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    condition.conditionText = conditionText || condition.conditionText;
    condition.returnText = returnText || condition.returnText;
    
    const updatedCondition = await condition.save();
    
    res.json(updatedCondition);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Supprimer une condition
export const deleteCondition = async (req, res) => {
  try {
    const condition = await Condition.findById(req.params.id);
    
    if (!condition) {
      return res.status(404).json({ message: 'Condition non trouvée' });
    }
    
    // Vérifier si l'utilisateur est autorisé à supprimer cette condition
    if (condition.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    await condition.deleteOne();
    
    res.json({ message: 'Condition supprimée' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Évaluer une condition
export const evaluateCondition = async (req, res, next) => {
  try {
    const { conditionId, context } = req.body;
    
    if (!conditionId) {
      throw new ValidationError('ID de condition requis', 'MISSING_CONDITION_ID');
    }
    
    if (!context || typeof context !== 'object') {
      throw new ValidationError('Contexte requis et doit être un objet', 'INVALID_CONTEXT');
    }
    
    const condition = await Condition.findById(conditionId);
    
    if (!condition) {
      throw new NotFoundError('Condition non trouvée', 'CONDITION_NOT_FOUND');
    }
    
    // Vérifier si l'utilisateur est autorisé à évaluer cette condition
    if (condition.owner.toString() !== req.user.id) {
      throw new AuthorizationError('Accès non autorisé à cette condition', 'UNAUTHORIZED_ACCESS');
    }
    
    // Évaluer la condition avec le contexte fourni
    const result = evalCondition(condition.conditionText, context);
    
    // Remplacer les variables dans le texte de retour
    const processedReturnText = replaceVariables(condition.returnText, context);
    
    res.json({
      result,
      returnText: processedReturnText
    });
  } catch (error) {
    next(error);
  }
};
