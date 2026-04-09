const express = require('express');
const router = express.Router();
const { authenticate, requireOwner } = require('../middleware/auth');
const {
  generateCode,
  getCodes,
  getUsers,
  suspendUser,
  extendUser,
} = require('../controllers/ownerController');

router.use(authenticate, requireOwner);

router.post('/generate-code', generateCode);
router.get('/registration-codes', getCodes);
router.get('/users', getUsers);
router.put('/users/:id/suspend', suspendUser);
router.put('/users/:id/extend', extendUser);

module.exports = router;
