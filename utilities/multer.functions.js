let multer = require("multer");
let memoryStorage = multer.memoryStorage();
let upload = multer({ storage: memoryStorage });
module.exports = upload;