import express from 'express';
import { attachmentController } from '../controllers/index.js';
import { authMiddleware, errorMiddleware, uploadMiddleware } from '../middleware/index.js';

const router = express.Router();
const { protect } = authMiddleware;
const { asyncHandler, validateMongoId } = errorMiddleware;

/**
 * @route   GET /api/attachments/flow/:flowId
 * @desc    Récupérer toutes les pièces jointes d'un flow
 * @access  Private
 */
router.get('/flow/:flowId', 
  protect, 
  validateMongoId('flowId'), 
  asyncHandler(attachmentController.getAttachmentsByFlow)
);

/**
 * @route   GET /api/attachments/email/:emailId
 * @desc    Récupérer toutes les pièces jointes d'un email
 * @access  Private
 */
router.get('/email/:emailId', 
  protect, 
  validateMongoId('emailId'), 
  asyncHandler(attachmentController.getAttachmentsByEmail)
);

/**
 * @route   GET /api/attachments/:id
 * @desc    Récupérer une pièce jointe par ID
 * @access  Private
 */
router.get('/:id', 
  protect, 
  validateMongoId('id'), 
  asyncHandler(attachmentController.getAttachmentById)
);

/**
 * @route   GET /api/attachments/:id/download
 * @desc    Télécharger une pièce jointe
 * @access  Private
 */
router.get('/:id/download', 
  protect, 
  validateMongoId('id'), 
  asyncHandler(attachmentController.downloadAttachment)
);

/**
 * @route   DELETE /api/attachments/:id
 * @desc    Supprimer une pièce jointe
 * @access  Private
 */
router.delete('/:id', 
  protect, 
  validateMongoId('id'), 
  asyncHandler(attachmentController.deleteAttachment)
);

/**
 * @route   POST /api/attachments/upload
 * @desc    Télécharger un fichier en tant que pièce jointe
 * @access  Private
 */
router.post('/upload', 
  protect, 
  uploadMiddleware.single('file'), 
  asyncHandler(attachmentController.uploadAttachment)
);

export default router;
