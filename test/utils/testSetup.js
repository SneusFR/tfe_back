import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// MongoDB Memory Server instance
let mongoServer;

// Connect to the in-memory database
export const connectDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  await mongoose.connect(uri);
  console.log('Connected to the in-memory database');
};

// Disconnect and close connection
export const disconnectDB = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
  console.log('Disconnected from the in-memory database');
};

// Clear all collections
export const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

// Helper function to sign JWT tokens for testing
export const signJwt = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};

// Global setup for Jest
export const setupTestDB = () => {
  // Setup before all tests
  beforeAll(async () => {
    await connectDB();
  });
  
  // Clean up after each test
  afterEach(async () => {
    await clearDatabase();
  });
  
  // Disconnect after all tests
  afterAll(async () => {
    await disconnectDB();
  });
};
