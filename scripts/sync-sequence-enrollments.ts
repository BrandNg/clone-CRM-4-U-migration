import { PrismaClient, SequenceEnrollmentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all leads currently associated with a sequence...');

  const leads = await prisma.lead.findMany({
    where: {
      sequenceId: { not: null },
    },
    select: {
      id: true,
      sequenceId: true,
      sequenceStep: true,
      sequenceStatus: true,
      tenantId: true,
    },
  });

  console.log(`Found ${leads.length} leads with an active or paused sequence.`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const lead of leads) {
    if (!lead.sequenceId) continue;

    // Check if an enrollment record already exists
    const existing = await prisma.sequenceEnrollment.findFirst({
      where: {
        leadId: lead.id,
        sequenceId: lead.sequenceId,
        status: { in: ['active', 'paused'] },
      },
    });

    const targetStatus = (lead.sequenceStatus || 'active') as SequenceEnrollmentStatus;
    const targetStep = lead.sequenceStep || 1;

    if (existing) {
      if (existing.status !== targetStatus || existing.currentStep !== targetStep) {
        await prisma.sequenceEnrollment.update({
          where: { id: existing.id },
          data: { status: targetStatus, currentStep: targetStep },
        });
        updatedCount++;
      }
    } else {
      await prisma.sequenceEnrollment.create({
        data: {
          leadId: lead.id,
          sequenceId: lead.sequenceId,
          status: targetStatus,
          currentStep: targetStep,
          tenantId: lead.tenantId,
        },
      });
      createdCount++;
    }
  }

  console.log(`Sync complete. Created ${createdCount} missing enrollments. Updated ${updatedCount} existing enrollments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
