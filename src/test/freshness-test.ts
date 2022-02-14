import {suite} from 'uvu';
import * as assert from 'uvu/assert';
import {TestRig} from './util/test-rig.js';
import {timeout} from './util/uvu-timeout.js';

const test = suite<{rig: TestRig}>();

test.before.each(async (ctx) => {
  ctx.rig = new TestRig();
  await ctx.rig.setup();
});

test.after.each(async (ctx) => {
  await ctx.rig.cleanup();
});

test(
  '1 script: run, fresh, run, fresh',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['input.txt'],
          },
        },
        'input.txt': 'v1',
      },
    });

    // [1] Run the first time.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // [2] Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd.startedCount, 1);
    }

    // [3] Change the input files. Now we should run again.
    {
      await rig.writeFiles({'input.txt': 'v2'});
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 2);
    }

    // [4] Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd.startedCount, 2);
    }
  })
);

test(
  'cross-package freshness',
  timeout(async ({rig}) => {
    const cmd1 = rig.newCommand();
    const cmd2 = rig.newCommand();
    await rig.writeFiles({
      'pkg1/package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd1.command(),
            dependencies: ['../pkg2:cmd'],
            files: ['input.txt'],
          },
        },
      },
      'pkg2/package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd2.command(),
            files: ['input.txt'],
          },
        },
      },
      // Each package script has its own input file.
      'pkg1/input.txt': 'v0',
      'pkg2/input.txt': 'v0',
    });

    // Has to run the first time.
    {
      const process = rig.exec('npm run cmd', {cwd: 'pkg1'});
      await cmd2.waitUntilStarted();
      await cmd2.exit(0);
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await process.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 1);
    }

    // Still fresh.
    {
      const process = rig.exec('npm run cmd', {cwd: 'pkg1'});
      const {code} = await process.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 1);
    }

    // Change the input for pkg2. Both should re-run.
    {
      await rig.writeFiles({'pkg2/input.txt': 'v1'});
      const process = rig.exec('npm run cmd', {cwd: 'pkg1'});
      await cmd2.waitUntilStarted();
      await cmd2.exit(0);
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await process.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 2);
      assert.equal(cmd2.startedCount, 2);
    }

    // Change the input for pkg1. Only pkg1 should re-run.
    {
      await rig.writeFiles({'pkg1/input.txt': 'v1'});
      const process = rig.exec('npm run cmd', {cwd: 'pkg1'});
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await process.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 3);
      assert.equal(cmd2.startedCount, 2);
    }
  })
);

test(
  '2 scripts: run, fresh, run, fresh',
  timeout(async ({rig}) => {
    const cmd1 = rig.newCommand();
    const cmd2 = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd1: 'wireit',
          cmd2: 'wireit',
        },
        wireit: {
          cmd1: {
            command: cmd1.command(),
            files: [],
            dependencies: ['cmd2'],
          },
          cmd2: {
            command: cmd2.command(),
            files: ['cmd2.input.txt'],
          },
        },
      },
      'cmd2.input.txt': 'v1',
    });

    // [1] Run both the first time.
    {
      const out = rig.exec('npm run cmd1');
      await cmd2.waitUntilStarted();
      // cmd1 shouldn't start until cmd2 has finished
      await rig.sleep(50);
      assert.not(cmd1.running);
      await cmd2.exit(0);
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 1);
    }

    // [2] Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd1');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 1);
    }

    // [3] Change the input file. Now both should run again.
    {
      await rig.writeFiles({
        'cmd2.input.txt': 'v2',
      });
      const out = rig.exec('npm run cmd1');
      await cmd2.waitUntilStarted();
      // cmd1 shouldn't start until cmd2 has finished
      await rig.sleep(50);
      assert.not(cmd1.running);
      await cmd2.exit(0);

      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 2);
      assert.equal(cmd2.startedCount, 2);
    }

    // [4] Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd1');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd1.startedCount, 2);
      assert.equal(cmd2.startedCount, 2);
    }
  })
);

test(
  '2 scripts: run, fresh, run, fresh',
  timeout(async ({rig}) => {
    const cmd1 = rig.newCommand();
    const cmd2 = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd1: 'wireit',
          cmd2: 'wireit',
        },
        wireit: {
          cmd1: {
            command: cmd1.command(),
            files: [],
            dependencies: ['cmd2'],
          },
          cmd2: {
            command: cmd2.command(),
            files: ['cmd2.input.txt'],
          },
        },
      },
      'cmd2.input.txt': 'v1',
    });

    // [1] Run both the first time.
    {
      const out = rig.exec('npm run cmd1');
      await cmd2.waitUntilStarted();
      // cmd1 shouldn't start until cmd2 has finished
      await rig.sleep(50);
      assert.not(cmd1.running);
      await cmd2.exit(0);
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 1);
    }

    // [2] Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd1');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 1);
    }

    // [3] Change the input file and run cmd2.
    {
      await rig.writeFiles({
        'cmd2.input.txt': 'v2',
      });
      const out = rig.exec('npm run cmd2');
      await cmd2.waitUntilStarted();
      await cmd2.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
      assert.equal(cmd2.startedCount, 2);
    }

    // [4] Now run cmd1. It should run because cmd2 recently ran with different
    // inputs.
    {
      const out = rig.exec('npm run cmd1');
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 2);
      assert.equal(cmd2.startedCount, 2);
    }

    // [5] Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd1');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd1.startedCount, 2);
      assert.equal(cmd2.startedCount, 2);
    }
  })
);

