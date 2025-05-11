import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import { setupTestDB, signJwt } from '../utils/testSetup.js';
import { User, Flow, Collaboration } from '../../src/models/index.js';
import collaborationRoutes from '../../src/routes/collaborationRoutes.js';
import { authMiddleware, errorMiddleware, validationMiddleware } from '../../src/middleware/index.js';
import { COLLABORATION_ROLE } from '../../src/utils/constants.js';

// Setup the in-memory database for testing
setupTestDB();

// Create Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock JWT_SECRET for testing
process.env.JWT_SECRET = 'test-secret';

// Setup routes for testing
app.use('/api/collaborations', collaborationRoutes);
app.use(errorMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

describe('Collaboration Routes', () => {
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
  });

  describe('GET /api/collaborations/flow/:flowId', () => {
    it('should return all collaborations for a flow if user is owner', async () => {
      const response = await request(app)
        .get(`/api/collaborations/flow/${testFlow._id}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
      
      // Check that the response contains the expected collaborations
      const collaborationIds = response.body.map(collab => collab.id);
      expect(collaborationIds).toContain(ownerCollaboration._id.toString());
      expect(collaborationIds).toContain(editorCollaboration._id.toString());
      expect(collaborationIds).toContain(viewerCollaboration._id.toString());
    });

    it('should return all collaborations for a flow if user is editor', async () => {
      const response = await request(app)
        .get(`/api/collaborations/flow/${testFlow._id}`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should return all collaborations for a flow if user is viewer', async () => {
      const response = await request(app)
        .get(`/api/collaborations/flow/${testFlow._id}`)
        .set('Cookie', [`token=${viewerToken}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .get(`/api/collaborations/flow/${testFlow._id}`);

      expect(response.status).toBe(401);
    });

    it('should return 404 if flow does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/collaborations/flow/${nonExistentId}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/collaborations', () => {
    it('should create a new collaboration if user is owner', async () => {
      const newUser = await User.create({
        email: 'new@example.com',
        passwordHash: 'password123',
        displayName: 'New User'
      });

      const response = await request(app)
        .post('/api/collaborations')
        .set('Cookie', [`token=${ownerToken}`])
        .send({
          flowId: testFlow._id,
          userId: newUser._id,
          role: COLLABORATION_ROLE.EDITOR
        });

      expect(response.status).toBe(201);
      expect(response.body.flow).toBe(testFlow._id.toString());
      expect(response.body.user._id).toBe(newUser._id.toString());
      expect(response.body.role).toBe(COLLABORATION_ROLE.EDITOR);

      // Verify in database
      const collaboration = await Collaboration.findById(response.body.id);
      expect(collaboration).toBeDefined();
      expect(collaboration.role).toBe(COLLABORATION_ROLE.EDITOR);
    });

    it('should return 403 if user is not owner', async () => {
      const newUser = await User.create({
        email: 'new@example.com',
        passwordHash: 'password123',
        displayName: 'New User'
      });

      const response = await request(app)
        .post('/api/collaborations')
        .set('Cookie', [`token=${editorToken}`])
        .send({
          flowId: testFlow._id,
          userId: newUser._id,
          role: COLLABORATION_ROLE.VIEWER
        });

      expect(response.status).toBe(403);
    });

    it('should return 400 if collaboration already exists', async () => {
      const response = await request(app)
        .post('/api/collaborations')
        .set('Cookie', [`token=${ownerToken}`])
        .send({
          flowId: testFlow._id,
          userId: editorUser._id,
          role: COLLABORATION_ROLE.VIEWER
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('existe déjà');
    });
  });

  describe('PUT /api/collaborations/:id', () => {
    it('should update a collaboration if user is owner', async () => {
      const response = await request(app)
        .put(`/api/collaborations/${editorCollaboration._id}`)
        .set('Cookie', [`token=${ownerToken}`])
        .send({
          role: COLLABORATION_ROLE.VIEWER
        });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe(COLLABORATION_ROLE.VIEWER);

      // Verify in database
      const updatedCollaboration = await Collaboration.findById(editorCollaboration._id);
      expect(updatedCollaboration.role).toBe(COLLABORATION_ROLE.VIEWER);
    });

    it('should return 403 if user is not owner', async () => {
      const response = await request(app)
        .put(`/api/collaborations/${viewerCollaboration._id}`)
        .set('Cookie', [`token=${editorToken}`])
        .send({
          role: COLLABORATION_ROLE.EDITOR
        });

      expect(response.status).toBe(403);
    });

    it('should return 403 if trying to downgrade the last owner', async () => {
      const response = await request(app)
        .put(`/api/collaborations/${ownerCollaboration._id}`)
        .set('Cookie', [`token=${ownerToken}`])
        .send({
          role: COLLABORATION_ROLE.EDITOR
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('dernier propriétaire');
    });
  });

  describe('DELETE /api/collaborations/:id', () => {
    it('should delete a collaboration if user is owner', async () => {
      const response = await request(app)
        .delete(`/api/collaborations/${viewerCollaboration._id}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('supprimée');

      // Verify in database
      const deletedCollaboration = await Collaboration.findById(viewerCollaboration._id);
      expect(deletedCollaboration).toBeNull();
    });

    it('should return 403 if user is not owner', async () => {
      const response = await request(app)
        .delete(`/api/collaborations/${viewerCollaboration._id}`)
        .set('Cookie', [`token=${editorToken}`]);

      expect(response.status).toBe(403);
    });

    it('should return 403 if trying to delete the last owner', async () => {
      const response = await request(app)
        .delete(`/api/collaborations/${ownerCollaboration._id}`)
        .set('Cookie', [`token=${ownerToken}`]);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('dernier propriétaire');
    });
  });
});
