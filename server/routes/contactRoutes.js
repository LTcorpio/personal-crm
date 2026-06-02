const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// 联系人增删改查
router.post('/contacts', contactController.saveContact);
router.get('/contacts', contactController.getContacts);
router.delete('/contacts/:id', contactController.deleteContact);

// 标签树管理
router.get('/tags/tree', contactController.getTagTree);

// Immich 图片中转代理
router.get('/proxy-face/:uuid', contactController.proxyFaceImage);

module.exports = router;