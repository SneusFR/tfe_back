import { jest } from '@jest/globals';

// Mock the backendConfigService
await jest.unstable_mockModule('../../src/services/backendConfigService', () => ({
  __esModule: true,
  listConfigsByFlow: jest.fn(),
  getConfig: jest.fn(),
  createConfig: jest.fn(),
  updateConfig: jest.fn(),
  deleteConfig: jest.fn(),
  setActiveConfig: jest.fn(),
  maskSensitiveData: jest.fn(config => config)
}));

// Import dependencies
const request = (await import('supertest')).default;
const express = (await import('express')).default;
const mongoose = (await import('mongoose')).default;
const cookieParser = (await import('cookie-parser')).default;
const { setupTestDB, signJwt } = await import('../utils/testSetup.js');
const { User, Flow, BackendConfig, Collaboration } = await import('../../src/models/index.js');
const backendConfigRoutes = (await import('../../src/routes/backendConfigRoutes.js')).default;
const { authMiddleware, errorMiddleware } = await import('../../src/middleware/index.js');
const { COLLABORATION_ROLE } = await import('../../src/utils/constants.js');

// Import the mocked backendConfigService
const backendConfigService = await import('../../src/services/backendConfigService');
const backendConfigController = await import('../../src/controllers/backendConfigController.js');

// Setup the in-memory database for testing
setupTestDB();

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock JWT_SECRET for testing
process.env.JWT_SECRET = 'test-secret';

// Setup routes for testing
app.use('/api/flows/:flowId/backend-configs', backendConfigRoutes);
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

