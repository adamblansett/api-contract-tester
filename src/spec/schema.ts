import { z } from 'zod';

const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

const RedirectPolicySchema = z.enum(['manual', 'follow-same-origin', 'error']);

export const RequestDefinitionSchema = z
  .object({
    method: HttpMethodSchema,
    path: z
      .string()
      .min(1, 'Request path cannot be empty')
      .refine(
        (path) => !path.includes('\0') && !path.includes('%00'),
        'Request path must not contain null bytes',
      )
      .refine((path) => !path.includes('\\'), 'Request path must not contain backslashes')
      .refine(
        (path) => !path.startsWith('//') && !path.startsWith('/\\') && !path.startsWith('\\/'),
        'Request path must not be a protocol-relative path',
      )
      .refine(
        (path) => !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path.trim()),
        'Request path must be a relative path and must not contain absolute URLs or custom protocols',
      ),
    headers: z.record(z.string(), z.string()).optional(),
    query: z
      .record(
        z.string(),
        z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.union([z.string(), z.number(), z.boolean()])),
        ]),
      )
      .optional(),
    body: z.unknown().optional(),
    timeoutMs: z.number().int().positive().optional(),
    redirect: RedirectPolicySchema.optional(),
  })
  .strict();

export const ExpectedHeadersSchema = z
  .object({
    required: z.union([z.record(z.string(), z.string()), z.array(z.string()).min(1)]).optional(),
    prohibited: z.array(z.string()).min(1).optional(),
  })
  .strict();

export const ExpectationDefinitionSchema = z
  .object({
    status: z
      .union([
        z.number().int().min(100).max(599),
        z.array(z.number().int().min(100).max(599)).min(1, 'status array cannot be empty'),
      ])
      .optional(),
    headers: ExpectedHeadersSchema.optional(),
    contentType: z.string().optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    hasProperties: z.array(z.string().min(1)).min(1).optional(),
    exact: z.record(z.string(), z.unknown()).optional(),
    contains: z.record(z.string(), z.unknown()).optional(),
    maxResponseTimeMs: z.number().positive().optional(),
  })
  .strict();

export const TestCaseSchema = z
  .object({
    id: z
      .string()
      .min(1, 'Test case ID must not be empty')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Test case ID may only contain letters, numbers, underscores, and hyphens',
      ),
    name: z.string().min(1, 'Test case name must not be empty'),
    description: z.string().optional(),
    skip: z.boolean().optional(),
    request: RequestDefinitionSchema,
    expect: ExpectationDefinitionSchema,
  })
  .strict();

export const SuiteConfigSchema = z
  .object({
    baseUrl: z
      .string()
      .url('baseUrl must be a valid URL')
      .refine((val) => {
        try {
          const u = new URL(val);
          return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password;
        } catch {
          return false;
        }
      }, 'baseUrl must use http: or https: protocol and must not contain embedded credentials')
      .optional(),
    timeoutMs: z.number().int().positive().optional(),
    maxBodyBytes: z.number().int().positive().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    allowDestructive: z.boolean().optional(),
    redirect: RedirectPolicySchema.optional(),
  })
  .strict();

export const TestSpecificationSchema = z
  .object({
    version: z
      .string()
      .regex(/^1\.\d+(\.\d+)?$/, 'Specification version must be in 1.x format (e.g., "1.0.0")'),
    name: z.string().min(1, 'Specification name must not be empty'),
    description: z.string().optional(),
    config: SuiteConfigSchema.optional(),
    tests: z.array(TestCaseSchema).min(1, 'Specification must contain at least one test case'),
  })
  .strict();
