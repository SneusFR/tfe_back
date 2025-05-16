import { jest } from '@jest/globals';

// Mock the Email, Attachment, and Task models
await jest.unstable_mockModule('../../src/models/Email.js', () => {
  const mockSort = jest.fn().mockImplementation(() => ({
    populate: jest.fn().mockImplementation(function() { return this._mockData || []; })
  }));
  
  const mockFind = jest.fn().mockImplementation(() => ({
    sort: mockSort,
    _mockData: []
  }));
  
  return {
    __esModule: true,
    default: {
      find: mockFind,
      findById: jest.fn(),
      findOne: jest.fn(),
      deleteMany: jest.fn()
    }
  };
});

await jest.unstable_mockModule('../../src/models/Attachment.js', () => ({
  __esModule: true,
  default: {
    deleteMany: jest.fn()
  }
}));

await jest.unstable_mockModule('../../src/models/Task.js', () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockImplementation(data => ({
      _id: new mongoose.Types.ObjectId(),
      ...data,
      save: jest.fn().mockResolvedValue(true)
    }))
  }
}));

// Import dependencies
const request = (await import('supertest')).default;
const express = (await import('express')).default;
const mongoose = (await import('mongoose')).default;
const cookieParser = (await import('cookie-parser')).default;
const { setupTestDB, signJwt } = await import('../utils/testSetup.js');
const { User } = await import('../../src/models/index.js');
const emailRoutes = (await import('../../src/routes/emailRoutes.js')).default;
const { authMiddleware, errorMiddleware } = await import('../../src/middleware/index.js');

// Import the mocked models
const Email = (await import('../../src/models/Email.js')).default;
const Attachment = (await import('../../src/models/Attachment.js')).default;
const Task = (await import('../../src/models/Task.js')).default;
const emailController = await import('../../src/controllers/emailController.js');

// Setup the in-memory database for testing
setupTestDB();

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock JWT_SECRET for testing
process.env.JWT_SECRET = 'test-secret';

// Setup routes for testing
app.use('/api/emails', emailRoutes);
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

