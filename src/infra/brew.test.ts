import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveBrewExecutable, resolveBrewPathDirs } from "./brew.js";

describe("brew helpers", () => {
  it("resolves brew from ~/.linuxbrew/bin when executable exists", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-brew-"));
    try {
      const homebrewBin = path.join(tmp, ".linuxbrew", "bin");
      await fs.mkdir(homebrewBin, { recursive: true });
      const brewPath = path.join(homebrewBin, "brew");
      await fs.writeFile(brewPath, "#!/bin/sh\necho ok\n", "utf-8");
      await fs.chmod(brewPath, 0o755);

      const env: NodeJS.ProcessEnv = {};
      expect(resolveBrewExecutable({ homeDir: tmp, env })).toBe(brewPath);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("prefers homeDir Linuxbrew over shared /home/linuxbrew", () => {
    const homeDir = "/tmp/clawdbot-home";
    const homeBrew = path.join(homeDir, ".linuxbrew", "bin", "brew");
    const sharedBrew = "/home/linuxbrew/.linuxbrew/bin/brew";

    const accessSyncMock = vi
      .spyOn(fsSync, "accessSync")
      .mockImplementation((candidate, mode) => {
        if (mode !== fsSync.constants.X_OK) {
          throw new Error(`unexpected mode: ${String(mode)}`);
        }
        const value = String(candidate);
        if (value === homeBrew || value === sharedBrew) return;
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

    try {
      expect(resolveBrewExecutable({ homeDir, env: {} })).toBe(homeBrew);
    } finally {
      accessSyncMock.mockRestore();
    }
  });

  it("prefers HOMEBREW_PREFIX/bin/brew when present", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-brew-"));
    try {
      const prefix = path.join(tmp, "prefix");
      const prefixBin = path.join(prefix, "bin");
      await fs.mkdir(prefixBin, { recursive: true });
      const prefixBrew = path.join(prefixBin, "brew");
      await fs.writeFile(prefixBrew, "#!/bin/sh\necho ok\n", "utf-8");
      await fs.chmod(prefixBrew, 0o755);

      const homebrewBin = path.join(tmp, ".linuxbrew", "bin");
      await fs.mkdir(homebrewBin, { recursive: true });
      const homebrewBrew = path.join(homebrewBin, "brew");
      await fs.writeFile(homebrewBrew, "#!/bin/sh\necho ok\n", "utf-8");
      await fs.chmod(homebrewBrew, 0o755);

      const env: NodeJS.ProcessEnv = { HOMEBREW_PREFIX: prefix };
      expect(resolveBrewExecutable({ homeDir: tmp, env })).toBe(prefixBrew);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("includes Linuxbrew bin/sbin in path candidates", () => {
    const env: NodeJS.ProcessEnv = { HOMEBREW_PREFIX: "/custom/prefix" };
    const dirs = resolveBrewPathDirs({ homeDir: "/home/test", env });
    expect(dirs).toContain("/custom/prefix/bin");
    expect(dirs).toContain("/custom/prefix/sbin");
    expect(dirs).toContain("/home/linuxbrew/.linuxbrew/bin");
    expect(dirs).toContain("/home/linuxbrew/.linuxbrew/sbin");
    expect(dirs).toContain("/home/test/.linuxbrew/bin");
    expect(dirs).toContain("/home/test/.linuxbrew/sbin");

    expect(dirs.indexOf("/home/test/.linuxbrew/bin")).toBeLessThan(
      dirs.indexOf("/home/linuxbrew/.linuxbrew/bin"),
    );
    expect(dirs.indexOf("/home/test/.linuxbrew/sbin")).toBeLessThan(
      dirs.indexOf("/home/linuxbrew/.linuxbrew/sbin"),
    );
  });
});
