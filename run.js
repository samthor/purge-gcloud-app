#!/usr/bin/env node

import purgeGcloudApp from './index.js';

if (process.argv.length !== 3) {
  console.warn(`usage: ${process.argv[1]} <project-id>`);
  process.exit(1);
}
const project = process.argv[2];

console.info('Deleting old versions for', project);

const deletedVersionCount = purgeGcloudApp({project});

console.info('Deleted', deletedVersionCount, 'versions');