// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Child content rendered</div>;
}

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    cleanup();
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content rendered')).toBeDefined();
  });

  it('catches error and shows error UI', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('문제가 발생했습니다')).toBeDefined();
  });

  it('shows error message in UI', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test error message')).toBeDefined();
  });

  it('"다시 시도" button exists and calls window.location.reload', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const retryButton = screen.getByText('다시 시도');
    expect(retryButton).toBeDefined();
    expect(retryButton.tagName).toBe('BUTTON');

    await userEvent.click(retryButton);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('"홈으로 돌아가기" button exists and navigates to "/"', async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: new Proxy(window.location, {
        set(_target, prop, value) {
          if (prop === 'href') {
            hrefSetter(value);
          }
          return true;
        },
      }),
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeButton = screen.getByText('홈으로 돌아가기');
    expect(homeButton).toBeDefined();
    expect(homeButton.tagName).toBe('BUTTON');

    await userEvent.click(homeButton);
    expect(hrefSetter).toHaveBeenCalledWith('/');
  });

  it('shows default message when error has no message', () => {
    function NoMessageError(): React.ReactElement {
      throw new Error();
    }

    render(
      <ErrorBoundary>
        <NoMessageError />
      </ErrorBoundary>
    );

    expect(screen.getByText('알 수 없는 오류가 발생했습니다.')).toBeDefined();
  });
});