describe('Email Controller', () => {
  let user;
  let otherUser;
  let token;
  let otherToken;
  let testEmail;
  let testAttachment;

  beforeEach(async () => {
    // Create a test flow
    const testFlow = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Flow',
      isActive: true,
      currentVersionIndex: 0,
      versions: [{
        label: 'Initial Version',
        nodes: [],
        edges: [],
        savedAt: new Date()
      }]
    };

    // Create test users
    user = await User.create({
      email: 'user@example.com',
      passwordHash: 'password123',
      displayName: 'Test User',
      defaultFlow: testFlow._id
    });

    otherUser = await User.create({
      email: 'other@example.com',
      passwordHash: 'password123',
      displayName: 'Other User',
      defaultFlow: testFlow._id
    });

    // Generate tokens
    token = signJwt({ id: user._id });
    otherToken = signJwt({ id: otherUser._id });
    
    // Create test data
    testAttachment = {
      _id: new mongoose.Types.ObjectId(),
      name: 'test-attachment.pdf',
      mime: 'application/pdf',
      size: 12345,
      storageKey: 'test-storage-key',
      toJSON: function() {
        return {
          id: this._id,
          name: this.name,
          mime: this.mime,
          size: this.size,
          storageKey: this.storageKey
        };
      }
    };
    
    testEmail = {
      _id: new mongoose.Types.ObjectId(),
      owner: user._id,
      emailId: 'test-email-id',
      subject: 'Test Email',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'recipient@example.com', name: 'Recipient' }],
      date: new Date(),
      body: 'This is a test email body',
      attachments: [testAttachment._id],
      toJSON: function() {
        return {
          id: this._id,
          owner: this.owner,
          emailId: this.emailId,
          subject: this.subject,
          from: this.from,
          to: this.to,
          date: this.date,
          body: this.body,
          attachments: this.attachments
        };
      },
      save: jest.fn().mockResolvedValue(this),
      deleteOne: jest.fn().mockResolvedValue(true)
    };
    
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    const mockSortWithData = jest.fn().mockImplementation(() => ({
      populate: jest.fn().mockResolvedValue([testEmail])
    }));
    
    Email.find.mockImplementation((query) => {
      if (query && query.owner && query.owner.toString() === user._id.toString()) {
        return {
          sort: jest.fn().mockImplementation(() => ({
            populate: jest.fn().mockResolvedValue([testEmail])
          }))
        };
      }
      return {
        sort: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockResolvedValue([])
        }))
      };
    });
    
    Email.findById.mockImplementation((id) => {
      if (id.toString() === testEmail._id.toString()) {
        return {
          populate: jest.fn().mockResolvedValue({
            ...testEmail,
            attachments: [testAttachment]
          })
        };
      }
      return {
        populate: jest.fn().mockResolvedValue(null)
      };
    });
    
    Email.findOne.mockImplementation(async (query) => {
      if (query && query.emailId === testEmail.emailId && query.owner.toString() === user._id.toString()) {
        return testEmail;
      }
      return null;
    });
    
    Attachment.deleteMany.mockResolvedValue({ deletedCount: 1 });
    
    Task.create = jest.fn().mockImplementation(async (data) => {
      return {
        _id: new mongoose.Types.ObjectId(),
        ...data
      };
    });
  });

  describe('getEmails', () => {
    it('should return all emails for a user', async () => {
      const req = {
        user: { id: user._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await emailController.getEmails(req, res);

      expect(Email.find).toHaveBeenCalledWith({ owner: user._id });
      expect(res.json).toHaveBeenCalledWith([testEmail]);
    });

    it('should return empty array if user has no emails', async () => {
      const req = {
        user: { id: otherUser._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Override the default mock for this specific test
      Email.find.mockImplementationOnce(() => ({
        sort: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockResolvedValue([])
        }))
      }));

      await emailController.getEmails(req, res);

      expect(Email.find).toHaveBeenCalledWith({ owner: otherUser._id });
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should get emails via API endpoint', async () => {
      const response = await request(app)
        .get('/api/emails')
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe(testEmail._id.toString());
      expect(response.body[0].subject).toBe('Test Email');
    });

    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .get('/api/emails');

      expect(response.status).toBe(401);
    });
  });

  describe('getEmailById', () => {
    it('should return an email by id', async () => {
      const req = {
        user: { id: user._id },
        params: { id: testEmail._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      const populatedEmail = {
        ...testEmail,
        attachments: [testAttachment],
        owner: {
          toString: () => user._id.toString()
        }
      };

      // Create a specific mock for this test
      Email.findById = jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(populatedEmail)
      }));

      await emailController.getEmailById(req, res);

      expect(Email.findById).toHaveBeenCalledWith(testEmail._id);
      expect(res.json).toHaveBeenCalledWith(populatedEmail);
    });

    it('should return 404 if email does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const req = {
        user: { id: user._id },
        params: { id: nonExistentId }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      Email.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(null)
      }));

      await emailController.getEmailById(req, res);

      expect(Email.findById).toHaveBeenCalledWith(nonExistentId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email non trouvé' });
    });

    it('should return 403 if user does not own the email', async () => {
      const req = {
        user: { id: otherUser._id },
        params: { id: testEmail._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      Email.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(testEmail)
      }));

      await emailController.getEmailById(req, res);

      expect(Email.findById).toHaveBeenCalledWith(testEmail._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accès non autorisé' });
    });

    it('should get email via API endpoint', async () => {
      const populatedEmail = {
        ...testEmail,
        attachments: [testAttachment],
        toJSON: function() {
          return {
            id: this._id,
            owner: this.owner,
            emailId: this.emailId,
            subject: this.subject,
            from: this.from,
            to: this.to,
            date: this.date,
            body: this.body,
            attachments: this.attachments.map(a => a.toJSON ? a.toJSON() : a)
          };
        }
      };

      Email.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedEmail)
      }));

      const response = await request(app)
        .get(`/api/emails/${testEmail._id}`)
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testEmail._id.toString());
      expect(response.body.subject).toBe('Test Email');
    });
  });

  describe('createEmail', () => {
    it('should create a new email', async () => {
      const emailData = {
        emailId: 'new-email-id',
        subject: 'New Email',
        from: { address: 'sender@example.com', name: 'Sender' },
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        body: 'This is a new email body',
        attachments: [],
        flow: user.defaultFlow
      };
      
      const req = {
        user: { id: user._id },
        body: emailData
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Create a saved email instance
      const savedEmail = {
        _id: new mongoose.Types.ObjectId(),
        owner: user._id,
        ...emailData
      };

      // Create a populated email instance for the response
      const populatedEmail = {
        ...savedEmail,
        attachments: []
      };

      // Mock the Email constructor
      const mockSave = jest.fn().mockResolvedValue(savedEmail);
      const mockEmailInstance = {
        ...emailData,
        _id: savedEmail._id,
        owner: user._id,
        save: mockSave
      };

      // Save the original Email constructor
      const originalEmail = global.Email;
      
      // Replace with our mock constructor
      global.Email = jest.fn().mockImplementation(() => mockEmailInstance);

      // Mock Task.create to return a task
      Task.create.mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        user: user._id,
        flow: emailData.flow,
        type: 'email_processing',
        description: `Traiter l'email: ${emailData.subject}`
      });

      // Mock findById for the populated response
      Email.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(populatedEmail)
      }));

      await emailController.createEmail(req, res);

      // Restore the original Email constructor
      global.Email = originalEmail;

      expect(Email.findOne).toHaveBeenCalledWith({
        owner: user._id,
        emailId: emailData.emailId
      });
      expect(mockSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(populatedEmail);
    });

    it('should return 400 if email already exists', async () => {
      const req = {
        user: { id: user._id },
        body: {
          emailId: testEmail.emailId,
          subject: 'Duplicate Email',
          from: { address: 'sender@example.com', name: 'Sender' },
          to: [{ address: 'recipient@example.com', name: 'Recipient' }],
          body: 'This is a duplicate email body'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      Email.findOne.mockResolvedValueOnce(testEmail);

      await emailController.createEmail(req, res);

      expect(Email.findOne).toHaveBeenCalledWith({
        owner: user._id,
        emailId: testEmail.emailId
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Cet email existe déjà' });
    });

    it('should create email via API endpoint', async () => {
      const emailData = {
        emailId: 'api-email-id',
        subject: 'API Email',
        from: { address: 'sender@example.com', name: 'Sender' },
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        body: 'This is an API email body',
        flow: user.defaultFlow
      };

      // Ensure findOne returns null (email doesn't exist)
      Email.findOne.mockResolvedValueOnce(null);

      // Mock the Email constructor and save
      const mockEmailInstance = {
        _id: new mongoose.Types.ObjectId(),
        owner: user._id,
        ...emailData,
        attachments: [],
        save: jest.fn().mockResolvedValue(true),
        toJSON: function() {
          return {
            id: this._id,
            owner: this.owner,
            ...emailData,
            attachments: []
          };
        }
      };

      // Mock Email.prototype.constructor
      const EmailConstructor = function() {
        return mockEmailInstance;
      };
      
      // Replace the Email mock with our constructor
      const originalEmail = Email;
      global.Email = EmailConstructor;
      
      // Mock findById for the populated response
      Email.findById.mockImplementationOnce(() => ({
        populate: jest.fn().mockResolvedValue(mockEmailInstance)
      }));

      const response = await request(app)
        .post('/api/emails')
        .set('Cookie', [`token=${token}`])
        .send(emailData);

      // Restore the original Email mock
      global.Email = originalEmail;

      expect(response.status).toBe(201);
    });
  });

  describe('deleteEmail', () => {
    it('should delete an email', async () => {
      const req = {
        user: { id: user._id },
        params: { id: testEmail._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Mock findById to return the test email
      Email.findById = jest.fn().mockResolvedValue(testEmail);
      
      // Mock Attachment.deleteMany
      Attachment.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });

      await emailController.deleteEmail(req, res);

      expect(Email.findById).toHaveBeenCalledWith(testEmail._id);
      expect(Attachment.deleteMany).toHaveBeenCalledWith({ email: testEmail._id });
      expect(testEmail.deleteOne).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Email supprimé' });
    });

    it('should return 404 if email does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const req = {
        user: { id: user._id },
        params: { id: nonExistentId }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      Email.findById.mockResolvedValueOnce(null);

      await emailController.deleteEmail(req, res);

      expect(Email.findById).toHaveBeenCalledWith(nonExistentId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email non trouvé' });
    });

    it('should return 403 if user does not own the email', async () => {
      const req = {
        user: { id: otherUser._id },
        params: { id: testEmail._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Mock findById to return the test email
      Email.findById = jest.fn().mockResolvedValue(testEmail);

      await emailController.deleteEmail(req, res);

      expect(Email.findById).toHaveBeenCalledWith(testEmail._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Accès non autorisé' });
    });

    it('should delete email via API endpoint', async () => {
      // Mock findById to return the test email for the API test
      Email.findById = jest.fn().mockResolvedValue(testEmail);
      
      // Mock Attachment.deleteMany
      Attachment.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const response = await request(app)
        .delete(`/api/emails/${testEmail._id}`)
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Email supprimé');
    });
  });

  describe('searchEmails', () => {
    it('should search emails by query', async () => {
      const req = {
        user: { id: user._id },
        query: { query: 'test' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Mock the search implementation
      Email.find.mockImplementationOnce(() => ({
        sort: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockResolvedValue([testEmail])
        }))
      }));

      await emailController.searchEmails(req, res);

      expect(Email.find).toHaveBeenCalledWith({
        owner: user._id,
        $or: [
          { subject: { $regex: 'test', $options: 'i' } },
          { body: { $regex: 'test', $options: 'i' } },
          { 'from.address': { $regex: 'test', $options: 'i' } },
          { 'from.name': { $regex: 'test', $options: 'i' } }
        ]
      });
      expect(res.json).toHaveBeenCalledWith([testEmail]);
    });

    it('should return 400 if query is missing', async () => {
      const req = {
        user: { id: user._id },
        query: {}
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await emailController.searchEmails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Paramètre de recherche requis' });
    });

    it('should search emails via API endpoint', async () => {
      const response = await request(app)
        .get('/api/emails/search?query=test')
        .set('Cookie', [`token=${token}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe(testEmail._id.toString());
    });
  });
});
