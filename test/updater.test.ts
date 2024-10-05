import { inlineUpdater } from "../src/index";
import os, { tmpdir } from "os";
import fs from "fs";
import path from "path";

const electron = {
  app: {
    getVersion: () => {
      return "0.0.1";
    },
    isReady: () => true,
    on: (eventName: any) => {},
    getAppPath: () => {
      return os.tmpdir();
    },
    isPackaged: true,
  },
  autoUpdater: {
    checkForUpdates: () => {},
    on: (eventName: any) => {},
    setFeedURL: (data: { url: string }) => {},
  },
  dialog: {
    showMessageBox: () => {
      return Promise.resolve({ response: 0 });
    },
  },
};

test("exports a function", () => {
  expect(typeof inlineUpdater).toBe("function");
});

describe("repository", () => {
  fs.writeFileSync(path.join(tmpdir(), "package.json"), JSON.stringify({}));

  test("is required", () => {
    expect(() => {
      inlineUpdater({}, electron as any);
    }).toThrow(
      "repo not found. Add repository string to your app's package.json file"
    );
  });

  test("from opts", () => {
    inlineUpdater({ repo: "bar", user: "foo" });
  });

  test("from package.json", () => {
    fs.writeFileSync(
      path.join(tmpdir(), "package.json"),
      JSON.stringify({ repository: "foo/bar" })
    );
    inlineUpdater({});
  });
});

describe("updateInterval", () => {
  test("must be 5 minutes or more", () => {
    expect(() => {
      inlineUpdater({ updateInterval: "20 seconds" });
    }).toThrow("updateInterval must be `5 minutes` or more");
  });

  test("must be a string", () => {
    expect(() => {
      inlineUpdater({ updateInterval: 3000 as any });
    }).toThrow(
      "updateInterval must be a human-friendly string interval like `20 minutes`"
    );
  });
});

describe("Check fetching download url", () => {
  test("must return the expected url", (done) => {
    // Mock setFeedURL to capture the URL and assert it
    electron.autoUpdater.setFeedURL = (data: { url: string }) => {
      try {
        expect(data.url).toContain(
          "https://github.com/justgo97/electron-update-test/releases/download/" // Replace with the correct expected URL
        );
        done(); // Signal that the test is complete
      } catch (error) {
        done(error); // Pass the error to fail the test
      }
    };

    // Manually trigger the updater's check for updates
    inlineUpdater(
      {
        user: "justgo97",
        repo: "electron-update-test",
        updateInterval: "5 minutes",
      },
      electron as any
    ).checkForUpdates();
  }, 200000);
});
