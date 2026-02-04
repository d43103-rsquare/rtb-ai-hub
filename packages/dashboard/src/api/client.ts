import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import type { User, Credential, ApiKeyInput } from '../types';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authApi = {
  getGoogleLoginUrl: async (): Promise<string> => {
    const { data } = await apiClient.get<{ authUrl: string }>('/auth/google/login');
    return data.authUrl;
  },

  getCurrentUser: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/api/me');
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/google/logout');
  },

  refreshToken: async (): Promise<void> => {
    await apiClient.post('/auth/refresh');
  },
};

export const credentialsApi = {
  getAll: async (): Promise<Credential[]> => {
    const { data } = await apiClient.get<Credential[]>('/credentials');
    return data;
  },

  addApiKey: async (input: ApiKeyInput): Promise<Credential> => {
    const { data } = await apiClient.post<Credential>('/credentials/api-key', input);
    return data;
  },

  deleteCredential: async (service: string): Promise<void> => {
    await apiClient.delete(`/credentials/${service}`);
  },
};

export const oauthApi = {
  getConnectUrl: async (service: string): Promise<string> => {
    const { data } = await apiClient.get<{ authUrl: string }>(`/oauth/${service}/connect`);
    return data.authUrl;
  },
};

export const workflowsApi = {
  getAll: async () => {
    return [];
  },
};

export default apiClient;
