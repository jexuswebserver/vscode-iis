import * as path from 'path';
import {globSync} from 'glob';

export async function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname, '..');

  const files = globSync('**/*.test.js', {cwd: testsRoot});

  for (const file of files) {
    require(path.resolve(testsRoot, file));
  }
}
