import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendRoutineFailureEmail(params: {
  to: string;
  routineTitle: string;
  routineId: string;
  runId: string;
  failureReason: string | null;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  const from = process.env.SMTP_FROM ?? "noreply@paperclip.local";
  await transport.sendMail({
    from,
    to: params.to,
    subject: `Routine failed: ${params.routineTitle}`,
    text: [
      `Routine "${params.routineTitle}" failed.`,
      ``,
      `Failure reason: ${params.failureReason ?? "Unknown"}`,
      `Routine ID: ${params.routineId}`,
      `Run ID: ${params.runId}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n"),
  });
}
