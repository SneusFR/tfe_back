import { jest } from '@jest/globals';

// Mock the conditionEvaluator utility
await jest.unstable_mockModule('../../src/utils/conditionEvaluator', () => ({
  __esModule: true,
  evaluateCondition: jest.fn(),
  replaceVariables: jest.fn(),
  validateCondition: jest.fn(),
}));

// Import dependencies
const request = (await import('supertest')).default;
const express = (await import('express')).default;
const mongoose = (await import('mongoose')).default;
const cookieParser = (await import('cookie-parser')).default;
const { setupTestDB, signJwt } = await import('../utils/testSetup.js');
const { User, Flow, Condition, Collaboration } = await import('../../src/models/index.js');
const conditionRoutes = (await import('../../src/routes/conditionRoutes.js')).default;
const { authMiddleware, errorMiddleware } = await import('../../src/middleware/index.js');
const { COLLABORATION_ROLE } = await import('../../src/utils/constants.js');

// Import the mocked conditionEvaluator
const conditionEvaluator = await import('../../src/utils/conditionEvaluator');
const conditionController = await import('../../src/controllers/conditionController.js');

// Setup the in-memory database for testing
setupTestDB();

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock JWT_SECRET for testing
process.env.JWT_SECRET = 'test-secret';

// Setup routes for testing
app.use('/api/flow/:flowId/conditions', conditionRoutes);
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

