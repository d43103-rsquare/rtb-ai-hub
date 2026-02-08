const BASE_URL = 'https://api.figma.com/v1';

function getToken(): string {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error('FIGMA_ACCESS_TOKEN environment variable is required');
  }
  return token;
}

export async function figmaRequest<T = unknown>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'X-Figma-Token': getToken(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Figma API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}
