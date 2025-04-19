import express from 'express';
import rateLimit from 'express-rate-limit';
import { backendConfigController as c } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, backendConfigValidation } from '../middleware/index.js';

const r = express.Router();
const { protect } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;

/* /api/backend-configs */
r.use(protect);

// Appliquer le rate limit global pour toutes les routes de backend-configs
const globalLimit = backendConfigValidation.backendConfigRateLimit(rateLimit);
r.use(globalLimit);

// Routes avec validation
r.get('/', asyncHandler(c.list));
r.post('/', backendConfigValidation.validateBackendConfig, asyncHandler(c.create));

r.get('/:id', validateMongoId('id'), asyncHandler(c.detail));
r.put('/:id', validateMongoId('id'), backendConfigValidation.validateBackendConfig, asyncHandler(c.update));
r.delete('/:id', validateMongoId('id'), asyncHandler(c.remove));
r.patch('/:id/active', validateMongoId('id'), asyncHandler(c.setActive));

export default r;