test(
  'output globs affect freshness key',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['input.txt'],
          },
        },
        'input.txt': 'v1',
      },
    });

    // Run the first time with no output.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Change the output setting.
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['input.txt'],
            output: ['output1.txt'],
          },
        },
        'input.txt': 'v1',
      },
    });

    // Run again because the output globs changed.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 2);
    }

    // Change the output setting again.
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['input.txt'],
            output: ['output2.txt'],
          },
        },
        'input.txt': 'v1',
      },
    });

    // Run again because the output globs changed.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 3);
    }

    // Don't run because the input files haven't changed.
    {
      const out = rig.exec('npm run cmd');
      const {code} = await out.done;
      assert.equal(code, 0);
      await rig.sleep(50);
      assert.equal(cmd.startedCount, 3);
    }
  })
);

test(
  'package-lock changes invalidate freshness keys',
  timeout(async ({rig}) => {
    const cmd1 = rig.newCommand();
    const cmd2 = rig.newCommand();
    await rig.writeFiles({
      'foo/package.json': {
        scripts: {
          cmd1: 'wireit',
          cmd2: 'wireit',
        },
        wireit: {
          cmd1: {
            command: cmd1.command(),
            files: [],
          },
          cmd2: {
            command: cmd2.command(),
            checkPackageLocks: false,
            files: [],
          },
        },
      },
      'package-lock.json': 'v1',
      'foo/package-lock.json': 'v1',
    });

    // Command 1 and 2 always run the first time.

    {
      const out = rig.exec('npm run cmd1', {cwd: 'foo'});
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
    }

    {
      const out = rig.exec('npm run cmd2', {cwd: 'foo'});
      await cmd2.waitUntilStarted();
      await cmd2.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd2.startedCount, 1);
    }

    // Neither command 1 nor 2 run again because nothing has changed.

    {
      const out = rig.exec('npm run cmd1', {cwd: 'foo'});
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 1);
    }

    {
      const out = rig.exec('npm run cmd2', {cwd: 'foo'});
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd2.startedCount, 1);
    }

    // Change foo/package-lock.json. Command 1 should run because we respect
    // package-locks by default. Command 2 should not run because it has
    // checkPackageLocks:false configured.

    await rig.writeFiles({'foo/package-lock.json': 'v2'});

    {
      const out = rig.exec('npm run cmd1', {cwd: 'foo'});
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 2);
    }

    {
      const out = rig.exec('npm run cmd2', {cwd: 'foo'});
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd2.startedCount, 1);
    }

    // Change the parent package-lock.json. This should also invalidate command 1,
    // because we recursively check the package locks of all parent directories.

    await rig.writeFiles({'package-lock.json': 'v2'});

    {
      const out = rig.exec('npm run cmd1', {cwd: 'foo'});
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 3);
    }

    {
      const out = rig.exec('npm run cmd2', {cwd: 'foo'});
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd2.startedCount, 1);
    }
  })
);

test(
  'SIGINT cancelled script is not considered fresh',
  timeout(async ({rig}) => {
    const cmd1 = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd1: 'wireit',
        },
        wireit: {
          cmd1: {
            command: cmd1.command(),
            files: [],
          },
        },
      },
    });

    // The first run is cancelled before cmd1 gets a chance to finish.
    {
      const process = rig.exec('npm run cmd1');
      await cmd1.waitUntilStarted();
      const signal = cmd1.receivedSignal;
      process.kill('SIGINT');
      assert.equal(await signal, 'SIGINT');
      await cmd1.exit(1);
      const {code} = await process.done;
      assert.equal(code, 130);
      assert.equal(cmd1.startedCount, 1);
    }

    // On the second run, cmd1 should run again, because it didn't finish
    // before.
    {
      const process = rig.exec('npm run cmd1');
      await cmd1.waitUntilStarted();
      await cmd1.exit(0);
      const {code} = await process.done;
      assert.equal(code, 0);
      assert.equal(cmd1.startedCount, 2);
    }
  })
);

