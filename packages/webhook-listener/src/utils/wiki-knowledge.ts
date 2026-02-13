import { readdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';

const logger = createLogger('wiki-knowledge');

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  obj: ['빌딩', '건물', '유닛', '호실', '물류', '필지', 'building', 'unit', 'warehouse'],
  prd: ['매물', '계약', '임대', '매매', '렌트', 'product', 'lease', 'contract', 'rent'],
  mbr: ['거래처', '담당자', '고객', 'client', 'customer', 'contact', 'member'],
  gtd: ['딜', '태스크', '업무', 'deal', 'task'],
  com: ['코드', '권한', '사용자', '알림', 'code', 'user', 'permission', 'notification'],
  r3: ['등기', '등기부', 'registry', 'registration'],
  gokr: ['공적장부', '건축물대장', '토지대장', 'land', '공시지가', '대장'],
};

const TABLE_PREFIX_TO_DOMAIN: Record<string, string> = {
  obj: 'obj',
  prd: 'prd',
  mbr: 'mbr',
  gtd: 'gtd',
  com: 'com',
  cmm: 'com',
  sys: 'com',
  r3: 'r3',
};

const MAX_DOC_CHARS = 6000;
const MAX_TOTAL_CHARS = 24000;

type WikiIndex = {
  tables: Map<string, string>;
  domains: Map<string, string>;
  baseContextPath: string | null;
  queriesPath: string | null;
};

export class WikiKnowledge {
  private index: WikiIndex | null = null;
  private wikiPath: string;

  constructor(wikiPath?: string) {
    this.wikiPath = wikiPath || getEnv('WIKI_LOCAL_PATH', '');
  }

  get isAvailable(): boolean {
    return this.wikiPath.length > 0;
  }

  async buildIndex(): Promise<WikiIndex> {
    if (this.index) return this.index;

    const tables = new Map<string, string>();
    const domains = new Map<string, string>();
    let baseContextPath: string | null = null;
    let queriesPath: string | null = null;

    try {
      await access(this.wikiPath);
    } catch {
      logger.warn({ wikiPath: this.wikiPath }, 'Wiki path not accessible');
      this.index = { tables, domains, baseContextPath, queriesPath };
      return this.index;
    }

    const rtbContextPath = join(this.wikiPath, 'rtb-common', 'RTB_CONTEXT.md');
    try {
      await access(rtbContextPath);
      baseContextPath = rtbContextPath;
    } catch {
      // RTB_CONTEXT.md not found
    }

    const queriesFilePath = join(this.wikiPath, 'rtb-legacy', 'queries.md');
    try {
      await access(queriesFilePath);
      queriesPath = queriesFilePath;
    } catch {
      // queries.md not found
    }

    const manageDir = join(this.wikiPath, 'rtb-common', 'db-schema', 'manage');
    try {
      const manageDomains = await readdir(manageDir, { withFileTypes: true });
      for (const entry of manageDomains) {
        if (!entry.isDirectory()) continue;
        const domainDir = join(manageDir, entry.name);

        const overviewPath = join(domainDir, '_overview.md');
        try {
          await access(overviewPath);
          domains.set(entry.name, overviewPath);
        } catch {
          // No overview for this domain
        }

        const files = await readdir(domainDir);
        for (const file of files) {
          if (!file.endsWith('.md') || file.startsWith('_')) continue;
          const tableName = file.replace('.md', '');
          tables.set(tableName, join(domainDir, file));
        }
      }
    } catch {
      logger.debug('manage directory not found in wiki');
    }

    const gokrDir = join(this.wikiPath, 'rtb-common', 'db-schema', 'gokr');
    try {
      const gokrOverview = join(gokrDir, '_overview.md');
      try {
        await access(gokrOverview);
        domains.set('gokr', gokrOverview);
      } catch {
        // No gokr overview
      }

      const files = await readdir(gokrDir);
      for (const file of files) {
        if (!file.endsWith('.md') || file.startsWith('_')) continue;
        const tableName = file.replace('.md', '');
        tables.set(tableName, join(gokrDir, file));
      }
    } catch {
      logger.debug('gokr directory not found in wiki');
    }

    this.index = { tables, domains, baseContextPath, queriesPath };
    logger.info(
      { tables: tables.size, domains: domains.size, hasBase: !!baseContextPath },
      'Wiki index built'
    );

    return this.index;
  }

  async getBaseContext(): Promise<string> {
    const index = await this.buildIndex();
    if (!index.baseContextPath) return '';
    return this.readAndTruncate(index.baseContextPath);
  }

