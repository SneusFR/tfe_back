import express from 'express';
import { collaborationController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../middleware/index.js';
import { Collaboration } from '../models/index.js';

const router = express.Router();
const { protect, hasFlowAccess } = authMiddleware;
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
  hasFlowAccess('viewer'), 
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
  hasFlowAccess('owner'), 
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
  asyncHandler(async (req, res, next) => {
    // Récupérer la collaboration pour vérifier le flow
    const collaboration = await Collaboration.findById(req.params.id).populate('flow');
    if (!collaboration) {
      return res.status(404).json({ message: 'Collaboration non trouvée' });
    }
    
    // Stocker le flowId dans la requête pour le middleware hasFlowAccess
    req.params.flowId = collaboration.flow._id;
    next();
  }),
  hasFlowAccess('owner'), 
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
  asyncHandler(async (req, res, next) => {
    // Récupérer la collaboration pour vérifier le flow
    const collaboration = await Collaboration.findById(req.params.id).populate('flow');
    if (!collaboration) {
      return res.status(404).json({ message: 'Collaboration non trouvée' });
    }
    
    // Stocker le flowId dans la requête pour le middleware hasFlowAccess
    req.params.flowId = collaboration.flow._id;
    next();
  }),
  hasFlowAccess('owner'), 
  asyncHandler(collaborationController.deleteCollaboration)
);

export default router;
