export interface EnvSubstitutionResult<T> {
  result: T;
  substitutedSecrets: string[];
}

const ENV_VAR_REGEX = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Substitutes environment variables in a string matching ${VAR_NAME} or ${VAR_NAME:-default}.
 */
export function substituteString(
  value: string,
  env: Record<string, string | undefined> = process.env,
): { text: string; secretValues: string[] } {
  const secretValues: string[] = [];

  const text = value.replace(ENV_VAR_REGEX, (_match, varName: string, defaultValue?: string) => {
    const envVal = env[varName];
    if (envVal !== undefined && envVal !== '') {
      secretValues.push(envVal);
      return envVal;
    }
    if (defaultValue !== undefined) {
      if (defaultValue !== '') {
        secretValues.push(defaultValue);
      }
      return defaultValue;
    }
    // If not found in env and no default, leave unresolved or return empty?
    // Returning empty string with a warning or throwing if missing?
    // Leaving it as empty or throwing is clearer: if env var is missing and no default provided, return ''
    return '';
  });

  return { text, secretValues };
}

/**
 * Recursively walks an object, array, or primitive, replacing environment variable placeholders.
 */
export function substituteEnvInValue<T>(
  value: T,
  env: Record<string, string | undefined> = process.env,
): EnvSubstitutionResult<T> {
  const secretValues: string[] = [];

  function walk(current: unknown): unknown {
    if (typeof current === 'string') {
      const { text, secretValues: subSecrets } = substituteString(current, env);
      secretValues.push(...subSecrets);
      return text;
    }
    if (Array.isArray(current)) {
      return current.map((item) => walk(item));
    }
    if (current !== null && typeof current === 'object') {
      const clone: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
        clone[k] = walk(v);
      }
      return clone;
    }
    return current;
  }

  return {
    result: walk(value) as T,
    substitutedSecrets: Array.from(new Set(secretValues.filter((s) => s.length > 2))),
  };
}
