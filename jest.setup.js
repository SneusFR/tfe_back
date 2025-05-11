import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.test file
dotenv.config({ path: path.join(__dirname, '.env.test') });

// Set environment variables for testing
process.env.NODE_ENV = 'test';
