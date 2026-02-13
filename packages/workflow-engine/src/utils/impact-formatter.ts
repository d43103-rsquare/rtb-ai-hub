import type { ImpactReport, ImpactLevel } from './impact-analyzer';

const LEVEL_ICONS: Record<ImpactLevel, string> = {
  high: '\uD83D\uDD34 High',
  medium: '\uD83D\uDFE1 Medium',
  low: '\uD83D\uDFE2 Low',
};

export function formatImpactForPr(report: ImpactReport): string {
  const sections: string[] = [];

  sections.push('### \uD83D\uDD0D Impact Analysis\n');
  sections.push(`**\uBCC0\uACBD \uBC94\uC704**: ${report.totalFiles}\uAC1C \uD30C\uC77C\n`);

  if (report.moduleImpacts.length > 0) {
    sections.push('**\uC601\uD5A5\uBC1B\uB294 \uC601\uC5ED**:');
    sections.push('| \uC601\uC5ED | \uC601\uD5A5\uB3C4 | \uC124\uBA85 |');
    sections.push('|------|--------|------|');
    for (const m of report.moduleImpacts) {
      sections.push(`| ${m.module} | ${LEVEL_ICONS[m.level]} | ${m.description} |`);
    }
    sections.push('');
  }

  if (report.similarChanges.length > 0) {
    sections.push('**\uACFC\uAC70 \uC720\uC0AC \uBCC0\uACBD**:');
    for (const c of report.similarChanges) {
      const icon = c.outcome === 'incident' ? '\u26A0\uFE0F' : '\u2705';
      sections.push(`- ${icon} PR #${c.prNumber} (${c.title}) \u2014 ${c.mergedAt}`);
      if (c.outcome === 'incident') {
        sections.push(
          '  \u2192 \uC774 \uC601\uC5ED\uC5D0\uC11C \uC778\uC2DC\uB358\uD2B8 \uBC1C\uC0DD \uC774\uB825 \uC788\uC74C. \uC8FC\uC758 \uD544\uC694.'
        );
      }
    }
    sections.push('');
  }

  if (report.riskFactors.length > 0) {
    sections.push('**\uB9AC\uC2A4\uD06C \uC694\uC778**:');
    for (const r of report.riskFactors) {
      const icon = r.severity === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F';
      sections.push(`- ${icon} ${r.description}`);
    }
    sections.push('');
  }

  if (report.suggestedReviewers.length > 0) {
    sections.push(
      `**\uAD8C\uC7A5 \uB9AC\uBDF0\uC5B4**: ${report.suggestedReviewers.map((r) => `@${r}`).join(', ')}`
    );
  }

  return sections.join('\n');
}

export function formatImpactForSlack(report: ImpactReport): string {
  const lines: string[] = [];
  lines.push('\uD83D\uDD0D \uC601\uD5A5 \uBD84\uC11D \uC694\uC57D\n');
  lines.push(report.summary);

  const highImpacts = report.moduleImpacts.filter((m) => m.level === 'high');
  if (highImpacts.length > 0) {
    lines.push(
      `\n\u26A0\uFE0F \uB192\uC740 \uC601\uD5A5: ${highImpacts.map((m) => m.module).join(', ')}`
    );
  }

  if (report.riskFactors.length > 0) {
    lines.push(`\n\uB9AC\uC2A4\uD06C ${report.riskFactors.length}\uAC74 \uAC10\uC9C0\uB428`);
  }

  return lines.join('\n');
}
