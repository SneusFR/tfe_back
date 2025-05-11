import mongoose from 'mongoose';
import { setupTestDB, signJwt } from '../utils/testSetup.js';
import { Flow, User, Collaboration } from '../../src/models/index.js';
import * as flowService from '../../src/services/flowService.js';
import { COLLABORATION_ROLE } from '../../src/utils/constants.js';

// Setup the in-memory database for testing
setupTestDB();

describe('Flow Service', () => {
  let testUser;
  let testFlow;

  beforeEach(async () => {
    // Create a test user
    testUser = await User.create({
      email: 'test@example.com',
      passwordHash: 'password123',
      displayName: 'Test User'
    });

    // Create a test flow
    testFlow = await flowService.createFlow(testUser.id, { name: 'Test Flow' });
  });

  describe('createFlow', () => {
    it('should create a new flow with owner collaboration', async () => {
      const flowName = 'New Test Flow';
      const flow = await flowService.createFlow(testUser.id, { name: flowName });

      // Check flow properties
      expect(flow).toBeDefined();
      expect(flow.name).toBe(flowName);
      expect(flow.versions).toHaveLength(3);
      expect(flow.currentVersionIndex).toBe(0);

      // Check collaboration was created
      const collaboration = await Collaboration.findOne({ 
        flow: flow.id, 
        user: testUser.id 
      });
      expect(collaboration).toBeDefined();
      expect(collaboration.role).toBe(COLLABORATION_ROLE.OWNER);
    });
  });

  describe('getFlow', () => {
    it('should return a flow if user has access', async () => {
      const flow = await flowService.getFlow(testFlow.id, testUser.id);
      expect(flow).toBeDefined();
      expect(flow.id).toBe(testFlow.id);
      expect(flow.name).toBe(testFlow.name);
    });

    it('should throw an error if flow does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await expect(flowService.getFlow(nonExistentId, testUser.id))
        .rejects.toThrow('FLOW_NOT_FOUND');
    });

    it('should throw an error if user does not have access', async () => {
      const anotherUser = await User.create({
        email: 'another@example.com',
        passwordHash: 'password123',
        displayName: 'Another User'
      });

      await expect(flowService.getFlow(testFlow.id, anotherUser.id))
        .rejects.toThrow('FORBIDDEN');
    });
  });

  describe('saveCurrentVariant', () => {
    it('should save the current variant if user has editor access', async () => {
      const newNodes = [{ id: 'node1', type: 'task' }];
      const newEdges = [{ id: 'edge1', source: 'node1', target: 'node2' }];

      const updatedFlow = await flowService.saveCurrentVariant(
        testFlow.id, 
        testUser.id, 
        { nodes: newNodes, edges: newEdges }
      );

      expect(updatedFlow).toBeDefined();
      expect(updatedFlow.versions[0].nodes).toEqual(newNodes);
      expect(updatedFlow.versions[0].edges).toEqual(newEdges);
      expect(updatedFlow.versions[0].savedAt).toBeDefined();
    });

    it('should throw an error if user does not have editor access', async () => {
      // Create a viewer user
      const viewerUser = await User.create({
        email: 'viewer@example.com',
        passwordHash: 'password123',
        displayName: 'Viewer User'
      });

      // Create a viewer collaboration
      await Collaboration.create({
        flow: testFlow.id,
        user: viewerUser.id,
        role: COLLABORATION_ROLE.VIEWER
      });

      await expect(flowService.saveCurrentVariant(
        testFlow.id, 
        viewerUser.id, 
        { nodes: [], edges: [] }
      )).rejects.toThrow('FORBIDDEN');
    });
  });

  describe('switchVariant', () => {
    it('should switch to another variant', async () => {
      const newIndex = 1;
      const updatedFlow = await flowService.switchVariant(testFlow.id, testUser.id, newIndex);

      expect(updatedFlow).toBeDefined();
      expect(updatedFlow.currentVersionIndex).toBe(newIndex);
    });

    it('should throw an error if index is out of bounds', async () => {
      await expect(flowService.switchVariant(testFlow.id, testUser.id, 5))
        .rejects.toThrow('INVALID_INDEX');
    });
  });

  describe('checkFlowAccess', () => {
    it('should return true if user has required access', async () => {
      const hasAccess = await flowService.checkFlowAccess(
        testUser.id, 
        testFlow.id, 
        COLLABORATION_ROLE.OWNER
      );
      expect(hasAccess).toBe(true);
    });

    it('should return false if user does not have required access', async () => {
      // Create a viewer user
      const viewerUser = await User.create({
        email: 'viewer@example.com',
        passwordHash: 'password123',
        displayName: 'Viewer User'
      });

      // Create a viewer collaboration
      await Collaboration.create({
        flow: testFlow.id,
        user: viewerUser.id,
        role: COLLABORATION_ROLE.VIEWER
      });

      const hasAccess = await flowService.checkFlowAccess(
        viewerUser.id, 
        testFlow.id, 
        COLLABORATION_ROLE.EDITOR
      );
      expect(hasAccess).toBe(false);
    });

    it('should return false if user has no collaboration', async () => {
      const anotherUser = await User.create({
        email: 'another@example.com',
        passwordHash: 'password123',
        displayName: 'Another User'
      });

      const hasAccess = await flowService.checkFlowAccess(
        anotherUser.id, 
        testFlow.id, 
        COLLABORATION_ROLE.VIEWER
      );
      expect(hasAccess).toBe(false);
    });
  });
});