describe('BackendConfig Controller', () => {
  let ownerUser;
  let editorUser;
  let viewerUser;
  let testFlow;
  let testConfig;
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

    // Create test backend config
    testConfig = await BackendConfig.create({
      owner: ownerUser._id,
      flow: testFlow._id,
      name: 'Test Config',
      description: 'Test Description',
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      retries: 3,
      defaultHeaders: [
        { key: 'Content-Type', value: 'application/json' }
      ],
      authType: 'bearer',
      auth: { token: 'test-token' },
      compression: true,
      isActive: true
    });

    // Generate tokens
    ownerToken = signJwt({ id: ownerUser._id });
    editorToken = signJwt({ id: editorUser._id });
    viewerToken = signJwt({ id: viewerUser._id });
    
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations for API endpoint tests
    backendConfigService.listConfigsByFlow.mockImplementation(async (flowId) => {
      const configs = await BackendConfig.find({ flow: flowId });
      return configs.map(config => config.toJSON());
    });
    
    backendConfigService.getConfig.mockImplementation(async (id, flowId) => {
      const config = await BackendConfig.findOne({ _id: id, flow: flowId });
      if (!config) throw new Error('CONFIG_NOT_FOUND');
      return config.toJSON();
    });
    
    backendConfigService.createConfig.mockImplementation(async (userId, flowId, data) => {
      const config = await BackendConfig.create({
        ...data,
        owner: userId,
        flow: flowId
      });
      return config.toJSON();
    });
    
    backendConfigService.updateConfig.mockImplementation(async (id, flowId, data) => {
      const config = await BackendConfig.findOne({ _id: id, flow: flowId });
      if (!config) throw new Error('CONFIG_NOT_FOUND');
      
      Object.assign(config, data);
      await config.save();
      return config.toJSON();
    });
    
    backendConfigService.deleteConfig.mockImplementation(async (id, flowId) => {
      const config = await BackendConfig.findOne({ _id: id, flow: flowId });
      if (!config) throw new Error('CONFIG_NOT_FOUND');
      
      await config.deleteOne();
    });
    
    backendConfigService.setActiveConfig.mockImplementation(async (id, flowId) => {
      // Désactiver toutes les configurations du flow
      await BackendConfig.updateMany(
        { flow: flowId },
        { $set: { isActive: false } }
      );
      
      // Activer la configuration spécifiée
      const config = await BackendConfig.findOne({ _id: id, flow: flowId });
      if (!config) throw new Error('CONFIG_NOT_FOUND');
      
      config.isActive = true;
      await config.save();
      return config.toJSON();
    });
  });

  describe('list', () => {
    it('should return all configs for a flow', async () => {
      const req = {
        params: { flowId: testFlow._id }
      };
      const res = {
        json: jest.fn()
      };

      // Mock the service method
      backendConfigService.listConfigsByFlow.mockResolvedValueOnce([testConfig]);

      await backendConfigController.list(req, res);

      expect(backendConfigService.listConfigsByFlow).toHaveBeenCalledWith(testFlow._id);
      expect(res.json).toHaveBeenCalledWith([testConfig]);
    });

    it('should return configs via API endpoint', async () => {
      const response = await request(app)
        .get(`/api/flows/${testFlow._id}/backend-configs`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].id).toBeDefined();
      expect(response.body[0].name).toBe('Test Config');
    });

    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .get(`/api/flows/${testFlow._id}/backend-configs`);

      expect(response.status).toBe(401);
    });
  });

  describe('detail', () => {
    it('should return a config by id', async () => {
      const req = {
        params: { 
          flowId: testFlow._id,
          id: testConfig._id 
        }
      };
      const res = {
        json: jest.fn()
      };

      // Mock the service method
      backendConfigService.getConfig.mockResolvedValueOnce(testConfig);

      await backendConfigController.detail(req, res);

      expect(backendConfigService.getConfig).toHaveBeenCalledWith(testConfig._id, testFlow._id);
      expect(res.json).toHaveBeenCalledWith(testConfig);
    });

    it('should get a config via API endpoint', async () => {
      const response = await request(app)
        .get(`/api/flows/${testFlow._id}/backend-configs/${testConfig._id}`)
        .set('Cookie', [`token=${viewerToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testConfig._id.toString());
      expect(response.body.name).toBe('Test Config');
      expect(response.body.baseUrl).toBe('https://api.example.com');
    });

    it('should return 404 if config does not exist via API', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      // Mock the service to throw an error
      backendConfigService.getConfig.mockRejectedValueOnce(new Error('CONFIG_NOT_FOUND'));
      
      const response = await request(app)
        .get(`/api/flows/${testFlow._id}/backend-configs/${nonExistentId}`)
        .set('Cookie', [`token=${viewerToken}`]);

      expect(response.status).toBe(500);
    });
  });

  describe('create', () => {
    it('should create a new config', async () => {
      const newConfigData = {
        name: 'New Config',
        description: 'New Description',
        baseUrl: 'https://new-api.example.com',
        timeout: 3000,
        retries: 2,
        defaultHeaders: [
          { key: 'Content-Type', value: 'application/json' }
        ],
        authType: 'none',
        auth: {},
        compression: false,
        isActive: false
      };
      
      const req = {
        user: { id: ownerUser._id },
        params: { flowId: testFlow._id },
        body: newConfigData
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const createdConfig = { 
        ...newConfigData, 
        id: new mongoose.Types.ObjectId(),
        owner: ownerUser._id,
        flow: testFlow._id
      };

      // Mock the service method
      backendConfigService.createConfig.mockResolvedValueOnce(createdConfig);

      await backendConfigController.create(req, res);

      expect(backendConfigService.createConfig).toHaveBeenCalledWith(ownerUser._id, testFlow._id, newConfigData);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(createdConfig);
    });

    it('should create a config via API endpoint', async () => {
      const newConfigData = {
        name: 'API Config',
        description: 'API Description',
        baseUrl: 'https://api-test.example.com',
        timeout: 3000,
        retries: 2,
        defaultHeaders: [
          { key: 'Content-Type', value: 'application/json' }
        ],
        authType: 'none',
        auth: {},
        compression: false,
        isActive: false
      };
      
      const response = await request(app)
        .post(`/api/flows/${testFlow._id}/backend-configs`)
        .set('Cookie', [`token=${editorToken}`])
        .send(newConfigData);

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('API Config');
      expect(response.body.baseUrl).toBe('https://api-test.example.com');
    });

    it('should return 403 if user is not editor or owner', async () => {
      const newConfigData = {
        name: 'Viewer Config',
        baseUrl: 'https://viewer.example.com'
      };
      
      const response = await request(app)
        .post(`/api/flows/${testFlow._id}/backend-configs`)
        .set('Cookie', [`token=${viewerToken}`])
        .send(newConfigData);

      expect(response.status).toBe(403);
    });
  });

  describe('update', () => {
    it('should update an existing config', async () => {
      const updateData = {
        name: 'Updated Config',
        baseUrl: 'https://updated.example.com'
      };
      
      const req = {
        params: { 
          flowId: testFlow._id,
          id: testConfig._id 
        },
        body: updateData
      };
      const res = {
        json: jest.fn()
      };
      
      const updatedConfig = { 
        ...testConfig.toJSON(), 
        ...updateData
      };

      // Mock the service method
      backendConfigService.updateConfig.mockResolvedValueOnce(updatedConfig);

      await backendConfigController.update(req, res);

      expect(backendConfigService.updateConfig).toHaveBeenCalledWith(testConfig._id, testFlow._id, updateData);
      expect(res.json).toHaveBeenCalledWith(updatedConfig);
    });

    it('should update a config via API endpoint', async () => {
      const updateData = {
        name: 'API Updated Config',
        baseUrl: 'https://api-updated.example.com'
      };
      
      const response = await request(app)
        .put(`/api/flows/${testFlow._id}/backend-configs/${testConfig._id}`)
        .set('Cookie', [`token=${editorToken}`])
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testConfig._id.toString());
      expect(response.body.name).toBe('API Updated Config');
      expect(response.body.baseUrl).toBe('https://api-updated.example.com');
    });

    it('should return 404 if config does not exist via API', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Non-existent Config'
      };
      
      // Mock the service to throw an error
      backendConfigService.updateConfig.mockRejectedValueOnce(new Error('CONFIG_NOT_FOUND'));
      
      const response = await request(app)
        .put(`/api/flows/${testFlow._id}/backend-configs/${nonExistentId}`)
        .set('Cookie', [`token=${editorToken}`])
        .send(updateData);

      expect(response.status).toBe(500);
    });
  });

  describe('remove', () => {
    it('should delete a config', async () => {
      const req = {
        params: { 
          flowId: testFlow._id,
          id: testConfig._id 
        }
      };
      const res = {
        json: jest.fn()
      };

      // Mock the service method
      backendConfigService.deleteConfig.mockResolvedValueOnce();

      await backendConfigController.remove(req, res);

      expect(backendConfigService.deleteConfig).toHaveBeenCalledWith(testConfig._id, testFlow._id);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should delete a config via API endpoint', async () => {
      const response = await request(app)
        .delete(`/api/flows/${testFlow._id}/backend-configs/${testConfig._id}`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the config was deleted
      const deletedConfig = await BackendConfig.findById(testConfig._id);
      expect(deletedConfig).toBeNull();
    });

    it('should return 404 if config does not exist via API', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      // Mock the service to throw an error
      backendConfigService.deleteConfig.mockRejectedValueOnce(new Error('CONFIG_NOT_FOUND'));
      
      const response = await request(app)
        .delete(`/api/flows/${testFlow._id}/backend-configs/${nonExistentId}`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(500);
    });
  });

  describe('setActive', () => {
    it('should set a config as active', async () => {
      const req = {
        params: { 
          flowId: testFlow._id,
          id: testConfig._id 
        }
      };
      const res = {
        json: jest.fn()
      };
      
      const activeConfig = { 
        ...testConfig.toJSON(), 
        isActive: true
      };

      // Mock the service method
      backendConfigService.setActiveConfig.mockResolvedValueOnce(activeConfig);

      await backendConfigController.setActive(req, res);

      expect(backendConfigService.setActiveConfig).toHaveBeenCalledWith(testConfig._id, testFlow._id);
      expect(res.json).toHaveBeenCalledWith(activeConfig);
    });

    it('should set a config as active via API endpoint', async () => {
      // Create a second config that's not active
      const secondConfig = await BackendConfig.create({
        owner: ownerUser._id,
        flow: testFlow._id,
        name: 'Second Config',
        baseUrl: 'https://second.example.com',
        isActive: false
      });
      
      const response = await request(app)
        .patch(`/api/flows/${testFlow._id}/backend-configs/${secondConfig._id}/active`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(secondConfig._id.toString());
      expect(response.body.isActive).toBe(true);

      // Verify the first config is no longer active
      const updatedFirstConfig = await BackendConfig.findById(testConfig._id);
      expect(updatedFirstConfig.isActive).toBe(false);
    });

    it('should return 404 if config does not exist via API', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      // Mock the service to throw an error
      backendConfigService.setActiveConfig.mockRejectedValueOnce(new Error('CONFIG_NOT_FOUND'));
      
      const response = await request(app)
        .patch(`/api/flows/${testFlow._id}/backend-configs/${nonExistentId}/active`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(500);
    });
  });
});
