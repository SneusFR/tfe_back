import { FlowExecutionEngine } from '../../src/flow/FlowExecutionEngine.js';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Create a mock for axios
const mock = new MockAdapter(axios);

describe('Flow Execution Engine Error Handling', () => {
  let flowEngine;
  
  beforeEach(() => {
    // Create a new instance of FlowExecutionEngine for each test
    flowEngine = new FlowExecutionEngine();
    
    // Reset the mock
    mock.reset();
  });
  
  test('404 errors should not be blocking in API nodes', async () => {
    // Mock a 404 response for a specific URL
    mock.onGet('http://localhost:5171/api/User/GetUserIdByEmail').reply(404, {
      message: 'User not found'
    });
    
    // Create a simple flow with an API node
    const nodes = [
      {
        id: 'node1',
        type: 'apiNode',
        data: {
          method: 'GET',
          path: '/api/User/GetUserIdByEmail',
          parameters: []
        }
      },
      {
        id: 'node2',
        type: 'conditionalFlowNode',
        data: {
          conditionType: 'equals',
          value: 404
        }
      }
    ];
    
    const edges = [
      {
        source: 'node1',
        target: 'node2',
        sourceHandle: 'output-status',
        targetHandle: 'value-input',
        data: {
          isExecutionLink: true
        }
      }
    ];
    
    // Set up the flow engine
    flowEngine.setDiagram(nodes, edges);
    
    // Execute the API node
    const result = await flowEngine.executeNode(nodes[0]);
    
    // Check that the API node executed without throwing an exception
    expect(result).toBeDefined();
    
    // Check that the status code was stored in the execution context
    const statusCode = flowEngine.executionContext.get(`${nodes[0].id}-output-status`);
    expect(statusCode).toBe(404);
    
    // Check that the response data was stored in the execution context
    const responseData = flowEngine.executionContext.get(`${nodes[0].id}-output-response`);
    expect(responseData).toEqual({ message: 'User not found' });
  });
  
  test('Other error codes should still throw exceptions', async () => {
    // Mock a 500 response for a specific URL
    mock.onGet('http://localhost:5171/api/User/GetUserIdByEmail').reply(500, {
      message: 'Internal server error'
    });
    
    // Create a simple flow with an API node
    const nodes = [
      {
        id: 'node1',
        type: 'apiNode',
        data: {
          method: 'GET',
          path: '/api/User/GetUserIdByEmail',
          parameters: []
        }
      }
    ];
    
    // Set up the flow engine
    flowEngine.setDiagram(nodes, []);
    
    // Execute the API node and expect it to throw an exception
    await expect(flowEngine.executeNode(nodes[0])).rejects.toThrow();
  });
  
  test('Conditional flow should work with 404 status code', async () => {
    // Create a simple flow with an API node and a conditional flow node
    const nodes = [
      {
        id: 'node1',
        type: 'apiNode',
        data: {
          method: 'GET',
          path: '/api/User/GetUserIdByEmail',
          parameters: []
        }
      },
      {
        id: 'node2',
        type: 'conditionalFlowNode',
        data: {
          conditionType: 'equals',
          value: 404
        }
      },
      {
        id: 'node3',
        type: 'textNode',
        data: {
          text: 'User not found'
        }
      }
    ];
    
    const edges = [
      {
        source: 'node1',
        target: 'node2',
        sourceHandle: 'output-status',
        targetHandle: 'value-input',
        data: {
          isExecutionLink: true
        }
      },
      {
        source: 'node2',
        target: 'node3',
        sourceHandle: 'execution-true',
        targetHandle: 'input',
        data: {
          isExecutionLink: true
        }
      }
    ];
    
    // Mock a 404 response
    mock.onGet('http://localhost:5171/api/User/GetUserIdByEmail').reply(404, {
      message: 'User not found'
    });
    
    // Set up the flow engine
    flowEngine.setDiagram(nodes, edges);
    
    // Execute the API node
    await flowEngine.executeNode(nodes[0]);
    
    // Check that the status code was stored correctly
    const statusCode = flowEngine.executionContext.get(`${nodes[0].id}-output-status`);
    expect(statusCode).toBe(404);
    
    // Execute the conditional flow node
    const conditionResult = await flowEngine.executeNode(nodes[1]);
    
    // Check that the condition evaluated to true
    expect(conditionResult.result).toBe('true');
    
    // Check that the condition result was stored in the execution context
    const conditionResultInContext = flowEngine.executionContext.get(`${nodes[1].id}-condition-result`);
    expect(conditionResultInContext).toBe('true');
  });
});
