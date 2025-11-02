import { simpleGit, SimpleGit } from 'simple-git';
import { readFile } from 'fs/promises';

export interface FileInfo {
  path: string;
  blobSha: string;
}

export interface GitInfo {
  head: string;
  files: FileInfo[];
}

let git: SimpleGit;

export async function initGit(baseDir: string): Promise<void> {
  git = simpleGit(baseDir);
}

export async function getHeadCommit(): Promise<string> {
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash || 'unknown';
}

export async function getTrackedFiles(): Promise<FileInfo[]> {
  const output = await git.raw(['ls-files', '-s']);
  const lines = output.trim().split('\n').filter(Boolean);

  return lines.map(line => {
    const parts = line.split(/\s+/);
    // Format: mode hash stage path
    return {
      blobSha: parts[1],
      path: parts[3]
    };
  });
}

export async function getChangedFilesSince(baseCommit?: string): Promise<string[]> {
  if (!baseCommit) {
    // No base, return all tracked files
    const files = await getTrackedFiles();
    return files.map(f => f.path);
  }

  const diff = await git.diff(['--name-only', baseCommit, 'HEAD']);
  return diff.trim().split('\n').filter(Boolean);
}

export async function getGitInfo(): Promise<GitInfo> {
  const head = await getHeadCommit();
  const files = await getTrackedFiles();

  return { head, files };
}
