import { db } from '../db'
import { auditLogs } from '../db/schema'

type Action = 'CREATE' | 'UPDATE' | 'DELETE' | 'CHECKOUT' | 'RETURN' | 'LOGIN' | 'IMPORT'

export async function logAudit(params: {
  userId: string
  action: Action
  entityType: string
  entityId: string
  details?: Record<string, unknown>
  ipAddress?: string
}) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details ? JSON.stringify(params.details) : undefined,
    ipAddress: params.ipAddress,
  })
}
