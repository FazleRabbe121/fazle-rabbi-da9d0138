import { spawn } from 'child_process';
import path from 'path';
import { jobDatabaseEngine, PersistentJobRecord } from './jobDatabase.js';

export interface PythonFourScores {
  job_suitability_score: number;
  sponsorship_evidence_score: number;
  work_permit_feasibility_score: number;
  overall_priority_score: number;
  sponsorship_category: 'A' | 'B' | 'C' | 'D' | 'E';
  legacy_score?: number;
  score_reasons?: string[];
}

export interface PythonCompanyRecord {
  id: number;
  name: string;
  website: string;
  domain: string;
  country: string;
  country_name: string;
  city: string;
  address: string;
  phone: string;
  source: string;
  status: string;
  score: number;
  score_reasons: string;
  job_suitability_score: number;
  sponsorship_evidence_score: number;
  work_permit_feasibility_score: number;
  overall_priority_score: number;
  sponsorship_category: 'A' | 'B' | 'C' | 'D' | 'E';
  sponsorship_category_label: string;
  sponsorship_confidence: string;
  evidence_source: string;
  verification_date: string;
  has_job: number;
  visa_signal: string;
  accommodation: number;
  roles: string;
  canonical_roles: string;
  roles_list: string[];
  canonical_roles_list: string[];
  summary: string;
  career_url: string;
  apply_url: string;
  best_email: string;
  language: string;
  publication_date: string;
  priority_group: 1 | 2 | 3;
  priority_rank: number;
  country_permit_info?: {
    group?: number;
    priority?: number;
    pathway?: string;
    authority?: string;
    feasibility_base?: number;
    notes?: string;
  };
  outbox?: {
    id: number;
    to_email: string;
    subject: string;
    body: string;
    status: string;
    cv_id: string;
    cv_filename: string;
    sent_at?: string;
    replied_at?: string;
    reply_snippet?: string;
    bounced?: number;
  };
}

class PythonJobHunterBridge {
  private bridgeScriptPath: string;
  private agentRootDir: string;

  constructor() {
    this.agentRootDir = path.resolve(process.cwd(), 'jobhunter-agent');
    this.bridgeScriptPath = path.join(this.agentRootDir, 'bridge.py');
  }

  public async invokeBridge<T = any>(command: string, payload: Record<string, any> = {}, timeoutMs = 45000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const env = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: this.agentRootDir,
      };

