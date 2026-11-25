const { onRequest } = require('firebase-functions/v2/https');
exports.api = onRequest({ region: 'us-central1', invoker: 'public' }, require('./handler'));
