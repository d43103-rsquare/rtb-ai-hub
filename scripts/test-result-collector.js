const fs = require('fs');
const path = require('path');

/**
 * Test Result Collector and Reporter
 * Collects test results and generates HTML/Markdown reports
 */

class TestResultCollector {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './test-results';
    this.results = {
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      suites: [],
      metadata: {
        environment: process.env.NODE_ENV || 'test',
        gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3000',
        hubUrl: process.env.RTB_HUB_URL || 'http://localhost:4000',
        version: require('../package.json').version,
      },
    };
  }

  addSuite(suite) {
    this.results.suites.push(suite);
    this.results.summary.total += suite.tests.length;
    this.results.summary.passed += suite.tests.filter((t) => t.status === 'passed').length;
    this.results.summary.failed += suite.tests.filter((t) => t.status === 'failed').length;
    this.results.summary.skipped += suite.tests.filter((t) => t.status === 'skipped').length;
  }

  generateHTMLReport() {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>RTB AI Hub - Integration Test Results</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 10px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }
    .stat { text-align: center; padding: 20px; border-radius: 8px; }
    .stat.total { background: #e3f2fd; }
    .stat.passed { background: #e8f5e9; }
    .stat.failed { background: #ffebee; }
    .stat.skipped { background: #fff3e0; }
    .stat-value { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
    .stat-label { color: #666; font-size: 14px; }
    .suite { margin: 20px 0; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    .suite-header { background: #f5f5f5; padding: 15px 20px; font-weight: bold; border-bottom: 1px solid #e0e0e0; }
    .test { padding: 12px 20px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; }
    .test:last-child { border-bottom: none; }
    .test-status { width: 20px; height: 20px; border-radius: 50%; margin-right: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    .test-status.passed { background: #4caf50; color: white; }
    .test-status.failed { background: #f44336; color: white; }
    .test-status.skipped { background: #ff9800; color: white; }
    .test-name { flex: 1; }
    .test-duration { color: #999; font-size: 12px; }
    .metadata { margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
    .metadata h3 { margin-top: 0; }
    .metadata-item { margin: 8px 0; }
    .success-rate { font-size: 48px; font-weight: bold; text-align: center; margin: 20px 0; }
    .success-rate.good { color: #4caf50; }
    .success-rate.warning { color: #ff9800; }
    .success-rate.bad { color: #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Integration Test Results</h1>
    <p>Generated: ${new Date(this.results.timestamp).toLocaleString()}</p>
    
    <div class="success-rate ${this.getSuccessRateClass()}">
      ${this.calculateSuccessRate()}%
    </div>
    
    <div class="summary">
      <div class="stat total">
        <div class="stat-value">${this.results.summary.total}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat passed">
        <div class="stat-value">${this.results.summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat failed">
        <div class="stat-value">${this.results.summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat skipped">
        <div class="stat-value">${this.results.summary.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
    </div>

    ${this.results.suites.map((suite) => this.renderSuite(suite)).join('')}

    <div class="metadata">
      <h3>Test Environment</h3>
      <div class="metadata-item"><strong>Environment:</strong> ${this.results.metadata.environment}</div>
      <div class="metadata-item"><strong>Gateway URL:</strong> ${this.results.metadata.gatewayUrl}</div>
      <div class="metadata-item"><strong>Hub URL:</strong> ${this.results.metadata.hubUrl}</div>
      <div class="metadata-item"><strong>Version:</strong> ${this.results.metadata.version}</div>
    </div>
  </div>
</body>
</html>`;

    return html;
  }

  renderSuite(suite) {
    return `
    <div class="suite">
      <div class="suite-header">${suite.name} (${suite.tests.filter((t) => t.status === 'passed').length}/${suite.tests.length})</div>
      ${suite.tests.map((test) => this.renderTest(test)).join('')}
    </div>`;
  }

  renderTest(test) {
    const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○';
    return `
    <div class="test">
      <div class="test-status ${test.status}">${icon}</div>
      <div class="test-name">${test.name}</div>
      <div class="test-duration">${test.duration || 0}ms</div>
    </div>`;
  }

  calculateSuccessRate() {
    if (this.results.summary.total === 0) return 0;
    return Math.round((this.results.summary.passed / this.results.summary.total) * 100);
  }

  getSuccessRateClass() {
    const rate = this.calculateSuccessRate();
    if (rate >= 90) return 'good';
    if (rate >= 70) return 'warning';
    return 'bad';
  }

  saveReports() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Save JSON
    fs.writeFileSync(
      path.join(this.outputDir, 'test-results.json'),
      JSON.stringify(this.results, null, 2)
    );

    // Save HTML
    fs.writeFileSync(path.join(this.outputDir, 'test-report.html'), this.generateHTMLReport());

    // Save Markdown
    fs.writeFileSync(path.join(this.outputDir, 'test-report.md'), this.generateMarkdownReport());

    console.log(`Reports saved to ${this.outputDir}/`);
    console.log(`  - test-results.json`);
    console.log(`  - test-report.html`);
    console.log(`  - test-report.md`);
  }

  generateMarkdownReport() {
    return `# Integration Test Results

**Generated:** ${new Date(this.results.timestamp).toLocaleString()}  
**Success Rate:** ${this.calculateSuccessRate()}%

## Summary

| Metric | Count |
|--------|-------|
| Total Tests | ${this.results.summary.total} |
| Passed | ${this.results.summary.passed} ✅ |
| Failed | ${this.results.summary.failed} ❌ |
| Skipped | ${this.results.summary.skipped} ⏭️ |

## Test Suites

${this.results.suites
  .map(
    (suite) => `
### ${suite.name}

| Test | Status | Duration |
|------|--------|----------|
${suite.tests.map((t) => `| ${t.name} | ${t.status} | ${t.duration || 0}ms |`).join('\n')}
`
  )
  .join('\n')}

## Environment

- **Environment:** ${this.results.metadata.environment}
- **Gateway URL:** ${this.results.metadata.gatewayUrl}
- **Hub URL:** ${this.results.metadata.hubUrl}
- **Version:** ${this.results.metadata.version}
`;
  }
}

module.exports = { TestResultCollector };

// CLI usage
if (require.main === module) {
  const collector = new TestResultCollector();

  // Example: Load from vitest JSON output
  const vitestOutput = process.argv[2];
  if (vitestOutput && fs.existsSync(vitestOutput)) {
    const data = JSON.parse(fs.readFileSync(vitestOutput, 'utf8'));
    // Parse vitest output and add to collector
    // ...
  }

  collector.saveReports();
}
