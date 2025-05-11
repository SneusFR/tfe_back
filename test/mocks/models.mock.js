// Mock for models
import mongoose from 'mongoose';

// Mock BackendConfig model
const mockBackendConfig = {
  _id: new mongoose.Types.ObjectId(),
  owner: new mongoose.Types.ObjectId(),
  flow: new mongoose.Types.ObjectId(),
  name: 'Mock Backend Config',
  description: 'Mock description',
  baseUrl: 'https://mock-api.com',
  timeout: 10000,
  retries: 0,
  defaultHeaders: [],
  authType: 'none',
  auth: {},
  compression: false,
  proxy: null,
  tlsSkipVerify: false,
  isActive: true
};

// Mock for mongoose models
jest.mock('../../src/models/index.js', () => {
  const originalModule = jest.requireActual('../../src/models/index.js');
  
  return {
    ...originalModule,
    BackendConfig: {
      findById: jest.fn().mockResolvedValue(mockBackendConfig),
      findOne: jest.fn().mockResolvedValue(mockBackendConfig),
      create: jest.fn().mockResolvedValue(mockBackendConfig),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }
  };
});

// Set environment variables for testing
process.env.SECRET_ENC_KEY = 'testtesttesttesttesttesttesttest'; // 32 characters
