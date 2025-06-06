// src/app.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import fs from 'fs-extra';
import path from 'path';
import connectDB from './config/db.js';
import { 
  authRoutes, 
  userRoutes, 
  flowRoutes, 
  collaborationRoutes, 
  // conditionRoutes, // Commenté pour éviter la collision avec les routes imbriquées
  taskRoutes, 
  emailRoutes, 
  attachmentRoutes,
  backendConfigRoutes,
  executionLogRoutes,
  metricsRoutes
} from './routes/index.js';
import flowExecRoutes from './routes/flowExecRoutes.js';
import { errorMiddleware } from './middleware/index.js';

// Charger les variables d'environnement
dotenv.config();

// Connecter à la base de données
connectDB();

// Assurer que le dossier uploads existe
const uploadDir = path.join(process.cwd(), 'uploads');
fs.ensureDirSync(uploadDir);

const app = express();

// CORS avec support des cookies HttpOnly
const allowedOrigins = [
  'http://localhost:5173',
  // ajoute ici d'autres origines si nécessaire
];

app.use(
  cors({
    origin: (origin, callback) => {
      // autorise les requêtes sans origin (ex. Postman) ou celles listées
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // <— indispensable pour envoyer/recevoir les cookies
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  })
);

app.use(express.json());
app.use(cookieParser());

// Route de test
app.get('/', (req, res) => {
  res.send('🚀 API en marche !');
});

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/collaborations', collaborationRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/flow', flowExecRoutes);
app.use('/api/executions', executionLogRoutes);
app.use('/api/metrics', metricsRoutes);

// Note: Les routes pour tasks, conditions et backend-configs sont maintenant
// imbriquées sous /api/flows/:flowId/ via le routeur de flow

// Gestion des 404
app.use(errorMiddleware.notFound);
// Gestion des erreurs
app.use(errorMiddleware.errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
