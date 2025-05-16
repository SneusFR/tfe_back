import { jest } from '@jest/globals';

// Mock the Attachment and Email models
await jest.unstable_mockModule('../../src/models/Attachment.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findById: jest.fn(),
    deleteMany: jest.fn()
  }
}));

await jest.unstable_mockModule('../../src/models/Email.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    updateOne: jest.fn()
  }
}));

// Import dependencies
const request = (await import('supertest')).default;
const express = (await import('express')).default;
const mongoose = (await import('mongoose')).default;
const cookieParser = (await import('cookie-parser')).default;
const { setupTestDB, signJwt } = await import('../utils/testSetup.js');
const { User } = await import('../../src/models/index.js');
const attachmentRoutes = (await import('../../src/routes/attachmentRoutes.js')).default;
const { authMiddleware, errorMiddleware } = await import('../../src/middleware/index.js');

// Import the mocked models
const Attachment = (await import('../../src/models/Attachment.js')).default;
const Email = (await import('../../src/models/Email.js')).default;
const attachmentController = await import('../../src/controllers/attachmentController.js');

// Setup the in-memory database for testing
setupTestDB();

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock JWT_SECRET for testing
process.env.JWT_SECRET = 'test-secret';

// Setup routes for testing
app.use('/api/attachments', attachmentRoutes);
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

