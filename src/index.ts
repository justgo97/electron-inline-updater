import path from "path";
import fs from "fs";
import assert from "assert";
import gh from "github-url-to-object";
import ms from "ms";
import semver from "semver";

import electron, { MessageBoxOptions } from "electron";

interface IAsset {
  name: string;
  browser_download_url: string;
}

interface IRelease {
  draft: number;
  prerelease: number;
  tag_name: string;
  assets: IAsset[];
  body: string;
}

interface IUpdateElectronAppOptions {
  /**
   * @param {String} user A GitHub user account identifier.
   */
  user?: string;

  /**
   * @param {String} repo A GitHub repository identifier.
   */
  repo?: string;

  /**
   * @param {String} updateInterval How frequently to check for updates. Defaults to `10 minutes`.
   *                                Minimum allowed interval is `5 minutes`.
   */
  updateInterval?: string;

  /**
   * @param {Boolean} notifyBeforeApply Defaults to `true`.  When enabled the user will be
   *                             prompted to apply the update immediately after download.
   */
  notifyBeforeApply?: boolean;

  /**
   * @param {Boolean} notifyBeforeDownload Defaults to `true`.  When enabled the user will be
   *                             prompted to whether start downloading the update or not.
   */
  notifyBeforeDownload?: boolean;
}

const supportedPlatforms = ["darwin", "win32"];

class InlineUpdaterClass {
  hasLatestVersion = true;
  fetchedVersion: string = "0.0.0";
  pauseUpdates: boolean = false;
  releaseNotes: string = "";
  private downloadUrl: string = "";
  setupComplete: boolean = false;
  isPromptOn = false;
  isDownloading = false;

  options: IUpdateElectronAppOptions = {
    updateInterval: "10 minutes",
    notifyBeforeApply: true,
    notifyBeforeDownload: true,
  };

  electronInstance!: typeof electron;

  constructor(
    opts?: IUpdateElectronAppOptions,
    electronOpts?: typeof electron
  ) {
    if (opts) {
      this.options = { ...opts };
    }

    if (electronOpts) {
      this.electronInstance = electronOpts;
    } else {
      this.electronInstance = electron;
    }
  }

  setup(opts?: IUpdateElectronAppOptions) {
    if (this.setupComplete) {
      throw new Error("inlineUpdater: Can't call the setup method twice.");
    }

    this.setupComplete = true;

    const electronApp = this.electronInstance.app;

    if (electronApp.isReady()) this.onAppReady(opts);
    else electronApp.on("ready", () => this.onAppReady(opts));
  }

  private onAppReady(opts?: IUpdateElectronAppOptions) {
    this.validateInput(opts);

    const electronApp = this.electronInstance.app;

    // don't attempt to update during development
    if (!electronApp.isPackaged) {
      const message =
        "electron-inline-updater config looks good; aborting updates since app is in development mode";
      console.log(message);
      return false;
    }

    // exit early on unsupported platforms, e.g. `linux`
    if (!supportedPlatforms.includes(process?.platform)) {
      console.log(`electron-inline-updater only supports windows platform.`);
      return false;
    }

    this.initUpdater();
  }

  private validateInput(opts: IUpdateElectronAppOptions | undefined) {
    if (opts?.repo && opts?.user) {
      this.options.repo = opts?.repo;
      this.options.user = opts?.user;
    } else {
      const pgkRepo = this.guessRepo(this.electronInstance.app.getAppPath());
      this.options.repo = pgkRepo.repo;
      this.options.user = pgkRepo.user;
    }

    this.options.updateInterval =
      opts?.updateInterval ?? this.options.updateInterval;
    this.options.notifyBeforeApply =
      opts?.notifyBeforeApply ?? this.options.notifyBeforeApply;
    this.options.notifyBeforeDownload =
      opts?.notifyBeforeDownload ?? this.options.notifyBeforeDownload;

    assert(this.options.user, "user is required");

    assert(this.options.repo, "repo is required");

    assert(
      typeof this.options.updateInterval === "string" &&
        this.options.updateInterval.match(/^\d+/),
      "updateInterval must be a human-friendly string interval like `20 minutes`"
    );

    assert(
      ms(this.options.updateInterval) >= 5 * 60 * 1000,
      "updateInterval must be `5 minutes` or more"
    );
  }

  private guessRepo(appPath: string) {
    const pkgBuf = fs.readFileSync(path.join(appPath, "package.json"));

    const pkg = JSON.parse(pkgBuf.toString());
    const repoString = pkg.repository?.url || pkg.repository;
    const repoObject = gh(repoString);

    assert(
      repoObject,
      "repo not found. Add repository string to your app's package.json file"
    );
    return { user: repoObject.user, repo: repoObject.repo };
  }

  private initUpdater() {
    const electronUpdater = this.electronInstance.autoUpdater;

    this.checkForUpdates();
    setInterval(() => {
      this.checkForUpdates();
    }, ms(this.options.updateInterval!));

    electronUpdater.on("update-available", () => {
      console.log("update-available; downloading...");
      this.isDownloading = true;
    });

    electronUpdater.on("update-downloaded", this.onUpdateDownloaded);

    return true;
  }

