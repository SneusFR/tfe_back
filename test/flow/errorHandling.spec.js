// test/flow/errorHandling.spec.js
import { FlowExecutionEngine } from '../../src/flow/FlowExecutionEngine.js';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Create a mock for axios
const mock = new MockAdapter(axios);

describe('Flow Execution Engine Error Handling', () => {
  let flowEngine;
  
  beforeEach(() => {
    flowEngine = new FlowExecutionEngine();
    // Set up a simple diagram with one API node
    flowEngine.setDiagram(
      [
        {
          id: 'api1',
          type: 'apiNode',
          data: {
            method: 'GET',
            path: '/test-api'
          }
        }
      ],
      [] // No edges
    );
  });
  
  afterEach(() => {
    mock.reset();
  });
  
  test('should provide detailed error message for 400 error', async () => {
    // Mock a 400 error with a JSON error response
    mock.onGet('/test-api').reply(400, {
      error: 'Invalid parameters',
      details: 'Missing required field: name'
    });
    
    try {
      await flowEngine.executeApiNode({
        id: 'api1',
        type: 'apiNode',
        data: {
          method: 'GET',
          path: '/test-api'
        }
      });
      fail('Should have thrown an error');
    } catch (error) {
      // Verify the error message contains detailed information
      expect(error.message).toContain('API request failed with status code 400');
      expect(error.message).toContain('Invalid parameters');
      expect(error.message).toContain('Request: GET');
    }
  });
  
  test('should provide detailed error message for 401 error', async () => {
    // Mock a 401 error with a string error response
    mock.onGet('/test-api').reply(401, 'Unauthorized access');
    
    try {
      await flowEngine.executeApiNode({
        id: 'api1',
        type: 'apiNode',
        data: {
          method: 'GET',
          path: '/test-api'
        }
      });
      fail('Should have thrown an error');
    } catch (error) {
      // Verify the error message contains detailed information
      expect(error.message).toContain('API request failed with status code 401');
      expect(error.message).toContain('Unauthorized access');
      expect(error.message).toContain('Request: GET');
    }
  });
  
  test('should provide detailed error message for 500 error', async () => {
    // Mock a 500 error with a complex error response
    mock.onGet('/test-api').reply(500, {
      message: 'Internal server error',
      errors: [
        { field: 'server', message: 'Database connection failed' }
      ]
    });
    
    try {
      await flowEngine.executeApiNode({
        id: 'api1',
        type: 'apiNode',
        data: {
          method: 'GET',
          path: '/test-api'
        }
      });
      fail('Should have thrown an error');
    } catch (error) {
      // Verify the error message contains detailed information
      expect(error.message).toContain('API request failed with status code 500');
      expect(error.message).toContain('Internal server error');
      expect(error.message).toContain('Request: GET');
    }
  });
});
