import { jest } from '@jest/globals';

// ⚠️ top-level await autorisé en ESM dans Jest
await jest.unstable_mockModule('../../src/services/flowService', () => ({
  __esModule: true,
  getUserFlows: jest.fn(),
  createFlow:   jest.fn(),
  getFlow:      jest.fn(),
  saveCurrentVariant: jest.fn(),
  switchVariant:      jest.fn(),
  deleteFlow:         jest.fn(),
  checkFlowAccess:    jest.fn().mockReturnValue(true), // Mock this to always return true for tests
}));

// imports « standard » ne pourront pas voir le mock, donc on importe dynamiquement
const request = (await import('supertest')).default;
const express = (await import('express')).default;
const mongoose = (await import('mongoose')).default;
const cookieParser = (await import('cookie-parser')).default;
const { setupTestDB, signJwt } = await import('../utils/testSetup.js');
const { User, Flow, Collaboration } = await import('../../src/models/index.js');
const flowRoutes = (await import('../../src/routes/flowRoutes.js')).default;
const { authMiddleware, errorMiddleware } = await import('../../src/middleware/index.js');
const { COLLABORATION_ROLE } = await import('../../src/utils/constants.js');

// là on récupère ton mock tout prêt
const flowService = await import('../../src/services/flowService');
const flowController = await import('../../src/controllers/flowController.js');

// Setup the in-memory database for testing
setupTestDB();

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock JWT_SECRET for testing
process.env.JWT_SECRET = 'test-secret';

// Setup routes for testing
app.use('/api/flows', flowRoutes);
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

