import { NestFactory } from '@nestjs/core';
import { UsersService } from '@/modules/users/users.service';
import { CliModule } from './cli.module';

const USAGE = `datebud CLI

Usage:
  npm run cli -- user:create --email=<email> --password=<password> --name=<name>

Commands:
  user:create   Create a user with the seven default categories (PRD 7.4)
`;

/** Parses `--key=value` and `--key value` pairs out of argv. */
function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const [key, inlineValue] = token.slice(2).split(/=(.*)/s);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      flags[key] = argv[index + 1];
      index += 1;
    } else {
      flags[key] = 'true';
    }
  }

  return flags;
}

function require_(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value || value === 'true') {
    throw new Error(`--${name} is required`);
  }
  return value;
}

async function run(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return;
  }

  const context = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });

  try {
    switch (command) {
      case 'user:create': {
        const flags = parseFlags(rest);
        const users = context.get(UsersService);

        const user = await users.createUser({
          email: require_(flags, 'email'),
          password: require_(flags, 'password'),
          displayName: require_(flags, 'name'),
        });

        // stdout, not a Logger: the context is created with the 'log' level switched off,
        // and a CLI's result belongs on stdout where it can be piped, not in framework noise.
        process.stdout.write(`Created user #${user.id} <${user.email}> with default categories\n`);
        break;
      }

      default:
        process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
        process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

run().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
