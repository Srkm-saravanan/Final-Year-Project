import { prisma } from '../db/prisma.js';

export interface AuditEntryInput {
  actorUserId?: string | null;
  userName: string;
  action: string;
  target: string;
  status?: 'Success' | 'Warning' | 'Pending';
  alwaysRecord?: boolean;
}

export async function recordAuditLog(input: AuditEntryInput): Promise<void> {
  try {
    if (!input.alwaysRecord) {
      const settings = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
      if (settings && !settings.auditTrailArchival) {
        return;
      }
    }

    const now = new Date();
    const timestampLabel = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`;

    await prisma.auditLog.create({
      data: {
        timestampLabel,
        actorUserId: input.actorUserId ?? null,
        userName: input.userName,
        action: input.action,
        target: input.target,
        status: input.status ?? 'Success',
      },
    });
  } catch (err) {
    // Non-blocking audit persistence warning
    console.warn('Failed to persist audit log entry:', err instanceof Error ? err.message : err);
  }
}