  async checkForUpdates() {
    if (this.isDownloading) return;

    const electronUpdater = this.electronInstance.autoUpdater;

    if (this.pauseUpdates) return false;

    this.hasLatestVersion = await this.checkVersionDelta();

    if (this.hasLatestVersion) {
      console.log(`App has the lastest version(${this.fetchedVersion})`);
      return false;
    }

    console.log("UpdateUrl: ", this.downloadUrl);
    electronUpdater.setFeedURL({ url: this.downloadUrl });

    if (this.options.notifyBeforeDownload) {
      this.promptDownload();
    } else {
      electronUpdater.checkForUpdates();
    }

    return true;
  }

  private async checkVersionDelta() {
    const electronApp = this.electronInstance.app;

    this.downloadUrl = await this.fetchDownloadUrl();

    if (!this.downloadUrl) {
      // We couldn't fetch the download url for some reason, just treat this case as if we have the latest version
      return true;
    }

    return semver.gte(electronApp.getVersion(), this.fetchedVersion);
  }

  private async fetchDownloadUrl() {
    const apiUrl = `https://api.github.com/repos/${this.options.user}/${this.options.repo}/releases?per_page=100`;
    const headers = { Accept: "application/vnd.github.preview" };

    try {
      const response = await fetch(apiUrl, { headers });
      if (!response.ok) {
        throw new Error(
          `GitHub API returned ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      const releases: IRelease[] = Array.isArray(data) ? data : [data];

      for (const release of releases) {
        if (
          !semver.valid(release.tag_name) ||
          release.draft ||
          release.prerelease
        ) {
          continue;
        }

        if (this.isAssetAvailable(release.assets)) {
          this.fetchedVersion = release.tag_name;
          console.log("Latest release online: ", release.tag_name);
          this.releaseNotes = release.body;
          return `https://github.com/${this.options.user}/${this.options.repo}/releases/download/${release.tag_name}`;
        }
      }
    } catch (error: any) {
      console.error(
        "Error fetching [apiUrl] ",
        apiUrl,
        " latest release:",
        error.message
      );
      throw new Error("Failed to fetch release information");
    }

    return "";
  }

  private isAssetAvailable(assets: IAsset[]) {
    if (process.platform.includes("win32")) {
      return assets.some((asset) => asset.name.endsWith(".nupkg"));
    }
    if (process.platform.includes("darwin")) {
      return assets.some((asset) => asset.name.includes("darwin"));
    }
    return false;
  }

  private promptDownload() {
    if (this.isPromptOn) return;

    const electronUpdater = this.electronInstance.autoUpdater;

    const dialogOpts: MessageBoxOptions = {
      type: "info",
      buttons: ["Download update", "Later"],
      title: "Application Update",
      message: this.fetchedVersion,
      detail: `A new version have been released.\n\n${this.releaseNotes}\n`,
    };

    this.isPromptOn = true;

    this.electronInstance.dialog
      .showMessageBox(dialogOpts)
      .then(({ response }) => {
        this.isPromptOn = false;
        if (response === 0) {
          electronUpdater.checkForUpdates();
        } else {
          this.pauseUpdates = true;
        }
      });
  }

  private onUpdateDownloaded = (
    event: Electron.Event,
    releaseNotes: string,
    releaseName: string,
    releaseDate: Date,
    updateURL: string
  ) => {
    if (!this.options.notifyBeforeApply) return;

    console.log("update-downloaded", [
      event,
      releaseNotes,
      releaseName,
      releaseDate,
      updateURL,
    ]);

    const dialogOpts: MessageBoxOptions = {
      type: "info",
      buttons: ["Restart", "Later"],
      title: "Application Update",
      message: process.platform === "win32" ? releaseNotes : releaseName,
      detail:
        "A new version has been downloaded. Restart the application to apply the updates.",
    };

    this.electronInstance.dialog
      .showMessageBox(dialogOpts)
      .then(({ response }) => {
        if (response === 0) this.electronInstance.autoUpdater.quitAndInstall();
      });
  };

  getInstance(
    options?: IUpdateElectronAppOptions,
    electronOpts?: typeof electron
  ): InlineUpdaterClass {
    if (electronOpts) {
      this.electronInstance = electronOpts;
    }

    if (!this.setupComplete) {
      this.setup(this.options);
    } else {
      this.validateInput(options);
    }

    return this;
  }

  static createInstance(
    options?: IUpdateElectronAppOptions,
    electronOpts?: typeof electron
  ): (
    options?: IUpdateElectronAppOptions,
    electronOpts?: typeof electron
  ) => InlineUpdaterClass {
    const newClass = new InlineUpdaterClass(options, electronOpts);
    return newClass.getInstance.bind(newClass);
  }
}

const inlineUpdater = InlineUpdaterClass.createInstance();

export { inlineUpdater };
