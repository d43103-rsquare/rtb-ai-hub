import axios, { type AxiosInstance } from 'axios';

export interface WorkflowRequest {
  type: 'jira-auto-dev' | 'figma-to-jira' | 'auto-review' | 'deploy-monitor' | 'incident-to-jira';
  event: Record<string, any>;
  env?: 'int' | 'stg' | 'prd';
  userId?: string;
}

export interface WorkflowResponse {
  executionId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  result?: any;
  error?: string;
}

export class RTBWorkflowClient {
  private client: AxiosInstance;

  constructor(baseURL: string, apiKey?: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      timeout: 30000,
    });
  }

  async triggerWorkflow(request: WorkflowRequest): Promise<WorkflowResponse> {
    const response = await this.client.post<WorkflowResponse>('/api/workflows/trigger', request);
    return response.data;
  }

  async getWorkflowStatus(executionId: string): Promise<WorkflowResponse> {
    const response = await this.client.get<WorkflowResponse>(
      `/api/workflows/status/${executionId}`
    );
    return response.data;
  }

  async listWorkflows(params?: { limit?: number; env?: string }): Promise<WorkflowResponse[]> {
    const response = await this.client.get<WorkflowResponse[]>('/api/workflows/list', {
      params,
    });
    return response.data;
  }
}

export function createRTBWorkflowClient(): RTBWorkflowClient {
  const baseURL = process.env.RTB_WORKFLOW_API_URL || 'http://localhost:4000';
  const apiKey = process.env.RTB_WORKFLOW_API_KEY;

  return new RTBWorkflowClient(baseURL, apiKey);
}
