import * as svc from '../services/backendConfigService.js';

export const list = (req, res) => svc.listConfigs(req.user.id).then(r => res.json(r));
export const detail = (req, res) => svc.getConfig(req.params.id, req.user.id).then(r => res.json(r));
export const create = (req, res) => svc.createConfig(req.user.id, req.body).then(r => res.status(201).json(r));
export const update = (req, res) => svc.updateConfig(req.params.id, req.user.id, req.body).then(r => res.json(r));
export const remove = (req, res) => svc.deleteConfig(req.params.id, req.user.id).then(() => res.json({ success: true }));
