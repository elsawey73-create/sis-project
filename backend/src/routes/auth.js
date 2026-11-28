const router = require('express').Router();
const { login, refresh, me, logout, setLanguage, forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/change-password', authenticate, changePassword);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.patch('/language', authenticate, setLanguage);

module.exports = router;
