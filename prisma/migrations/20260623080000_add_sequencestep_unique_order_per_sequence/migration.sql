-- P1.8: SequenceStep — unique order within a sequence
-- The @@unique([sequenceId, order]) constraint was added to schema.prisma
-- but was never migrated to the database. This closes the gap.
CREATE UNIQUE INDEX "SequenceStep_sequenceId_order_key"
ON "SequenceStep"("sequenceId", "order");
