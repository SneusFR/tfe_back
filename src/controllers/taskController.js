import { Task } from '../models/index.js';

import { ValidationError, NotFoundError, AuthorizationError } from '../utils/AppError.js';

// Récupérer toutes les tâches d'un utilisateur
export const getTasks = async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const query = { user: req.user.id };
    
    // Filtrer par statut si spécifié
    if (status) {
      query.status = status;
    }
    
    // Filtrer par type si spécifié
    if (type) {
      query.type = type;
    }
    
    const tasks = await Task.find(query)
      .sort(req.pagination.sort)
      .skip(req.pagination.skip)
      .limit(req.pagination.limit);
    
    const total = await Task.countDocuments(query);
    
    res.json({
      page: req.pagination.page,
      limit: req.pagination.limit,
      total,
      totalPages: Math.ceil(total / req.pagination.limit),
      data: tasks
    });
  } catch (error) {
    next(error);
  }
};

// Récupérer une tâche par ID
export const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // Vérifier si l'utilisateur est autorisé à voir cette tâche
    if (task.user.toString() !== req.user.id) {
      throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
    }
    
    res.json(task);
  } catch (error) {
    next(error);
  }
};

// Créer une nouvelle tâche
export const createTask = async (req, res, next) => {
  try {
    const { type, description, source, sourceId, attachments } = req.body;
    
    const task = new Task({
      user: req.user.id,
      type,
      description,
      source: source || 'manual',
      sourceId,
      attachments: attachments || []
    });
    
    const createdTask = await task.save();
    
    res.status(201).json(createdTask);
  } catch (error) {
    next(error);
  }
};

// Mettre à jour une tâche
export const updateTask = async (req, res, next) => {
  try {
    const { description, status, attachments } = req.body;
    
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // Vérifier si l'utilisateur est autorisé à modifier cette tâche
    if (task.user.toString() !== req.user.id) {
      throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
    }
    
    task.description = description || task.description;
    
    if (status && status !== task.status) {
      task.status = status;
      if (status === 'completed') {
        task.completedAt = Date.now();
      } else {
        task.completedAt = null;
      }
    }
    
    if (attachments) {
      task.attachments = attachments;
    }
    
    const updatedTask = await task.save();
    
    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};

// Supprimer une tâche
export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // Vérifier si l'utilisateur est autorisé à supprimer cette tâche
    if (task.user.toString() !== req.user.id) {
      throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
    }
    
    await task.deleteOne();
    
    res.json({ 
      success: true,
      message: 'Tâche supprimée' 
    });
  } catch (error) {
    next(error);
  }
};

// Marquer une tâche comme terminée
export const completeTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // Vérifier si l'utilisateur est autorisé à modifier cette tâche
    if (task.user.toString() !== req.user.id) {
      throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
    }
    
    // Vérifier si la tâche est déjà terminée
    if (task.status === 'completed') {
      throw new ValidationError('La tâche est déjà terminée', 'TASK_ALREADY_COMPLETED');
    }
    
    task.status = 'completed';
    task.completedAt = Date.now();
    
    const updatedTask = await task.save();
    
    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};
