import { NestFactory } from '@nestjs/core';
import { planRecolour } from '@/modules/categories/recolour';
import { UsersService } from '@/modules/users/users.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CliModule } from './cli.module';

const USAGE = `budget-tracker CLI

Usage:
  npm run cli -- user:create --email=<email> --password=<password> --name=<name>
  npm run cli -- categories:recolour [--email=<email>] [--dry-run]

Commands:
  user:create          Create a user with the seven default categories (PRD 7.4)
  categories:recolour  Move categories still wearing the pre-revamp palette onto the
                       current one. Colours picked by hand in Settings are left alone.
                       Idempotent; --dry-run prints the plan without writing.
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

  const context = await NestFactory.createApplicationContext(CliModule, {
    logger: ['error', 'warn'],
  });

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

      case 'categories:recolour': {
        const flags = parseFlags(rest);
        const prisma = context.get(PrismaService);
        const dryRun = flags['dry-run'] === 'true';

        // Archived categories are included on purpose: un-archiving one later must not
        // bring a colour from the old palette back with it.
        const categories = await prisma.category.findMany({
          where: flags.email ? { user: { email: flags.email } } : {},
          select: { id: true, name: true, color: true },
          orderBy: { id: 'asc' },
        });

        const plan = planRecolour(categories);

        if (plan.length === 0) {
          process.stdout.write(
            `Nothing to do: ${categories.length} categories, none on the old palette\n`,
          );
          break;
        }

        for (const change of plan) {
          process.stdout.write(`  ${change.name} ${change.from} -> ${change.to}\n`);
        }

        if (dryRun) {
          process.stdout.write(`\n${plan.length} would change (dry run, nothing written)\n`);
          break;
        }

        // One transaction: a half-applied palette is worse than the old one, because it
        // leaves two categories that used to differ wearing colours from different sets.
        await prisma.$transaction(
          plan.map((change) =>
            prisma.category.update({ where: { id: change.id }, data: { color: change.to } }),
          ),
        );

        process.stdout.write(`\n${plan.length} categories recoloured\n`);
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