test(
  'SIGINT freshness',
  timeout(async ({rig}) => {
    const cmd1 = rig.newCommand();
    const cmd2 = rig.newCommand();
    const cmd3 = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd1: 'wireit',
          cmd2: 'wireit',
          cmd3: 'wireit',
        },
        wireit: {
          cmd1: {
            command: cmd1.command(),
            dependencies: ['cmd2', 'cmd3'],
            files: [],
          },
          cmd2: {
            command: cmd2.command(),
            files: [],
          },
          cmd3: {
            command: cmd3.command(),
            files: [],
          },
        },
      },
    });

    // First run.
    {
      const process = rig.exec('npm run cmd1');

      // cmd2 and cmd3 start concurrently
      await cmd2.waitUntilStarted();
      await cmd3.waitUntilStarted();

      // cmd2 finishes
      cmd2.exit(0);

      // TODO(aomarks) We need enough time to allow wireit to notice cmd2's exit
      // code and write the status.
      await rig.sleep(100);

      // wireit killed
      const signal3 = cmd3.receivedSignal;
      process.kill('SIGINT');

      // cmd3 receives signal and exits
      assert.equal(await signal3, 'SIGINT');
      await cmd3.exit(1);

      // wireit exits
      const {code} = await process.done;
      assert.equal(code, 130);

      // cmd1 should never have started, the other two started once each.
      assert.equal(cmd1.startedCount, 0);
      assert.equal(cmd2.startedCount, 1);
      assert.equal(cmd3.startedCount, 1);
    }

    // Second run
    {
      const process = rig.exec('npm run cmd1');

      // cmd2 already finished, so only cmd3 starts. It finishes successfully.
      await cmd3.waitUntilStarted();
      await cmd3.exit(0);

      // cmd1 starts and finishes successfully

      await cmd1.waitUntilStarted();
      await cmd1.exit(0);

      // wire it finishes
      const {code} = await process.done;
      assert.equal(code, 0);

      // cmd1 should have run once because it didn't start the first time
      assert.equal(cmd1.startedCount, 1);

      // cmd2 should have run once because it completed the first time
      assert.equal(cmd2.startedCount, 1);

      // cmd3 should have run twice because it was cancelled the first time
      assert.equal(cmd3.startedCount, 2);
    }
  })
);

test(
  'invalidate freshness on failure',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['input.txt'],
          },
        },
      },
      'input.txt': 'v0',
    });

    // Run 1 succeeds.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Modify the input file.
    await rig.writeFiles({
      'input.txt': 'v1',
    });

    // Run 2 fails.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(1);
      const {code} = await out.done;
      assert.equal(code, 1);
      assert.equal(cmd.startedCount, 2);
    }

    // Go back to the state of run 1.
    await rig.writeFiles({
      'input.txt': 'v0',
    });

    // Delete the cache, because otherwise in the next step the output will be
    // restored from cache instead of cmd starting again, which makes it
    // difficult to tell that we invalidated freshness correctly.
    // TODO(aomarks) Add a --nocache or similar flag instead.
    await rig.rmFile('.wireit/cache');

    // Even though we have the same state as run 1, and run 1 succeeded, this
    // script is not fresh, because there was a failed state inbetween, which
    // might have modified the output files.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 3);
    }
  })
);

test(
  'scripts with undefined input files cannot be fresh',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
          },
        },
      },
    });

    // Run 1 succeeds.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Delete the cache, because otherwise in the next step the output will be
    // restored from cache instead of cmd starting again, which makes it
    // difficult to tell that we invalidated freshness correctly.
    // TODO(aomarks) Add a --nocache or similar flag instead.
    await rig.rmFile('.wireit/cache');

    // Run 2 is not fresh, even though nothing has changed, because input files
    // are undefined (as opposed to an empty array).
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 2);
    }
  })
);

test(
  'scripts with empty input files can be fresh',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: [],
          },
        },
      },
    });

    // Run 1 succeeds.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Run 2 is already fresh, so it can be skipped, because input files are an
    // empty array (as opposed to undefined).
    {
      const out = rig.exec('npm run cmd');
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }
  })
);

test(
  'dot files in files globs affect freshness',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['src/**'],
          },
        },
      },
      'src/.dotfile': 'v0',
    });

    // Run 1 succeeds.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Modify the dotfile.
    await rig.writeFiles({
      'src/.dotfile': 'v1',
    });

    // Run 2 is not fresh.
    {
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 2);
    }

    // Run 3 is fresh.
    {
      const out = rig.exec('npm run cmd');
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 2);
    }
  })
);

test.skip(
  'symlinks are not followed but affect freshness',
  timeout(async ({rig}) => {
    const cmd = rig.newCommand();
    await rig.writeFiles({
      'package.json': {
        scripts: {
          cmd: 'wireit',
        },
        wireit: {
          cmd: {
            command: cmd.command(),
            files: ['inputs/**'],
          },
        },
      },
      'inputs/file1': 'v0',
      'inputs/file2': 'v0',
    });
    await rig.symlink('./file1', 'inputs/link-1');
    await rig.symlink('../inputs', 'inputs/link-recursive');

    // Run 1 succeeds.
    {
      console.log(0);
      const out = rig.exec('npm run cmd');
      await cmd.waitUntilStarted();
      await cmd.exit(0);
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Run 2 is fresh.
    {
      console.log(1);
      const out = rig.exec('npm run cmd');
      const {code} = await out.done;
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 1);
    }

    // Symlink target changes
    console.log(2);
    await rig.symlink('../inputs/xxx', 'inputs/foo');

    // Run 3 is not fresh.
    {
      const out = rig.exec('npm run cmd');
      console.log(3);
      await cmd.waitUntilStarted();
      console.log(4);
      await cmd.exit(0);
      console.log(5);
      const {code} = await out.done;
      console.log(6);
      assert.equal(code, 0);
      assert.equal(cmd.startedCount, 2);
    }
  })
);

test.run();