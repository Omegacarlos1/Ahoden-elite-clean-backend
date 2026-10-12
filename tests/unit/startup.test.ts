import { spawn } from 'node:child_process';

import { expect } from 'chai';

describe('server startup', () => {
  it('fails safely when configuration is invalid', async () => {
    const environment = {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://user:topsecret@localhost',
      CORS_ORIGINS: ''
    };
    const result = await runProcess(process.execPath, ['dist/src/server.js'], environment);

    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.contain('Invalid environment configuration');
    expect(result.stderr).not.to.contain('topsecret');
  });
});

function runProcess(
  executable: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv
): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: process.cwd(),
      env: environment,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve({ exitCode, stderr }));
  });
}

