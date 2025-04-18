// Statuts des tâches
export const TASK_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed'
};

// Sources des tâches
export const TASK_SOURCE = {
  EMAIL: 'email',
  MANUAL: 'manual'
};

// Rôles de collaboration
export const COLLABORATION_ROLE = {
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer'
};

// Ordre des rôles (pour les vérifications d'accès)
export const ROLE_HIERARCHY = [
  COLLABORATION_ROLE.VIEWER,
  COLLABORATION_ROLE.EDITOR,
  COLLABORATION_ROLE.OWNER
];
