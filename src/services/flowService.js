import { Flow, Collaboration } from '../models/index.js';

const MAX_VARIANTS = 3;                            // ← 3 variantes fixes
const ROLE = { VIEWER: 'viewer', EDITOR: 'editor', OWNER: 'owner' };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
const roleRank = { [ROLE.VIEWER]: 1, [ROLE.EDITOR]: 2, [ROLE.OWNER]: 3 };

const hasAccess = (userRole, required = ROLE.VIEWER) =>
  roleRank[userRole] >= roleRank[required];

const findCollabRole = async (flow, userId) => {
  if (flow.owner.toString() === userId) return ROLE.OWNER;
  const collab = await Collaboration.findOne({ flow: flow._id, user: userId });
  return collab?.role ?? null;
};

/* -------------------------------------------------------------------------- */
/* CRUD ‑ niveau « service »                                                  */
/* -------------------------------------------------------------------------- */
export const createFlow = async (userId, { name }) => {
  // Crée un shell à 3 variantes vides (+ index courant = 0)
  const variants = Array.from({ length: MAX_VARIANTS }, () => ({
    nodes: [],
    edges: [],
    savedAt: null,
  }));

  const flow = await Flow.create({
    owner: userId,
    name,
    versions: variants,
    currentVersionIndex: 0,
  });

  // Collaboration owner
  await Collaboration.create({ flow: flow._id, user: userId, role: ROLE.OWNER });
  return flow.toJSON();
};

export const getFlow = async (flowId, userId) => {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('FLOW_NOT_FOUND');

  const role = await findCollabRole(flow, userId);
  if (!role) throw new Error('FORBIDDEN');

  return flow.toJSON();
};

export const getUserFlows = async (userId) => {
  const owned = await Flow.find({ owner: userId });
  const collabs = await Collaboration.find({ user: userId }).populate('flow');

  return [
    ...owned.map((f) => ({ ...f.toJSON(), userRole: ROLE.OWNER })),
    ...collabs.map((c) => ({ ...c.flow.toJSON(), userRole: c.role })),
  ];
};

/* -------------------------------------------------------------------------- */
/* Variante courante : écrasement direct                                      */
/* -------------------------------------------------------------------------- */
export const saveCurrentVariant = async (flowId, userId, { nodes = [], edges = [] }) => {
  const flow = await Flow.findById(flowId);
  if (!flow) throw new Error('FLOW_NOT_FOUND');

  const role = await findCollabRole(flow, userId);
  if (!hasAccess(role, ROLE.EDITOR)) throw new Error('FORBIDDEN');

  const i = flow.currentVersionIndex;           // 0, 1 ou 2
  flow.versions[i] = { nodes, edges, savedAt: Date.now() };

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

  const role = await findCollabRole(flow, userId);
  if (!role) throw new Error('FORBIDDEN');      // même viewer peut switcher

  // Initialise la case si elle n’existe pas encore
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
  if (flow.owner.toString() !== userId) throw new Error('FORBIDDEN');

  await Collaboration.deleteMany({ flow: flowId });
  await flow.deleteOne();
};

/**
 * Vérifie si un utilisateur a accès à un flow avec un rôle spécifique
 * @param {string} userId - ID de l'utilisateur
 * @param {string} flowId - ID du flow
 * @param {string} requiredRole - Rôle requis (owner, editor, viewer)
 * @returns {Promise<boolean>} - True si l'utilisateur a accès, false sinon
 */
export const checkFlowAccess = async (userId, flowId, requiredRole = ROLE.VIEWER) => {
  try {
    const flow = await Flow.findById(flowId);
    if (!flow) return false;
    
    const userRole = await findCollabRole(flow, userId);
    if (!userRole) return false;
    
    return hasAccess(userRole, requiredRole);
  } catch (error) {
    return false;
  }
};
