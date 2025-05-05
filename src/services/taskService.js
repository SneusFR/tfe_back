import { Task } from '../models/index.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../utils/AppError.js';

/**
 * Récupère toutes les tâches d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {Object} options - Options de filtrage et pagination
 * @returns {Promise<Array>} - Liste des tâches
 */
export const getUserTasks = async (userId, options = {}) => {
  const { 
    limit = 20, 
    skip = 0, 
    sort = { createdAt: -1 },
    status = null,
    type = null
  } = options;
  
  const query = { user: userId };
  
  // Filtrer par statut si spécifié
  if (status) {
    query.status = status;
  }
  
  // Filtrer par type si spécifié
  if (type) {
    query.type = type;
  }
  
  const tasks = await Task.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit);
  
  return tasks;
};

/**
 * Récupère une tâche par ID
 * @param {string} taskId - ID de la tâche
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Tâche
 */
export const getTaskById = async (taskId, userId) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
  }
  
  // Vérifier si l'utilisateur est autorisé à voir cette tâche
  if (task.user.toString() !== userId) {
    throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
  }
  
  return task;
};

/**
 * Crée une nouvelle tâche
 * @param {string} userId - ID de l'utilisateur
 * @param {Object} taskData - Données de la tâche
 * @returns {Promise<Object>} - Tâche créée
 */
export const createTask = async (userId, taskData) => {
  const { 
    type, 
    description, 
    source, 
    sourceId, 
    senderEmail, 
    recipientEmail, 
    attachments 
  } = taskData;
  
  if (!type) {
    throw new ValidationError('Le type de tâche est requis', 'MISSING_TASK_TYPE');
  }
  
  const task = new Task({
    user: userId,
    type,
    description,
    source: source || 'manual',
    sourceId,
    senderEmail,
    recipientEmail,
    attachments: attachments || []
  });
  
  return await task.save();
};

/**
 * Met à jour une tâche
 * @param {string} taskId - ID de la tâche
 * @param {Object} updateData - Données à mettre à jour
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Tâche mise à jour
 */
export const updateTask = async (taskId, updateData, userId) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
  }
  
  // Vérifier si l'utilisateur est autorisé à modifier cette tâche
  if (task.user.toString() !== userId) {
    throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
  }
  
  const { 
    description, 
    type, 
    source, 
    sourceId, 
    senderEmail, 
    recipientEmail, 
    status, 
    attachments 
  } = updateData;
  
  // Mise à jour des champs si fournis
  if (description !== undefined) task.description = description;
  if (type !== undefined) task.type = type;
  if (source !== undefined) task.source = source;
  if (sourceId !== undefined) task.sourceId = sourceId;
  if (senderEmail !== undefined) task.senderEmail = senderEmail;
  if (recipientEmail !== undefined) task.recipientEmail = recipientEmail;
  
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
  
  return await task.save();
};

/**
 * Marque une tâche comme terminée
 * @param {string} taskId - ID de la tâche
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Tâche mise à jour
 */
export const completeTask = async (taskId, userId) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
  }
  
  // Vérifier si l'utilisateur est autorisé à modifier cette tâche
  if (task.user.toString() !== userId) {
    throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
  }
  
  // Vérifier si la tâche est déjà terminée
  if (task.status === 'completed') {
    throw new ValidationError('La tâche est déjà terminée', 'TASK_ALREADY_COMPLETED');
  }
  
  task.status = 'completed';
  task.completedAt = Date.now();
  
  return await task.save();
};

/**
 * Supprime une tâche
 * @param {string} taskId - ID de la tâche
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<void>}
 */
export const deleteTask = async (taskId, userId) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
  }
  
  // Vérifier si l'utilisateur est autorisé à supprimer cette tâche
  if (task.user.toString() !== userId) {
    throw new AuthorizationError('Accès non autorisé', 'UNAUTHORIZED_ACCESS');
  }
  
  await task.deleteOne();
};

/**
 * Récupère les statistiques des tâches d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - Statistiques des tâches
 */
export const getTaskStats = async (userId) => {
  const totalTasks = await Task.countDocuments({ user: userId });
  const pendingTasks = await Task.countDocuments({ user: userId, status: 'pending' });
  const completedTasks = await Task.countDocuments({ user: userId, status: 'completed' });
  
  // Tâches par type
  const tasksByType = await Task.aggregate([
    { $match: { user: userId } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);
  
  // Tâches créées par jour (7 derniers jours)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const tasksByDay = await Task.aggregate([
    { 
      $match: { 
        user: userId,
        createdAt: { $gte: sevenDaysAgo }
      } 
    },
    {
      $group: {
        _id: { 
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } 
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  return {
    total: totalTasks,
    pending: pendingTasks,
    completed: completedTasks,
    byType: tasksByType,
    byDay: tasksByDay
  };
};
