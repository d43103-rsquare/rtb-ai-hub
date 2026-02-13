import { useState, useEffect, useRef } from 'react';
import type { SimulatedWorkflow } from '../types/workflow';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const WS_URL = API_URL.replace(/^http/, 'ws');

function transformWorkflow(wf: any): SimulatedWorkflow {
  return {
    id: wf.id,
    key: wf.key,
    summary: wf.summary,
    description: '',
    status: wf.status,
    priority: 'High',
    labels: [],
    created: wf.created,
    updated: wf.updated,
    assignee: wf.assignee,
    progress: wf.progress,
    timeline: [],
    artifacts: {
      refined_requirement: null,
      dev_plan: null,
      branch_name: null,
      ci_result: null,
      pr_url: null,
      preview_url: null,
      test_plan: null,
      test_result: null,
    },
    gates: {
      G1: null,
      G2: null,
      G3: null,
      G4: null,
    },
  };
}

export function useWorkflowSSE(initialWorkflows: SimulatedWorkflow[]) {
  const [workflows, setWorkflows] = useState<SimulatedWorkflow[]>(initialWorkflows);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const res = await fetch(`${API_URL}/api/workflows`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setWorkflows(data.map(transformWorkflow));
        }
      } catch (err) {
        console.error('Failed to fetch workflows:', err);
      }
    };

    fetchWorkflows();

    const connectWebSocket = () => {
      const ws = new WebSocket(`${WS_URL}/ws`);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'subscribe' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'workflow_update') {
            fetchWorkflows();
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log('Attempting to reconnect...');
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    const pollInterval = setInterval(fetchWorkflows, 30000);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(pollInterval);
    };
  }, []);

  return { workflows, isConnected };
}
