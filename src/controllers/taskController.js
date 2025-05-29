import { Task } from '../models/index.js';

import { ValidationError, NotFoundError, AuthorizationError } from '../utils/AppError.js';

// Récupérer toutes les tâches d'un flow
export const getTasks = async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const flowId = req.params.flowId;
    const query = { flow: flowId };
    
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
    const flowId = req.params.flowId;
    const task = await Task.findOne({ _id: req.params.id, flow: flowId });
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // L'accès est déjà vérifié par le middleware hasFlowAccess
    
    res.json(task);
  } catch (error) {
    next(error);
  }
};

// Créer une nouvelle tâche
export const createTask = async (req, res, next) => {
  try {
    const flowId = req.params.flowId;
    const { 
      type, 
      description, 
      source, 
      sourceId, 
      subject,
      senderEmail, 
      recipientEmail, 
      senderName,
      recipientName,
      body,
      date,
      attachmentId,
      attachments 
    } = req.body;
    
    const task = new Task({
      user: req.user.id,
      flow: flowId,
      type,
      description,
      source: source || 'manual',
      sourceId,
      subject,
      senderEmail,
      recipientEmail,
      senderName,
      recipientName,
      body,
      date,
      attachmentId,
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
    const flowId = req.params.flowId;
    const { 
      description, 
      type, 
      source, 
      sourceId, 
      subject,
      senderEmail, 
      recipientEmail, 
      senderName,
      recipientName,
      body,
      date,
      attachmentId,
      status, 
      attachments 
    } = req.body;
    
    const task = await Task.findOne({ _id: req.params.id, flow: flowId });
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // L'accès est déjà vérifié par le middleware hasFlowAccess
    
    // Mise à jour des champs si fournis
    if (description !== undefined) task.description = description;
    if (type !== undefined) task.type = type;
    if (source !== undefined) task.source = source;
    if (sourceId !== undefined) task.sourceId = sourceId;
    if (subject !== undefined) task.subject = subject;
    if (senderEmail !== undefined) task.senderEmail = senderEmail;
    if (recipientEmail !== undefined) task.recipientEmail = recipientEmail;
    if (senderName !== undefined) task.senderName = senderName;
    if (recipientName !== undefined) task.recipientName = recipientName;
    if (body !== undefined) task.body = body;
    if (date !== undefined) task.date = date;
    if (attachmentId !== undefined) task.attachmentId = attachmentId;
    
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
    const flowId = req.params.flowId;
    const task = await Task.findOne({ _id: req.params.id, flow: flowId });
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // L'accès est déjà vérifié par le middleware hasFlowAccess
    
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
    const flowId = req.params.flowId;
    const task = await Task.findOne({ _id: req.params.id, flow: flowId });
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // L'accès est déjà vérifié par le middleware hasFlowAccess
    
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

// Marquer une tâche comme en attente (remettre une tâche complétée en état pending)
export const setPendingTask = async (req, res, next) => {
  try {
    const flowId = req.params.flowId;
    const task = await Task.findOne({ _id: req.params.id, flow: flowId });
    
    if (!task) {
      throw new NotFoundError('Tâche non trouvée', 'TASK_NOT_FOUND');
    }
    
    // L'accès est déjà vérifié par le middleware hasFlowAccess
    
    // Vérifier si la tâche est déjà en attente
    if (task.status === 'pending') {
      throw new ValidationError('La tâche est déjà en attente', 'TASK_ALREADY_PENDING');
    }
    
    task.status = 'pending';
    task.completedAt = null;
    
    const updatedTask = await task.save();
    
    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};