describe('Attachment Controller', () => {
  let user;
  let otherUser;
  let token;
  let otherToken;
  let testEmail;
  let testAttachment;

  beforeEach(async () => {
    // Create test users
    user = await User.create({
      email: 'user@example.com',
      passwordHash: 'password123',
      displayName: 'Test User'
    });

    otherUser = await User.create({
      email: 'other@example.com',
      passwordHash: 'password123',
      displayName: 'Other User'
    });

    // Generate tokens
    token = signJwt({ id: user._id });
    otherToken = signJwt({ id: otherUser._id });
    
    // Create test data
    testEmail = {
      _id: new mongoose.Types.ObjectId(),
      owner: user._id,
      emailId: 'test-email-id',
      subject: 'Test Email',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'recipient@example.com', name: 'Recipient' }],
      date: new Date(),
      body: 'This is a test email body',
      attachments: []
    };
    
    testAttachment = {
      _id: new mongoose.Types.ObjectId(),
      email: testEmail._id,
      name: 'test-attachment.pdf',
      mime: 'application/pdf',
      size: 12345,
      storageKey: 'test-storage-key',
      toJSON: function() {
        return {
          id: this._id,
          email: this.email,
          name: this.name,
          mime: this.mime,
          size: this.size,
          storageKey: this.storageKey
        };
      },
      deleteOne: jest.fn().mockResolvedValue(true)
    };
    
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    Email.findById.mockImplementation(async (id) => {
      if (id.toString() === testEmail._id.toString()) {
        return testEmail;
      }
      return null;
    });
    
    Attachment.find.mockImplementation(async (query) => {
      if (query.email && query.email.toString() === testEmail._id.toString()) {
        return [testAttachment];
      }
      return [];
    });
    
    Attachment.findById.mockImplementation(async (id) => {
      if (id.toString() === testAttachment._id.toString()) {
        return {
          ...testAttachment,
          populate: jest.fn().mockResolvedValue(testAttachment)
        };
      }
      return null;
    });
    
    Email.updateOne.mockResolvedValue({ nModified: 1 });
  });

  describe('getAttachmentsByEmail', () => {
    it('should return all attachments for an email', async () => {
      const req = {
        user: { id: user._id },
        params: { emailId: testEmail._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await attachmentController.getAttachmentsByEmail(req, res);

      expect(Email.findById).toHaveBeenCalledWith(testEmail._id);
      expect(Attachment.find).toHaveBeenCalledWith({ email: testEmail._id });
      expect(res.json).toHaveBeenCalledWith([testAttachment]);
    });

    it('should return 404 if email does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const req = {
        user: { id: user._id },
        params: { emailId: nonExistentId }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      Email.findById.mockResolvedValueOnce(null);

      await attachmentController.getAttachmentsByEmail(req, res);

      expect(Email.findById).toHaveBeenCalledWith(nonExistentId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email non trouvé' });
    });

    it('should return 403 if user does not own the email', async () => {
      const req = {
        user: { id: otherUser._id },
        params: { emailId: testEmail._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await attachmentController.getAttachmentsByEmail(req, res);

      expect(Email.findById).toHaveBeenCalledWith(testEmail._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accès non autorisé' });
    });

    it('should get attachments via API endpoint', async () => {
      // Mock the implementation for this specific test
      Email.findById.mockResolvedValueOnce(testEmail);
      Attachment.find.mockResolvedValueOnce([testAttachment]);

      const response = await request(app)
        .get(`/api/attachments/email/${testEmail._id}`)
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe(testAttachment._id.toString());
      expect(response.body[0].name).toBe('test-attachment.pdf');
    });

    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .get(`/api/attachments/email/${testEmail._id}`);

      expect(response.status).toBe(401);
    });
  });

  describe('getAttachmentById', () => {
    it('should return an attachment by id', async () => {
      const req = {
        user: { id: user._id },
        params: { id: testAttachment._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      await attachmentController.getAttachmentById(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(testAttachment._id);
      expect(res.json).toHaveBeenCalledWith(populatedAttachment);
    });

    it('should return 404 if attachment does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const req = {
        user: { id: user._id },
        params: { id: nonExistentId }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(null)
      }));

      await attachmentController.getAttachmentById(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(nonExistentId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Pièce jointe non trouvée' });
    });

    it('should return 403 if user does not own the email', async () => {
      const req = {
        user: { id: otherUser._id },
        params: { id: testAttachment._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      await attachmentController.getAttachmentById(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(testAttachment._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accès non autorisé' });
    });

    it('should get attachment via API endpoint', async () => {
      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        },
        toJSON: function() {
          return {
            id: this._id,
            email: this.email._id,
            name: this.name,
            mime: this.mime,
            size: this.size,
            storageKey: this.storageKey
          };
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      const response = await request(app)
        .get(`/api/attachments/${testAttachment._id}`)
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testAttachment._id.toString());
      expect(response.body.name).toBe('test-attachment.pdf');
    });
  });

  describe('downloadAttachment', () => {
    it('should return attachment download info', async () => {
      const req = {
        user: { id: user._id },
        params: { id: testAttachment._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn()
      };

      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      await attachmentController.downloadAttachment(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(testAttachment._id);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Téléchargement de pièce jointe non implémenté',
        attachment: populatedAttachment
      });
    });

    it('should return 404 if attachment does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const req = {
        user: { id: user._id },
        params: { id: nonExistentId }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn()
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(null)
      }));

      await attachmentController.downloadAttachment(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(nonExistentId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Pièce jointe non trouvée' });
    });

    it('should return 403 if user does not own the email', async () => {
      const req = {
        user: { id: otherUser._id },
        params: { id: testAttachment._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn()
      };

      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      await attachmentController.downloadAttachment(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(testAttachment._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accès non autorisé' });
    });

    it('should download attachment via API endpoint', async () => {
      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        },
        toJSON: function() {
          return {
            id: this._id,
            email: this.email._id,
            name: this.name,
            mime: this.mime,
            size: this.size,
            storageKey: this.storageKey
          };
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      const response = await request(app)
        .get(`/api/attachments/${testAttachment._id}/download`)
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Téléchargement de pièce jointe non implémenté');
      expect(response.body.attachment.id).toBe(testAttachment._id.toString());
    });
  });

  describe('deleteAttachment', () => {
    it('should delete an attachment', async () => {
      const req = {
        user: { id: user._id },
        params: { id: testAttachment._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        },
        deleteOne: jest.fn().mockResolvedValue(true)
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      await attachmentController.deleteAttachment(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(testAttachment._id);
      expect(Email.updateOne).toHaveBeenCalledWith(
        { _id: testEmail._id },
        { $pull: { attachments: testAttachment._id } }
      );
      expect(populatedAttachment.deleteOne).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Pièce jointe supprimée' });
    });

    it('should return 404 if attachment does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const req = {
        user: { id: user._id },
        params: { id: nonExistentId }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(null)
      }));

      await attachmentController.deleteAttachment(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(nonExistentId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Pièce jointe non trouvée' });
    });

    it('should return 403 if user does not own the email', async () => {
      const req = {
        user: { id: otherUser._id },
        params: { id: testAttachment._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      await attachmentController.deleteAttachment(req, res);

      expect(Attachment.findById).toHaveBeenCalledWith(testAttachment._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accès non autorisé' });
    });

    it('should delete attachment via API endpoint', async () => {
      // Setup the populated attachment with email owner
      const populatedAttachment = {
        ...testAttachment,
        email: {
          _id: testEmail._id,
          owner: user._id
        },
        deleteOne: jest.fn().mockResolvedValue(true),
        toJSON: function() {
          return {
            id: this._id,
            email: this.email._id,
            name: this.name,
            mime: this.mime,
            size: this.size,
            storageKey: this.storageKey
          };
        }
      };

      Attachment.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedAttachment)
      }));

      const response = await request(app)
        .delete(`/api/attachments/${testAttachment._id}`)
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Pièce jointe supprimée');
    });
  });
});
