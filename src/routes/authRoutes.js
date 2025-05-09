import express from 'express';
import { authService }          from '../services/index.js';
import { validationMiddleware } from '../middleware/index.js';
import { authMiddleware }       from '../middleware/index.js';
import { errorMiddleware }      from '../middleware/index.js';

const router = express.Router();

/* Middlewares ------------------------------------------------------------- */
const { validateAuth, validateUser } = validationMiddleware;
const { protect }                    = authMiddleware;
const { asyncHandler }               = errorMiddleware;

/* ------------------------------------------------------------------------ */
/*  POST /api/auth/register  – Inscription                                  */
/* ------------------------------------------------------------------------ */
router.post(
  '/register',
  validateUser,
  asyncHandler(async (req, res) => {
    const { email, password, displayName } = req.body;

    const user = await authService.registerUser({
      email:       email.trim().toLowerCase(),
      password,
      displayName
    });

    const tokenData = authService.generateToken({ id: user._id });

    res.cookie('token', tokenData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24*60*60*1000 // 1 jour
    }).status(201).json({
      _id:         user._id,
      email:       user.email,
      displayName: user.displayName,
      expiresAt:   tokenData.expiresAt
    });
  })
);

/* ------------------------------------------------------------------------ */
/*  POST /api/auth/login  – Connexion                                       */
/* ------------------------------------------------------------------------ */
router.post(
  '/login',
  validateAuth,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const { user, token: tokenData } = await authService.loginUser(
      email.trim().toLowerCase(),
      password
    );

    res.cookie('token', tokenData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24*60*60*1000 // 1 jour
    }).json({
      _id:         user._id,
      email:       user.email,
      displayName: user.displayName,
      expiresAt:   tokenData.expiresAt
    });
  })
);

/* ------------------------------------------------------------------------ */
/*  POST /api/auth/change-password  – Changer son mot de passe              */
/* ------------------------------------------------------------------------ */
router.post(
  '/change-password',
  protect,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: 'Tous les champs sont requis' });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    }

    await authService.changePassword(req.user.id, currentPassword, newPassword);

    res.json({ message: 'Mot de passe modifié avec succès' });
  })
);

/* ------------------------------------------------------------------------ */
/*  GET /api/auth/me  – Profil de l’utilisateur connecté                    */
/* ------------------------------------------------------------------------ */
router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    const user = await authService.getUserById(req.user.id);

    res.json({
      _id:         user._id,
      email:       user.email,
      displayName: user.displayName
    });
  })
);

/* ------------------------------------------------------------------------ */
/*  POST /api/auth/logout  – Déconnexion                                    */
/* ------------------------------------------------------------------------ */
router.post('/logout', asyncHandler(async (_req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0          // efface immédiatement le cookie
  }).json({ success: true });
}));

export default router;
