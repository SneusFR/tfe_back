// src/flow/httpLogger.js
import axios from 'axios';
import winston from 'winston';
import axiosRetry from 'axios-retry';

// Créer un logger Winston pour les requêtes HTTP
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/http-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/http.log' 
    })
  ]
});

// Créer une instance axios
export const http = axios.create();

// Configurer axios-retry
axiosRetry(http, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Réessayer en cas d'erreur réseau ou de certaines erreurs serveur
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           (error.response && error.response.status >= 500);
  }
});

// Fonction pour masquer les informations sensibles
const maskSensitiveData = (obj) => {
  if (!obj) return obj;
  
  // Créer une copie pour ne pas modifier l'original
  const masked = { ...obj };
  
  // Masquer les headers d'autorisation
  if (masked.headers) {
    const headers = { ...masked.headers };
    
    // Masquer Authorization header
    if (headers.Authorization || headers.authorization) {
      const authHeader = headers.Authorization || headers.authorization;
      if (typeof authHeader === 'string') {
        // Conserver le type d'auth (Bearer, Basic, etc.) mais masquer le token
        const parts = authHeader.split(' ');
        if (parts.length > 1) {
          headers.Authorization = `${parts[0]} <masked>`;
        } else {
          headers.Authorization = '<masked>';
        }
      }
    }
    
    // Masquer les cookies
    if (headers.Cookie || headers.cookie) {
      headers.Cookie = '<masked>';
    }
    
    // Masquer les clés API potentielles
    Object.keys(headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('api-key') || 
          lowerKey.includes('apikey') || 
          lowerKey.includes('x-api-key') ||
          lowerKey.includes('token')) {
        headers[key] = '<masked>';
      }
      
      // Tronquer les valeurs longues
      if (headers[key] && typeof headers[key] === 'string' && headers[key].length > 1000) {
        headers[key] = headers[key].substring(0, 1000) + '... (tronqué)';
      }
    });
    
    masked.headers = headers;
  }
  
  // Masquer les données sensibles dans le corps de la requête
  if (masked.data) {
    // Si les données sont une chaîne JSON, essayer de les parser
    let data = masked.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        // Ignorer les erreurs de parsing
      }
    }
    
    // Si les données sont un objet, masquer les champs sensibles
    if (typeof data === 'object' && data !== null) {
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'api_key', 'auth'];
      
      // Fonction récursive pour masquer les champs sensibles
      const maskRecursive = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        
        const result = Array.isArray(obj) ? [...obj] : { ...obj };
        
        Object.keys(result).forEach(key => {
          const lowerKey = key.toLowerCase();
          
          // Masquer les champs sensibles
          if (sensitiveFields.some(field => lowerKey.includes(field))) {
            result[key] = '<masked>';
          } 
          // Traiter récursivement les objets imbriqués
          else if (typeof result[key] === 'object' && result[key] !== null) {
            result[key] = maskRecursive(result[key]);
          }
          // Tronquer les valeurs longues
          else if (typeof result[key] === 'string' && result[key].length > 2000) {
            result[key] = result[key].substring(0, 2000) + '... (tronqué)';
          }
        });
        
        return result;
      };
      
      masked.data = maskRecursive(data);
    }
  }
  
  return masked;
};

// Intercepteur de requête
http.interceptors.request.use(config => {
  const maskedConfig = maskSensitiveData(config);
  
  logger.info({
    type: 'request',
    method: config.method?.toUpperCase(),
    url: config.url,
    headers: maskedConfig.headers,
    data: maskedConfig.data
  });
  
  console.log('➡️', config.method?.toUpperCase(), config.url);
  return config;
});

// Intercepteur de réponse
http.interceptors.response.use(
  response => {
    const maskedResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    };
    
    logger.info({
      type: 'response',
      status: response.status,
      url: response.config.url,
      method: response.config.method?.toUpperCase(),
      responseTime: Date.now() - (response.config.metadata?.startTime || 0)
    });
    
    console.log('✅', response.status, response.config.url);
    return response;
  },
  error => {
    const maskedError = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data
    };
    
    // Log the error with appropriate level (warn for 404, error for others)
    const logLevel = error.response?.status === 404 ? 'warn' : 'error';
    
    logger[logLevel]({
      type: 'error',
      error: maskedError,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      responseTime: Date.now() - (error.config?.metadata?.startTime || 0)
    });
    
    // For 404 errors, log with a different icon to indicate it's not a critical error
    if (error.response?.status === 404) {
      console.log('⚠️', error.response.status, error.config?.url, 'Not Found (non-blocking)');
    } else {
      console.log('❌', error?.response?.status ?? '-', error.config?.url, error.message);
    }
    
    // We still throw the error as the FlowExecutionEngine will handle 404s specially
    throw error;
  }
);

// Ajouter des métadonnées à chaque requête pour mesurer le temps de réponse
http.interceptors.request.use(config => {
  config.metadata = { startTime: Date.now() };
  return config;
});
