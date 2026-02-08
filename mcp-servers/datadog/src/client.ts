type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

function getConfig() {
  const apiKey = process.env.DD_API_KEY;
  const appKey = process.env.DD_APP_KEY;
  if (!apiKey || !appKey) {
    throw new Error('DD_API_KEY and DD_APP_KEY environment variables are required');
  }
  const site = process.env.DD_SITE || 'datadoghq.com';
  return { apiKey, appKey, site };
}

export async function datadogRequest<T = unknown>(
  path: string,
  method: HttpMethod = 'GET',
  body?: unknown,
  apiVersion: 'v1' | 'v2' = 'v1'
): Promise<T> {
  const { apiKey, appKey, site } = getConfig();
  const url = `https://api.${site}/api/${apiVersion}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Datadog API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}
