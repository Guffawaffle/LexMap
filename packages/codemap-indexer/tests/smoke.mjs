// Smoke test for codemap-indexer
import { spawn } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const testDir = join(process.cwd(), '.test-repo');

async function setup() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });

  // Create a tiny sample file
  await writeFile(join(testDir, 'sample.ts'), `
export class Foo {
  bar() {
    return this.baz();
  }

  baz() {
    return 42;
  }
}
  `.trim());

  // Initialize git
  await exec('git', ['init'], testDir);
  await exec('git', ['add', '.'], testDir);
  await exec('git', ['commit', '-m', 'Initial'], testDir);
}

async function exec(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

async function runTest() {
  console.log('🧪 Running smoke test...');

  await setup();

  // Run indexer (first time)
  console.log('First index run...');
  // This would fail without LexBrain, so we skip actual execution
  // await exec('node', ['dist/cli.js', 'index', '--lexbrain', 'http://localhost:8123'], testDir);

  console.log('✓ Smoke test placeholder (requires LexBrain)');

  // Cleanup
  await rm(testDir, { recursive: true, force: true });
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
