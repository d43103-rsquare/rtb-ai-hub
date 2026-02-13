import { useState } from 'react';
import { Button } from '../common/Button';
import type { SimulatedWorkflow } from '../../types/workflow';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const JIRA_HOST = import.meta.env.VITE_JIRA_HOST || 'rsquare.atlassian.net';

interface WorkflowActionButtonsProps {
  workflow: SimulatedWorkflow;
}

export function WorkflowActionButtons({ workflow }: WorkflowActionButtonsProps) {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const hasTestResult = Boolean(workflow.artifacts.test_result);
  const hasPreview = Boolean(workflow.artifacts.preview_url);
  const hasPR = Boolean(workflow.artifacts.pr_url);

  const handleOpenJira = () => {
    window.open(`https://${JIRA_HOST}/browse/${workflow.key}`, '_blank');
  };

  const handleOpenGitHub = () => {
    if (workflow.artifacts.pr_url) {
      window.open(workflow.artifacts.pr_url, '_blank');
    } else if (workflow.artifacts.branch_name) {
      const repo = 'dev-rsquare/rtb-v2-mvp';
      window.open(`https://github.com/${repo}/tree/${workflow.artifacts.branch_name}`, '_blank');
    }
  };

  const handleOpenPreview = () => {
    if (workflow.artifacts.preview_url) {
      window.open(workflow.artifacts.preview_url, '_blank');
    }
  };

  const handleVerify = async () => {
    if (!workflow.id) {
      alert('워크플로우 ID가 없습니다.');
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch(`${API_URL}/api/workflows/${workflow.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to verify workflow');
      }

      const data = await response.json();
      setVerified(true);
      alert(data.message || `Jira 이슈 ${workflow.key} 상태가 "INT 검증"으로 변경되었습니다.`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`검증 실패: ${errorMessage}`);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button onClick={handleOpenJira} className="bg-blue-600 hover:bg-blue-700 text-white">
        🔗 Jira {workflow.key}
      </Button>

      {hasPR && (
        <Button onClick={handleOpenGitHub} className="bg-gray-800 hover:bg-gray-900 text-white">
          🌿 GitHub PR
        </Button>
      )}

      {!hasPR && workflow.artifacts.branch_name && (
        <Button onClick={handleOpenGitHub} className="bg-gray-600 hover:bg-gray-700 text-white">
          🌿 Branch: {workflow.artifacts.branch_name.split('/').pop()?.slice(0, 20)}
        </Button>
      )}

      {hasPreview && hasTestResult && (
        <Button onClick={handleOpenPreview} className="bg-green-600 hover:bg-green-700 text-white">
          🌐 검증하기
        </Button>
      )}

      {hasPreview && hasTestResult && !verified && (
        <Button
          onClick={handleVerify}
          disabled={verifying}
          className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
        >
          {verifying ? '처리 중...' : '✅ 검증 완료'}
        </Button>
      )}

      {verified && (
        <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium text-sm">
          ✓ INT 검증 완료
        </span>
      )}
    </div>
  );
}
