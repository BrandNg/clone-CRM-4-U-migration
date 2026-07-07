import { Prisma } from '@prisma/client';
import { tenantStorage } from './tenant-context';

export const auditExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = await query(args);
          
          if (model === 'AuditLog' || model === 'Tenant') return result;

          try {
            const userId = (args.data as any).createdById || 
                           (args.data as any).assignedToId || 
                           (args.data as any).userId || 
                           null;
            
            const tenantId = (result as any).tenantId || 
                             (args.data as any).tenantId || 
                             tenantStorage.getStore()?.tenantId || 
                             'default-tenant';
            await (client as any).auditLog.create({
              data: {
                userId: userId || null,
                action: `create_${model.toLowerCase()}`,
                tableName: model,
                recordId: (result as any).id || '',
                changedFields: args.data || {},
                tenantId,
              },
            });
          } catch (err) {
            console.error('[auditExtension] Failed to write create audit log:', err);
          }

          return result;
        },

        async update({ model, args, query }) {
          if (model === 'AuditLog' || model === 'Tenant') return query(args);

          let currentData: any = null;
          try {
            currentData = await (client as any)[model].findUnique({ where: args.where });
          } catch (err) {
            console.error('[auditExtension] Failed to fetch pre-update data:', err);
          }

          const result = await query(args);

          try {
            const changedFields: Record<string, { old: any; new: any }> = {};
            const newData = args.data as any;

            if (currentData) {
              for (const key of Object.keys(newData)) {
                const oldValue = currentData[key];
                const newValue = newData[key];

                if (oldValue !== newValue && newValue !== undefined && key !== 'updatedAt') {
                  if (typeof newValue !== 'object' || newValue === null || Array.isArray(newValue)) {
                    changedFields[key] = { old: oldValue, new: newValue };
                  }
                }
              }
            }

            if (Object.keys(changedFields).length > 0) {
              const userId = currentData?.assignedToId || 
                             currentData?.userId || 
                             currentData?.createdById || 
                             null;

              const tenantId = currentData?.tenantId || 
                               (result as any).tenantId || 
                               (args.data as any).tenantId || 
                               tenantStorage.getStore()?.tenantId || 
                               'default-tenant';
              await (client as any).auditLog.create({
                data: {
                  userId: userId || null,
                  action: `update_${model.toLowerCase()}`,
                  tableName: model,
                  recordId: (result as any).id || (args.where as any).id || '',
                  changedFields,
                  tenantId,
                },
              });
            }
          } catch (err) {
            console.error('[auditExtension] Failed to write update audit log:', err);
          }

          return result;
        },

        async delete({ model, args, query }) {
          if (model === 'AuditLog' || model === 'Tenant') return query(args);

          let currentData: any = null;
          try {
            currentData = await (client as any)[model].findUnique({ where: args.where });
          } catch (err) {
            console.error('[auditExtension] Failed to fetch pre-delete data:', err);
          }

          const result = await query(args);

          try {
            const userId = currentData?.assignedToId || 
                           currentData?.userId || 
                           currentData?.createdById || 
                           null;
            
            const tenantId = currentData?.tenantId || 
                             tenantStorage.getStore()?.tenantId || 
                             'default-tenant';
            await (client as any).auditLog.create({
              data: {
                userId: userId || null,
                action: `delete_${model.toLowerCase()}`,
                tableName: model,
                recordId: (result as any).id || (args.where as any).id || '',
                changedFields: currentData || {},
                tenantId,
              },
            });
          } catch (err) {
            console.error('[auditExtension] Failed to write delete audit log:', err);
          }

          return result;
        },
      },
    },
  });
});