      const child = spawn('python3', [this.bridgeScriptPath, command], {
        cwd: this.agentRootDir,
        env,
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Python bridge command '${command}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf-8');
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf-8');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const trimmed = stdout.trim();
        if (!trimmed) {
          return reject(new Error(`Python bridge '${command}' returned empty output (exit ${code}): ${stderr}`));
        }
        try {
          const lines = trimmed.split('\n');
          const lastJsonLine = lines[lines.length - 1];
          const parsed = JSON.parse(lastJsonLine);
          if (parsed && parsed.ok === false) {
            return reject(new Error(parsed.error || `Python bridge '${command}' failed`));
          }
          resolve(parsed as T);
        } catch (parseErr: any) {
          reject(new Error(`Failed to parse Python bridge JSON for '${command}': ${parseErr.message} | raw: ${trimmed.slice(-300)}`));
        }
      });

      if (payload && Object.keys(payload).length > 0) {
        child.stdin.write(JSON.stringify(payload));
      }
      child.stdin.end();
    });
  }

  /**
   * Synchronizes Python-discovered & scored companies into the unified jobDatabaseEngine
   * so existing Dashboard, Global Sponsorship, and Email Application views stay 100% unified.
   */
  public syncCompaniesIntoCanonicalJobDb(companies: PythonCompanyRecord[]): number {
    if (!Array.isArray(companies) || companies.length === 0) return 0;

    let syncedCount = 0;
    for (const c of companies) {
      if (c.status !== 'analyzed' || c.sponsorship_category === 'E') continue;

      const primaryRole = c.canonical_roles_list?.[0] || c.roles_list?.[0] || 'Hospitality & F&B Specialist';
      const secondaryRoles = (c.canonical_roles_list || []).slice(1, 3).join(', ');
      const title = secondaryRoles ? `${primaryRole} (${secondaryRoles})` : primaryRole;
      const permitPathway = c.country_permit_info?.pathway || 'National Work Permit / Employer Sponsorship';

      const jobRec: Partial<PersistentJobRecord> & {
        employer: string;
        title: string;
        country: string;
        market: 'sponsorship';
      } = {
        id: `py-agent-${c.id}`,
        employer: c.name,
        title,
        position: title,
        country: c.country_name || c.country,
        city: c.city || '',
        location: `${c.city ? c.city + ', ' : ''}${c.country_name || c.country}`,
        market: 'sponsorship',
        applicationUrl: c.apply_url || c.career_url || c.website,
        originalJobUrl: c.career_url || c.website,
        sourceUrl: c.career_url || c.website,
        sourceName: `Python Hybrid Agent (${c.source === 'priority_hospitality_seed' ? 'Verified Sponsor Seed' : 'OSM/Crawler'})`,
        recipientEmail: c.best_email || '',
        emailVerificationStatus: c.best_email ? 'verified' : 'unverified',
        sponsorshipStatus:
          c.sponsorship_category === 'A' || c.sponsorship_category === 'B'
            ? 'confirmed'
            : c.sponsorship_category === 'C'
            ? 'possible'
            : 'unverified',
        sponsorshipEvidence: `[Category ${c.sponsorship_category}: ${c.sponsorship_category_label}] ${c.summary} (Pathway: ${permitPathway})`,
        sourceNotes: `Scores — Suitability: ${c.job_suitability_score}%, Sponsorship Evidence: ${c.sponsorship_evidence_score}%, Permit Feasibility: ${c.work_permit_feasibility_score}%, Priority: ${c.overall_priority_score}%`,
        sponsorshipScore: c.overall_priority_score || c.score || 75,
        suitabilityScore: c.job_suitability_score || 80,
        accommodationIncluded: Boolean(c.accommodation),
        postingDate: c.publication_date || c.verification_date || new Date().toISOString().split('T')[0],
        postingDateVerified: true,
      };

      jobDatabaseEngine.upsertJob(jobRec);
      syncedCount++;
    }

    return syncedCount;
  }

  public async getStatus() {
    const status = await this.invokeBridge('status');
    // Also ensure initial companies are mirrored into the unified jobDatabaseEngine
    try {
      const compRes = await this.invokeBridge<{ ok: boolean; companies: PythonCompanyRecord[] }>('companies', { limit: 50 });
      if (compRes?.companies) {
        this.syncCompaniesIntoCanonicalJobDb(compRes.companies);
      }
    } catch {
      // ignore non-critical sync warning on status check
    }
    return status;
  }

  public async getCompanies(filter: {
    country?: string;
    priority_group?: number;
    sponsorship_category?: string;
    role?: string;
    limit?: number;
  } = {}) {
    const res = await this.invokeBridge<{ ok: boolean; count: number; companies: PythonCompanyRecord[] }>('companies', filter);
    if (res?.companies) {
      this.syncCompaniesIntoCanonicalJobDb(res.companies);
    }
    return res;
  }

  public async runDiscovery(options: {
    countries?: string[];
    live_osm?: boolean;
    max_crawl?: number;
  } = {}) {
    const res = await this.invokeBridge<{
      ok: boolean;
      seeded_count: number;
      discovered_osm: number;
      crawled_count: number;
      countries: string[];
      companies: PythonCompanyRecord[];
    }>('discover', options, 60000);
    if (res?.companies) {
      this.syncCompaniesIntoCanonicalJobDb(res.companies);
    }
    return res;
  }

  public async analyzeVacancy(payload: {
    title?: string;
    company_name?: string;
    country?: string;
    city?: string;
    description?: string;
    email?: string;
    website?: string;
  }) {
    return this.invokeBridge('analyze', payload);
  }

  public async generateDraft(payload: {
    company_id?: number;
    company_name?: string;
    country?: string;
    city?: string;
    roles?: string;
    description?: string;
    kind?: 'initial' | 'followup';
    cv_id?: string;
  }) {
    return this.invokeBridge('draft', payload);
  }

  public async syncCvFromGallery(payload: {
    cv_id: string;
    title: string;
    filename: string;
    role_target?: string;
    base64_data?: string;
    is_active?: boolean;
  }) {
    return this.invokeBridge('sync_cv', payload);
  }

  public async executeQueueAction(payload: {
    action: 'approve' | 'approve_all' | 'skip' | 'mark_sent' | 'retry' | 'pause' | 'resume' | 'set_mode' | 'set_cap' | 'suppress';
    outbox_id?: number;
    value?: string | number;
  }) {
    return this.invokeBridge('queue_action', payload);
  }
}

export const pythonJobHunterBridge = new PythonJobHunterBridge();
