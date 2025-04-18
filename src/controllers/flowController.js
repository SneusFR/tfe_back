import * as flowService from '../services/flowService.js';

/* -------------------------------------------------------------------------- */
/* Liste + création                                                           */
/* -------------------------------------------------------------------------- */
export const listFlows = async (req, res) => {
  try {
    const flows = await flowService.getUserFlows(req.user.id);
    res.json(flows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const createFlow = async (req, res) => {
  try {
    const flow = await flowService.createFlow(req.user.id, req.body);
    res.status(201).json(flow);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* -------------------------------------------------------------------------- */
/* Lire un flow                                                               */
/* -------------------------------------------------------------------------- */
export const getFlow = async (req, res) => {
  try {
    const flow = await flowService.getFlow(req.params.id, req.user.id);
    res.json(flow);
  } catch (e) {
    res.status(e.message === 'FORBIDDEN' ? 403 : 404).json({ message: e.message });
  }
};

/* -------------------------------------------------------------------------- */
/* Sauver la variante courante                                                */
/* PUT /flows/:id                                                              */
/* body: { nodes, edges }                                                     */
/* -------------------------------------------------------------------------- */
export const saveVariant = async (req, res) => {
  try {
    const flow = await flowService.saveCurrentVariant(req.params.id, req.user.id, req.body);
    res.json(flow);
  } catch (e) {
    const status = e.message === 'FORBIDDEN' ? 403 : 404;
    res.status(status).json({ message: e.message });
  }
};

/* -------------------------------------------------------------------------- */
/* Changer d’onglet                                                           */
/* PATCH /flows/:id/version   body: { index: 0|1|2 }                          */
/* -------------------------------------------------------------------------- */
export const switchVariant = async (req, res) => {
  try {
    const { index } = req.body;
    const flow = await flowService.switchVariant(req.params.id, req.user.id, index);
    res.json(flow);
  } catch (e) {
    let status = 400;
    if (e.message === 'FORBIDDEN') status = 403;
    else if (e.message === 'FLOW_NOT_FOUND') status = 404;
    res.status(status).json({ message: e.message });
  }
};

/* -------------------------------------------------------------------------- */
/* Suppression                                                                */
/* DELETE /flows/:id                                                          */
/* -------------------------------------------------------------------------- */
export const deleteFlow = async (req, res) => {
  try {
    await flowService.deleteFlow(req.params.id, req.user.id);
    res.json({ message: 'Flow supprimé' });
  } catch (e) {
    res.status(e.message === 'FORBIDDEN' ? 403 : 404).json({ message: e.message });
  }
};
