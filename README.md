Helper to delete old versions of an App Engine project.
Install via [`purge-gcloud-app`](https://www.npmjs.com/package/purge-gcloud-app).

This just farms out to `gcloud` and will use whatever credentials are available in your environment.
Even though this task is fundamentally async, we block in Node until complete.
Wrap this in a tiny helper binary.

## Usage

```js
import purgeGcloudApp from 'purge-gcloud-app';

const deletedVersionCount = purgeGcloudApp({
  project: 'project-id', // required

  // All other parameters are optional, here are their defaults:
  service: 'default',
  keepMinimum: 20,            // keep the most recent <X> versions
  keepDailyAmountDefault: 7,  // keep one version for each of the past <X> days
  log: (s) => console.info(s),
});
```
