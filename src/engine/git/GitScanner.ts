/**
 * Git Integration
 * Compare schema changes between commits
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { GraphEngine } from "../graph/GraphEngine.js";
import { Crawler } from "../scanner/Crawler.js";
import { SchemaDiffer, SchemaDiff } from "../diff/SchemaDiffer.js";

// Validate git ref/commit to prevent command injection
const GIT_REF_PATTERN = /^[a-zA-Z0-9._\-/~^@{}:]+$/;
function validateGitRef(ref: string): string {
  if (!GIT_REF_PATTERN.test(ref)) {
    throw new Error(`Invalid git reference: ${ref}`);
  }
  return ref;
}

// Safe git command execution using spawnSync with argument array
function safeGitCommand(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Git command failed with status ${result.status}`);
  }
  return result.stdout;
}

export interface GitComparisonResult {
  baseCommit: string;
  headCommit: string;
  diffs: SchemaDiff[];
  filesChanged: string[];
}

export class GitScanner {
  private readonly repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  /**
   * Get current git commit hash
   */
  getCurrentCommit(): string {
    try {
      return safeGitCommand(["rev-parse", "HEAD"], this.repoPath).trim();
    } catch {
      throw new Error("Not a git repository or git not available");
    }
  }

  /**
   * Get list of changed files between two commits
   */
  getChangedFiles(baseCommit: string, headCommit: string = "HEAD"): string[] {
    try {
      const validBase = validateGitRef(baseCommit);
      const validHead = validateGitRef(headCommit);
      const output = safeGitCommand(["diff", "--name-only", validBase, validHead], this.repoPath);

      return output
        .split("\n")
        .filter((f: string) => f.trim().length > 0)
        .filter((f: string) => this.isSchemaFile(f));
    } catch (error) {
      throw new Error(`Failed to get changed files: ${error}`);
    }
  }

  /**
   * Check if file is a schema file
   */
  private isSchemaFile(filePath: string): boolean {
    return (
      /\.(dto|schema|interface)\.ts$/i.test(filePath) ||
      /Dto\.ts$/i.test(filePath) ||
      /Schema\.ts$/i.test(filePath) ||
      /Interface\.ts$/i.test(filePath) ||
      /\.(openapi|swagger)\.(json|yaml|yml)$/i.test(filePath)
    );
  }

  /**
   * Get file content at specific commit
   */
  getFileAtCommit(filePath: string, commit: string): string | null {
    try {
      const validCommit = validateGitRef(commit);
      // filePath is used as part of git show syntax (commit:path), validate it doesn't have special chars
      if (filePath.includes("..") || filePath.startsWith("/")) {
        throw new Error("Invalid file path");
      }
      return safeGitCommand(["show", `${validCommit}:${filePath}`], this.repoPath);
    } catch {
      return null; // File didn't exist at that commit
    }
  }

  /**
   * Compare schemas between two commits
   */
  async compareCommits(
    baseCommit: string,
    headCommit: string = "HEAD"
  ): Promise<GitComparisonResult> {
    const filesChanged = this.getChangedFiles(baseCommit, headCommit);

    // Scan baseline
    const baseEngine = new GraphEngine(".dotto-baseline.json");
    const baseCrawler = new Crawler(baseEngine);
    await baseCrawler.crawl();
    const baseNodes = new Map(baseEngine.getAllNodes().map((n) => [n.id, n]));

    // Scan current
    const headEngine = new GraphEngine(".dotto-head.json");
    const headCrawler = new Crawler(headEngine);
    await headCrawler.crawl();
    const headNodes = new Map(headEngine.getAllNodes().map((n) => [n.id, n]));

    // Compute diffs
    const differ = new SchemaDiffer();
    const diffs = differ.diffMany(baseNodes, headNodes);

    // Cleanup temp files
    try {
      fs.unlinkSync(".dotto-baseline.json");
      fs.unlinkSync(".dotto-head.json");
    } catch {
      // Ignore cleanup errors
    }

    return {
      baseCommit,
      headCommit,
      diffs,
      filesChanged,
    };
  }

  /**
   * Compare current working directory against last commit
   */
  async scanUncommittedChanges(): Promise<GitComparisonResult> {
    const headCommit = this.getCurrentCommit();

    // Get changed files in working directory
    const filesChanged = this.getWorkingDirectoryChanges();

    if (filesChanged.length === 0) {
      return {
        baseCommit: headCommit,
        headCommit: "working-directory",
        diffs: [],
        filesChanged: [],
      };
    }

    // Stash current changes temporarily
    const hasStash = this.stashChanges();

    try {
      // Scan baseline (HEAD - committed version)
      const baseEngine = new GraphEngine(".dotto-baseline.json");
      const baseCrawler = new Crawler(baseEngine);
      await baseCrawler.crawl();
      const baseNodes = new Map(baseEngine.getAllNodes().map((n) => [n.id, n]));

      // Restore working directory changes
      if (hasStash) {
        this.unstashChanges();
      }

      // Scan current working directory
      const headEngine = new GraphEngine(".dotto-head.json");
      const headCrawler = new Crawler(headEngine);
      await headCrawler.crawl();
      const headNodes = new Map(headEngine.getAllNodes().map((n) => [n.id, n]));

      // Compute diffs
      const differ = new SchemaDiffer();
      const diffs = differ.diffMany(baseNodes, headNodes);

      // Cleanup temp files
      try {
        fs.unlinkSync(".dotto-baseline.json");
        fs.unlinkSync(".dotto-head.json");
      } catch {
        // Ignore cleanup errors
      }

      return {
        baseCommit: headCommit,
        headCommit: "working-directory",
        diffs,
        filesChanged,
      };
    } catch (error) {
      // Make sure to restore stash on error
      if (hasStash) {
        this.unstashChanges();
      }
      throw error;
    }
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string {
    try {
      return safeGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], this.repoPath).trim();
    } catch {
      return "HEAD";
    }
  }

  /**
   * Get repository name from git remote
   */
  getRepositoryName(): string {
    try {
      const remote = safeGitCommand(["config", "--get", "remote.origin.url"], this.repoPath).trim();
      // Extract repo name from URL (e.g., git@github.com:user/repo.git -> user/repo)
      const match = remote.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
      return match ? match[1] : "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Stash current changes
   */
  private stashChanges(): boolean {
    try {
      spawnSync("git", ["stash", "push", "-u", "-m", "dotto-temp-scan"], {
        cwd: this.repoPath,
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Unstash changes
   */
  private unstashChanges(): void {
    try {
      spawnSync("git", ["stash", "pop"], { cwd: this.repoPath, stdio: "pipe" });
    } catch {
      console.warn("Warning: Failed to restore stashed changes");
    }
  }

  /**
   * Get files changed in working directory (uncommitted)
   */
  private getWorkingDirectoryChanges(): string[] {
    try {
      const output = safeGitCommand(["diff", "--name-only", "HEAD"], this.repoPath);

      return output
        .split("\n")
        .filter((f: string) => f.trim().length > 0)
        .filter((f: string) => this.isSchemaFile(f));
    } catch {
      return [];
    }
  }

  /**
   * Get commit message
   */
  getCommitMessage(commit: string): string {
    try {
      const validCommit = validateGitRef(commit);
      return safeGitCommand(["log", "-1", "--pretty=%B", validCommit], this.repoPath).trim();
    } catch {
      return "";
    }
  }

  /**
   * Get commit author
   */
  getCommitAuthor(commit: string): string {
    try {
      const validCommit = validateGitRef(commit);
      return safeGitCommand(["log", "-1", "--pretty=%an", validCommit], this.repoPath).trim();
    } catch {
      return "";
    }
  }

  /**
   * Check if working directory is clean
   */
  isWorkingDirectoryClean(): boolean {
    try {
      const status = safeGitCommand(["status", "--porcelain"], this.repoPath);
      return status.trim().length === 0;
    } catch {
      return false;
    }
  }
}
