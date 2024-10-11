import { inlineUpdater } from "../src/index";
import os, { tmpdir } from "os";
import fs from "fs";
import path from "path";
import fetchMock from "jest-fetch-mock";

const electron = {
  app: {
    getVersion: () => "0.0.1",
    isReady: () => true,
    on: (eventName: any) => {},
    getAppPath: () => os.tmpdir(),
    isPackaged: true,
  },
  autoUpdater: {
    checkForUpdates: () => {},
    on: (eventName: any) => {},
    setFeedURL: (data: { url: string }) => {},
  },
  dialog: {
    showMessageBox: () => Promise.resolve({ response: 0 }),
  },
};

test("exports a function", () => {
  expect(typeof inlineUpdater).toBe("function");
});

describe("repository", () => {
  // Ensure package.json is empty initially
  fs.writeFileSync(path.join(tmpdir(), "package.json"), JSON.stringify({}));

  test("is required", () => {
    expect(() => {
      const updater = inlineUpdater({ checkOnStart: false }, electron as any);
      updater.setUpdateTimer(false);
    }).toThrow(
      "repo not found. Add repository string to your app's package.json file"
    );
  });

  test("from opts", () => {
    const updater = inlineUpdater({
      repo: "bar",
      user: "foo",
      checkOnStart: false,
    });
    updater.setUpdateTimer(false);
  });

  test("from package.json", () => {
    fs.writeFileSync(
      path.join(tmpdir(), "package.json"),
      JSON.stringify({ repository: "foo/bar" })
    );
    const updater = inlineUpdater({ checkOnStart: false });
    updater.setUpdateTimer(false);
  });
});

describe("updateInterval", () => {
  test("Correct default interval value", () => {
    const updater = inlineUpdater(
      { repo: "bar", user: "foo", checkOnStart: false },
      electron as any
    );
    updater.setUpdateTimer(false);
    expect(updater.options.updateInterval).toBe("10 minutes");
  });

  test("must be 5 minutes or more", () => {
    expect(() => {
      const updater = inlineUpdater({
        updateInterval: "20 seconds",
        checkOnStart: false,
      });
      updater.setUpdateTimer(false);
    }).toThrow("updateInterval must be `5 minutes` or more");
  });

  test("must be a string", () => {
    expect(() => {
      const updater = inlineUpdater({
        updateInterval: 3000 as any,
        checkOnStart: false,
      });
      updater.setUpdateTimer(false);
    }).toThrow(
      "updateInterval must be a human-friendly string interval like `20 minutes`"
    );
  });
});

// Enable fetch mocks
beforeAll(() => {
  fetchMock.enableMocks();
});

describe("Check fetching download url", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test("must return the expected url", (done) => {
    // Mock the fetch API call with the expected release structure
    fetchMock.mockResponseOnce(
      JSON.stringify([
        {
          tag_name: "v1.0.0",
          draft: false,
          prerelease: false,
          assets: [
            {
              name: "file.nupkg",
              browser_download_url:
                "https://github.com/justgo97/electron-update-test/releases/download/v1.0.0/file.nupkg",
            },
          ],
          body: "Release notes for v1.0.0",
        },
      ])
    );

    // Mock setFeedURL to capture the URL and assert it
    electron.autoUpdater.setFeedURL = (data: { url: string }) => {
      try {
        expect(data.url).toContain(
          "https://github.com/justgo97/electron-update-test/releases/download/v1.0.0"
        );
        done(); // Signal that the test is complete
      } catch (error) {
        done(error); // Pass the error to fail the test
      }
    };

    const updater = inlineUpdater(
      {
        user: "justgo97",
        repo: "electron-update-test",
        updateInterval: "5 minutes",
        checkOnStart: false,
      },
      electron as any
    );

    updater.setUpdateTimer(false);
    updater.checkForUpdates();
  });
});
