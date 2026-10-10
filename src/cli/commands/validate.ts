import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { ExitCode } from '../../config/exitCodes.js';
import { validateSpecification } from '../../spec/validator.js';

export async function runValidateCommand(specPath: string): Promise<number> {
  const resolvedPath = path.resolve(process.cwd(), specPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(pc.red(`Error: Specification file not found: ${specPath}`));
    return ExitCode.SPEC_ERROR;
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    console.error(
      pc.red(
        `Error reading specification file: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return ExitCode.SPEC_ERROR;
  }

  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch (err) {
    console.error(
      pc.red(
        `Error parsing specification JSON: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return ExitCode.SPEC_ERROR;
  }

  const result = validateSpecification(json);

  if (!result.valid || !result.spec) {
    console.error(
      pc.red(`\n✖ Specification validation failed with ${result.errors.length} error(s):\n`),
    );
    for (const error of result.errors) {
      console.error(`  ${pc.red('•')} [${pc.cyan(error.path || 'root')}]: ${error.message}`);
    }
    console.error('');
    return ExitCode.SPEC_ERROR;
  }

  console.log(
    pc.green(
      `\n✔ Specification "${result.spec.name}" (v${result.spec.version}) is valid with ${result.spec.tests.length} test case(s).\n`,
    ),
  );

  return ExitCode.SUCCESS;
}
