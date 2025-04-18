// routes/flowRoutes.js
import express from 'express';
import { flowController } from '../controllers/index.js';
import {
  authMiddleware,
  errorMiddleware,
  validationMiddleware,
} from '../middleware/index.js';

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* Middlewares courants                                                       */
/* -------------------------------------------------------------------------- */
const { protect, hasFlowAccess }         = authMiddleware;
const { asyncHandler, validateMongoId }  = errorMiddleware;
const { validateFlow, validatePagination } = validationMiddleware;

/* -------------------------------------------------------------------------- */
/* GET /api/flows – liste paginée                                             */
/* -------------------------------------------------------------------------- */
router.get(
  '/',
  protect,
  validatePagination,
  asyncHandler(flowController.listFlows)    // ← nouveau nom
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
/* GET /api/flows/:id – détail d’un flow                                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/:id',
  protect,
  validateMongoId('id'),
  hasFlowAccess('viewer'),
  asyncHandler(flowController.getFlow)      // ← nouveau nom
);

/* -------------------------------------------------------------------------- */
/* POST /api/flows – création                                                 */
/* -------------------------------------------------------------------------- */
router.post(
  '/',
  protect,
  validateFlow,
  asyncHandler(flowController.createFlow)   // inchangé
);

/* -------------------------------------------------------------------------- */
/* PUT /api/flows/:id – sauvegarde de la variante courante                    */
/* body : { nodes, edges }                                                    */
/* -------------------------------------------------------------------------- */
router.put(
  '/:id',
  protect,
  validateMongoId('id'),
  hasFlowAccess('editor'),
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
  hasFlowAccess('viewer'),                  // un simple viewer peut switcher
  asyncHandler(flowController.switchVariant)
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/flows/:id – suppression                                        */
/* -------------------------------------------------------------------------- */
router.delete(
  '/:id',
  protect,
  validateMongoId('id'),
  hasFlowAccess('owner'),
  asyncHandler(flowController.deleteFlow)
);

export default router;
