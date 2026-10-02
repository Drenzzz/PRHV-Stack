// Contract evaluation (REQ-010): a probe succeeds only when every configured
// expectation matches — expected status AND all body keywords. Case-sensitive
// keyword scan per 04 §4.

export interface ContractConfig {
  expectedStatus?: number | null;
  expectedKeywords: string[];
}

export interface ContractVerdict {
  ok: boolean;
  error: string | null;
}

export function evaluateContract(
  probeOk: boolean,
  statusCode: number | null,
  bodyText: string | null,
  config: ContractConfig,
): ContractVerdict {
  if (!probeOk) {
    // Network-level failure — the probe result already explains why.
    return { ok: false, error: null };
  }

  if (config.expectedStatus != null && statusCode !== config.expectedStatus) {
    return { ok: false, error: `expected status ${config.expectedStatus}, got ${statusCode}` };
  }

  if (config.expectedKeywords.length > 0) {
    if (bodyText == null) {
      return { ok: false, error: `keyword check failed: body not readable (status ${statusCode})` };
    }
    const missing = config.expectedKeywords.filter((kw) => !bodyText.includes(kw));
    if (missing.length > 0) {
      return { ok: false, error: `keyword not found in body: ${missing.map((k) => JSON.stringify(k)).join(", ")}` };
    }
  }

  return { ok: true, error: null };
}
