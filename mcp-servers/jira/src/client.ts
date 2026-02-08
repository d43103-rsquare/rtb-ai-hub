type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

function getConfig() {
  const host = process.env.JIRA_HOST;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!host || !email || !apiToken) {
    throw new Error('JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables are required');
  }
  return { host, email, apiToken };
}

export async function jiraRequest<T = unknown>(
  path: string,
  method: HttpMethod = 'GET',
  body?: unknown
): Promise<T> {
  const { host, email, apiToken } = getConfig();
  const url = `https://${host}/rest/api/3${path}`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
