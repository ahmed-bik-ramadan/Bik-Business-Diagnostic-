import { LeadData, DiagnosticReport } from '../types';

export async function notifyAhmed(
  leadData: LeadData,
  report: DiagnosticReport,
  sessionId: string
): Promise<void> {
  // Automatic third-party delivery is intentionally disabled. The user chooses
  // whether and what to share from their own device.
  void leadData;
  void report;
  void sessionId;
}
