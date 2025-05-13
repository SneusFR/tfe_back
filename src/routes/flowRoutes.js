// routes/flowRoutes.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import { flowController } from '../controllers/index.js';
import {
  authMiddleware,
  errorMiddleware,
  validationMiddleware,
} from '../middleware/index.js';
import taskRoutes from './taskRoutes.js';
import backendConfigRoutes from './backendConfigRoutes.js';
import conditionRoutes from './conditionRoutes.js';
import { COLLABORATION_ROLE } from '../utils/constants.js';

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* Middlewares courants                                                       */
/* -------------------------------------------------------------------------- */
const { protect, hasFlowAccess }         = authMiddleware;
const { asyncHandler, validateMongoId }  = errorMiddleware;
const { validateFlow, validatePagination } = validationMiddleware;

/* -------------------------------------------------------------------------- */
/* GET /api/flows – liste paginée                                             */
/* -------------------------------------------------------------------------- */
router.get(
  '/',
  protect,
  validatePagination,
  asyncHandler(flowController.getMyFlows)    // ← utilise getMyFlows au lieu de listFlows
);

/* -------------------------------------------------------------------------- */
/* POST /api/flows – création                                                 */
/* -------------------------------------------------------------------------- */
router.post(
  '/',
  protect,
  body('name').notEmpty().withMessage('Le nom est requis'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: errors.array()[0].msg,
        errors: errors.array() 
      });
    }
    next();
  },
  asyncHandler(flowController.createFlow)   // inchangé
);

/* -------------------------------------------------------------------------- */
/* GET /api/flows/active – liste paginée des flows actifs                     */
/* -------------------------------------------------------------------------- */
router.get(
  '/active',
  protect,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { flowService } = await import('../services/index.js');
    const flows          = await flowService.getUserFlows(req.user.id);
    const activeFlows    = flows.filter(f => f.isActive);

    const { page, limit, skip } = req.pagination;
    const paginated             = activeFlows.slice(skip, skip + limit);

    res.json({
      page,
      limit,
      total:      activeFlows.length,
      totalPages: Math.ceil(activeFlows.length / limit),
      data:       paginated,
    });
  })
);

/* -------------------------------------------------------------------------- */
/* GET /api/flows/:id – détail d'un flow                                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id',
  protect,
  validateMongoId('id'),
  hasFlowAccess(COLLABORATION_ROLE.VIEWER),
  asyncHandler(flowController.getFlow)      // ← nouveau nom
);

/* -------------------------------------------------------------------------- */
/* PUT /api/flows/:id – sauvegarde de la variante courante                    */
/* body : { nodes, edges }                                                    */
/* -------------------------------------------------------------------------- */
router.put(
  '/:id',
  protect,
  validateMongoId('id'),
  hasFlowAccess(COLLABORATION_ROLE.EDITOR),
  asyncHandler(flowController.saveVariant)  // ← écrase l’onglet courant
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/flows/:id/version – changement d’onglet (0 / 1 / 2)             */
/* body : { index: Number }                                                   */
/* -------------------------------------------------------------------------- */
router.patch(
  '/:id/version',
  protect,
  validateMongoId('id'),
  hasFlowAccess(COLLABORATION_ROLE.VIEWER),                  // un simple viewer peut switcher
  asyncHandler(flowController.switchVariant)
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/flows/:id – suppression                                        */
/* -------------------------------------------------------------------------- */
router.delete(
  '/:id',
  protect,
  validateMongoId('id'),
  hasFlowAccess(COLLABORATION_ROLE.OWNER),
  asyncHandler(flowController.deleteFlow)
);

/* -------------------------------------------------------------------------- */
/* Routes imbriquées pour les entités liées au flow                           */
/* -------------------------------------------------------------------------- */
router.use('/:flowId/tasks', taskRoutes);
router.use('/:flowId/backend-configs', backendConfigRoutes);
router.use('/:flowId/conditions', conditionRoutes);

export default router;
