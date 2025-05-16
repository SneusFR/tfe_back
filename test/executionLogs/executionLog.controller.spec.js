// test/executionLogs/executionLog.controller.spec.js
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import { ExecutionLog, Task } from '../../src/models/index.js';
import { generateToken } from '../../test/utils/testSetup.js';

// Mock the flowService.checkFlowAccess method
import { flowService } from '../../src/services/index.js';

jest.mock('../../src/services/flowService.js', () => ({
  checkFlowAccess: jest.fn().mockResolvedValue(true)
}));

describe('Execution Log Controller', () => {
  let token;
  let taskId;
  let flowId;
  
  beforeAll(async () => {
    // Create a test user and generate a token
    token = await generateToken();
    
    // Create test flow and task
    flowId = new mongoose.Types.ObjectId();
    
    const task = await Task.create({
      user: new mongoose.Types.ObjectId(),
      flow: flowId,
      type: 'test-task',
      description: 'Test task for execution logs'
    });
    
    taskId = task._id;
  });
  
  beforeEach(async () => {
    // Clear execution logs before each test
    await ExecutionLog.deleteMany({});
  });
  
  afterAll(async () => {
    // Clean up
    await Task.deleteMany({});
    await ExecutionLog.deleteMany({});
  });
  
  describe('GET /api/executions/:taskId/logs', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get(`/api/executions/${taskId}/logs`);
      
      expect(res.statusCode).toBe(401);
    });
    
    it('should return 400 if taskId is invalid', async () => {
      const res = await request(app)
        .get('/api/executions/invalid-id/logs')
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(400);
    });
    
    it('should return 404 if task not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .get(`/api/executions/${nonExistentId}/logs`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(404);
    });
    
    it('should return empty array if no logs exist', async () => {
      const res = await request(app)
        .get(`/api/executions/${taskId}/logs`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });
    
    it('should return logs for a task', async () => {
      // Create test logs
      await ExecutionLog.create({
        taskId,
        flowId,
        level: 'info',
        message: 'Test log 1',
        createdAt: new Date('2024-05-16T10:00:00Z')
      });
      
      await ExecutionLog.create({
        taskId,
        flowId,
        level: 'debug',
        nodeId: 'node-1',
        nodeType: 'testNode',
        message: 'Test log 2',
        payload: { test: 'data' },
        createdAt: new Date('2024-05-16T10:05:00Z')
      });
      
      const res = await request(app)
        .get(`/api/executions/${taskId}/logs`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.total).toBe(2);
      
      // Check log format
      expect(res.body.data[0]).toHaveProperty('timestamp');
      expect(res.body.data[0]).toHaveProperty('level');
      expect(res.body.data[0]).toHaveProperty('message');
      
      // Check ordering (newest first by default)
      expect(new Date(res.body.data[0].timestamp)).toBeInstanceOf(Date);
      expect(res.body.data[0].level).toBe('debug');
      expect(res.body.data[0].nodeId).toBe('node-1');
      expect(res.body.data[0].nodeType).toBe('testNode');
      expect(res.body.data[0].message).toBe('Test log 2');
      expect(res.body.data[0].payload).toEqual({ test: 'data' });
      
      expect(res.body.data[1].level).toBe('info');
      expect(res.body.data[1].message).toBe('Test log 1');
    });
    
    it('should filter logs by since parameter', async () => {
      // Create test logs with different timestamps
      await ExecutionLog.create({
        taskId,
        flowId,
        level: 'info',
        message: 'Old log',
        createdAt: new Date('2024-05-16T10:00:00Z')
      });
      
      await ExecutionLog.create({
        taskId,
        flowId,
        level: 'info',
        message: 'New log',
        createdAt: new Date('2024-05-16T11:00:00Z')
      });
      
      // Request logs since a specific time
      const res = await request(app)
        .get(`/api/executions/${taskId}/logs?since=2024-05-16T10:30:00Z`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].message).toBe('New log');
    });
    
    it('should return 400 if since parameter is invalid', async () => {
      const res = await request(app)
        .get(`/api/executions/${taskId}/logs?since=invalid-date`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(400);
    });
    
    it('should paginate results', async () => {
      // Create 10 test logs
      for (let i = 0; i < 10; i++) {
        await ExecutionLog.create({
          taskId,
          flowId,
          level: 'info',
          message: `Log ${i}`,
          createdAt: new Date(`2024-05-16T${10 + i}:00:00Z`)
        });
      }
      
      // Request first page with 5 items
      const res1 = await request(app)
        .get(`/api/executions/${taskId}/logs?page=1&limit=5`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res1.statusCode).toBe(200);
      expect(res1.body.data.length).toBe(5);
      expect(res1.body.total).toBe(10);
      expect(res1.body.page).toBe(1);
      expect(res1.body.limit).toBe(5);
      
      // Request second page
      const res2 = await request(app)
        .get(`/api/executions/${taskId}/logs?page=2&limit=5`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res2.statusCode).toBe(200);
      expect(res2.body.data.length).toBe(5);
      expect(res2.body.page).toBe(2);
      
      // Ensure we got different logs on each page
      const firstPageMessages = res1.body.data.map(log => log.message);
      const secondPageMessages = res2.body.data.map(log => log.message);
      
      // No overlap between pages
      expect(firstPageMessages.some(msg => secondPageMessages.includes(msg))).toBe(false);
    });
    
    it('should truncate large payloads', async () => {
      // Create a log with a large payload
      const largePayload = {};
      for (let i = 0; i < 1000; i++) {
        largePayload[`key${i}`] = `value${i}`.repeat(20); // Make it really big
      }
      
      await ExecutionLog.create({
        taskId,
        flowId,
        level: 'info',
        message: 'Log with large payload',
        payload: largePayload
      });
      
      const res = await request(app)
        .get(`/api/executions/${taskId}/logs`)
        .set('Cookie', [`token=${token}`]);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      
      // Check that payload was truncated
      const payload = res.body.data[0].payload;
      expect(typeof payload).toBe('string');
      expect(payload.endsWith('...(truncated)')).toBe(true);
      expect(payload.length).toBeLessThan(300); // 200 chars + truncation message
    });
  });
  
  describe('Log creation', () => {
    it('should create a log document in MongoDB', async () => {
      // Import the logPersist module
      const logPersist = (await import('../../src/flow/logPersist.js')).default;
      
      // Use the logPersist.info method to create a log
      logPersist.info('Test log message', {
        taskId,
        flowId,
        nodeId: 'test-node',
        nodeType: 'testNode',
        payload: { test: 'data' }
      });
      
      // Wait a bit for the async operation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if the log was created in the database
      const logs = await ExecutionLog.find({ taskId });
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('Test log message');
      expect(logs[0].level).toBe('info');
      expect(logs[0].nodeId).toBe('test-node');
      expect(logs[0].nodeType).toBe('testNode');
      expect(logs[0].payload).toEqual({ test: 'data' });
    });
  });
});
