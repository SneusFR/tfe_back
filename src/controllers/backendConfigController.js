import * as svc from '../services/backendConfigService.js';

export const list = (req, res) => svc.listConfigsByFlow(req.params.flowId).then(r => res.json(r));
export const detail = (req, res) => svc.getConfig(req.params.id, req.params.flowId).then(r => res.json(r));
export const create = (req, res) => svc.createConfig(req.user.id, req.params.flowId, req.body).then(r => res.status(201).json(r));
export const update = (req, res) => svc.updateConfig(req.params.id, req.params.flowId, req.body).then(r => res.json(r));
export const remove = (req, res) => svc.deleteConfig(req.params.id, req.params.flowId).then(() => res.json({ success: true }));
export const setActive = (req, res) => svc.setActiveConfig(req.params.id, req.params.flowId).then(r => res.json(r));
