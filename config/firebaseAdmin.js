const admin = require('firebase-admin');
const serverAccount = require('../ladylog-242a4-firebase-adminsdk-c5z8e-6617c9a69c.json');

admin.initializeApp({
    credential: admin.credential.cert(serverAccount)
});

module.exports = admin;