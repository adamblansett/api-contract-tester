import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ExitCode } from '../../config/exitCodes.js';
import { TestSpecificationSchema } from '../../spec/schema.js';

export interface ExportSchemaOptions {
  output?: string;
}

export function generateContractJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TestSpecificationSchema, {
    reused: 'inline',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
}

export async function runExportSchemaCommand(options: ExportSchemaOptions = {}): Promise<number> {
  try {
    const jsonSchema = generateContractJsonSchema();
    const formatted = JSON.stringify(jsonSchema, null, 2);

    if (options.output) {
      const outputPath = path.resolve(process.cwd(), options.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, formatted, 'utf-8');
      console.log(`Successfully exported JSON Schema -> ${outputPath}`);
    } else {
      console.log(formatted);
    }

    return ExitCode.SUCCESS;
  } catch (err) {
    console.error(`Failed to export schema: ${err instanceof Error ? err.message : String(err)}`);
    return ExitCode.CONFIG_OR_INTERNAL_ERROR;
  }
}