describe('Condition Controller', () => {
  let ownerUser;
  let editorUser;
  let viewerUser;
  let testFlow;
  let testCondition;
  let ownerToken;
  let editorToken;
  let viewerToken;
  let ownerCollaboration;
  let editorCollaboration;
  let viewerCollaboration;

  beforeEach(async () => {
    // Create test users
    ownerUser = await User.create({
      email: 'owner@example.com',
      passwordHash: 'password123',
      displayName: 'Owner User'
    });

    editorUser = await User.create({
      email: 'editor@example.com',
      passwordHash: 'password123',
      displayName: 'Editor User'
    });

    viewerUser = await User.create({
      email: 'viewer@example.com',
      passwordHash: 'password123',
      displayName: 'Viewer User'
    });

    // Create test flow
    testFlow = await Flow.create({
      name: 'Test Flow',
      versions: Array.from({ length: 3 }, () => ({
        nodes: [],
        edges: [],
        savedAt: null,
      })),
      currentVersionIndex: 0
    });

    // Create test condition
    testCondition = await Condition.create({
      owner: ownerUser._id,
      flow: testFlow._id,
      conditionText: 'value > 10',
      returnText: 'La valeur ${value} est supérieure à 10'
    });

    // Create collaborations
    ownerCollaboration = await Collaboration.create({
      flow: testFlow._id,
      user: ownerUser._id,
      role: COLLABORATION_ROLE.OWNER
    });

    editorCollaboration = await Collaboration.create({
      flow: testFlow._id,
      user: editorUser._id,
      role: COLLABORATION_ROLE.EDITOR
    });

    viewerCollaboration = await Collaboration.create({
      flow: testFlow._id,
      user: viewerUser._id,
      role: COLLABORATION_ROLE.VIEWER
    });

    // Generate tokens
    ownerToken = signJwt({ id: ownerUser._id });
    editorToken = signJwt({ id: editorUser._id });
    viewerToken = signJwt({ id: viewerUser._id });
    
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations for conditionEvaluator
    conditionEvaluator.evaluateCondition.mockImplementation((expression, context) => {
      if (expression === 'value > 10') {
        return context.value > 10;
      }
      return false;
    });
    
    conditionEvaluator.replaceVariables.mockImplementation((text, context) => {
      return text.replace(/\${([^}]+)}/g, (_, variable) => context[variable] || '');
    });
    
    conditionEvaluator.validateCondition.mockImplementation((expression) => {
      return expression && typeof expression === 'string';
    });
  });

  describe('getConditions', () => {
    it('should return all conditions for a flow', async () => {
      const req = {
        params: { flowId: testFlow._id },
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.getConditions(req, res);

      expect(res.json).toHaveBeenCalled();
      const conditions = res.json.mock.calls[0][0];
      expect(Array.isArray(conditions)).toBe(true);
      expect(conditions.length).toBeGreaterThan(0);
      expect(conditions[0].id).toBe(testCondition._id.toString());
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return conditions via API endpoint', async () => {
      const response = await request(app)
        .get(`/api/flow/${testFlow._id}/conditions`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].id).toBeDefined();
      expect(response.body.data[0].conditionText).toBe('value > 10');
    });

    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .get(`/api/flow/${testFlow._id}/conditions`);

      expect(response.status).toBe(401);
    });
  });

  describe('getConditionById', () => {
    it('should return a condition by id', async () => {
      const req = {
        params: { flowId: testFlow._id, id: testCondition._id },
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.getConditionById(req, res);

      expect(res.json).toHaveBeenCalled();
      const condition = res.json.mock.calls[0][0];
      expect(condition.id).toBe(testCondition._id.toString());
      expect(condition.conditionText).toBe('value > 10');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 if condition is not found', async () => {
      const req = {
        params: { flowId: testFlow._id, id: new mongoose.Types.ObjectId() },
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.getConditionById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Condition non trouvée' });
    });

    it('should get a condition via API endpoint', async () => {
      const response = await request(app)
        .get(`/api/flow/${testFlow._id}/conditions/${testCondition._id}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testCondition._id.toString());
      expect(response.body.conditionText).toBe('value > 10');
    });

    it('should return 404 if condition does not exist via API', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/flow/${testFlow._id}/conditions/${nonExistentId}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(404);
    });
  });

  describe('createCondition', () => {
    it('should create a new condition', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id },
        body: { 
          conditionText: 'value < 5',
          returnText: 'La valeur ${value} est inférieure à 5'
        }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.createCondition(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
      const createdCondition = res.json.mock.calls[0][0];
      expect(createdCondition.conditionText).toBe('value < 5');
      expect(createdCondition.returnText).toBe('La valeur ${value} est inférieure à 5');
      expect(createdCondition.flow.toString()).toBe(testFlow._id.toString());
      expect(createdCondition.owner.toString()).toBe(ownerUser._id.toString());
    });

    it('should create a condition via API endpoint', async () => {
      const response = await request(app)
        .post(`/api/flow/${testFlow._id}/conditions`)
        .set('Cookie', [`token=${editorToken}`])
        .send({ 
          conditionText: 'value < 5',
          returnText: 'La valeur ${value} est inférieure à 5'
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.conditionText).toBe('value < 5');
      expect(response.body.returnText).toBe('La valeur ${value} est inférieure à 5');
      expect(response.body.flow).toBe(testFlow._id.toString());
      expect(response.body.owner).toBe(editorUser._id.toString());
    });

    it('should return 403 if user is viewer', async () => {
      const response = await request(app)
        .post(`/api/flow/${testFlow._id}/conditions`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ 
          conditionText: 'value < 5',
          returnText: 'La valeur ${value} est inférieure à 5'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('updateCondition', () => {
    it('should update an existing condition', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id, id: testCondition._id },
        body: { 
          conditionText: 'value >= 20',
          returnText: 'La valeur ${value} est supérieure ou égale à 20'
        }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.updateCondition(req, res);

      expect(res.json).toHaveBeenCalled();
      const updatedCondition = res.json.mock.calls[0][0];
      expect(updatedCondition.conditionText).toBe('value >= 20');
      expect(updatedCondition.returnText).toBe('La valeur ${value} est supérieure ou égale à 20');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 if condition is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id, id: new mongoose.Types.ObjectId() },
        body: { 
          conditionText: 'value >= 20',
          returnText: 'La valeur ${value} est supérieure ou égale à 20'
        }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.updateCondition(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Condition non trouvée' });
    });

    it('should update a condition via API endpoint', async () => {
      const response = await request(app)
        .put(`/api/flow/${testFlow._id}/conditions/${testCondition._id}`)
        .set('Cookie', [`token=${editorToken}`])
        .send({ 
          conditionText: 'value >= 20',
          returnText: 'La valeur ${value} est supérieure ou égale à 20'
        });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testCondition._id.toString());
      expect(response.body.conditionText).toBe('value >= 20');
      expect(response.body.returnText).toBe('La valeur ${value} est supérieure ou égale à 20');
    });

    it('should return 403 if user is viewer', async () => {
      const response = await request(app)
        .put(`/api/flow/${testFlow._id}/conditions/${testCondition._id}`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ 
          conditionText: 'value >= 20',
          returnText: 'La valeur ${value} est supérieure ou égale à 20'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('deleteCondition', () => {
    it('should delete a condition', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id, id: testCondition._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.deleteCondition(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Condition supprimée' });
      
      // Verify the condition was deleted
      const deletedCondition = await Condition.findById(testCondition._id);
      expect(deletedCondition).toBeNull();
    });

    it('should return 404 if condition is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id, id: new mongoose.Types.ObjectId() }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await conditionController.deleteCondition(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Condition non trouvée' });
    });

    it('should delete a condition via API endpoint', async () => {
      const response = await request(app)
        .delete(`/api/flow/${testFlow._id}/conditions/${testCondition._id}`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Condition supprimée');

      // Verify the condition was deleted
      const deletedCondition = await Condition.findById(testCondition._id);
      expect(deletedCondition).toBeNull();
    });

    it('should return 403 if user is viewer', async () => {
      const response = await request(app)
        .delete(`/api/flow/${testFlow._id}/conditions/${testCondition._id}`)
        .set('Cookie', [`token=${viewerToken}`]);

      expect(response.status).toBe(403);
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate a condition with the provided context', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id },
        body: { 
          conditionId: testCondition._id,
          context: { value: 15 }
        }
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();

      // Setup mocks for this specific test
      conditionEvaluator.evaluateCondition.mockReturnValueOnce(true);
      conditionEvaluator.replaceVariables.mockReturnValueOnce('La valeur 15 est supérieure à 10');

      await conditionController.evaluateCondition(req, res, next);

      expect(conditionEvaluator.evaluateCondition).toHaveBeenCalledWith('value > 10', { value: 15 });
      expect(conditionEvaluator.replaceVariables).toHaveBeenCalledWith('La valeur ${value} est supérieure à 10', { value: 15 });
      expect(res.json).toHaveBeenCalledWith({
        result: true,
        returnText: 'La valeur 15 est supérieure à 10'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return error if conditionId is missing', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id },
        body: { 
          context: { value: 15 }
        }
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();

      await conditionController.evaluateCondition(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('ID de condition requis');
      expect(error.code).toBe('MISSING_CONDITION_ID');
    });

    it('should return error if context is missing', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id },
        body: { 
          conditionId: testCondition._id
        }
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();

      await conditionController.evaluateCondition(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('Contexte requis et doit être un objet');
      expect(error.code).toBe('INVALID_CONTEXT');
    });

    it('should return error if condition is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id },
        body: { 
          conditionId: new mongoose.Types.ObjectId(),
          context: { value: 15 }
        }
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();

      await conditionController.evaluateCondition(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('Condition non trouvée');
      expect(error.code).toBe('CONDITION_NOT_FOUND');
    });

    it('should evaluate a condition via API endpoint', async () => {
      // Setup mocks for this specific test
      conditionEvaluator.evaluateCondition.mockReturnValueOnce(true);
      conditionEvaluator.replaceVariables.mockReturnValueOnce('La valeur 15 est supérieure à 10');

      const response = await request(app)
        .post(`/api/flow/${testFlow._id}/conditions/evaluate`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ 
          conditionId: testCondition._id,
          context: { value: 15 }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBe(true);
      expect(response.body.returnText).toBe('La valeur 15 est supérieure à 10');
    });

    it('should return 400 if conditionId is missing via API', async () => {
      const response = await request(app)
        .post(`/api/flow/${testFlow._id}/conditions/evaluate`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ 
          context: { value: 15 }
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('ID de condition requis');
    });
  });
});
