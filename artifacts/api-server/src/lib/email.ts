import nodemailer from "nodemailer";
import { logger } from "./logger";

/**
 * Mailt een contracteigenaar bij kritieke vervalwaarschuwing.
 *
 * Configuratie via omgevingsvariabelen:
 *   SMTP_HOST   – SMTP-server (verplicht)
 *   SMTP_PORT   – poort, standaard 587
 *   SMTP_SECURE – "true" voor TLS op poort 465
 *   SMTP_USER   – gebruikersnaam
 *   SMTP_PASS   – wachtwoord
 *   SMTP_FROM   – afzendadres, standaard "LetShare4gov <noreply@letshare4gov.nl>"
 */

function createTransport() {
  const host = process.env["SMTP_HOST"];
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env["SMTP_PORT"] ?? 587),
    secure: process.env["SMTP_SECURE"] === "true",
    auth:
      process.env["SMTP_USER"] && process.env["SMTP_PASS"]
        ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] }
        : undefined,
  });
}

export interface ContractExpiryEmailParams {
  toEmail: string;
  toName: string;
  contractName: string;
  endDate: string;
  supplierName: string;
  daysUntilEnd: number;
  contractsUrl: string;
}

/**
 * Verstuurt één e-mailbericht voor een aflopend contract.
 *
 * Gooit een fout als de verzending mislukt zodat de aanroepende wachtrij-
 * verwerker (processEmailQueue) de mislukking kan registreren en later opnieuw
 * kan proberen.
 *
 * Wanneer SMTP_HOST niet is geconfigureerd wordt een fout gegooid met de
 * eigenschap `smtpNotConfigured: true`; de wachtrij-verwerker houdt dan geen
 * poging bij zodat de e-mail opnieuw wordt geprobeerd zodra SMTP beschikbaar is.
 */
export async function sendContractExpiryEmail(
  params: ContractExpiryEmailParams,
): Promise<void> {
  const transport = createTransport();

  if (!transport) {
    const err = Object.assign(
      new Error("SMTP_HOST niet geconfigureerd"),
      { smtpNotConfigured: true } as { smtpNotConfigured: true },
    );
    throw err;
  }

  const from =
    process.env["SMTP_FROM"] ?? "LetShare4gov <noreply@letshare4gov.nl>";

  const subject = `Urgent: contract "${params.contractName}" eindigt over ${params.daysUntilEnd} dag(en)`;

  const text = [
    `Beste ${params.toName},`,
    "",
    `Het contract "${params.contractName}" nadert zijn einddatum en vereist uw aandacht.`,
    "",
    `Contractnaam : ${params.contractName}`,
    `Leverancier  : ${params.supplierName}`,
    `Einddatum    : ${params.endDate}`,
    `Resterende dagen: ${params.daysUntilEnd}`,
    "",
    `Bekijk en verleng het contract via:`,
    params.contractsUrl,
    "",
    "Dit is een automatische melding van LetShare4gov.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#c0392b">⚠ Urgent: contract eindigt binnenkort</h2>
  <p>Beste <strong>${escHtml(params.toName)}</strong>,</p>
  <p>Het contract <strong>${escHtml(params.contractName)}</strong> nadert zijn einddatum en vereist uw aandacht.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr>
      <td style="padding:8px 12px;background:#f5f5f5;font-weight:bold;width:40%">Contractnaam</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${escHtml(params.contractName)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f5f5f5;font-weight:bold">Leverancier</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${escHtml(params.supplierName)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f5f5f5;font-weight:bold">Einddatum</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${escHtml(params.endDate)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;background:#f5f5f5;font-weight:bold">Resterende dagen</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0"><strong style="color:#c0392b">${params.daysUntilEnd}</strong></td>
    </tr>
  </table>
  <p>
    <a href="${escHtml(params.contractsUrl)}"
       style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
      Bekijk contract →
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0"/>
  <p style="font-size:12px;color:#666">Dit is een automatische melding van LetShare4gov. Reageer niet op dit e-mailadres.</p>
</body>
</html>`;

  await transport.sendMail({ from, to: params.toEmail, subject, text, html });

  logger.info(
    { to: params.toEmail, contract: params.contractName, daysUntilEnd: params.daysUntilEnd },
    "Contract-verval e-mail verzonden",
  );
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
