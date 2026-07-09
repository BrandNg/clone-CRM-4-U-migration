import { updateSequenceSchema } from './lib/validation/schemas';
const data = {
  name: "C-level_Mavis",
  description: "",
  isActive: true,
  steps: [
    {
      channel: "email",
      order: 1,
      delayDays: 1,
      delayHours: 0,
      instructions: "Log touchpoint details for the email outreach.",
      templateId: null,
      autoComplete: true
    },
    {
      channel: "email",
      order: 2,
      delayDays: 1,
      delayHours: 0,
      instructions: "Log touchpoint details for the email outreach.",
      templateId: null,
      autoComplete: true
    }
  ]
};
const parsed = updateSequenceSchema.safeParse(data);
console.log(JSON.stringify(parsed, null, 2));
