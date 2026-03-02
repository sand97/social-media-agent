#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Path to the problematic generated file
const filePath = path.join(
  __dirname,
  '..',
  'src',
  'generated',
  'backend-client',
  'client',
  'client.gen.ts',
);

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Remove all @ts-expect-error comments
content = content.replace(/\s*\/\/\s*@ts-expect-error\s*\n/g, '\n');

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Cleaned up @ts-expect-error from generated client');
