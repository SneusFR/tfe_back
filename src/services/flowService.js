import { Flow, Collaboration } from '../models/index.js';
import { COLLABORATION_ROLE, ROLE_HIERARCHY } from '../utils/constants.js';

const MAX_VARIANTS = 3;                            // ← 3 variantes fixes

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
// Créer un objet de rang à partir du tableau de hiérarchie
const RANK = {};
ROLE_HIERARCHY.forEach((role, index) => {
  RANK[role] = index + 1;
});

const hasAccess = (userRole, required = COLLABORATION_ROLE.VIEWER) =>
  RANK[userRole] >= RANK[required];

const findCollabRole = async (flow, userId) => {
  const collab = await Collaboration.findOne({ flow: flow._id, user: userId });
  return collab?.role ?? null;
};

/* -------------------------------------------------------------------------- */
/* CRUD ‑ niveau « service »                                                  */
/* -------------------------------------------------------------------------- */
export const createFlow = async (userId, { name }) => {
  // Crée un shell à 3 variantes vides (+ index courant = 0)
  const variants = Array.from({ length: MAX_VARIANTS }, () => ({
    nodes: [],
    edges: [],
    savedAt: null,
  }));

  const flow = await Flow.create({
    name,
    versions: variants,
    currentVersionIndex: 0,
  });

  // Création de la collaboration owner pour gérer les permissions
  await Collaboration.create({ flow: flow._id, user: userId, role: COLLABORATION_ROLE.OWNER });
  return flow.toJSON();
};

export const getFlow = async (flowId, userId) => {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('FLOW_NOT_FOUND');

  // Récupérer la collaboration directement
  const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
  if (!collaboration) throw new Error('FORBIDDEN');

  return flow.toJSON();
};

export const getUserFlows = async (userId) => {
  const collabs = await Collaboration.find({ user: userId }).populate('flow');
  
  // Filter out collaborations with null or undefined flows
  return collabs
    .filter(c => c.flow)
    .map(c => ({ ...c.flow.toJSON(), userRole: c.role }));
};

/* -------------------------------------------------------------------------- */
/* Variante courante : écrasement direct                                      */
/* -------------------------------------------------------------------------- */
export const saveCurrentVariant = async (flowId, userId, { nodes = [], edges = [], subflowMetadata = null }) => {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('FLOW_NOT_FOUND');

  // Récupérer la collaboration directement
  const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
  if (!collaboration || RANK[collaboration.role] < RANK[COLLABORATION_ROLE.EDITOR]) {
    throw new Error('FORBIDDEN');
  }

  // Validation des SubFlowNodes
  const subflowNodes = nodes.filter(node => node.type === 'subFlowNode');
  
  // Vérifier l'intégrité des données de subflow
  for (const subflowNode of subflowNodes) {
    if (subflowNode.data.originals) {
      // Valider que les nœuds originaux ont des IDs valides
      const originalNodeIds = subflowNode.data.originals.nodes.map(n => n.id);
      
      // S'assurer que tous les IDs sont des chaînes non vides
      if (originalNodeIds.some(id => !id || typeof id !== 'string')) {
        console.warn('SubFlowNode contient des IDs de nœuds originaux invalides');
        // On ne bloque pas la sauvegarde, mais on log l'avertissement
      }
    }
    
    // S'assurer que isCollapsed est un booléen (ou undefined)
    if (subflowNode.data.isCollapsed !== undefined && 
        typeof subflowNode.data.isCollapsed !== 'boolean') {
      subflowNode.data.isCollapsed = Boolean(subflowNode.data.isCollapsed);
    }
  }

  const i = flow.currentVersionIndex;           // 0, 1 ou 2
  flow.versions[i] = { 
    nodes, 
    edges, 
    savedAt: Date.now(),
    // Si des métadonnées de subflow sont fournies, les stocker également
    ...(subflowMetadata ? { subflowMetadata } : {})
  };

  await flow.save();
  return flow.toJSON();
};

/* -------------------------------------------------------------------------- */
/* Changement d’onglet (= variante)                                           */
/* -------------------------------------------------------------------------- */
export const switchVariant = async (flowId, userId, index) => {
  if (index < 0 || index >= MAX_VARIANTS) throw new Error('INVALID_INDEX');

  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('FLOW_NOT_FOUND');

  // Récupérer la collaboration directement
  const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
  if (!collaboration) throw new Error('FORBIDDEN');      // même viewer peut switcher

  // Initialise la case si elle n'existe pas encore
  if (!flow.versions[index])
    flow.versions[index] = { nodes: [], edges: [], savedAt: null };

  flow.currentVersionIndex = index;
  await flow.save();
  return flow.toJSON();
};

/* -------------------------------------------------------------------------- */
/* Suppression                                                                */
/* -------------------------------------------------------------------------- */
export const deleteFlow = async (flowId, userId) => {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('FLOW_NOT_FOUND');
  
  // Vérifier si l'utilisateur est owner via la collaboration
  const collab = await Collaboration.findOne({ flow: flowId, user: userId });
  if (!collab || collab.role !== COLLABORATION_ROLE.OWNER) throw new Error('FORBIDDEN');

  // La suppression des collaborations est gérée par le middleware pre('deleteOne') du modèle Flow
  await flow.deleteOne();
};

/**
 * Vérifie si un utilisateur a accès à un flow avec un rôle spécifique
 * @param {string} userId - ID de l'utilisateur
 * @param {string} flowId - ID du flow
 * @param {string} requiredRole - Rôle requis (owner, editor, viewer)
 * @returns {Promise<boolean>} - True si l'utilisateur a accès, false sinon
 */
export const checkFlowAccess = async (userId, flowId, requiredRole = COLLABORATION_ROLE.VIEWER) => {
  try {
    // 1. Récupérer la collaboration directement (sans passer par le flow)
    const collaboration = await Collaboration.findOne({ flow: flowId, user: userId });
    
    // Si aucune collaboration n'existe, l'accès est refusé
    if (!collaboration) return false;
    
    // 2. Comparer les rangs pour déterminer la permission
    return RANK[collaboration.role] >= RANK[requiredRole];
  } catch (error) {
    return false;
  }
};