describe('Flow Controller', () => {
  let ownerUser;
  let editorUser;
  let viewerUser;
  let testFlow;
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
    
    // Setup default mock implementations for API endpoint tests
    flowService.getUserFlows.mockImplementation(async (userId) => {
      const collabs = await Collaboration.find({ user: userId }).populate('flow');
      return collabs
        .filter(c => c.flow)
        .map(c => ({ ...c.flow.toJSON(), userRole: c.role }));
    });
    
    flowService.getFlow.mockImplementation(async (flowId, userId) => {
      const flow = await Flow.findById(flowId);
      if (!flow) throw new Error('FLOW_NOT_FOUND');
      
      const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
      if (!collaboration) throw new Error('FORBIDDEN');
      
      return flow.toJSON();
    });
    
    flowService.createFlow.mockImplementation(async (userId, { name }) => {
      const variants = Array.from({ length: 3 }, () => ({
        nodes: [],
        edges: [],
        savedAt: null,
      }));
      
      const flow = await Flow.create({
        name,
        versions: variants,
        currentVersionIndex: 0,
      });
      
      await Collaboration.create({ flow: flow._id, user: userId, role: COLLABORATION_ROLE.OWNER });
      return flow.toJSON();
    });
    
    flowService.saveCurrentVariant.mockImplementation(async (flowId, userId, { nodes = [], edges = [] }) => {
      const flow = await Flow.findById(flowId);
      if (!flow) throw new Error('FLOW_NOT_FOUND');
      
      const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
      if (!collaboration || collaboration.role === COLLABORATION_ROLE.VIEWER) {
        throw new Error('FORBIDDEN');
      }
      
      const i = flow.currentVersionIndex;
      flow.versions[i] = { nodes, edges, savedAt: Date.now() };
      
      await flow.save();
      return flow.toJSON();
    });
    
    flowService.switchVariant.mockImplementation(async (flowId, userId, index) => {
      if (index < 0 || index >= 3) throw new Error('INVALID_INDEX');
      
      const flow = await Flow.findById(flowId);
      if (!flow) throw new Error('FLOW_NOT_FOUND');
      
      const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
      if (!collaboration) throw new Error('FORBIDDEN');
      
      flow.currentVersionIndex = index;
      await flow.save();
      return flow.toJSON();
    });
    
    flowService.deleteFlow.mockImplementation(async (flowId, userId) => {
      const flow = await Flow.findById(flowId);
      if (!flow) throw new Error('FLOW_NOT_FOUND');
      
      const collab = await Collaboration.findOne({ flow: flowId, user: userId });
      if (!collab || collab.role !== COLLABORATION_ROLE.OWNER) throw new Error('FORBIDDEN');
      
      await flow.deleteOne();
    });
  });

  describe('getMyFlows', () => {
    it('should return all flows for the authenticated user', async () => {
      const req = {
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();

      // Mock the flowService method directly
      flowService.getUserFlows.mockResolvedValueOnce([testFlow]);

      await flowController.getMyFlows(req, res, next);

      expect(flowService.getUserFlows).toHaveBeenCalledWith(ownerUser._id);
      expect(res.json).toHaveBeenCalledWith([testFlow]);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with error if flowService.getUserFlows throws', async () => {
      const req = {
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();
      const error = new Error('Test error');

      // Mock the flowService method directly
      flowService.getUserFlows.mockRejectedValueOnce(error);

      await flowController.getMyFlows(req, res, next);

      expect(flowService.getUserFlows).toHaveBeenCalledWith(ownerUser._id);
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(error);
    });

    it('should return flows via API endpoint', async () => {
      const response = await request(app)
        .get('/api/flows')
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].id).toBeDefined();
      expect(response.body[0].name).toBe('Test Flow');
    });

    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .get('/api/flows');

      expect(response.status).toBe(401);
    });
  });

  describe('listFlows', () => {
    it('should return all flows for the authenticated user', async () => {
      const req = {
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Mock the flowService method directly
      flowService.getUserFlows.mockResolvedValueOnce([testFlow]);

      await flowController.listFlows(req, res);

      expect(flowService.getUserFlows).toHaveBeenCalledWith(ownerUser._id);
      expect(res.json).toHaveBeenCalledWith([testFlow]);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 500 if flowService.getUserFlows throws', async () => {
      const req = {
        user: { id: ownerUser._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('Test error');

      // Mock the flowService method directly
      flowService.getUserFlows.mockRejectedValueOnce(error);

      await flowController.listFlows(req, res);

      expect(flowService.getUserFlows).toHaveBeenCalledWith(ownerUser._id);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('createFlow', () => {
    it('should create a new flow', async () => {
      const req = {
        user: { id: ownerUser._id },
        body: { name: 'New Flow' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const newFlow = { ...testFlow.toJSON(), name: 'New Flow' };

      // Mock the flowService method directly
      flowService.createFlow.mockResolvedValueOnce(newFlow);

      await flowController.createFlow(req, res);

      expect(flowService.createFlow).toHaveBeenCalledWith(ownerUser._id, req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newFlow);
    });

    it('should return 400 if flowService.createFlow throws', async () => {
      const req = {
        user: { id: ownerUser._id },
        body: { name: 'New Flow' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('Test error');

      // Mock the flowService method directly
      flowService.createFlow.mockRejectedValueOnce(error);

      await flowController.createFlow(req, res);

      expect(flowService.createFlow).toHaveBeenCalledWith(ownerUser._id, req.body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should create a flow via API endpoint', async () => {
      const response = await request(app)
        .post('/api/flows')
        .set('Cookie', [`token=${ownerToken}`])
        .send({ name: 'API Test Flow' });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('API Test Flow');
      expect(response.body.versions).toHaveLength(3);
      expect(response.body.currentVersionIndex).toBe(0);
    });

    it('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/api/flows')
        .set('Cookie', [`token=${ownerToken}`])
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('getFlow', () => {
    it('should return a flow by id', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Mock the flowService method directly
      flowService.getFlow.mockResolvedValueOnce(testFlow);

      await flowController.getFlow(req, res);

      expect(flowService.getFlow).toHaveBeenCalledWith(testFlow._id, ownerUser._id);
      expect(res.json).toHaveBeenCalledWith(testFlow);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 if flow is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FLOW_NOT_FOUND');

      // Mock the flowService method directly
      flowService.getFlow.mockRejectedValueOnce(error);

      await flowController.getFlow(req, res);

      expect(flowService.getFlow).toHaveBeenCalledWith(testFlow._id, ownerUser._id);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should return 403 if user does not have access', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FORBIDDEN');

      // Mock the flowService method directly
      flowService.getFlow.mockRejectedValueOnce(error);

      await flowController.getFlow(req, res);

      expect(flowService.getFlow).toHaveBeenCalledWith(testFlow._id, ownerUser._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should get a flow via API endpoint', async () => {
      const response = await request(app)
        .get(`/api/flows/${testFlow._id}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testFlow._id.toString());
      expect(response.body.name).toBe('Test Flow');
    });

    it('should return 403 if user does not have access via API', async () => {
      // Create a user with no access to the flow
      const noAccessUser = await User.create({
        email: 'noaccess@example.com',
        passwordHash: 'password123',
        displayName: 'No Access User'
      });
      const noAccessToken = signJwt({ id: noAccessUser._id });

      const response = await request(app)
        .get(`/api/flows/${testFlow._id}`)
        .set('Cookie', [`token=${noAccessToken}`]);

      expect(response.status).toBe(403);
    });
  });

  describe('saveVariant', () => {
    it('should save the current variant of a flow', async () => {
      const nodes = [{ id: 'node1', type: 'task' }];
      const edges = [{ id: 'edge1', source: 'node1', target: 'node2' }];
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id },
        body: { nodes, edges }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const updatedFlow = {
        ...testFlow.toJSON(),
        versions: [
          { nodes, edges, savedAt: new Date() },
          { nodes: [], edges: [], savedAt: null },
          { nodes: [], edges: [], savedAt: null }
        ]
      };

      // Mock the flowService method directly
      flowService.saveCurrentVariant.mockResolvedValueOnce(updatedFlow);

      await flowController.saveVariant(req, res);

      expect(flowService.saveCurrentVariant).toHaveBeenCalledWith(testFlow._id, ownerUser._id, req.body);
      expect(res.json).toHaveBeenCalledWith(updatedFlow);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 if flow is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id },
        body: { nodes: [], edges: [] }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FLOW_NOT_FOUND');

      // Mock the flowService method directly
      flowService.saveCurrentVariant.mockRejectedValueOnce(error);

      await flowController.saveVariant(req, res);

      expect(flowService.saveCurrentVariant).toHaveBeenCalledWith(testFlow._id, ownerUser._id, req.body);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should return 403 if user does not have editor access', async () => {
      const req = {
        user: { id: viewerUser._id },
        params: { id: testFlow._id },
        body: { nodes: [], edges: [] }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FORBIDDEN');

      // Mock the flowService method directly
      flowService.saveCurrentVariant.mockRejectedValueOnce(error);

      await flowController.saveVariant(req, res);

      expect(flowService.saveCurrentVariant).toHaveBeenCalledWith(testFlow._id, viewerUser._id, req.body);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should save a variant via API endpoint', async () => {
      const nodes = [{ id: 'node1', type: 'task' }];
      const edges = [{ id: 'edge1', source: 'node1', target: 'node2' }];

      const response = await request(app)
        .put(`/api/flows/${testFlow._id}`)
        .set('Cookie', [`token=${editorToken}`])
        .send({ nodes, edges });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testFlow._id.toString());
      expect(response.body.versions[0].nodes).toEqual(nodes);
      expect(response.body.versions[0].edges).toEqual(edges);
      expect(response.body.versions[0].savedAt).toBeDefined();
    });

    it('should return 403 if user does not have editor access via API', async () => {
      const response = await request(app)
        .put(`/api/flows/${testFlow._id}`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ nodes: [], edges: [] });

      expect(response.status).toBe(403);
    });
  });

  describe('switchVariant', () => {
    it('should switch to another variant', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id },
        body: { index: 1 }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const updatedFlow = {
        ...testFlow.toJSON(),
        currentVersionIndex: 1
      };

      // Mock the flowService method directly
      flowService.switchVariant.mockResolvedValueOnce(updatedFlow);

      await flowController.switchVariant(req, res);

      expect(flowService.switchVariant).toHaveBeenCalledWith(testFlow._id, ownerUser._id, 1);
      expect(res.json).toHaveBeenCalledWith(updatedFlow);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 if flow is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id },
        body: { index: 1 }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FLOW_NOT_FOUND');

      // Mock the flowService method directly
      flowService.switchVariant.mockRejectedValueOnce(error);

      await flowController.switchVariant(req, res);

      expect(flowService.switchVariant).toHaveBeenCalledWith(testFlow._id, ownerUser._id, 1);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should return 403 if user does not have access', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id },
        body: { index: 1 }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FORBIDDEN');

      // Mock the flowService method directly
      flowService.switchVariant.mockRejectedValueOnce(error);

      await flowController.switchVariant(req, res);

      expect(flowService.switchVariant).toHaveBeenCalledWith(testFlow._id, ownerUser._id, 1);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should return 400 if index is invalid', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id },
        body: { index: 5 }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('INVALID_INDEX');

      // Mock the flowService method directly
      flowService.switchVariant.mockRejectedValueOnce(error);

      await flowController.switchVariant(req, res);

      expect(flowService.switchVariant).toHaveBeenCalledWith(testFlow._id, ownerUser._id, 5);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should switch variant via API endpoint', async () => {
      const response = await request(app)
        .patch(`/api/flows/${testFlow._id}/version`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ index: 1 });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testFlow._id.toString());
      expect(response.body.currentVersionIndex).toBe(1);
    });

    it('should return 400 if index is out of bounds via API', async () => {
      const response = await request(app)
        .patch(`/api/flows/${testFlow._id}/version`)
        .set('Cookie', [`token=${viewerToken}`])
        .send({ index: 5 });

      expect(response.status).toBe(400);
    });
  });

  describe('deleteFlow', () => {
    it('should delete a flow', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // Mock the flowService method directly
      flowService.deleteFlow.mockResolvedValueOnce();

      await flowController.deleteFlow(req, res);

      expect(flowService.deleteFlow).toHaveBeenCalledWith(testFlow._id, ownerUser._id);
      expect(res.json).toHaveBeenCalledWith({ message: 'Flow supprimé' });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 if flow is not found', async () => {
      const req = {
        user: { id: ownerUser._id },
        params: { id: testFlow._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FLOW_NOT_FOUND');

      // Mock the flowService method directly
      flowService.deleteFlow.mockRejectedValueOnce(error);

      await flowController.deleteFlow(req, res);

      expect(flowService.deleteFlow).toHaveBeenCalledWith(testFlow._id, ownerUser._id);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should return 403 if user is not owner', async () => {
      const req = {
        user: { id: editorUser._id },
        params: { id: testFlow._id }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      const error = new Error('FORBIDDEN');

      // Mock the flowService method directly
      flowService.deleteFlow.mockRejectedValueOnce(error);

      await flowController.deleteFlow(req, res);

      expect(flowService.deleteFlow).toHaveBeenCalledWith(testFlow._id, editorUser._id);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });

    it('should delete a flow via API endpoint', async () => {
      const response = await request(app)
        .delete(`/api/flows/${testFlow._id}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Flow supprimé');

      // Verify the flow was deleted
      const deletedFlow = await Flow.findById(testFlow._id);
      expect(deletedFlow).toBeNull();
    });

    it('should return 403 if user is not owner via API', async () => {
      const response = await request(app)
        .delete(`/api/flows/${testFlow._id}`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(403);
    });
  });
});
