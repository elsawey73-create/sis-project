const router = require('express').Router();
const { login, me, logout, setLanguage, forgotPassword, resetPassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.patch('/language', authenticate, setLanguage);

module.exports = router;
