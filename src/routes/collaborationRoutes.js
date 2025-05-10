import express from 'express';
import { collaborationController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';
import { COLLABORATION_ROLE } from '../utils/constants.js';

const router = express.Router();
const { protect, hasFlowAccess, injectFlowId } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;
const { validateCollaboration } = validationMiddleware;

/**
 * @route   GET /api/collaborations/flow/:flowId
 * @desc    Récupérer toutes les collaborations pour un flow
 * @access  Private
 */
router.get('/flow/:flowId', 
  protect, 
  validateMongoId('flowId'), 
  hasFlowAccess(COLLABORATION_ROLE.VIEWER), 
  asyncHandler(collaborationController.getCollaborationsByFlow)
);

/**
 * @route   GET /api/collaborations/user
 * @desc    Récupérer toutes les collaborations d'un utilisateur
 * @access  Private
 */
router.get('/user', 
  protect, 
  asyncHandler(collaborationController.getCollaborationsByUser)
);

/**
 * @route   POST /api/collaborations
 * @desc    Créer une nouvelle collaboration
 * @access  Private
 */
router.post('/', 
  protect, 
  validateCollaboration, 
  hasFlowAccess(COLLABORATION_ROLE.OWNER), 
  asyncHandler(collaborationController.createCollaboration)
);

/**
 * @route   PUT /api/collaborations/:id
 * @desc    Mettre à jour une collaboration
 * @access  Private
 */
router.put('/:id', 
  protect, 
  validateMongoId('id'), 
  injectFlowId,
  hasFlowAccess(COLLABORATION_ROLE.OWNER), 
  asyncHandler(collaborationController.updateCollaboration)
);

/**
 * @route   DELETE /api/collaborations/:id
 * @desc    Supprimer une collaboration
 * @access  Private
 */
router.delete('/:id', 
  protect, 
  validateMongoId('id'), 
  injectFlowId,
  hasFlowAccess(COLLABORATION_ROLE.OWNER), 
  asyncHandler(collaborationController.deleteCollaboration)
);

export default router;