  async searchForContext(text: string, maxDocs = 4): Promise<string> {
    if (!this.isAvailable) return '';

    const index = await this.buildIndex();
    const sections: string[] = [];
    let totalChars = 0;

    const baseContext = await this.getBaseContext();
    if (baseContext) {
      sections.push('# RTB System Context\n\n' + baseContext);
      totalChars += baseContext.length;
    }

    const tableNames = this.extractTableNames(text);
    let docsLoaded = 0;

    for (const tableName of tableNames) {
      if (docsLoaded >= maxDocs || totalChars >= MAX_TOTAL_CHARS) break;

      const content = await this.getTableDoc(tableName);
      if (content) {
        sections.push(content);
        totalChars += content.length;
        docsLoaded++;
      }
    }

    const matchedDomains = this.extractDomains(text);
    for (const domain of matchedDomains) {
      if (docsLoaded >= maxDocs || totalChars >= MAX_TOTAL_CHARS) break;

      const overview = await this.getDomainOverview(domain);
      if (overview) {
        sections.push(overview);
        totalChars += overview.length;
        docsLoaded++;
      }
    }

    if (tableNames.length > 0 && index.queriesPath && totalChars < MAX_TOTAL_CHARS) {
      const queries = await this.extractRelevantQueries(tableNames, matchedDomains);
      if (queries) {
        sections.push('# Relevant SQL Query Patterns\n\n' + queries);
      }
    }

    if (sections.length === 0) return '';

    const result = sections.join('\n\n---\n\n');
    logger.info(
      { tableNames, matchedDomains, docsLoaded, totalChars: result.length },
      'Wiki knowledge loaded'
    );

    return result;
  }

  async getTableDoc(tableName: string): Promise<string | null> {
    const index = await this.buildIndex();
    const filePath = index.tables.get(tableName);
    if (!filePath) return null;

    const content = await this.readAndTruncate(filePath);
    return content || null;
  }

  async getDomainOverview(domain: string): Promise<string | null> {
    const index = await this.buildIndex();
    const filePath = index.domains.get(domain);
    if (!filePath) return null;

    const content = await this.readAndTruncate(filePath);
    return content || null;
  }

  async listTables(): Promise<string[]> {
    const index = await this.buildIndex();
    return [...index.tables.keys()];
  }

  async listDomains(): Promise<string[]> {
    const index = await this.buildIndex();
    return [...index.domains.keys()];
  }

  extractTableNames(text: string): string[] {
    const names = new Set<string>();

    const managePattern = /\b(obj|prd|mbr|gtd|com|cmm|sys|r3)_[a-z][a-z0-9_]*\b/gi;
    for (const match of text.matchAll(managePattern)) {
      names.add(match[0].toLowerCase());
    }

    const gokrPattern = /\bgokr\.(\w+)/gi;
    for (const match of text.matchAll(gokrPattern)) {
      names.add(match[1].toLowerCase());
    }

    return [...names];
  }

  extractDomains(text: string): string[] {
    const lowerText = text.toLowerCase();
    const matched = new Set<string>();

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          matched.add(domain);
          break;
        }
      }
    }

    const tableNames = this.extractTableNames(text);
    for (const tableName of tableNames) {
      const prefix = tableName.split('_')[0];
      const domain = TABLE_PREFIX_TO_DOMAIN[prefix];
      if (domain) matched.add(domain);
    }

    return [...matched];
  }

  private async extractRelevantQueries(
    tableNames: string[],
    domains: string[]
  ): Promise<string | null> {
    const index = await this.buildIndex();
    if (!index.queriesPath) return null;

    try {
      const content = await readFile(index.queriesPath, 'utf-8');
      const sections = content.split(/^## /m);
      const relevant: string[] = [];

      const domainQueryTerms: Record<string, string[]> = {
        obj: ['빌딩', '유닛', 'building', 'unit'],
        prd: ['매물', 'product', '거래중'],
        mbr: ['거래처', '담당자', 'client'],
        gtd: ['딜', '계약', 'deal'],
      };

      for (const section of sections.slice(1)) {
        const sectionLower = section.toLowerCase();
        let isRelevant = false;

        for (const table of tableNames) {
          if (sectionLower.includes(table)) {
            isRelevant = true;
            break;
          }
        }

        if (!isRelevant) {
          for (const domain of domains) {
            const terms = domainQueryTerms[domain];
            if (terms?.some((t) => sectionLower.includes(t.toLowerCase()))) {
              isRelevant = true;
              break;
            }
          }
        }

        if (isRelevant) {
          relevant.push('## ' + section.trim());
        }
      }

      return relevant.length > 0 ? relevant.join('\n\n') : null;
    } catch {
      return null;
    }
  }

  private async readAndTruncate(filePath: string): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf-8');
      if (content.length <= MAX_DOC_CHARS) return content;
      return content.slice(0, MAX_DOC_CHARS) + '\n\n... (truncated)';
    } catch (error) {
      logger.warn({ filePath, error }, 'Failed to read wiki file');
      return '';
    }
  }
}
