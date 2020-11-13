/*
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Helper to delete old versions of a deployed App Engine project.
 *
 * Fundamentally, this farms out to the `gcloud` command via "child_process".
 */

const keepMinimumDefault = 20;
const keepDailyAmountDefault = 7;
const deleteAtMost = 4; // deleting is slow

const childProcess = require('child_process');
const prettyMs = require('pretty-ms');

/**
 * Retrieve parsed information for all deployed versions.
 *
 * @param {PurgeOptions} options
 * @return {!Array<!Object>}
 */
function fetchVersions(options) {
  const {project, service} = options;
  const {status, stdout} = childProcess.spawnSync(
    'gcloud',
    ['app', '--project', project, 'versions', 'list', '--service', service, '--format="json"'],
    {
      input: '',
      timeout: 20 * 1000,
    },
  );
  if (status !== 0) {
    throw new Error(`could not list versions: ${status}`);
  }
  return JSON.parse(stdout);
}

/**
 * Deletes a number of versions from a project.
 *
 * @param {PurgeOptions} options
 * @param {!Array<string>} versions which must be previously returned and cannot start with "-"
 * @return {number}
 */
function deleteVersions(options, versions) {
  const {log, project, service} = options;
  versions.forEach((version) => {
    if (
      typeof version !== 'string' ||
      version.startsWith('-') ||
      version.includes('\\')
    ) {
      // Check for some possibly badly formatted names, including -, prevent flags from being set.
      throw new Error(`bad version: ${version}`);
    }
  });

  // Deleting versions is slow, so do a chunk at a time.
  let done = 0;
  versions = versions.slice();
  while (versions.length) {
    const next = versions.splice(0, deleteAtMost);
    log(`Enacting deletion for versions: ${next.join(' ')}`);

    const {status, stdout, stderr} = childProcess.spawnSync(
      'gcloud',
      [
        'app',
        '--project',
        project,
        'versions',
        'delete',
        ...next,
        '--service',
        service,
        '--format="json"',
      ],
      {
        input: '',
        timeout: 60 * 1000,
      },
    );
    process.stderr.write(stderr);
    if (status !== 0) {
      log(`Could not delete versions: ${status}`);
      break;
    }
    done += next.length;
    console.info(JSON.parse(stdout));
  }
  return done;
}

/**
 * Purges old versions for the passed project.
 *
 * @param {PurgeOptions} options
 * @return {number}
 */
function purgeOldVersionsFor(options) {
  const now = new Date();

  options = Object.assign({
    service: 'default',
    log: (s) => console.info(s),
  }, options);

  const {log, project, service} = options;

  let candidates = [];
  const versions = fetchVersions(project);

  for (const v of versions) {
    if (
      v.project !== project ||
      v.service !== service ||
      v.traffic_split !== 0.0
    ) {
      // Filter unexpected results or anything serving traffic.
      continue;
    }

    // Parse Date so we can easily sort.
    const lastDeployed = new Date(v.last_deployed_time.datetime);
    candidates.push({
      id: v.id,
      usage: parseInt(v.version.diskUsageBytes) || 0,
      lastDeployed,
    });
  }

  // Place most recent versions first.
  candidates.sort(({lastDeployed: a}, {lastDeployed: b}) => b - a);

  const {
    keepDailyAmount = keepDailyAmountDefault,
    keepMinimum = keepMinimumDefault,
  } = options;

  // Keep the most recent version for the last `keepDailyAmount` days.
  const versionsForDays = new Map();
  for (let i = 0; i < keepDailyAmount; ++i) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    versionsForDays.set(d.toISOString().substr(0, 10), null);
  }

  // Keep the most recent `keepMinimum` versions.
  const keptRecentVersions = [];

  candidates = candidates.filter(({id, lastDeployed}) => {
    const since = +now - +lastDeployed;
    const deployedString = `deployed ${prettyMs(since)} ago`;

    const key = lastDeployed.toISOString().substr(0, 10);
    if (versionsForDays.has(key) && versionsForDays.get(key) === null) {
      log(`Keeping for ${key}: ${id} (${deployedString})`);
      versionsForDays.set(key, id);
      return false; // safe from deletion
    }

    if (keptRecentVersions.length < keepMinimum) {
      log(`Keeping for recent ${keptRecentVersions.length + 1}: ${id} (${deployedString})`);
      keptRecentVersions.push(id);
      return false; // safe from deletion
    }

    log(`Deleting ${id} ${deployedString}`);
    return true;
  });

  const count = deleteVersions(
    project,
    candidates.map(({id}) => id),
    service,
  );

  // If deletions were requested but none completed, fail.
  if (candidates.length && count === 0) {
    throw new Error(`Deleted ${count} versions with error`);
  }
}

module.exports = purgeOldVersionsFor;
