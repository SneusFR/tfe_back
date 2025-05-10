import express from 'express';
import rateLimit from 'express-rate-limit';
import { backendConfigController as c } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, backendConfigValidation } from '../middleware/index.js';
import { COLLABORATION_ROLE } from '../utils/constants.js';

const r = express.Router({ mergeParams: true }); // Pour accéder aux params de la route parent (flowId)
const { protect, hasFlowAccess } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;

/* /api/flow/:flowId/backend-configs */
r.use(protect, hasFlowAccess(COLLABORATION_ROLE.VIEWER));

// Appliquer le rate limit global pour toutes les routes de backend-configs
const globalLimit = backendConfigValidation.backendConfigRateLimit(rateLimit);
r.use(globalLimit);

// Routes avec validation - lecture (viewer+)
r.get('/', asyncHandler(c.list));
r.get('/:id', validateMongoId('id'), asyncHandler(c.detail));

// Routes avec validation - écriture (editor+)
r.post('/', hasFlowAccess(COLLABORATION_ROLE.EDITOR), backendConfigValidation.validateBackendConfig, asyncHandler(c.create));
r.put('/:id', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), backendConfigValidation.validateBackendConfig, asyncHandler(c.update));
r.delete('/:id', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), asyncHandler(c.remove));
r.patch('/:id/active', hasFlowAccess(COLLABORATION_ROLE.EDITOR), validateMongoId('id'), asyncHandler(c.setActive));

export default r;
