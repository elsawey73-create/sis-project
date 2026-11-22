const router = require('express').Router();
const { register, login, me, setLanguage } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);
router.patch('/language', authenticate, setLanguage);

module.exports = router;
