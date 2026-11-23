const router = require('express').Router();
const { login, me, logout, setLanguage } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.patch('/language', authenticate, setLanguage);

module.exports = router;
