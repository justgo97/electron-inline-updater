# electron-inline-updater

[![build](https://github.com/justgo97/electron-inline-updater/actions/workflows/release_package.yml/badge.svg)](https://github.com/justgo97/electron-inline-updater/actions) [![img](https://img.shields.io/npm/v/electron-inline-updater.svg)](https://www.npmjs.com/package/electron-inline-updater) [![img](https://img.shields.io/npm/dt/electron-inline-updater.svg)](https://www.npmjs.com/package/electron-inline-updater) [![img](https://img.shields.io/npm/l/electron-inline-updater.svg)](https://github.com/justgo97/electron-inline-updater/blob/main/LICENSE)

A module that allows electron Apps to fetch updates from a Github backend without needing an external server.

## Installation

To install the package, you can use npm:

```bash
npm install electron-inline-updater
```

If you are having issues with bundling your app with vite then you might need to install the package as a dev dependency

```bash
npm install -D electron-inline-updater
```

## Usage

Here's an example of how to use the `electron-inline-updater` package:

```ts
import { inlineUpdater } from "electron-inline-updater";
inlineUpdater();
```

You can also specify custom options:

```ts
import { inlineUpdater } from "electron-inline-updater";
inlineUpdater({
  user: "your-github-username",
  repo: "your-repo-name",
  updateInterval: "15 minutes",
  notifyBeforeApply: true,
  notifyBeforeDownload: true,
  displayChangelog: true,
});
```

You can also specify custom options:

# License

[MIT](LICENSE)
