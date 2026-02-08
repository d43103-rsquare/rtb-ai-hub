import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import type { User } from '../types';

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

export const workflowsApi = {
  getAll: async () => {
    return [];
  },
};

export default apiClient;
