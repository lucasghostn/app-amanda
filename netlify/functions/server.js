const serverless = require('serverless-http');
const path = require('path');

// Load the Netlify-specific Express app. This file imports server/index.netlify.js
const serverModule = require(path.resolve(__dirname, '../../server/index.netlify.js'));
const app = serverModule.app;
const ensureTables = serverModule.ensureTables;

const handler = serverless(app);

module.exports.handler = async (event, context) => {
  // Ensure DB tables exist on cold start / invocation
  try {
    await ensureTables();
  } catch (e) {
    console.error('ensureTables failed in serverless wrapper', e);
    // continue - queries will fail later if DB not available
  }
  return handler(event, context);
};
