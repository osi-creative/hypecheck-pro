const express = require('express');
const router = express.Router();
const { sync } = require('../controllers/syncController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, sync);

module.exports = router;
